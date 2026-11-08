import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Check, FileDown, Pause, Play, RefreshCw, ShieldCheck, Upload, XCircle } from "lucide-react";
import {
  cancelImportUploadSession, createImportJob, createImportUploadSession, failImportJobSafely, fetchCentralSynonyms, fetchImportJobs, fetchImportProfiles, rollbackImportSnapshot,
  fetchImportUploadChunks, fetchImportRowErrors, findImportDuplicate, finalizeImportJob, insertImportRows, recordImportUploadChunk, updateImportJob,
  type ImportRowErrorDetail,
} from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { completeImportRequestKey, getOrCreateImportRequestKey } from "@/lib/import-request-key";
import { useFetch } from "@/lib/useFetch";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { AdminPage, Button, Empty, ErrorBox, Loading, TableWrap } from "@/components/AdminPages";
import {
  DataQualityAccumulator, DEFAULT_SYNONYMS, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_COLUMNS, MAX_IMPORT_ROWS,
  PROCESSING_CHUNK_ROWS, UPLOAD_CHUNK_BYTES, IncrementalSha256, StreamingCsvParser, hashFileSha256,
  applyImportProfileRules, normalizeHeader, parseXlsxFirstWorksheet, shouldPersistParsedImportRow, stableJsonStringify, validateCsvRow, validateImportProfileRules, validateVerifiedImportChunkPrefix,
  type ParsedImportRow, type QualityResult,
} from "@/lib/unified-import";
import type { ImportJob, ImportProfile } from "@/lib/types";

type Stage = "reading" | "detecting" | "mapping" | "validating" | "normalizing" | "deduplicating" | "merging" | "analytics" | "complete";
type DuplicateAction = "ignore" | "replace" | "merge" | "new_version" | "resume";
type DuplicateResult = {
  duplicate: boolean;
  profile_id: string | null;
  jobs: Array<ImportJob & { upload_session_id?: string | null }>;
  snapshots: Array<{ id: string; status: string; snapshot_version: number }>;
};
type DuplicatePrompt = {
  file: File;
  fileHash: string;
  profileId: string | null;
  periodKey: string | null;
  sourceSystem: string;
  externalSourceReference: string | null;
  duplicate: DuplicateResult;
};

function unsupportedImportFormatDetails(extension: string): {
  errorSummary: { code: string; message: string; manual_mapping_required: true; no_raw_file_retained: true };
  statusMessage: string;
} {
  const isPdf = extension === "pdf";
  return {
    errorSummary: {
      code: isPdf ? "PDF_TABLE_EXTRACTION_REQUIRED" : "LEGACY_XLS_PARSER_UNAVAILABLE",
      message: isPdf
        ? "لم يتوفر مستخرج جدولي موثوق في هذه النسخة. لم يتم تخمين بيانات PDF أو توليد صفوف وهمية؛ يلزم استخراج/تعيين يدوي قبل الاعتماد."
        : "صيغة XLS الثنائية القديمة غير مدعومة مباشرة. حُفظت الميتاداتا والبصمة فقط؛ احفظ الملف بصيغة XLSX أو CSV ثم أعد الاستيراد.",
      manual_mapping_required: true,
      no_raw_file_retained: true,
    },
    statusMessage: isPdf
      ? "سُجل ملف PDF كمسودة تعيين يدوي دون افتراض أنه جدولي."
      : "سُجل ملف XLS القديم كمسودة؛ احفظ نسخة XLSX أو CSV لإتمام الاستيراد.",
  };
}

const STAGES: Array<{ id: Stage; label: string }> = [
  { id: "reading", label: "قراءة الملف" },
  { id: "detecting", label: "كشف النوع والبصمة" },
  { id: "mapping", label: "توحيد الأعمدة" },
  { id: "validating", label: "التحقق والجودة" },
  { id: "normalizing", label: "تطبيع البيانات وكتابة الشرائح" },
  { id: "deduplicating", label: "منع التكرار" },
  { id: "merging", label: "الدمج/اعتماد النسخة" },
  { id: "analytics", label: "إنشاء اللقطة التحليلية" },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function describeReconciledImportStatus(
  reconciled: Awaited<ReturnType<typeof failImportJobSafely>>,
): string {
  const snapshotText = reconciled.snapshotId ? " • Snapshot " + reconciled.snapshotId : "";
  if (reconciled.status === "completed" || reconciled.status === "completed_with_warnings") {
    return "أكد الخادم أن الدفعة انتهت بالفعل بالحالة " + reconciled.status + snapshotText + ". لم تُعد العملية ولم تُكرر آثارها.";
  }
  return "أكد الخادم الحالة النهائية " + reconciled.status + " لهذه الدفعة. لم تتم إعادة اعتمادها تلقائيًا.";
}

function formatOptionalRowCount(value: number | null): string {
  return value === null ? "غير متاح" : formatNumber(value);
}

function describeRetryableImportStatus(
  reconciled: Awaited<ReturnType<typeof failImportJobSafely>>,
): string {
  return "حُفظ الفشل كحالة قابلة للاستئناف، وصالح الخادم عدد الصفوف المحفوظة: " +
    formatOptionalRowCount(reconciled.processedRows) +
    "، والمرفوض: " +
    formatOptionalRowCount(reconciled.failedRows) +
    ". استخدم الملف الأصلي نفسه للاستئناف.";
}

export function UnifiedImportEngine({ onNotice, refreshVersion = 0, initialJobId }: { onNotice: (message: string) => void; refreshVersion?: number; initialJobId?: string }) {
  const { user } = useAuth();
  const canRollbackImport = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  const { data: jobs, loading, error, refetch } = useFetch(fetchImportJobs, [refreshVersion]);
  const { data: profiles } = useFetch(fetchImportProfiles, [refreshVersion]);
  const { data: storedSynonyms } = useFetch(fetchCentralSynonyms, [refreshVersion]);
  const [stage, setStage] = useState<Stage | null>(null);
  const [progress, setProgress] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [profileId, setProfileId] = useState("");
  const [periodKey, setPeriodKey] = useState("");
  const [sourceSystem, setSourceSystem] = useState("manual");
  const [externalSourceReference, setExternalSourceReference] = useState("");
  const [qualityPreview, setQualityPreview] = useState<QualityResult | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePrompt | null>(null);
  const [rowErrorState, setRowErrorState] = useState<{ jobId: string; rows: ImportRowErrorDetail[]; loading: boolean; error: string; offset: number; hasMore: boolean } | null>(null);
  const rowErrorRequestId = useRef(0);
  const pausedRef = useRef(false);
  useEffect(() => {
    if (!initialJobId || loading || !jobs?.some((job) => job.id === initialJobId)) return;
    const timer = window.setTimeout(() => {
      document.getElementById("admin-import-job-" + initialJobId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialJobId, loading, jobs]);
  const cancelRef = useRef(false);
  const runningRef = useRef(false);

  const activeProfileId = profileId || (profiles ?? []).find((p: ImportProfile) => p.profile_name === "Unified CSV" && p.status === "active")?.id || null;
  const selectedImportProfile = (profiles ?? []).find((profile: ImportProfile) => profile.id === activeProfileId);
  const synonymMap = useMemo(() => {
    const result: Record<string, string> = { ...DEFAULT_SYNONYMS };
    const normalizeSource = (value: string) => value.trim().toLocaleLowerCase("ar").replace(/[ـ_-]+/g, " ").replace(/\s+/g, " ");
    for (const row of storedSynonyms ?? []) {
      if (row.profile_id && row.profile_id !== activeProfileId) continue;
      const source = normalizeSource(String(row.source_header ?? ""));
      const target = String(row.canonical_field ?? "").trim();
      if (source && /^[a-z][a-z0-9_]{0,79}$/.test(target)) result[source] = target;
    }
    const selectedProfile = (profiles ?? []).find((p: ImportProfile) => p.id === activeProfileId);
    for (const [sourceHeader, canonicalField] of Object.entries(selectedProfile?.synonyms ?? {})) {
      const source = normalizeSource(sourceHeader);
      const target = String(canonicalField).trim();
      if (source && /^[a-z][a-z0-9_]{0,79}$/.test(target)) result[source] = target;
    }
    return result;
  }, [storedSynonyms, profiles, activeProfileId]);

  function updatePaused(next: boolean) {
    pausedRef.current = next;
    setPaused(next);
    setStatusMessage(next ? "تم الإيقاف المؤقت؛ آخر شريحة معتمدة محفوظة ويمكن الاستئناف بإعادة اختيار الملف نفسه." : "استؤنفت المعالجة.");
  }

  async function handleImportFailure(
    cause: unknown,
    job: ImportJob | null,
    processingConfigFingerprint: string | null,
    checkpointFingerprintPersisted: boolean,
  ): Promise<void> {
    const message = cause instanceof Error ? cause.message : "تعذر معالجة الملف.";
    setStage(null);
    if (!job) {
      setErrorMessage(message);
      await refetch();
      return;
    }

    const failureSummary: Record<string, unknown> = {
      code: "IMPORT_PROCESSING_FAILED",
      message,
      resumable: true,
      no_raw_file_retained: true,
    };
    if (checkpointFingerprintPersisted && processingConfigFingerprint) {
      failureSummary.processing_config_fingerprint = processingConfigFingerprint;
    }

    try {
      const reconciled = await failImportJobSafely(job.id, failureSummary);
      if (reconciled.terminal) {
        // The finalize/cancel RPC may have committed while its response was lost.
        // Keep the server's terminal result; never mark it failed or create another snapshot.
        setErrorMessage("");
        setStatusMessage(describeReconciledImportStatus(reconciled));
        onNotice("حُفظت الحالة النهائية الموجودة للدفعة؛ لم تُحوّل إلى فشل ولم يُكرر الاعتماد.");
      } else {
        setErrorMessage(message);
        setStatusMessage(describeRetryableImportStatus(reconciled));
      }
    } catch (reconcileError) {
      setErrorMessage(message);
      setStatusMessage(
        "تعذر تأكيد حالة الدفعة بعد الفشل: " +
        (reconcileError instanceof Error ? reconcileError.message : "خطأ غير معروف") +
        ". لا تبدأ نسخة بديلة قبل تحديث سجل الدفعات والتحقق من الحالة على الخادم.",
      );
    }
    await refetch();
  }

  async function processFile(
    file: File,
    fileHash: string,
    action: Exclude<DuplicateAction, "ignore" | "resume">,
    existingJob?: ImportJob & { upload_session_id?: string | null },
    selectedProfile: string | null = activeProfileId,
    selectedPeriod: string | null = periodKey.trim() || null,
    selectedSource: string = sourceSystem,
    selectedExternalSourceReference: string | null = existingJob
      ? (existingJob.external_source_reference ?? null)
      : selectedSource === "manual" ? null : externalSourceReference.trim() || null,
  ) {
    if (runningRef.current) return;
    runningRef.current = true;
    pausedRef.current = false;
    cancelRef.current = false;
    setPaused(false);
    setErrorMessage("");
    setStatusMessage("");
    setProgress(10);
    setProcessed(0);
    setQualityPreview(null);
    let job: ImportJob | null = existingJob ?? null;
    let uploadSession: { id: string; import_job_id: string; organization_id: string; profile_id: string | null; profile_version: number | null; period_key: string | null; external_source_reference: string | null; chunk_size_bytes: number; total_chunks: number; verified_chunks: number; status: string; file_hash: string; file_size: number } | null = null;
    let processingConfigFingerprint: string | null = null;
    let checkpointFingerprintPersisted = false;

    try {
      if (!job) {
        const { data: authSessionData, error: authSessionError } = await supabase.auth.getSession();
        if (authSessionError) throw authSessionError;
        const authUserId = authSessionData.session?.user.id;
        if (!authUserId) throw new Error("انتهت جلسة الدخول؛ سجّل الدخول مجددًا قبل بدء الاستيراد.");

        const requestAttempt = await getOrCreateImportRequestKey({
          actorId: authUserId,
          fileName: file.name,
          fileHash,
          fileSize: file.size,
          jobType: "unified_import",
          profileId: selectedProfile,
          periodKey: selectedPeriod,
          sourceSystem: selectedSource,
          externalSourceReference: selectedExternalSourceReference,
          intent: action,
        });
        job = await createImportJob({
          fileName: file.name,
          fileHash,
          fileSize: file.size,
          jobType: "unified_import",
          profileId: selectedProfile,
          periodKey: selectedPeriod,
          sourceSystem: selectedSource,
          externalSourceReference: selectedExternalSourceReference,
          requestKey: requestAttempt.requestKey,
          intent: action,
        });
        completeImportRequestKey(requestAttempt.storageKey);
      }
      if (selectedProfile && job.profile_id && selectedProfile !== job.profile_id) {
        throw new Error("الملف التعريفي المختار لا يطابق الملف التعريفي المقيد بدفعة الاستيراد.");
      }
      // The server may create the default profile while creating the job; bind processing to
      // that persisted profile, not to a possibly stale/empty React query cache.
      selectedProfile = job.profile_id ?? selectedProfile ?? activeProfileId;

      const extension = file.name.split(".").pop()?.toLocaleLowerCase("en") ?? "";
      if (extension !== "csv" && extension !== "xlsx") {
        const unsupported = unsupportedImportFormatDetails(extension);
        await updateImportJob(job.id, {
          status: "manual_mapping_required",
          data_quality_score: 0,
          error_summary: unsupported.errorSummary,
        });
        setStage(null);
        setStatusMessage(unsupported.statusMessage);
        await refetch();
        return;
      }

      const currentProfiles = await fetchImportProfiles();
      const currentSynonyms = await fetchCentralSynonyms();
      const profile = (currentProfiles ?? []).find((p: ImportProfile) => p.id === selectedProfile) as ImportProfile | undefined;
      if (selectedProfile && !profile) {
        throw new Error("تعذر تحميل إصدار الملف التعريفي المقيد بالدفعة؛ لن تتم معالجة صفوف بإعدادات غير مؤكدة.");
      }
      const rawTransformations: unknown = profile?.transformation_rules;
      const rawValidations: unknown = profile?.validation_rules;
      if (profile && (!Array.isArray(rawTransformations) || !Array.isArray(rawValidations))) {
        throw new Error("إعدادات التحويل والتحقق في الملف التعريفي غير صالحة؛ أوقف الاستيراد قبل تجهيز الصفوف.");
      }
      const transformations: unknown[] = Array.isArray(rawTransformations) ? rawTransformations : [];
      const validations: unknown[] = Array.isArray(rawValidations) ? rawValidations : [];
      // Fail fast on malformed declarative profiles before any rows are staged.
      validateImportProfileRules(transformations, validations);
      const profileSynonyms: Record<string, string> = { ...DEFAULT_SYNONYMS };
      const normalizeSynonymSource = (value: string) => value.trim().toLocaleLowerCase("ar").replace(/[ـ_-]+/g, " ").replace(/\s+/g, " ");
      for (const row of currentSynonyms ?? []) {
        if (row.profile_id && row.profile_id !== selectedProfile) continue;
        const source = normalizeSynonymSource(String(row.source_header ?? ""));
        const target = String(row.canonical_field ?? "").trim();
        if (source && /^[a-z][a-z0-9_]{0,79}$/.test(target)) profileSynonyms[source] = target;
      }
      for (const [sourceHeader, canonicalField] of Object.entries(profile?.synonyms ?? {})) {
        const source = normalizeSynonymSource(sourceHeader);
        const target = String(canonicalField).trim();
        if (source && /^[a-z][a-z0-9_]{0,79}$/.test(target)) profileSynonyms[source] = target;
      }
      const ignoredColumns = new Set((profile?.ignored_columns ?? []).map((field) => normalizeHeader(String(field), profileSynonyms)));
      const requiredColumns = Array.isArray(profile?.required_columns) ? profile.required_columns.map(String) : ["item_code"];
      const matchingKey = String(profile?.matching_key ?? "item_code");
      const processingConfig = {
        profileId: selectedProfile,
        profileVersion: profile?.version ?? null,
        reportType: profile?.report_type ?? null,
        source: profile?.source ?? null,
        sourceSystem: selectedSource,
        externalSourceReference: selectedExternalSourceReference,
        requiredColumns,
        optionalColumns: profile?.optional_columns ?? [],
        ignoredColumns: [...ignoredColumns].sort(),
        matchingKey,
        mergeStrategy: profile?.merge_strategy ?? "manual_review",
        isFullDataset: profile?.is_full_dataset ?? false,
        dateRules: profile?.date_rules ?? {},
        synonyms: Object.entries(profileSynonyms).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        transformations,
        validations,
      };
      processingConfigFingerprint = new IncrementalSha256()
        .update(new TextEncoder().encode(stableJsonStringify(processingConfig)))
        .digestHex();

      setStage("reading");
      uploadSession = await createImportUploadSession(job.id);
      if (uploadSession.file_hash !== fileHash || Number(uploadSession.file_size) !== file.size) {
        throw new Error("جلسة الاستيراد لا تطابق الملف المختار. لا يمكن متابعة المعالجة بأمان.");
      }
      if ((uploadSession.profile_id ?? null) !== (selectedProfile ?? null) ||
          (uploadSession.profile_version ?? null) !== (profile?.version ?? null) ||
          (uploadSession.period_key ?? null) !== (selectedPeriod ?? null) ||
          (uploadSession.external_source_reference ?? null) !== (selectedExternalSourceReference ?? null)) {
        throw new Error("هوية الملف التعريفي أو إصداره أو الفترة لا تطابق جلسة الرفع. أوقفنا الاستئناف حتى لا تختلط نتائج دفعتين.");
      }
      if (uploadSession.chunk_size_bytes !== UPLOAD_CHUNK_BYTES ||
          uploadSession.total_chunks !== Math.ceil(file.size / UPLOAD_CHUNK_BYTES)) {
        throw new Error("إعدادات شرائح جلسة الاستيراد لا تطابق هذا الملف؛ أوقف العملية وابدأ دفعة جديدة.");
      }
      if (["cancelled", "expired", "completed"].includes(uploadSession.status)) {
        throw new Error("جلسة الاستيراد السابقة ملغاة أو منتهية؛ ابدأ دفعة جديدة بدل الكتابة فوق جلسة غير متاحة.");
      }
      const uploadManifest = await fetchImportUploadChunks(uploadSession.id);
      const verifiedChunkNumbers = validateVerifiedImportChunkPrefix(
        uploadManifest, file.size, uploadSession.chunk_size_bytes,
      );
      if (verifiedChunkNumbers.length !== uploadSession.verified_chunks) {
        throw new Error("عدد الشرائح المؤكدة لا يطابق سجل الشرائح؛ تعذر الاستئناف الآمن.");
      }
      const previousSummary = (job.error_summary ?? {}) as Record<string, unknown>;
      const savedFingerprint = previousSummary.processing_config_fingerprint;
      if (verifiedChunkNumbers.length > 0 && typeof savedFingerprint !== "string") {
        throw new Error("هذه دفعة قديمة لا تحفظ بصمة إعدادات المعالجة. ابدأ نسخة استيراد جديدة بدل دمج بيانات ربما استخدمت تعيين أعمدة مختلفًا.");
      }
      if (typeof savedFingerprint === "string" && savedFingerprint !== processingConfigFingerprint) {
        throw new Error("تغير الملف التعريفي أو المرادفات أو قواعد المعالجة منذ بدء الدفعة. تم إيقاف الاستئناف لتجنب خلط صفوف بمعايير مختلفة؛ ابدأ نسخة جديدة.");
      }
      await updateImportJob(job.id, {
        error_summary: {
          ...previousSummary,
          processing_config_fingerprint: processingConfigFingerprint,
          profile_id: selectedProfile,
          profile_version: profile?.version ?? null,
          source_file_hash: fileHash,
          no_raw_file_retained: true,
        },
      });
      checkpointFingerprintPersisted = true;
      const verifiedChunks = new Set(verifiedChunkNumbers);
      if (verifiedChunks.size > 0) {
        setStatusMessage(extension === "xlsx"
          ? "استئناف XLSX آمن: ستعاد قراءة الورقة كاملة من الملف المطابق، وتُحدّث الصفوف بمفتاح الدفعة ورقم الصف دون إنشاء صفوف مكررة، ثم تُراجع بصمات الشرائح المحفوظة."
          : "استئناف آمن: سيعاد بناء حالة قراءة CSV محليًا، وتُتجاوز كتابة الشرائح المؤكدة، ويستمر الحفظ من أول شريحة غير مؤكدة.");
      }
      const parser = new StreamingCsvParser();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let headers: string[] | null = null;
      let quality: DataQualityAccumulator | null = null;
      let currentChunkNumber = -1;
      let finalizingCsv = false;
      let dataRows = 0;
      let batch: Array<{ rowNumber: number; data: Record<string, unknown>; status: string; errors: string[] }> = [];

      const flushBatch = async () => {
        if (!batch.length) return;
        const toSave = batch;
        batch = [];
        await insertImportRows(job!.id, toSave);
        setProcessed(dataRows);
        if (quality) setQualityPreview(quality.result());
      };

      const consumeRow = async (values: string[]) => {
        if (cancelRef.current) return;
        if (!headers) {
          if (values.length > MAX_IMPORT_COLUMNS) throw new Error("عدد الأعمدة يتجاوز الحد الأقصى " + MAX_IMPORT_COLUMNS);
          headers = values.map((value) => {
            const canonical = normalizeHeader(value, profileSynonyms);
            const rawKey = normalizeSynonymSource(value);
            return ignoredColumns.has(canonical) || ignoredColumns.has(rawKey) ? "" : canonical;
          });
          if (!headers.length || headers.every((value) => !value)) throw new Error("صف العناوين فارغ؛ يلزم تعيين الأعمدة يدويًا.");
          if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) {
            throw new Error("يوجد أكثر من عنوان يتحول إلى العمود نفسه بعد التطبيع؛ راجع قاموس المرادفات.");
          }
          const requiredHeaderSet = new Set([...requiredColumns, matchingKey]);
          const missingRequiredHeaders = [...requiredHeaderSet].filter((field) => !headers!.includes(field));
          if (missingRequiredHeaders.length > 0) {
            throw new Error("الملف يفتقد أعمدة إلزامية للملف التعريفي الحالي: " + missingRequiredHeaders.join("، ") + ". صحح صف العناوين أو اختر ملفًا تعريفيًا مطابقًا؛ لم يتم اعتماد أي بيانات.");
          }
          setStage("mapping");
          quality = new DataQualityAccumulator(requiredColumns.length ? requiredColumns : [matchingKey], matchingKey);
          return;
        }
        if (values.length > MAX_IMPORT_COLUMNS) throw new Error("صف البيانات تجاوز حد الأعمدة.");
        if (dataRows >= MAX_IMPORT_ROWS) throw new Error("تجاوز الملف الحد الأقصى " + MAX_IMPORT_ROWS + " صف.");
        dataRows += 1;
        const baseRow: ParsedImportRow = validateCsvRow(values, headers, dataRows + 1, matchingKey, requiredColumns);
        const parsed: ParsedImportRow = applyImportProfileRules(baseRow, transformations, validations);
        quality?.add(parsed);
        // Already-verified upload chunks have their structured rows committed before their
        // manifest checkpoint. Reparse those bytes locally to rebuild CSV/quality state, but
        // never write their rows again. The first incomplete chunk is upserted normally.
        if (shouldPersistParsedImportRow(currentChunkNumber, verifiedChunks, finalizingCsv)) {
          // The final unterminated CSV row may not have been staged if a prior run stopped
          // after the final chunk checkpoint but before EOF finalization; upsert it safely.
          batch.push({ rowNumber: parsed.row_number, data: parsed.data, status: parsed.status, errors: parsed.errors });
          if (batch.length >= PROCESSING_CHUNK_ROWS) await flushBatch();
        }
        if (dataRows % 100 === 0) setProcessed(dataRows);
        setStage("validating");
      };

      let processedBytes = 0;
      let xlsxWorksheetName: string | null = null;
      if (extension === "csv") {
        const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_BYTES);
        for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber += 1) {
          while (pausedRef.current && !cancelRef.current) await delay(180);
          if (cancelRef.current) break;
          currentChunkNumber = chunkNumber;
          const byteOffset = chunkNumber * UPLOAD_CHUNK_BYTES;
          const bytes = new Uint8Array(await file.slice(byteOffset, Math.min(file.size, byteOffset + UPLOAD_CHUNK_BYTES)).arrayBuffer());
          const chunkHash = new IncrementalSha256().update(bytes).digestHex();
          await parser.push(decoder.decode(bytes, { stream: byteOffset + bytes.length < file.size }), consumeRow, false);
          await flushBatch();
          // A cancellation during row parsing must not certify a partially processed chunk.
          // Its rows are upserted by row number on retry, so leaving the chunk unverified is safe.
          if (cancelRef.current) break;
          if (verifiedChunks.has(chunkNumber)) {
            const checkpoint = uploadManifest[chunkNumber];
            if (!checkpoint || checkpoint.chunk_hash !== chunkHash) {
              throw new Error("بصمة الشريحة " + (chunkNumber + 1) + " تختلف عن نقطة الاستئناف المحفوظة؛ لم يتم تجاوزها.");
            }
          } else {
            await recordImportUploadChunk({
              sessionId: uploadSession.id,
              chunkNumber,
              byteOffset,
              byteSize: bytes.byteLength,
              chunkHash,
            });
          }
          processedBytes += bytes.byteLength;
          setProcessed(dataRows);
          setStage("normalizing");
          setProgress(Math.min(82, 10 + Math.round((processedBytes / Math.max(file.size, 1)) * 72)));
        }
      } else {
        // XLSX row provenance is inside compressed ZIP members, not raw-file byte chunks.
        // A failed run with recorded byte checkpoints is therefore fail-closed above. Fresh or
        // uncheckpointed runs parse once, persist idempotently, then record the raw-byte manifest.
        setStage("reading");
        setProgress(18);
        let worksheetRows = 0;
        const workbook = await parseXlsxFirstWorksheet(file, async (values) => {
          while (pausedRef.current && !cancelRef.current) await delay(180);
          if (cancelRef.current) return;
          currentChunkNumber = -1;
          await consumeRow(values);
          worksheetRows += 1;
          if (worksheetRows % 100 === 0) {
            setProcessed(dataRows);
            setProgress(Math.min(70, 18 + Math.round((worksheetRows / (MAX_IMPORT_ROWS + 1)) * 52)));
          }
        });
        xlsxWorksheetName = workbook.worksheetName;
        if (cancelRef.current) {
          setProcessed(dataRows);
        } else {
          await flushBatch();
          if (!headers) throw new Error("ورقة XLSX لا تحتوي على صف عناوين صالح.");
          setStage("normalizing");
          setProgress(72);
          const totalChunks = Math.ceil(file.size / UPLOAD_CHUNK_BYTES);
          for (let chunkNumber = 0; chunkNumber < totalChunks; chunkNumber += 1) {
            while (pausedRef.current && !cancelRef.current) await delay(180);
            if (cancelRef.current) break;
            const byteOffset = chunkNumber * UPLOAD_CHUNK_BYTES;
            const bytes = new Uint8Array(await file.slice(byteOffset, Math.min(file.size, byteOffset + UPLOAD_CHUNK_BYTES)).arrayBuffer());
            const chunkHash = new IncrementalSha256().update(bytes).digestHex();
            await recordImportUploadChunk({
              sessionId: uploadSession.id,
              chunkNumber,
              byteOffset,
              byteSize: bytes.byteLength,
              chunkHash,
            });
            processedBytes += bytes.byteLength;
            setProgress(Math.min(82, 72 + Math.round((processedBytes / Math.max(file.size, 1)) * 10)));
          }
        }
      }

      if (cancelRef.current) {
        if (uploadSession) {
          try { await cancelImportUploadSession(uploadSession.id); } catch { /* cancellation of the job remains recorded below */ }
        }
        await updateImportJob(job.id, {
          status: "cancelled",
          error_summary: { code: "CANCELLED_BY_USER", message: "ألغى المستخدم الدفعة؛ لم يتم إنشاء Snapshot.", no_raw_file_retained: true },
        });
        await refetch();
        setStage(null);
        setStatusMessage("ألغيت الدفعة. لم تُحفظ بيانات الملف الخام.");
        return;
      }

      if (extension === "csv") {
        finalizingCsv = true;
        await parser.push(decoder.decode(), consumeRow, true);
        await flushBatch();
        if (!headers) throw new Error("تعذر اكتشاف صف عناوين صالح في CSV.");
      } else if (!headers) {
        throw new Error("ورقة XLSX لا تحتوي على صف عناوين صالح.");
      }
      setStage("deduplicating");
      setProgress(86);
      await updateImportJob(job.id, {
        total_rows: dataRows,
        processed_rows: dataRows,
        error_summary: {
          no_raw_file_retained: true,
          source_file_hash: fileHash,
          profile_id: selectedProfile,
          profile_version: profile?.version ?? null,
          processing_config_fingerprint: processingConfigFingerprint,
          is_full_dataset: profile?.is_full_dataset === true,
          period_key: selectedPeriod,
          source_system: selectedSource,
          external_source_reference: selectedExternalSourceReference,
          parser: extension === "csv" ? "streaming-csv" : "xlsx-first-visible-sheet",
          worksheet_name: xlsxWorksheetName,
          processing_chunk_rows: PROCESSING_CHUNK_ROWS,
          upload_chunk_bytes: UPLOAD_CHUNK_BYTES,
        },
      });
      setStage("merging");
      const result = await finalizeImportJob(job.id, action);
      setStage("analytics");
      setProgress(96);
      setQualityPreview((quality as DataQualityAccumulator | null)?.result() ?? null);
      setProgress(100);
      setStage("complete");
      if (result.status === "manual_review") {
        setStatusMessage("تحتاج الدفعة إلى مراجعة بشرية قبل اعتماد Snapshot. الجودة " + result.data_quality_score + "/100.");
      } else if (result.status === "rejected") {
        setStatusMessage("رُفضت الدفعة وفق نتيجة الجودة " + result.data_quality_score + "/100؛ لم تُنشأ لقطة معتمدة.");
      } else {
        setStatusMessage("انتهت المعالجة: " + result.status + " • DQS " + result.data_quality_score + "/100 • Snapshot " + (result.snapshot_id ?? "غير منشأ"));
      }
      await refetch();
      onNotice(result.status === "completed" ? "اكتمل الاستيراد بجودة " + result.data_quality_score + "/100" : "انتهت الدفعة بالحالة: " + result.status);
    } catch (cause) {
      await handleImportFailure(
        cause,
        job,
        processingConfigFingerprint,
        checkpointFingerprintPersisted,
      );
    } finally {
      runningRef.current = false;
      pausedRef.current = false;
      setPaused(false);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || runningRef.current) return;
    if (file.size === 0) { setErrorMessage('الملف فارغ. اختر ملفًا يحتوي على بيانات.'); return; }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setErrorMessage("حجم الملف يتجاوز الحد المسموح 100MB.");
      return;
    }
    if (sourceSystem !== "manual" && !externalSourceReference.trim()) {
      setErrorMessage("مرجع المصدر الخارجي/رقم الدفعة مطلوب عند الاستيراد من Onyx Pro أو ERP أو ملف مورد؛ لم يتم إنشاء دفعة.");
      return;
    }
    setErrorMessage("");
    setStatusMessage("");
    setStage("reading");
    setProgress(0);
    try {
      const fileHash = await hashFileSha256(file, (bytes) => {
        setProgress(Math.round((bytes / Math.max(file.size, 1)) * 10));
      });
      setStage("detecting");
      const duplicate = await findImportDuplicate(fileHash, activeProfileId, periodKey.trim() || null) as DuplicateResult;
      if (duplicate.duplicate) {
        setDuplicatePrompt({
          file,
          fileHash,
          profileId: activeProfileId,
          periodKey: periodKey.trim() || null,
          sourceSystem,
          externalSourceReference: sourceSystem === "manual" ? null : externalSourceReference.trim() || null,
          duplicate,
        });
        setStage(null);
        setStatusMessage("وجد المحرك ملفًا بنفس البصمة للملف التعريفي والفترة المحددين. اختر الإجراء قبل المتابعة.");
        return;
      }
      await processFile(file, fileHash, "new_version", undefined, activeProfileId, periodKey.trim() || null, sourceSystem,
        sourceSystem === "manual" ? null : externalSourceReference.trim() || null);
    } catch (cause) {
      setStage(null);
      setErrorMessage(cause instanceof Error ? cause.message : "تعذر قراءة بصمة الملف.");
    }
  }

  async function resolveDuplicate(action: DuplicateAction) {
    if (!duplicatePrompt) return;
    const pending = duplicatePrompt;
    setDuplicatePrompt(null);
    if (action === "ignore") {
      setStatusMessage("لم يُنشأ استيراد جديد؛ احتفظ النظام بالنسخة السابقة دون تعديل.");
      return;
    }
    if (action === "resume") {
      const openJob = pending.duplicate.jobs.find((item) =>
        ["staging", "uploading", "failed"].includes(item.status) && Boolean(item.upload_session_id),
      );
      if (!openJob) {
        setErrorMessage("لا توجد دفعة غير مكتملة قابلة للاستئناف لهذا الملف.");
        return;
      }
      await processFile(
        pending.file, pending.fileHash, "new_version", openJob, pending.profileId, pending.periodKey,
        openJob.source_system ?? pending.sourceSystem,
        openJob.external_source_reference ?? pending.externalSourceReference,
      );
      return;
    }
    await processFile(pending.file, pending.fileHash, action, undefined, pending.profileId, pending.periodKey,
      pending.sourceSystem, pending.externalSourceReference);
  }

  async function resumeFromHistory(event: ChangeEvent<HTMLInputElement>, job: ImportJob & { upload_session_id?: string | null }) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || runningRef.current) return;
    if (file.size !== job.file_size) {
      setErrorMessage("حجم الملف لا يطابق الدفعة السابقة.");
      return;
    }
    try {
      const fileHash = await hashFileSha256(file);
      if (fileHash !== job.file_hash) {
        setErrorMessage("بصمة الملف لا تطابق الدفعة السابقة؛ اختر الملف الأصلي نفسه.");
        return;
      }
      await processFile(file, fileHash, "new_version", job, job.profile_id ?? activeProfileId, job.period_key ?? null,
        job.source_system ?? sourceSystem, job.external_source_reference ?? null);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "تعذر استئناف الدفعة.");
    }
  }

  async function rollbackJob(job: ImportJob) {
    if (!canRollbackImport || !["completed", "completed_with_warnings"].includes(job.status)) return;
    const reason = window.prompt("اكتب سبب التراجع عن أحدث لقطة لهذه الدفعة (3 إلى 1000 حرف):", "");
    if (reason === null) return;
    if (reason.trim().length < 3 || reason.trim().length > 1000) {
      setErrorMessage("سبب التراجع مطلوب ويجب أن يكون بين 3 و1000 حرف.");
      return;
    }
    if (!window.confirm("سيؤرشف النظام اللقطة الجاهزة الأحدث المرتبطة بهذه الدفعة فقط، مع الاحتفاظ بجميع الصفوف وسجل التدقيق. لا يمكن أرشفة لقطة أقدم إذا كانت هناك لقطة أحدث. هل تتابع؟")) return;
    setErrorMessage("");
    setStatusMessage("جارٍ التحقق من صلاحية التراجع وحالة أحدث لقطة على الخادم…");
    try {
      const result = await rollbackImportSnapshot(job.id, reason);
      await refetch();
      setStatusMessage(
        result.alreadyRolledBack
          ? "سبق تنفيذ التراجع عن هذه الدفعة؛ أكد الخادم بقاء اللقطة مؤرشفة والصفوف التاريخية محفوظة."
          : "تمت أرشفة اللقطة " + (result.snapshotVersion === null ? "" : "رقم " + formatNumber(result.snapshotVersion) + " ") +
            "وسُجل سبب التراجع وهوية المنفذ في سجل التدقيق. لم تُحذف صفوف اللقطة أو دفعة الاستيراد.",
      );
      onNotice(result.alreadyRolledBack ? "التراجع مسجل مسبقًا؛ لم تتكرر العملية." : "تم التراجع الآمن عن لقطة الاستيراد مع الاحتفاظ بالتاريخ.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر التراجع الآمن عن لقطة الاستيراد.";
      setErrorMessage(message);
      setStatusMessage("لم يتم تأكيد التراجع. بقيت الصفوف التاريخية محفوظة؛ راجع أحدث حالة على الخادم قبل إعادة المحاولة.");
    }
  }

  async function toggleRowErrors(job: ImportJob) {
    const previous = rowErrorState;
    const requestId = ++rowErrorRequestId.current;
    if (previous?.jobId === job.id && !previous.loading) {
      setRowErrorState(null);
      return;
    }
    setRowErrorState({ jobId: job.id, rows: [], loading: true, error: "", offset: 0, hasMore: false });
    try {
      const rows = await fetchImportRowErrors(job.id, 100, 0);
      if (requestId === rowErrorRequestId.current) {
        setRowErrorState({ jobId: job.id, rows, loading: false, error: "", offset: rows.length, hasMore: rows.length === 100 });
      }
    } catch (cause) {
      if (requestId === rowErrorRequestId.current) {
        setRowErrorState({
          jobId: job.id, rows: [], loading: false,
          error: cause instanceof Error ? cause.message : "تعذر تحميل أسباب رفض الصفوف.",
          offset: 0, hasMore: false,
        });
      }
    }
  }

  async function loadMoreRowErrors(job: ImportJob) {
    const previous = rowErrorState;
    if (!previous || previous.jobId !== job.id || previous.loading || !previous.hasMore) return;
    const requestId = ++rowErrorRequestId.current;
    setRowErrorState({ ...previous, loading: true, error: "" });
    try {
      const nextRows = await fetchImportRowErrors(job.id, 100, previous.offset);
      if (requestId === rowErrorRequestId.current) {
        setRowErrorState({
          jobId: job.id,
          rows: [...previous.rows, ...nextRows],
          loading: false,
          error: "",
          offset: previous.offset + nextRows.length,
          hasMore: nextRows.length === 100,
        });
      }
    } catch (cause) {
      if (requestId === rowErrorRequestId.current) {
        setRowErrorState({
          ...previous, loading: false,
          error: cause instanceof Error ? cause.message : "تعذر تحميل صفحة أخطاء الصفوف التالية.",
        });
      }
    }
  }

  return (
    <AdminPage eyebrow="البيانات والذكاء" title="محرك الاستيراد الموحد" description="معالجة CSV متدفقة، بصمات SHA-256، ملف تعريفي وإدارة نسخ دون حفظ الملفات الخام." icon={Upload} note="ملف خام لا يغادر المتصفح؛ الحفظ في الخادم يقتصر على الميتاداتا والصفوف المنظمة واللقطات.">
      <div className="import-layout">
        <section className="panel import-upload-panel">
          <div className="import-upload-icon"><Upload size={26} /></div>
          <h2>رفع ملف للمعالجة</h2>
          <p>يدعم CSV وملفات XLSX الجدولية (الورقة المرئية الأولى). صيغة XLS الثنائية وPDF تبقيان في مسار التعيين اليدوي؛ لا تُخترع بيانات غير مستخرجة.</p>
          <div className="form-grid">
            <label className="form-field"><span>مصدر البيانات</span>
              <select value={sourceSystem} disabled={stage !== null || Boolean(duplicatePrompt)} onChange={(event) => { setSourceSystem(event.target.value); setExternalSourceReference(""); }}>
                <option value="manual">رفع يدوي</option>
                <option value="onyx_pro">Onyx Pro</option>
                <option value="external_erp">نظام ERP خارجي</option>
                <option value="supplier_feed">ملف مورد</option>
              </select>
              <small>يحفظ هذا الاختيار هوية المصدر في سجل الدفعة فقط؛ لا يبدأ مزامنة حية أو اتصالًا خارجيًا.</small>
            </label>
            {sourceSystem !== "manual" && <label className="form-field"><span>مرجع المصدر الخارجي / رقم الدفعة</span>
              <input value={externalSourceReference} disabled={stage !== null || Boolean(duplicatePrompt)}
                onChange={(event) => setExternalSourceReference(event.target.value)}
                maxLength={200} required placeholder="معرّف الدفعة في Onyx أو ERP أو ملف المورد" />
              <small>حتى 200 حرف. يدخل المرجع في هوية الطلب وبصمة المعالجة وسجل الدفعة؛ لا تُرسل أي مزامنة خارجية.</small>
            </label>}
            <label className="form-field"><span>الملف التعريفي</span>
              <select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
                <option value="">الملف الموحد (تلقائي)</option>
                {(profiles ?? []).filter((profile: ImportProfile) => profile.status === "active").map((profile: ImportProfile) =>
                  <option key={profile.id} value={profile.id}>{profile.profile_name} — v{profile.version}</option>,
                )}
              </select>
              <small role="status">
                {selectedImportProfile?.is_full_dataset === true
                  ? "هذا الملف التعريفي مصنف كمجموعة كاملة. سيظل الخادم يتحقق من الإصدار وبصمة المعالجة قبل السماح بالاستبدال."
                  : "هذا الملف التعريفي غير مثبت كمجموعة كاملة؛ الاستبدال الكامل محظور. استخدم «دمج» أو «نسخة جديدة» حتى لا تختفي سجلات غائبة عن ملف جزئي."}
              </small>
            </label>
            <label className="form-field"><span>الفترة (اختياري)</span>
              <input value={periodKey} onChange={(event) => setPeriodKey(event.target.value)} maxLength={120} placeholder="مثال: 2026-01 أو 2026-Q1" />
            </label>
          </div>
          <label className="import-dropzone">
            <input type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={handleFile} disabled={Boolean(stage && stage !== "complete")} />
            <FileDown size={22} /><strong>اختر CSV أو XLSX أو XLS أو PDF</strong>
            <span>100MB كحد أقصى • شرائح 4MB • دفعات معالجة 1,000 صف</span>
          </label>
          {errorMessage && <div className="form-error"><XCircle size={15} /> {errorMessage}</div>}
          {statusMessage && <div className="privacy-note" role="status"><ShieldCheck size={17} /><span>{statusMessage}</span></div>}
          <div className="privacy-note"><ShieldCheck size={17} /><span>الملف الخام لا يُخزن. لا تُحذف سجلات تشغيلية بسبب غيابها من ملف الاستيراد.</span></div>
        </section>

        {duplicatePrompt && <section className="panel" role="alert" style={{ gridColumn: "1 / -1", borderColor: "#d8c17a" }}>
          <h2>تم اكتشاف ملف مطابق</h2>
          <p>الاسم: <strong>{duplicatePrompt.file.name}</strong> • SHA-256: <code>{duplicatePrompt.fileHash.slice(0, 20)}…</code> • المصدر: {duplicatePrompt.sourceSystem} • مرجع المصدر: {duplicatePrompt.externalSourceReference ?? "غير محدد"} • دفعات سابقة: {duplicatePrompt.duplicate.jobs.length} • لقطات: {duplicatePrompt.duplicate.snapshots.length}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="outline" onClick={() => void resolveDuplicate("ignore")}>تجاهل</Button>
            {duplicatePrompt.duplicate.jobs.some((item) => ["staging", "failed"].includes(item.status) && Boolean(item.upload_session_id)) &&
              <Button variant="secondary" onClick={() => void resolveDuplicate("resume")}>استئناف دفعة غير مكتملة</Button>}
            <Button variant="secondary" onClick={() => void resolveDuplicate("replace")}>استبدال النسخة</Button>
            <Button variant="secondary" onClick={() => void resolveDuplicate("merge")}>دمج وفق سياسة الملف</Button>
            <Button onClick={() => void resolveDuplicate("new_version")}>إنشاء نسخة جديدة</Button>
          </div>
          <small style={{ display: "block", marginTop: 8 }}>الاستبدال يؤرشف اللقطة السابقة ولا يمحو سجلها. التعارضات التي تتطلب قرارًا بشريًا توقف الدمج.</small>
        </section>}

        <section className="panel pipeline-panel">
          <div className="panel-head">
            <div><h2>مراحل المعالجة</h2><p>تقدم فعلي من القراءة والصفوف المحفوظة إلى قرار الخادم واللقطة.</p></div>
            {stage && stage !== "complete" && <div style={{ display: "flex", gap: 8 }}>
              <button className="pause-button" onClick={() => updatePaused(!pausedRef.current)}>{paused ? <Play size={16} /> : <Pause size={16} />}{paused ? "استئناف" : "إيقاف مؤقت"}</button>
              <button className="pause-button" onClick={() => { cancelRef.current = true; pausedRef.current = false; setPaused(false); }}>إلغاء</button>
            </div>}
          </div>
          <div className="pipeline">{STAGES.map((item, index) => {
            const current = stage === item.id;
            const complete = stage === "complete" || (stage && STAGES.findIndex((entry) => entry.id === stage) > index);
            return <div className={"pipeline-step " + (current ? "current" : "") + (complete ? " complete" : "")} key={item.id}>
              <span>{complete ? <Check size={14} /> : index + 1}</span><small>{item.label}</small>
            </div>;
          })}</div>
          {stage && <div className="progress-area">
            <div className="progress-label"><span>المرحلة الحالية: {STAGES.find((item) => item.id === stage)?.label ?? "اكتملت المعالجة"}</span><b>{progress}%</b></div>
            <div className="progress-track"><i style={{ width: progress + "%" }} /></div>
            <small>{formatNumber(processed)} صف تمت معالجته {qualityPreview ? "• DQS أولي " + qualityPreview.score + "/100 (" + (qualityPreview.score >= 90 ? 'ممتاز' : qualityPreview.score >= 75 ? 'مقبول' : qualityPreview.score >= 50 ? 'تحذير' : 'مرفوض') + ")" : ""}</small>
          </div>}
        </section>

        <section className="panel import-jobs-panel">
          <div className="panel-head"><div><h2>سجل الدفعات</h2><p>البصمة والميتا والنتائج دون حفظ الملفات الخام</p></div><Button variant="outline" onClick={refetch}><RefreshCw size={15} /> تحديث</Button></div>
          {loading ? <Loading /> : error ? <ErrorBox message={error} /> : jobs?.length ? <TableWrap><table>
            <thead><tr><th>الملف</th><th>المصدر</th><th>الحالة</th><th>DQS</th><th>الصفوف</th><th>التاريخ</th><th>الاستئناف</th><th>أخطاء الصفوف</th>{canRollbackImport && <th>التراجع</th>}</tr></thead>
            <tbody>{jobs.map((job) => <Fragment key={job.id}>
              <tr
                id={"admin-import-job-" + job.id}
                aria-current={initialJobId === job.id ? "true" : undefined}
                style={initialJobId === job.id ? { outline: "2px solid var(--primary)", outlineOffset: "-2px", background: "var(--accent, rgba(15, 118, 110, .08))" } : undefined}
              >
                <td><strong>{job.file_name ?? "—"}</strong><small>{job.file_hash?.slice(0, 16) ?? "—"}…</small></td>
                <td>{job.source_system || "manual"}<small>{job.external_source_reference || "لا يوجد مرجع خارجي"}</small></td>
                <td><span className={"badge " + (job.status === "completed" ? "success" : ["rejected", "failed", "cancelled", "rolled_back"].includes(job.status) ? "danger" : "warning")}>{job.status === "manual_mapping_required" ? "تعيين يدوي" : job.status === "manual_review" ? "مراجعة بشرية" : job.status === "rolled_back" ? "تم التراجع مع حفظ التاريخ" : job.status}</span></td>
                <td>{job.data_quality_score == null ? "—" : job.data_quality_score + "/100 (" + (qualityPreview?.score === job.data_quality_score ? qualityPreview.label : job.data_quality_score >= 90 ? "ممتاز" : job.data_quality_score >= 75 ? "مقبول" : job.data_quality_score >= 50 ? "تحذير" : "مرفوض") + ")"}</td>
                <td>{formatNumber(job.processed_rows)} / {formatNumber(job.total_rows)}</td>
                <td>{new Date(job.created_at).toLocaleDateString("ar")}</td>
                <td>{["staging", "failed"].includes(job.status) && job.upload_session_id &&
                  <label className="sf-link" style={{ cursor: "pointer" }}>اختر الملف الأصلي<input type="file" accept=".csv,.xlsx" style={{ display: "none" }} onChange={(event) => void resumeFromHistory(event, job)} /></label>}</td>
                <td>{(Number(job.failed_rows ?? 0) > 0 || ["failed", "rejected"].includes(job.status)) &&
                  <Button variant="outline" onClick={() => void toggleRowErrors(job)}>
                    {rowErrorState?.jobId === job.id && !rowErrorState.loading ? "إخفاء التفاصيل" : "عرض الأسباب"}
                  </Button>}</td>
                {canRollbackImport && <td>{["completed", "completed_with_warnings"].includes(job.status) &&
                  <Button variant="outline" onClick={() => void rollbackJob(job)}>تراجع آمن</Button>}</td>}
              </tr>
              {rowErrorState?.jobId === job.id && <tr><td colSpan={canRollbackImport ? 9 : 8} style={{ whiteSpace: "normal", minWidth: 320 }}>
                {rowErrorState.loading && rowErrorState.rows.length === 0 ? <Loading /> : rowErrorState.error && rowErrorState.rows.length === 0 ? <ErrorBox message={rowErrorState.error} /> : rowErrorState.rows.length === 0
                  ? <Empty text="لا توجد صفوف مرفوضة مسجلة لهذه الدفعة؛ قد يكون الفشل حدث قبل اكتمال قراءة الصفوف." />
                  : <div>
                    <strong>أسباب رفض الصفوف (المحمّل {formatNumber(rowErrorState.rows.length)} صفًا)</strong>
                    <ol>{rowErrorState.rows.map((row) => {
                      const messages = Array.isArray(row.errors)
                        ? row.errors.filter((message): message is string => typeof message === "string" && message.trim().length > 0)
                        : typeof row.errors === "string" && row.errors.trim() ? [row.errors] : [];
                      return <li key={row.row_number}><strong>الصف {formatNumber(row.row_number)}:</strong> {messages.length ? messages.join("؛ ") : "لم يسجل الخادم سببًا نصيًا لهذا الصف."}</li>;
                    })}</ol>
                    {rowErrorState.error && <ErrorBox message={rowErrorState.error} />}
                    {rowErrorState.loading && <Loading />}
                    {rowErrorState.hasMore && <Button variant="outline" disabled={rowErrorState.loading} onClick={() => void loadMoreRowErrors(job)}>
                      {rowErrorState.loading ? "جارٍ تحميل المزيد…" : "تحميل 100 سبب إضافي"}
                    </Button>}
                  </div>}
              </td></tr>}
            </Fragment>)}</tbody>
          </table></TableWrap> : <Empty text="لا توجد دفعات مستوردة بعد" />}
        </section>
      </div>
    </AdminPage>
  );
}
