import type { OnyxSnapshotSourceEvidence } from "@/lib/onyx-source-evidence";

const HEADERS = ["section", "record_index", "field", "value", "canonical_key"] as const;

/**
 * CSV cells can contain hostile text originating in imported source files.
 * Prefix spreadsheet formula-like cells (even after leading controls/whitespace)
 * with an apostrophe before quoting them. CSV quoting alone does not prevent formula execution.
 */
function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  let firstNonControl: string | undefined;
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code <= 0x20 || (code >= 0x7f && code <= 0x9f)) continue;
    firstNonControl = character;
    break;
  }
  if (firstNonControl && "=+-@".includes(firstNonControl)) {
    text = "'" + text;
  }
  return '"' + text.replace(/"/g, '""') + '"';
}

/**
 * Export the same tenant-scoped evidence returned by get_onyx_snapshot_source_evidence.
 * This deliberately exports the authorized, bounded sample only; it never re-queries data
 * client-side, invents external IDs, or represents snapshot/import records as live sync proof.
 */
export function buildOnyxSourceEvidenceCsv(evidence: OnyxSnapshotSourceEvidence): string {
  const rows: string[] = [[...HEADERS].map(csvCell).join(",")];
  const add = (section: string, index: string | number, field: string, value: unknown, canonicalKey = "") => {
    rows.push([section, index, field, value, canonicalKey].map(csvCell).join(","));
  };

  add("organization", "", "id", evidence.organization.id);
  add("organization", "", "name", evidence.organization.name);

  const snapshot = evidence.snapshot;
  add("snapshot", "", "id", snapshot.id);
  add("snapshot", "", "source_import_job_id", snapshot.source_import_job_id ?? "NOT_AVAILABLE");
  add("snapshot", "", "source_file_name", snapshot.source_file_name ?? "NOT_RECORDED");
  add("snapshot", "", "source_file_hash_sha256", snapshot.source_file_hash);
  add("snapshot", "", "report_type", snapshot.report_type);
  add("snapshot", "", "period_key", snapshot.period_key ?? "NOT_RECORDED");
  add("snapshot", "", "snapshot_version", snapshot.snapshot_version);
  add("snapshot", "", "created_at", snapshot.created_at);
  add("snapshot", "", "row_count", snapshot.row_count);

  const job = evidence.import_job;
  add("import_job", "", "available", Boolean(job));
  if (job) {
    add("import_job", "", "id", job.id);
    add("import_job", "", "source_system", job.source_system ?? "NOT_RECORDED");
    add("import_job", "", "job_type", job.job_type ?? "NOT_RECORDED");
    add("import_job", "", "status", job.status);
    add("import_job", "", "file_name", job.file_name ?? "NOT_RECORDED");
    add("import_job", "", "file_hash_sha256", job.file_hash);
    add("import_job", "", "period_key", job.period_key ?? "NOT_RECORDED");
    add("import_job", "", "created_at", job.created_at);
    add("import_job", "", "updated_at", job.updated_at ?? "NOT_RECORDED");
    add("import_job", "", "error_code", job.error_code ?? "NOT_RECORDED");
    add("import_job", "", "file_hash_matches_snapshot", job.file_hash_matches_snapshot);
  } else {
    add("import_job", "", "status", "NOT_AVAILABLE");
  }

  const identity = evidence.source_identity;
  add("source_identity", "", "provenance_status", identity.provenance_status);
  add("source_identity", "", "source_system", identity.source_system ?? "NOT_RECORDED");
  add("source_identity", "", "source_record_id", identity.source_record_id ?? "NOT_AVAILABLE");
  add("source_identity", "", "source_row_count", identity.source_row_count);
  add("source_identity", "", "rows_with_external_id", identity.rows_with_external_id);
  add("source_identity", "", "external_id_fields_found", identity.external_id_fields_found.join("|") || "NONE_FOUND");
  add("source_identity", "", "external_id_examples_truncated", identity.external_id_examples_truncated);

  for (const example of identity.external_id_examples) {
    const index = example.row_number;
    add("external_id_sample", index, "row_number", example.row_number, example.canonical_key);
    add("external_id_sample", index, "canonical_key_truncated", example.canonical_key_truncated, example.canonical_key);
    add("external_id_sample", index, "value_truncated", example.value_truncated, example.canonical_key);
    for (const [field, value] of Object.entries(example.external_ids)) {
      add("external_id_sample", index, "external_id." + field, value, example.canonical_key);
    }
  }

  const live = evidence.live_sync_evidence;
  add("live_sync_evidence", "", "status", live.status);
  add("live_sync_evidence", "", "live_connection_proven", live.live_connection_proven);
  add("live_sync_evidence", "", "snapshot_sync_proven", live.snapshot_sync_proven);
  add("live_sync_evidence", "", "message", live.message);

  const addAttempt = (section: string, attempt: OnyxSnapshotSourceEvidence["live_sync_evidence"]["last_sync_attempt"]) => {
    add(section, "", "available", Boolean(attempt));
    if (!attempt) {
      add(section, "", "status", "NOT_RECORDED");
      add(section, "", "started_at", "NOT_RECORDED");
      add(section, "", "completed_at", "NOT_RECORDED");
      add(section, "", "error_code", "NOT_RECORDED");
      add(section, "", "error_summary", "NOT_RECORDED");
      add(section, "", "request_sha256", "NOT_AVAILABLE");
      add(section, "", "response_sha256", "NOT_AVAILABLE");
      return;
    }
    add(section, "", "id", attempt.id);
    add(section, "", "operation", attempt.operation);
    add(section, "", "status", attempt.status);
    add(section, "", "snapshot_id", attempt.snapshot_id ?? "NOT_ASSOCIATED");
    add(section, "", "order_id", attempt.order_id ?? "NOT_ASSOCIATED");
    add(section, "", "started_at", attempt.started_at);
    add(section, "", "completed_at", attempt.completed_at ?? "NOT_COMPLETED");
    add(section, "", "http_status", attempt.http_status ?? "NOT_RECORDED");
    add(section, "", "external_request_id", attempt.external_request_id ?? "NOT_RECORDED");
    add(section, "", "error_code", attempt.error_code ?? "NONE_RECORDED");
    add(section, "", "error_summary", attempt.error_summary ?? "NONE_RECORDED");
    add(section, "", "request_sha256", attempt.request_sha256);
    add(section, "", "response_sha256", attempt.response_sha256 ?? "NOT_AVAILABLE");
  };
  addAttempt("last_sync_attempt", live.last_sync_attempt);
  addAttempt("latest_successful_connection", live.latest_successful_connection);
  addAttempt("snapshot_sync_success", live.snapshot_sync_success);

  return rows.join("\r\n") + "\r\n";
}
