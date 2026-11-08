import { supabase } from "@/lib/supabase";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OnyxLiveSyncAttempt = {
  id: string;
  operation: "inventory_pull" | "order_push";
  status: "started" | "succeeded" | "failed";
  snapshot_id: string | null;
  order_id: string | null;
  request_sha256: string;
  response_sha256: string | null;
  http_status: number | null;
  external_request_id: string | null;
  error_code: string | null;
  error_summary: string | null;
  started_at: string;
  completed_at: string | null;
};

export type OnyxSnapshotSourceEvidence = {
  organization: { id: string; name: string };
  snapshot: {
    id: string;
    source_import_job_id: string | null;
    source_file_name: string | null;
    source_file_hash: string;
    report_type: string;
    period_key: string | null;
    snapshot_version: number;
    created_at: string;
    row_count: number;
  };
  import_job: null | {
    id: string;
    source_system: string | null;
    job_type: string | null;
    status: string;
    file_name: string | null;
    file_hash: string;
    period_key: string | null;
    created_at: string;
    updated_at: string | null;
    error_code: string | null;
    file_hash_matches_snapshot: boolean;
  };
  source_identity: {
    external_id_examples: Array<{ row_number: number; canonical_key: string; canonical_key_truncated: boolean; external_ids: Record<string, string>; value_truncated: boolean }>;
    external_id_examples_truncated: boolean;
    provenance_status: "snapshot_without_import_job" | "linked_import_job_unavailable" | "linked_hash_mismatch" | "linked_import_job_hash_match";
    source_system: string | null;
    source_record_id: string | null;
    source_row_count: number;
    external_id_fields_found: string[];
    rows_with_external_id: number;
  };
  live_sync_evidence: {
    status: "proven" | "not_proven";
    live_connection_proven: boolean;
    snapshot_sync_proven: boolean;
    last_sync_attempt: OnyxLiveSyncAttempt | null;
    latest_successful_connection: OnyxLiveSyncAttempt | null;
    snapshot_sync_success: OnyxLiveSyncAttempt | null;
    message: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseLiveSyncAttempt(value: unknown, field: string): OnyxLiveSyncAttempt | null {
  if (value == null) return null;
  if (!isRecord(value)) throw new Error("سجل محاولة مزامنة أونكس غير صالح: " + field);
  const operation = value.operation;
  const status = value.status;
  const requestHash = value.request_sha256;
  const responseHash = value.response_sha256;
  const httpStatus = value.http_status;
  const startedAt = value.started_at;
  const completedAt = value.completed_at;
  if (typeof value.id !== "string" || !UUID_RE.test(value.id)) {
    throw new Error("معرّف محاولة مزامنة أونكس غير صالح: " + field + ".id");
  }
  if (
    (operation !== "inventory_pull" && operation !== "order_push") ||
    (status !== "started" && status !== "succeeded" && status !== "failed") ||
    typeof requestHash !== "string" || !/^[0-9a-f]{64}$/.test(requestHash) ||
    (responseHash != null && (typeof responseHash !== "string" || !/^[0-9a-f]{64}$/.test(responseHash))) ||
    (httpStatus != null && (typeof httpStatus !== "number" || !Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599)) ||
    typeof startedAt !== "string" || (completedAt != null && typeof completedAt !== "string")
  ) throw new Error("حقول محاولة مزامنة أونكس غير مكتملة: " + field);

  const errorCode = nullableString(value.error_code, field + ".error_code");
  if (status === "succeeded" && (
    completedAt == null || httpStatus == null || httpStatus < 200 || httpStatus > 299 ||
    typeof responseHash !== "string" || errorCode != null
  )) throw new Error("نجاح مزامنة أونكس لا يحتوي دليل استجابة مكتملًا: " + field);
  if (status === "failed" && (completedAt == null || !errorCode?.trim())) {
    throw new Error("محاولة أونكس الفاشلة تفتقد رمز الخطأ: " + field);
  }
  if (status === "started" && (completedAt != null || httpStatus != null || responseHash != null)) {
    throw new Error("محاولة أونكس غير المكتملة تحمل نتيجة نهائية: " + field);
  }
  const nullableUuid = (candidate: unknown, name: string) => {
    if (candidate == null) return null;
    if (typeof candidate !== "string" || !UUID_RE.test(candidate)) {
      throw new Error("معرّف محاولة مزامنة أونكس غير صالح: " + name);
    }
    return candidate;
  };
  return {
    id: value.id,
    operation,
    status,
    snapshot_id: nullableUuid(value.snapshot_id, field + ".snapshot_id"),
    order_id: nullableUuid(value.order_id, field + ".order_id"),
    request_sha256: requestHash,
    response_sha256: responseHash == null ? null : responseHash as string,
    http_status: httpStatus == null ? null : httpStatus as number,
    external_request_id: nullableString(value.external_request_id, field + ".external_request_id"),
    error_code: errorCode,
    error_summary: nullableString(value.error_summary, field + ".error_summary"),
    started_at: startedAt,
    completed_at: completedAt == null ? null : completedAt as string,
  };
}

function nonnegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error("بيانات تتبع مصدر أونكس غير صالحة: " + field);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new Error("بيانات تتبع مصدر أونكس غير صالحة: " + field);
  return value;
}

function parseOnyxImportJob(value: unknown): OnyxSnapshotSourceEvidence["import_job"] {
  if (value == null) return null;
  if (!isRecord(value)) throw new Error("مرجع دفعة الاستيراد غير صالح.");
  const job = value;
  if (
    typeof job.id !== "string" ||
    typeof job.status !== "string" ||
    typeof job.file_hash !== "string" ||
    typeof job.created_at !== "string" ||
    typeof job.file_hash_matches_snapshot !== "boolean"
  ) throw new Error("بيانات دفعة الاستيراد غير مكتملة.");
  return {
    id: job.id,
    source_system: nullableString(job.source_system, "source_system"),
    job_type: nullableString(job.job_type, "job_type"),
    status: job.status,
    file_name: nullableString(job.file_name, "file_name"),
    file_hash: job.file_hash,
    period_key: nullableString(job.period_key, "period_key"),
    created_at: job.created_at,
    updated_at: nullableString(job.updated_at, "updated_at"),
    error_code: nullableString(job.error_code, "error_code"),
    file_hash_matches_snapshot: job.file_hash_matches_snapshot,
  };
}

type OnyxExternalIdExample = OnyxSnapshotSourceEvidence["source_identity"]["external_id_examples"][number];

function parseOnyxExternalIdExample(example: unknown): OnyxExternalIdExample {
  if (
    !isRecord(example) ||
    typeof example.row_number !== "number" || !Number.isInteger(example.row_number) || example.row_number < 1 ||
    typeof example.canonical_key !== "string" ||
    typeof example.canonical_key_truncated !== "boolean" ||
    typeof example.value_truncated !== "boolean" ||
    !isRecord(example.external_ids) ||
    Object.values(example.external_ids).some((value) => typeof value !== "string")
  ) throw new Error("صف المعرّفات الخارجية غير صالح.");
  return {
    row_number: example.row_number,
    canonical_key: example.canonical_key,
    canonical_key_truncated: example.canonical_key_truncated,
    external_ids: example.external_ids as Record<string, string>,
    value_truncated: example.value_truncated,
  };
}

const ONYX_SNAPSHOT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidOnyxSnapshotId(value: string): boolean {
  return ONYX_SNAPSHOT_ID_PATTERN.test(value);
}

export async function fetchOnyxSnapshotSourceEvidence(snapshotId: string): Promise<OnyxSnapshotSourceEvidence> {
  if (!isValidOnyxSnapshotId(snapshotId)) {
    throw new Error("معرّف لقطة أونكس غير صالح.");
  }
  const { data, error } = await supabase.rpc("get_onyx_snapshot_source_evidence", { p_snapshot_id: snapshotId });
  if (error) throw new Error("تعذر قراءة أدلة مصدر أونكس: " + error.message);
  if (!isRecord(data) || !isRecord(data.organization) || !isRecord(data.snapshot) || !isRecord(data.source_identity) || !isRecord(data.live_sync_evidence)) {
    throw new Error("أعاد الخادم أدلة مصدر أونكس غير مكتملة؛ لم يتم افتراض أي قيم.");
  }
  if (typeof data.organization.id !== "string" || !data.organization.id || typeof data.organization.name !== "string" || !data.organization.name.trim()) {
    throw new Error("هوية المؤسسة المرتبطة بمصدر أونكس غير مكتملة.");
  }

  const rawSnapshot = data.snapshot;
  if (
    rawSnapshot.id !== snapshotId ||
    typeof rawSnapshot.source_file_hash !== "string" ||
    typeof rawSnapshot.report_type !== "string" ||
    typeof rawSnapshot.snapshot_version !== "number" ||
    !Number.isInteger(rawSnapshot.snapshot_version) ||
    rawSnapshot.snapshot_version < 1 ||
    typeof rawSnapshot.created_at !== "string"
  ) {
    throw new Error("لا تطابق بيانات المصدر اللقطة المحددة.");
  }

  const importJob = parseOnyxImportJob(data.import_job);

  const identity = data.source_identity;
  const allowedProvenance = new Set([
    "snapshot_without_import_job",
    "linked_import_job_unavailable",
    "linked_hash_mismatch",
    "linked_import_job_hash_match",
  ]);
  if (typeof identity.provenance_status !== "string" || !allowedProvenance.has(identity.provenance_status)) {
    throw new Error("حالة مصدر أونكس غير معروفة؛ لم يتم تصنيفها تلقائيًا.");
  }
  if (!Array.isArray(identity.external_id_fields_found) || identity.external_id_fields_found.some((x) => typeof x !== "string")) {
    throw new Error("قائمة حقول المعرّفات الخارجية غير صالحة.");
  }
  if (typeof identity.external_id_examples_truncated !== "boolean" || !Array.isArray(identity.external_id_examples)) {
    throw new Error("عينة المعرّفات الخارجية غير مكتملة.");
  }
  const externalIdExamples = identity.external_id_examples.map(parseOnyxExternalIdExample);
  const sync = data.live_sync_evidence;
  if (sync.status !== "not_proven" || sync.live_connection_proven !== false || typeof sync.message !== "string") {
    throw new Error("رفض الخادم حالة مزامنة غير مدعومة بالدليل.");
  }

  const { data: syncData, error: syncError } = await supabase.rpc("get_onyx_live_sync_attempt_evidence", {
    p_snapshot_id: snapshotId,
  });
  if (syncError) throw new Error("تعذر قراءة محاولات مزامنة أونكس: " + syncError.message);
  if (
    !isRecord(syncData) ||
    syncData.organization_id !== data.organization.id ||
    syncData.snapshot_id !== snapshotId ||
    typeof syncData.live_connection_proven !== "boolean" ||
    typeof syncData.snapshot_sync_proven !== "boolean" ||
    typeof syncData.live_connection_message !== "string"
  ) throw new Error("أعاد الخادم سجل مزامنة غير مكتمل أو لا يطابق المؤسسة واللقطة المحددتين.");

  const lastSyncAttempt = parseLiveSyncAttempt(syncData.last_sync_attempt, "last_sync_attempt");
  const latestSuccessfulConnection = parseLiveSyncAttempt(syncData.latest_successful_connection, "latest_successful_connection");
  const snapshotSyncSuccess = parseLiveSyncAttempt(syncData.snapshot_sync_success, "snapshot_sync_success");
  if (latestSuccessfulConnection && latestSuccessfulConnection.status !== "succeeded") {
    throw new Error("آخر اتصال ناجح مسجل لا يحمل حالة نجاح موثقة.");
  }
  if (snapshotSyncSuccess && (
    snapshotSyncSuccess.status !== "succeeded" ||
    snapshotSyncSuccess.snapshot_id !== snapshotId ||
    snapshotSyncSuccess.operation !== "inventory_pull"
  )) throw new Error("دليل مزامنة اللقطة لا يطابق عملية الاستيراد المختارة.");
  if (syncData.live_connection_proven !== Boolean(latestSuccessfulConnection)) {
    throw new Error("حالة إثبات الاتصال لا تطابق سجل الاستجابة الناجحة.");
  }
  if (syncData.snapshot_sync_proven !== Boolean(snapshotSyncSuccess)) {
    throw new Error("حالة إثبات مزامنة اللقطة لا تطابق سجل الاستجابة الناجحة.");
  }

  return {
    organization: { id: data.organization.id, name: data.organization.name },
    snapshot: {
      id: rawSnapshot.id,
      source_import_job_id: nullableString(rawSnapshot.source_import_job_id, "source_import_job_id"),
      source_file_name: nullableString(rawSnapshot.source_file_name, "source_file_name"),
      source_file_hash: rawSnapshot.source_file_hash,
      report_type: rawSnapshot.report_type,
      period_key: nullableString(rawSnapshot.period_key, "period_key"),
      snapshot_version: rawSnapshot.snapshot_version,
      created_at: rawSnapshot.created_at,
      row_count: nonnegativeInteger(rawSnapshot.row_count, "row_count"),
    },
    import_job: importJob,
    source_identity: {
      provenance_status: identity.provenance_status as OnyxSnapshotSourceEvidence["source_identity"]["provenance_status"],
      source_system: nullableString(identity.source_system, "source_system"),
      source_record_id: nullableString(identity.source_record_id, "source_record_id"),
      source_row_count: nonnegativeInteger(identity.source_row_count, "source_row_count"),
      external_id_fields_found: identity.external_id_fields_found as string[],
      external_id_examples: externalIdExamples,
      external_id_examples_truncated: identity.external_id_examples_truncated,
      rows_with_external_id: nonnegativeInteger(identity.rows_with_external_id, "rows_with_external_id"),
    },
    live_sync_evidence: {
      status: syncData.live_connection_proven ? "proven" : "not_proven",
      live_connection_proven: syncData.live_connection_proven,
      snapshot_sync_proven: syncData.snapshot_sync_proven,
      last_sync_attempt: lastSyncAttempt,
      latest_successful_connection: latestSuccessfulConnection,
      snapshot_sync_success: snapshotSyncSuccess,
      message: syncData.live_connection_message,
    },
  };
}
