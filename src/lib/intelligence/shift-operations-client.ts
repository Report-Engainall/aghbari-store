import { supabase } from "@/lib/supabase";
import {
  buildShiftOperationsCenter,
  isSafeShiftCashAmount,
  parseShiftOperationsSnapshot,
  type ShiftOperationsCenterResult,
  type ShiftOperationsSnapshot,
} from "./shift-operations";

type RpcError = { code?: string; message?: string };
type RpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: "DENIED" | "NOT_FOUND" | "UNAVAILABLE" | "ERROR"; message: string };

type UnknownRecord = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function rpcFailure(error: RpcError): Exclude<RpcResult<never>, { ok: true }> {
  const code = error.code ?? "";
  const message = typeof error.message === "string" && error.message.trim()
    ? error.message
    : "تعذر تنفيذ عملية الوردية.";
  if (code === "42501" || code === "28000" || code === "PGRST301") {
    return { ok: false, status: "DENIED", message: "لا تملك الصلاحية المطلوبة لهذه العملية." };
  }
  if (code === "P0002") {
    return { ok: false, status: "NOT_FOUND", message: "لم توجد وردية أو سجل مطابق في المؤسسة الحالية." };
  }
  if (code === "PGRST202" || code === "42883") {
    return { ok: false, status: "UNAVAILABLE", message: "خدمة الوردية غير متاحة في قاعدة البيانات الحالية؛ يلزم تطبيق ترحيل القسم 53." };
  }
  return { ok: false, status: "ERROR", message };
}

function validBusinessDate(value: string): boolean {
  if (!DAY.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function idempotencyKey(value?: string): string {
  if (value !== undefined) {
    if (!UUID.test(value)) throw new Error("مفتاح منع التكرار يجب أن يكون UUID صالحاً.");
    return value;
  }
  return crypto.randomUUID();
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) return rpcFailure(error);
  return { ok: true, data: data as T };
}

export interface StartOperationalShiftInput {
  businessDate: string;
  shiftLabel: string;
  timeZone: string;
  previousShiftId?: string | null;
  idempotencyKey?: string;
}

export interface ShiftCommandReceipt {
  shiftId?: string;
  handoverId?: string;
  cashCountId?: string;
  snapshotId?: string;
  snapshotKind?: "OPENING" | "CLOSEOUT";
  version?: number;
  recordedAt?: string;
  acceptedAt?: string;
  businessDate?: string;
  previousShiftId?: string | null;
  shiftLabel?: string;
  idempotentReplay: boolean;
}

export interface RecordShiftCashCountInput {
  shiftId: string;
  phase: "OPENING" | "CLOSING";
  currency: string;
  countedAmount: number;
  note?: string;
  correctionReason?: string;
  idempotencyKey?: string;
}

export interface RecordShiftHandoverInput {
  currentShiftId: string;
  openItemRefs: string[];
  reason?: string;
  note?: string;
  idempotencyKey?: string;
}

export interface FetchShiftWorkspaceInput {
  businessDate: string;
  shiftId?: string | null;
}

/** Opens a tenant-bound shift; organization and actor are always derived by PostgreSQL. */
export async function startOperationalShift(
  input: StartOperationalShiftInput,
): Promise<RpcResult<ShiftCommandReceipt>> {
  if (!validBusinessDate(input.businessDate) ||
      input.shiftLabel.trim().length < 2 || input.shiftLabel.trim().length > 80 ||
      input.timeZone.trim().length < 1 || input.timeZone.trim().length > 80 ||
      (input.previousShiftId != null && !UUID.test(input.previousShiftId))) {
    return { ok: false, status: "ERROR", message: "تاريخ الوردية أو اسمها أو المنطقة الزمنية غير صالح." };
  }
  const result = await callRpc<unknown>("start_operational_shift", {
    p_business_date: input.businessDate,
    p_shift_label: input.shiftLabel.trim(),
    p_time_zone: input.timeZone.trim(),
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
    p_previous_shift_id: input.previousShiftId ?? null,
  });
  if (!result.ok) return result;
  const raw = record(result.data);
  if (!raw || typeof raw.shift_id !== "string" || !UUID.test(raw.shift_id) ||
      typeof raw.business_date !== "string" || typeof raw.shift_label !== "string" ||
      typeof raw.started_at !== "string" || !Number.isFinite(Date.parse(raw.started_at))) {
    return { ok: false, status: "ERROR", message: "استجابة فتح الوردية لا تطابق عقد الخدمة." };
  }
  return { ok: true, data: {
    shiftId: raw.shift_id,
    previousShiftId: typeof raw.previous_shift_id === "string" ? raw.previous_shift_id : null,
    businessDate: raw.business_date,
    shiftLabel: raw.shift_label,
    recordedAt: raw.started_at,
    idempotentReplay: raw.idempotent_replay === true,
  } };
}

/** Appends a currency-specific physical count; it never guesses the expected balance. */
export async function recordOperationalShiftCashCount(
  input: RecordShiftCashCountInput,
): Promise<RpcResult<ShiftCommandReceipt>> {
  const currency = input.currency.trim().toUpperCase();
  if (!UUID.test(input.shiftId) || !["OPENING", "CLOSING"].includes(input.phase) ||
      !CURRENCY.test(currency) || !isSafeShiftCashAmount(input.countedAmount) ||
      (input.note?.length ?? 0) > 1000 || (input.correctionReason?.length ?? 0) > 500) {
    return { ok: false, status: "ERROR", message: "بيانات العد النقدي غير صالحة." };
  }
  const result = await callRpc<unknown>("record_operational_shift_cash_count", {
    p_shift_id: input.shiftId,
    p_phase: input.phase,
    p_currency: currency,
    p_counted_amount: input.countedAmount,
    p_note: input.note?.trim() || null,
    p_correction_reason: input.correctionReason?.trim() || null,
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  });
  if (!result.ok) return result;
  const raw = record(result.data);
  if (!raw || typeof raw.cash_count_id !== "string" || !UUID.test(raw.cash_count_id) ||
      !Number.isInteger(raw.version) || typeof raw.counted_at !== "string") {
    return { ok: false, status: "ERROR", message: "استجابة حفظ العد النقدي لا تطابق عقد الخدمة." };
  }
  return { ok: true, data: {
    cashCountId: raw.cash_count_id,
    version: raw.version as number,
    recordedAt: raw.counted_at,
    idempotentReplay: raw.idempotent_replay === true,
  } };
}

/** Records source UUIDs only; the server rechecks every reference before it persists handover. */
export async function recordOperationalShiftHandover(
  input: RecordShiftHandoverInput,
): Promise<RpcResult<ShiftCommandReceipt>> {
  const refs = [...input.openItemRefs];
  if (!UUID.test(input.currentShiftId) || refs.length > 200 ||
      refs.some(ref => !UUID.test(ref)) || new Set(refs).size !== refs.length ||
      (input.reason?.length ?? 0) > 500 || (input.note?.length ?? 0) > 2000) {
    return { ok: false, status: "ERROR", message: "بيانات تسليم الوردية أو مراجع البنود غير صالحة." };
  }
  const result = await callRpc<unknown>("record_operational_shift_handover", {
    p_current_shift_id: input.currentShiftId,
    p_open_item_refs: refs,
    p_reason: input.reason?.trim() || null,
    p_note: input.note?.trim() || null,
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  });
  if (!result.ok) return result;
  const raw = record(result.data);
  if (!raw || typeof raw.handover_id !== "string" || !UUID.test(raw.handover_id) ||
      typeof raw.recorded_at !== "string") {
    return { ok: false, status: "ERROR", message: "استجابة تسجيل التسليم لا تطابق عقد الخدمة." };
  }
  return { ok: true, data: {
    handoverId: raw.handover_id,
    recordedAt: raw.recorded_at,
    idempotentReplay: raw.idempotent_replay === true,
  } };
}

/** Acceptance is a separate event and PostgreSQL checks the incoming shift owner. */
export async function acceptOperationalShiftHandover(
  handoverId: string,
  key?: string,
): Promise<RpcResult<ShiftCommandReceipt>> {
  if (!UUID.test(handoverId)) {
    return { ok: false, status: "ERROR", message: "مرجع التسليم غير صالح." };
  }
  const result = await callRpc<unknown>("accept_operational_shift_handover", {
    p_handover_id: handoverId,
    p_idempotency_key: idempotencyKey(key),
  });
  if (!result.ok) return result;
  const raw = record(result.data);
  if (!raw || raw.handover_id !== handoverId ||
      typeof raw.accepted_at !== "string" || !Number.isFinite(Date.parse(raw.accepted_at))) {
    return { ok: false, status: "ERROR", message: "استجابة قبول التسليم لا تطابق عقد الخدمة." };
  }
  return { ok: true, data: {
    handoverId,
    acceptedAt: raw.accepted_at,
    idempotentReplay: raw.idempotent_replay === true,
  } };
}


export interface ShiftHandoverAcceptanceLookup {
  currentShiftId: string;
  required: boolean;
  handoverId: string | null;
  acceptedAt: string | null;
}

/** Only the server-confirmed incoming owner can retrieve the command reference. */
export async function fetchOperationalShiftHandoverAcceptance(
  currentShiftId: string,
): Promise<RpcResult<ShiftHandoverAcceptanceLookup>> {
  if (!UUID.test(currentShiftId)) {
    return { ok: false, status: "ERROR", message: "مرجع الوردية غير صالح." };
  }
  const response = await callRpc<unknown>("fetch_operational_shift_handover_acceptance", {
    p_current_shift_id: currentShiftId,
  });
  if (!response.ok) return response;
  const raw = record(response.data);
  if (!raw || raw.current_shift_id !== currentShiftId || raw.required !== true ||
      !(raw.handover_id === null || (typeof raw.handover_id === "string" && UUID.test(raw.handover_id))) ||
      !(raw.accepted_at === null || (typeof raw.accepted_at === "string" && Number.isFinite(Date.parse(raw.accepted_at)))) ||
      (raw.handover_id === null && raw.accepted_at !== null)) {
    return { ok: false, status: "ERROR", message: "استجابة مرجع قبول التسليم لا تطابق عقد الخدمة." };
  }
  return { ok: true, data: {
    currentShiftId,
    required: true,
    handoverId: typeof raw.handover_id === "string" ? raw.handover_id : null,
    acceptedAt: typeof raw.accepted_at === "string" ? raw.accepted_at : null,
  } };
}


/** Returns a typed evidence result; missing or malformed server DTOs are never replaced with demo data. */
export async function fetchOperationalShiftWorkspace(
  input: FetchShiftWorkspaceInput,
): Promise<RpcResult<{
  snapshot: ShiftOperationsSnapshot;
  result: ShiftOperationsCenterResult;
}>> {
  if (!validBusinessDate(input.businessDate) ||
      (input.shiftId != null && !UUID.test(input.shiftId))) {
    return { ok: false, status: "ERROR", message: "تاريخ الوردية أو معرّفها غير صالح." };
  }
  const response = await callRpc<unknown>("fetch_operational_shift_workspace", {
    p_business_date: input.businessDate,
    p_shift_id: input.shiftId ?? null,
  });
  if (!response.ok) return response;
  const snapshot = parseShiftOperationsSnapshot(response.data);
  if (!snapshot) {
    return { ok: false, status: "ERROR", message: "استجابة مركز الوردية ناقصة أو لا تطابق عقد الأدلة؛ لم تُعرض أرقام بديلة." };
  }
  try {
    return { ok: true, data: { snapshot, result: buildShiftOperationsCenter(snapshot) } };
  } catch {
    return { ok: false, status: "ERROR", message: "تعذر بناء تقرير الوردية من الأدلة المستلمة." };
  }
}

export interface CaptureOperationalShiftSnapshotInput {
  shiftId: string;
  snapshotKind: "OPENING" | "CLOSEOUT";
  idempotencyKey?: string;
}

export interface SavedOperationalShiftSnapshot {
  snapshotId: string;
  snapshotKind: "OPENING" | "CLOSEOUT";
  version: number;
  capturedAt: string;
  sourceFingerprint: string;
  snapshot: ShiftOperationsSnapshot;
}

/** Persists an immutable, versioned evidence snapshot; CLOSEOUT can remain partial or blocked. */
export async function captureOperationalShiftSnapshot(
  input: CaptureOperationalShiftSnapshotInput,
): Promise<RpcResult<ShiftCommandReceipt>> {
  if (!UUID.test(input.shiftId) || !["OPENING", "CLOSEOUT"].includes(input.snapshotKind)) {
    return { ok: false, status: "ERROR", message: "مرجع الوردية أو نوع اللقطة غير صالح." };
  }
  const result = await callRpc<unknown>("capture_operational_shift_snapshot", {
    p_shift_id: input.shiftId,
    p_snapshot_kind: input.snapshotKind,
    p_idempotency_key: idempotencyKey(input.idempotencyKey),
  });
  if (!result.ok) return result;
  const raw = record(result.data);
  if (!raw || typeof raw.snapshot_id !== "string" || !UUID.test(raw.snapshot_id) ||
      raw.snapshot_kind !== input.snapshotKind || !Number.isInteger(raw.version) ||
      typeof raw.captured_at !== "string" || !Number.isFinite(Date.parse(raw.captured_at))) {
    return { ok: false, status: "ERROR", message: "استجابة حفظ لقطة الوردية لا تطابق عقد الخدمة." };
  }
  return { ok: true, data: {
    snapshotId: raw.snapshot_id,
    snapshotKind: input.snapshotKind,
    version: raw.version as number,
    recordedAt: raw.captured_at,
    idempotentReplay: raw.idempotent_replay === true,
  } };
}

/** Reads only an already-saved, tenant-authorized immutable snapshot. */
export async function fetchOperationalShiftSnapshot(
  snapshotId: string,
): Promise<RpcResult<SavedOperationalShiftSnapshot>> {
  if (!UUID.test(snapshotId)) {
    return { ok: false, status: "ERROR", message: "مرجع لقطة الوردية غير صالح." };
  }
  const response = await callRpc<unknown>("fetch_operational_shift_snapshot", {
    p_snapshot_id: snapshotId,
  });
  if (!response.ok) return response;
  const raw = record(response.data);
  const snapshot = parseShiftOperationsSnapshot(raw?.payload);
  if (!raw || raw.snapshot_id !== snapshotId ||
      (raw.snapshot_kind !== "OPENING" && raw.snapshot_kind !== "CLOSEOUT") ||
      !Number.isInteger(raw.version) || typeof raw.captured_at !== "string" ||
      typeof raw.source_fingerprint !== "string" || !/^[0-9a-f]{32}$/.test(raw.source_fingerprint) ||
      !snapshot) {
    return { ok: false, status: "ERROR", message: "اللقطة المحفوظة ناقصة أو لا تطابق عقد الأدلة." };
  }
  return { ok: true, data: {
    snapshotId,
    snapshotKind: raw.snapshot_kind,
    version: raw.version as number,
    capturedAt: raw.captured_at,
    sourceFingerprint: raw.source_fingerprint,
    snapshot,
  } };
}

