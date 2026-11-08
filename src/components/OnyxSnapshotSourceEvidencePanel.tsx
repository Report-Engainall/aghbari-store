import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Database, Download, Fingerprint, Link2, ShieldCheck } from "lucide-react";
import {
  fetchOnyxSnapshotSourceEvidence,
  type OnyxSnapshotSourceEvidence,
} from "@/lib/onyx-source-evidence";
import { buildOnyxSourceEvidenceCsv } from "@/lib/onyx-source-evidence-export";

function dateText(value: string | null | undefined): string {
  if (!value) return "غير مسجل";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "تاريخ غير صالح" : date.toLocaleString("ar-YE");
}

const provenanceLabels: Record<OnyxSnapshotSourceEvidence["source_identity"]["provenance_status"], string> = {
  snapshot_without_import_job: "لقطة محفوظة بلا مرجع دفعة استيراد",
  linked_import_job_unavailable: "مرجع دفعة الاستيراد غير متاح ضمن المؤسسة الحالية",
  linked_hash_mismatch: "تحذير: بصمة اللقطة تختلف عن بصمة دفعة الاستيراد",
  linked_import_job_hash_match: "مرجع دفعة الاستيراد موجود والبصمة متطابقة",
};

function sourceSystemLabel(value: string | null): string {
  if (!value) return "غير مسجل";
  if (value === "manual") return "استيراد ملف يدوي";
  if (value.toLocaleLowerCase("en") === "onyx") return "وسم المصدر Onyx (لا يثبت اتصالًا حيًا)";
  return value;
}


function OnyxSourceMetadata({ evidence }: { evidence: OnyxSnapshotSourceEvidence }) {
  const identity = evidence.source_identity;
  return (
    <div className="onyx-source-metadata">
      <span><strong>المؤسسة الفعالة من قاعدة البيانات:</strong> <span data-testid="onyx-evidence-organization-name">{evidence.organization.name}</span> · <code>{evidence.organization.id}</code></span>
      <span><strong>حالة إثبات المنشأ:</strong> {provenanceLabels[identity.provenance_status]}</span>
      <span><strong>نظام المصدر المسجل:</strong> {sourceSystemLabel(identity.source_system)}</span>
      <span><strong>معرّف سجل المصدر الخارجي:</strong> <code>{identity.source_record_id || "غير متاح"}</code></span>
      <span><strong>صفوف المصدر المقروءة:</strong> {identity.source_row_count}</span>
      <span><strong>صفوف بها حقول معرّف خارجي مرشحة:</strong> {identity.rows_with_external_id}</span>
      <span><strong>حقول المعرّف الخارجي المكتشفة:</strong> {identity.external_id_fields_found.length ? identity.external_id_fields_found.join("، ") : "لم يُكتشف حقل معرّف خارجي صريح"}</span>
    </div>
  );
}

function OnyxExternalIdExamples({ examples }: {
  examples: OnyxSnapshotSourceEvidence["source_identity"]["external_id_examples"];
}) {
  return (
    <ol style={{ display: "grid", gap: 8, paddingInlineStart: 22, margin: 0 }}>
      {examples.map((row) => <OnyxExternalIdRow key={row.row_number} row={row} />)}
    </ol>
  );
}

function OnyxExternalIdsEvidence({ evidence }: { evidence: OnyxSnapshotSourceEvidence["source_identity"] }) {
  const examples = evidence.external_id_examples;
  return (
    <section aria-label="عينات معرّفات المصدر الخارجية" style={{ marginTop: 10, padding: 12, border: "1px solid var(--border, #d8e0e0)", borderRadius: 10 }}>
      <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>قيم المعرّفات الخارجية المحفوظة في صفوف المصدر</h3>
      {examples.length === 0
        ? <p style={{ margin: 0 }}>لم تُحفظ قيم معرّفات خارجية مع صفوف هذه اللقطة.</p>
        : <OnyxExternalIdExamples examples={examples} />}
      {evidence.external_id_examples_truncated && <p role="note" style={{ margin: "8px 0 0" }}>تُعرض أول 20 صفًا فقط؛ توجد صفوف إضافية بها معرّفات خارجية.</p>}
    </section>
  );
}

function OnyxExternalIdRow({ row }: { row: OnyxSnapshotSourceEvidence["source_identity"]["external_id_examples"][number] }) {
  return (
    <li>
      <span>صف المصدر {row.row_number} · المفتاح: <code dir="ltr">{row.canonical_key}</code>{row.canonical_key_truncated ? " (المفتاح معروض بشكل مقتطع)" : ""}</span>
      <ul style={{ marginBlock: 4 }}>
        {Object.entries(row.external_ids).map(([field, value]) => <li key={field}><code dir="ltr">{field}</code>: <code dir="ltr">{value}</code></li>)}
      </ul>
      {row.value_truncated && <p style={{ margin: 0 }}>قيمة معرّف واحدة أو أكثر في هذا الصف مقتطعة إلى 256 محرفًا.</p>}
    </li>
  );
}

function OnyxImportJobEvidence({ job }: { job: NonNullable<OnyxSnapshotSourceEvidence["import_job"]> }) {
  return (
    <div className="onyx-source-metadata" style={{ marginTop: 10 }}>
      <span><strong>دفعة الاستيراد:</strong> <code>{job.id}</code></span>
      <span><strong>ملف الدفعة:</strong> {job.file_name || "اسم الملف غير مسجل"}</span>
      <span><strong>نوع الدفعة:</strong> {job.job_type || "غير مسجل"}</span>
      <span><strong>حالة الدفعة:</strong> {job.status}</span>
      <span><strong>وقت إنشاء الدفعة:</strong> {dateText(job.created_at)}</span>
      <span><strong>آخر تحديث للدفعة:</strong> {dateText(job.updated_at)}</span>
      <span><strong>تطابق بصمة الملف:</strong> {job.file_hash_matches_snapshot ? <><CheckCircle2 size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />متطابقة</> : <><AlertTriangle size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />غير متطابقة</>}</span>
      <span><strong>رمز خطأ الاستيراد المسجل:</strong> {job.error_code || "لا يوجد رمز خطأ محفوظ"}</span>
    </div>
  );
}

function OnyxLiveSyncEvidence({ evidence }: { evidence: OnyxSnapshotSourceEvidence }) {
  const sync = evidence.live_sync_evidence;
  const attempt = sync.last_sync_attempt;
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 12, padding: 12, border: "1px solid var(--border, #d8e0e0)", borderRadius: 10 }}>
      <strong><Database size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />حالة الاتصال والمزامنة الحية</strong>
      <span><strong>حالة اتصال Onyx المسجلة تاريخيًا:</strong> {sync.live_connection_proven ? "يوجد رد ناجح مسجل من الخدمة" : "غير مثبتة بأدلة هذا السجل"}</span>
      <span><strong>هل ارتبط رد ناجح بهذه اللقطة تحديدًا؟</strong> {sync.snapshot_sync_proven ? "نعم — توجد محاولة ناجحة موثقة لهذه اللقطة" : "لا — لا يوجد إثبات نجاح مرتبط بهذه اللقطة"}</span>
      <span><strong>آخر محاولة مزامنة مرتبطة باللقطة:</strong> {attempt ? attempt.status : "لا توجد محاولة مسجلة"}</span>
      {attempt && <OnyxSyncAttemptEvidence attempt={attempt} />}
      <span>{sync.live_connection_proven ? "توجد استجابة ناجحة مسجلة تاريخيًا؛ لا يثبت ذلك الحالة الصحية الحالية للخدمة." : "وجود لقطة أو دفعة استيراد محفوظة لا يثبت اتصالًا حيًا أو اكتمال مزامنة من واجهة Onyx API."}</span>
      <span><Clock3 size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />وقت آخر استجابة ناجحة مسجلة: {dateText(sync.latest_successful_connection?.completed_at)}</span>
      <span><Fingerprint size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />بصمة اللقطة: <code>{evidence.snapshot.source_file_hash}</code></span>
      <span><Link2 size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />وقت حفظ اللقطة: {dateText(evidence.snapshot.created_at)} · الإصدار {evidence.snapshot.snapshot_version}</span>
    </div>
  );
}

function OnyxSyncAttemptEvidence({ attempt }: { attempt: NonNullable<OnyxSnapshotSourceEvidence["live_sync_evidence"]["last_sync_attempt"]> }) {
  return (
    <>
      <span><Clock3 size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />بدء المحاولة: {dateText(attempt.started_at)} · الاكتمال: {dateText(attempt.completed_at)}</span>
      <span>عملية: <code dir="ltr">{attempt.operation}</code> · HTTP: {attempt.http_status ?? "غير مسجل"} · معرّف الطلب الخارجي: <code dir="ltr">{attempt.external_request_id ?? "غير مسجل"}</code></span>
      {attempt.error_code && <span role="alert">رمز الخطأ: <code dir="ltr">{attempt.error_code}</code> — {attempt.error_summary ?? "لا يوجد ملخص خطأ محفوظ"}</span>}
    </>
  );
}

function OnyxSourceEvidenceContent({ evidence, exportMessage, onExport }: {
  evidence: OnyxSnapshotSourceEvidence;
  exportMessage: string;
  onExport: () => void;
}) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBlock: 10 }}>
        <button type="button" className="btn secondary" data-testid="onyx-source-evidence-export" onClick={onExport}>
          <Download size={15} aria-hidden="true" /> تصدير أدلة المصدر CSV
        </button>
        {exportMessage && <p role="status" style={{ margin: 0 }}>{exportMessage}</p>}
      </div>
      <OnyxSourceMetadata evidence={evidence} />
      <OnyxExternalIdsEvidence evidence={evidence.source_identity} />
      {evidence.import_job ? <OnyxImportJobEvidence job={evidence.import_job} /> : <p role="status">لا يوجد مرجع دفعة استيراد متاح لهذه اللقطة. لا يُفترض مصدر بديل.</p>}
      <OnyxLiveSyncEvidence evidence={evidence} />
    </>
  );
}

export function OnyxSnapshotSourceEvidencePanel({ snapshotId }: { snapshotId: string }) {
  const [evidence, setEvidence] = useState<OnyxSnapshotSourceEvidence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    let active = true;
    setEvidence(null);
    setError("");
    setExportMessage("");
    setLoading(true);
    void fetchOnyxSnapshotSourceEvidence(snapshotId)
      .then((result) => { if (active) setEvidence(result); })
      .catch(() => { if (active) setError("تعذر تحميل أدلة المصدر لهذه اللقطة. تحقق من صلاحية المؤسسة ثم أعد المحاولة."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [snapshotId]);

  function exportEvidence() {
    if (!evidence) return;
    let objectUrl: string | null = null;
    try {
      const csv = buildOnyxSourceEvidenceCsv(evidence);
      const blob = new Blob(["\\uFEFF", csv], { type: "text/csv;charset=utf-8" });
      objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `aghbari-onyx-source-evidence-${evidence.snapshot.id}.csv`;
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setExportMessage("تم تجهيز ملف أدلة المصدر CSV للّقطة المحددة.");
    } catch {
      setExportMessage("تعذر إنشاء ملف التصدير؛ أعد المحاولة.");
    } finally {
      if (objectUrl) {
        const urlToRevoke = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 0);
      }
    }
  }

  return (
    <section className="panel" dir="rtl" aria-label="أدلة هوية مصدر أونكس" style={{ marginBlock: 14, padding: 16 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <ShieldCheck size={19} aria-hidden="true" />
        <div>
          <h2 style={{ margin: 0, fontSize: 17 }}>هوية المصدر وأدلة الاستيراد</h2>
          <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.82 }}>مطابقة محفوظة بين اللقطة ودفعة الاستيراد؛ لا تُثبت اتصال أونكس حيًا.</p>
        </div>
      </header>
      {loading ? <p role="status">جار قراءة سجل مصدر اللقطة من قاعدة البيانات…</p> : null}
      {error ? <p role="alert" style={{ color: "var(--destructive, #b42318)" }}><AlertTriangle size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />{error}</p> : null}

      {!loading && !error && evidence && (
        <OnyxSourceEvidenceContent evidence={evidence} exportMessage={exportMessage} onExport={exportEvidence} />
      )}
    </section>
  );
}
