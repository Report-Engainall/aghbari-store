import { supabase } from "@/lib/supabase";
import type { CashflowMeasurementProof } from "./cashflow-schedule-client";
import { parseDecisionMemorySnapshot } from "./decision-memory-client";
import type { DecisionMemorySnapshot } from "./decision-memory";

export type DecisionOutcomeState =
  | "PROPOSED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "DEFERRED"
  | "ASSIGNED" | "EXECUTING" | "EXECUTED" | "MEASURED";
export type DecisionOutcomeEventType =
  | "SUBMIT_FOR_REVIEW" | "APPROVE" | "REJECT" | "DEFER" | "ASSIGN"
  | "START_EXECUTION" | "COMPLETE_EXECUTION" | "MEASURE" | "RESUBMIT_FOR_REVIEW";

export interface DecisionOutcomeEventView {
  id: string;
  type: string;
  version: number;
  at: string;
  actorRole: string;
  reason: string | null;
}
export interface DecisionCandidateSnapshot {
  schemaVersion: "1.0.0";
  candidateId: string;
  ruleId: string;
  ruleVersion: string;
  priority: "P0" | "P1" | "P2" | "P3";
  priorityScore: number;
  what: string;
  why: string;
  risk: string;
  soWhat: string;
  whatNext: string;
  owner: string;
  expectedOutcome: string;
  impact: { value: number; unit: string; currency: string | null; formulaId: string; formulaVersion: string; sourceMetricIds: string[] } | null;
  impactStatus: "CALCULATED" | "NOT_CONFIGURED" | "WITHHELD";
  impactReason: string | null;
  proof: { evidenceIds: string[]; metricKeys: string[]; asOf: string; formulaVersions: string[] };
  createdAt: string;
  expiresAt: string | null;
}
export interface DecisionOutcomeView {
  id: string;
  candidateId: string;
  ruleId: string;
  ruleVersion: string;
  state: DecisionOutcomeState;
  version: number;
  ownerProfileId: string | null;
  ownerLabel: string;
  expectedOutcome: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  assignedAt: string | null;
  executedAt: string | null;
  measuredOutcome: { value: number; currency: string; asOf: string } | null;
  memorySnapshot: DecisionMemorySnapshot | null;
  candidateSnapshot: DecisionCandidateSnapshot | null;
  eventCount: number;
  history: DecisionOutcomeEventView[];
}
export type DecisionOutcomeFailureStatus = "DENIED" | "UNAVAILABLE" | "CONFLICT" | "STALE" | "ERROR";
export type DecisionOutcomeCommandResult =
  | { ok: true; outcome: DecisionOutcomeView; duplicate: boolean }
  | { ok: false; status: DecisionOutcomeFailureStatus; message: string };
export type DecisionOutcomeListResult =
  | { ok: true; items: DecisionOutcomeView[]; total: number }
  | { ok: false; status: DecisionOutcomeFailureStatus; message: string };

type UnknownRecord = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states = new Set<DecisionOutcomeState>([
  "PROPOSED","IN_REVIEW","APPROVED","REJECTED","DEFERRED","ASSIGNED","EXECUTING","EXECUTED","MEASURED",
]);
function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord : null;
}
function str(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function iso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function nullableIso(value: unknown): string | null {
  return value === null ? null : iso(value) ? value : null;
}
function safeFailure(error: unknown): { status: DecisionOutcomeFailureStatus; message: string } {
  const raw = record(error);
  const code = typeof raw?.code === "string" ? raw.code : "";
  if (code === "42501") return { status: "DENIED", message: "تتطلب إدارة دورة القرارات صلاحية الإدارة المالية." };
  if (code === "40001") return { status: "STALE", message: "تغير إصدار القرار؛ حدّث السجل ثم أعد المحاولة." };
  if (code === "23505") return { status: "CONFLICT", message: "تعارض مفتاح التكرار أو وجود متابعة لهذا المؤشر؛ حدّث القائمة." };
  if (code === "22023") return { status: "ERROR", message: "رفض الخادم الانتقال لعدم استيفاء شروط القرار أو أدلته." };
  return { status: "UNAVAILABLE", message: "تعذر الوصول إلى خدمة القرارات؛ لم تُحفظ أي تغييرات محلية." };
}
const eventStateByType: Record<string, DecisionOutcomeState> = {
  CREATE: "PROPOSED",
  SUBMIT_FOR_REVIEW: "IN_REVIEW",
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  DEFER: "DEFERRED",
  ASSIGN: "ASSIGNED",
  START_EXECUTION: "EXECUTING",
  COMPLETE_EXECUTION: "EXECUTED",
  MEASURE: "MEASURED",
  RESUBMIT_FOR_REVIEW: "IN_REVIEW",
};

function isNullableIso(value: unknown): value is string | null {
  return value === null || iso(value);
}

function parseMeasuredOutcome(value: unknown): DecisionOutcomeView["measuredOutcome"] | undefined {
  if (value === null) return null;
  const measured = record(value);
  const period = record(measured?.period);
  if (
    !measured ||
    !str(measured.metricKey, 150) ||
    typeof measured.value !== "number" ||
    !Number.isFinite(measured.value) ||
    !str(measured.unit, 50) ||
    !str(measured.currency, 3) ||
    !/^[A-Z]{3}$/.test(measured.currency) ||
    measured.status !== "VERIFIED" ||
    measured.completeness !== "COMPLETE" ||
    measured.quality !== "ACCEPTABLE" ||
    !period ||
    !str(period.from, 10) ||
    !str(period.to, 10) ||
    !Number.isFinite(Date.parse(period.from)) ||
    !Number.isFinite(Date.parse(period.to)) ||
    Date.parse(period.from) > Date.parse(period.to) ||
    !iso(measured.asOf) ||
    !iso(measured.measuredAt) ||
    Date.parse(measured.asOf) > Date.parse(measured.measuredAt) ||
    !str(measured.formulaId, 150) ||
    !str(measured.formulaVersion, 80) ||
    !Array.isArray(measured.evidenceIds) ||
    measured.evidenceIds.length < 1 ||
    measured.evidenceIds.length > 500 ||
    measured.evidenceIds.some(id => !str(id, 500)) ||
    new Set(measured.evidenceIds).size !== measured.evidenceIds.length
  ) return undefined;
  return {
    value: measured.value,
    currency: measured.currency,
    asOf: measured.asOf,
  };
}

function parseCandidateSnapshot(value: unknown): DecisionCandidateSnapshot | null {
  const raw = record(value);
  const proof = record(raw?.proof);
  if (!raw || !proof) return null;
  const priority = raw.priority === "P0" || raw.priority === "P1" || raw.priority === "P2" || raw.priority === "P3"
    ? raw.priority : null;
  const score = priority === "P0" ? 400 : priority === "P1" ? 300 : priority === "P2" ? 200 : priority === "P3" ? 100 : null;
  const evidenceIds = Array.isArray(proof.evidenceIds) && proof.evidenceIds.length >= 1 && proof.evidenceIds.length <= 500 && proof.evidenceIds.every(id => str(id,500)) ? proof.evidenceIds as string[] : null;
  const metricKeys = Array.isArray(proof.metricKeys) && proof.metricKeys.length >= 1 && proof.metricKeys.length <= 50 && proof.metricKeys.every(key => str(key,150)) ? proof.metricKeys as string[] : null;
  const formulaVersions = Array.isArray(proof.formulaVersions) && proof.formulaVersions.length >= 1 && proof.formulaVersions.length <= 50 && proof.formulaVersions.every(item => str(item,200)) ? proof.formulaVersions as string[] : null;
  const impactRaw = raw.impact === null ? null : record(raw.impact);
  const impact = impactRaw && typeof impactRaw.value === "number" && Number.isFinite(impactRaw.value) &&
    str(impactRaw.unit,80) && str(impactRaw.formulaId,150) && str(impactRaw.formulaVersion,80) &&
    Array.isArray(impactRaw.sourceMetricIds) && impactRaw.sourceMetricIds.length <= 50 && impactRaw.sourceMetricIds.every(id => str(id,200)) &&
    (impactRaw.currency === null || impactRaw.currency === undefined || (str(impactRaw.currency,3) && /^[A-Z]{3}$/.test(impactRaw.currency)))
    ? { value: impactRaw.value, unit: impactRaw.unit, currency: typeof impactRaw.currency === "string" ? impactRaw.currency : null,
        formulaId: impactRaw.formulaId, formulaVersion: impactRaw.formulaVersion, sourceMetricIds: impactRaw.sourceMetricIds as string[] }
    : raw.impact === null ? null : undefined;
  if (priority === null || score === null || raw.schemaVersion !== "1.0.0" || !str(raw.candidateId,150) ||
      !str(raw.ruleId,150) || !str(raw.ruleVersion,80) || raw.priorityScore !== score ||
      !str(raw.what,500) || !str(raw.why,2000) || !str(raw.risk,2000) || !str(raw.soWhat,2000) ||
      !str(raw.whatNext,2000) || !str(raw.owner,150) || !str(raw.expectedOutcome,2000) ||
      !["CALCULATED","NOT_CONFIGURED","WITHHELD"].includes(String(raw.impactStatus)) ||
      (raw.impactReason !== null && !str(raw.impactReason,2000)) ||
      !evidenceIds || new Set(evidenceIds).size !== evidenceIds.length || !metricKeys || !formulaVersions ||
      !iso(proof.asOf) || !iso(raw.createdAt) || (raw.expiresAt !== null && !iso(raw.expiresAt)) ||
      impact === undefined || (raw.impactStatus === "CALCULATED" && impact === null) ||
      (raw.impactStatus !== "CALCULATED" && impact !== null)) return null;
  return {
    schemaVersion: "1.0.0", candidateId: raw.candidateId, ruleId: raw.ruleId, ruleVersion: raw.ruleVersion,
    priority, priorityScore: score, what: raw.what, why: raw.why, risk: raw.risk, soWhat: raw.soWhat,
    whatNext: raw.whatNext, owner: raw.owner, expectedOutcome: raw.expectedOutcome, impact,
    impactStatus: raw.impactStatus as DecisionCandidateSnapshot["impactStatus"],
    impactReason: typeof raw.impactReason === "string" ? raw.impactReason : null,
    proof: { evidenceIds, metricKeys, asOf: proof.asOf, formulaVersions },
    createdAt: raw.createdAt, expiresAt: typeof raw.expiresAt === "string" ? raw.expiresAt : null,
  };
}

function parseOutcome(value: unknown): DecisionOutcomeView | null {
  const raw = record(value);
  const owner = record(raw?.owner);
  const proposedBy = record(raw?.proposedBy);
  const measuredOutcome = raw && Object.prototype.hasOwnProperty.call(raw, "measuredOutcome")
    ? parseMeasuredOutcome(raw.measuredOutcome)
    : undefined;
  const memorySnapshot = raw?.memorySnapshot === null || raw?.memorySnapshot === undefined
    ? null : parseDecisionMemorySnapshot(raw.memorySnapshot);
  const candidateSnapshot = raw?.candidateSnapshot === null || raw?.candidateSnapshot === undefined
    ? null : parseCandidateSnapshot(raw.candidateSnapshot);
  if (raw?.memorySnapshot !== null && raw?.memorySnapshot !== undefined && !memorySnapshot) return null;
  if (raw?.candidateSnapshot !== null && raw?.candidateSnapshot !== undefined && !candidateSnapshot) return null;
  if (
    !raw || !owner || !proposedBy ||
    !str(raw.id, 80) || !UUID.test(raw.id) ||
    !str(raw.candidateId, 150) || !str(raw.ruleId, 150) || !str(raw.ruleVersion, 80) ||
    typeof raw.state !== "string" || !states.has(raw.state as DecisionOutcomeState) ||
    !Number.isInteger(raw.version) || (raw.version as number) < 1 || (raw.version as number) > 1000 ||
    !str(raw.expectedOutcome, 2000) ||
    !iso(raw.createdAt) || !iso(raw.updatedAt) || Date.parse(raw.createdAt) > Date.parse(raw.updatedAt) ||
    !Number.isInteger(raw.eventCount) || (raw.eventCount as number) < 1 ||
    !Array.isArray(raw.history) || raw.history.length > 1000 ||
    raw.eventCount !== raw.history.length || raw.history.length !== raw.version ||
    !str(proposedBy.id, 80) || !UUID.test(proposedBy.id) ||
    (owner.id !== null && (!str(owner.id, 80) || !UUID.test(owner.id))) ||
    !str(owner.label, 150) ||
    (raw.reason !== null && !str(raw.reason, 2000)) ||
    !isNullableIso(raw.approvedAt) ||
    !isNullableIso(raw.assignedAt) ||
    !isNullableIso(raw.executedAt) ||
    (raw.approvedBy !== null && (!str(raw.approvedBy, 80) || !UUID.test(raw.approvedBy))) ||
    ((raw.approvedAt === null) !== (raw.approvedBy === null)) ||
    measuredOutcome === undefined
  ) return null;

  const history: DecisionOutcomeEventView[] = [];
  const eventIds = new Set<string>();
  let priorAt = Date.parse(raw.createdAt);
  for (let index = 0; index < raw.history.length; index += 1) {
    const event = record(raw.history[index]);
    const actor = record(event?.actor);
    const expectedVersion = index + 1;
    if (
      !event || !actor ||
      !str(event.id, 100) || eventIds.has(event.id) ||
      typeof event.type !== "string" || !Object.prototype.hasOwnProperty.call(eventStateByType, event.type) ||
      event.version !== expectedVersion ||
      !iso(event.at) ||
      Date.parse(event.at) < priorAt ||
      Date.parse(event.at) > Date.parse(raw.updatedAt) ||
      !str(actor.id, 80) || !UUID.test(actor.id) ||
      !str(actor.role, 100) ||
      (event.reason !== null && !str(event.reason, 2000))
    ) return null;
    eventIds.add(event.id);
    priorAt = Date.parse(event.at);
    history.push({
      id: event.id,
      type: event.type,
      version: expectedVersion,
      at: event.at,
      actorRole: actor.role,
      reason: event.reason,
    });
  }

  const latestEvent = raw.history[raw.history.length - 1] as UnknownRecord;
  if (
    eventStateByType[String(latestEvent.type)] !== raw.state ||
    (raw.state === "MEASURED") !== (measuredOutcome !== null) ||
    (raw.state === "MEASURED" && (!raw.executedAt || !raw.assignedAt || !raw.approvedAt)) ||
    (["ASSIGNED", "EXECUTING", "EXECUTED"].includes(String(raw.state)) && (!raw.approvedAt || !raw.assignedAt)) ||
    (raw.state === "EXECUTED" && !raw.executedAt) ||
    (measuredOutcome && Date.parse(measuredOutcome.asOf) > Date.parse(raw.updatedAt))
  ) return null;

  return {
    id: raw.id,
    candidateId: raw.candidateId,
    ruleId: raw.ruleId,
    ruleVersion: raw.ruleVersion,
    state: raw.state as DecisionOutcomeState,
    version: raw.version as number,
    ownerProfileId: typeof owner.id === "string" ? owner.id : null,
    ownerLabel: owner.label,
    expectedOutcome: raw.expectedOutcome,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    approvedAt: raw.approvedAt,
    assignedAt: raw.assignedAt,
    executedAt: raw.executedAt,
    measuredOutcome,
    memorySnapshot,
    candidateSnapshot,
    eventCount: raw.eventCount as number,
    history,
  };
}

function parseCommandResult(value: unknown): DecisionOutcomeCommandResult {
  const raw = record(value);
  const outcome = parseOutcome(raw?.outcome);
  if (!raw || raw.ok !== true || !outcome || typeof raw.duplicate !== "boolean") {
    return { ok: false, status: "ERROR", message: "أعادت خدمة القرارات استجابة غير مكتملة؛ لم يُعرض نجاح غير مثبت." };
  }
  return { ok: true, outcome, duplicate: raw.duplicate };
}
function validateProposal(input: {
  candidateId: string; ruleId: string; ruleVersion: string; ownerProfileId: string;
  expectedOutcome: string; reason: string; candidateSnapshot?: DecisionCandidateSnapshot;
}): string | null {
  if (!str(input.candidateId, 150) || !str(input.ruleId, 150) ||
      !str(input.ruleVersion, 80) || !UUID.test(input.ownerProfileId) ||
      !str(input.expectedOutcome, 2000) || input.reason.length > 2000 ||
      (input.candidateSnapshot !== undefined &&
        (input.candidateSnapshot.candidateId !== input.candidateId ||
         input.candidateSnapshot.ruleId !== input.ruleId ||
         input.candidateSnapshot.ruleVersion !== input.ruleVersion ||
         input.candidateSnapshot.expectedOutcome !== input.expectedOutcome))) {
    return "أكمل وصف النتيجة المتوقعة، وتأكد من صلاحية مالك القرار.";
  }
  return null;
}

export async function fetchDecisionOutcomes(limit = 50, offset = 0): Promise<DecisionOutcomeListResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 5000) {
    return { ok: false, status: "ERROR", message: "نطاق صفحة القرارات غير صالح." };
  }
  try {
    const { data, error } = await supabase.rpc("fetch_decision_outcomes", {
      p_limit: limit, p_offset: offset,
    });
    if (error) return { ok: false, ...safeFailure(error) };
    const raw = record(data);
    if (!raw || !Array.isArray(raw.items) || raw.items.length > limit ||
        !Number.isInteger(raw.total) || (raw.total as number) < 0) {
      return { ok: false, status: "ERROR", message: "استجابة قائمة القرارات غير صالحة؛ أُوقف العرض." };
    }
    const items = raw.items.map(parseOutcome);
    if (items.some(item => item === null)) {
      return { ok: false, status: "ERROR", message: "تحتوي قائمة القرارات على سجل غير مكتمل؛ أُوقف العرض." };
    }
    return { ok: true, items: items as DecisionOutcomeView[], total: raw.total as number };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بخدمة القرارات." };
  }
}


/**
 * Loads a bounded collection for decision-memory search.
 * Every page uses the existing authenticated RPC. Complete coverage requires
 * a stable total, exact page sizes, unique IDs and an unchanged first page.
 */
export interface DecisionOutcomeCollection {
  items: DecisionOutcomeView[];
  total: number;
  loaded: number;
  pageCount: number;
  complete: boolean;
  reason: "COMPLETE" | "SOURCE_TOTAL_CHANGED" | "PAGE_SIZE_MISMATCH" |
    "DUPLICATE_RECORD" | "FIRST_PAGE_CHANGED" | "MAXIMUM_WINDOW_REACHED";
}

const DECISION_MEMORY_PAGE_SIZE = 100;
const DECISION_MEMORY_MAX_OFFSET = 5000;

function decisionPageFingerprint(items: DecisionOutcomeView[]): string {
  return items.map(item => item.id + ":" + item.version + ":" + item.updatedAt).join("|");
}

export async function fetchDecisionOutcomeCollection(): Promise<
  | { ok: true; collection: DecisionOutcomeCollection }
  | { ok: false; status: DecisionOutcomeFailureStatus; message: string }
> {
  const first = await fetchDecisionOutcomes(DECISION_MEMORY_PAGE_SIZE, 0);
  if (!first.ok) return first;

  const total = first.total;
  const items = [...first.items];
  const seen = new Set(items.map(item => item.id));
  let pageCount = 1;
  let reason: DecisionOutcomeCollection["reason"] = "COMPLETE";

  if (items.length !== Math.min(DECISION_MEMORY_PAGE_SIZE, total)) {
    reason = "PAGE_SIZE_MISMATCH";
  } else if (seen.size !== items.length) {
    reason = "DUPLICATE_RECORD";
  }

  for (
    let offset = DECISION_MEMORY_PAGE_SIZE;
    reason === "COMPLETE" && offset <= DECISION_MEMORY_MAX_OFFSET && offset < total;
    offset += DECISION_MEMORY_PAGE_SIZE
  ) {
    const page = await fetchDecisionOutcomes(DECISION_MEMORY_PAGE_SIZE, offset);
    if (!page.ok) return page;
    pageCount += 1;

    if (page.total !== total) {
      reason = "SOURCE_TOTAL_CHANGED";
      break;
    }

    if (page.items.length !== Math.min(DECISION_MEMORY_PAGE_SIZE, total - offset)) {
      reason = "PAGE_SIZE_MISMATCH";
      break;
    }

    for (const item of page.items) {
      if (seen.has(item.id)) {
        reason = "DUPLICATE_RECORD";
        break;
      }
      seen.add(item.id);
      items.push(item);
    }
    if (reason !== "COMPLETE") break;
  }

  if (reason === "COMPLETE" && items.length < total) {
    reason = "MAXIMUM_WINDOW_REACHED";
  }

  if (reason === "COMPLETE") {
    const verification = await fetchDecisionOutcomes(DECISION_MEMORY_PAGE_SIZE, 0);
    if (!verification.ok) return verification;
    if (
      verification.total !== total ||
      decisionPageFingerprint(verification.items) !== decisionPageFingerprint(first.items)
    ) {
      reason = "FIRST_PAGE_CHANGED";
    }
  }

  const complete = reason === "COMPLETE" && items.length === total;
  return {
    ok: true,
    collection: {
      items,
      total,
      loaded: items.length,
      pageCount,
      complete,
      reason: complete ? "COMPLETE" : reason,
    },
  };
}

export async function createDecisionOutcomeProposal(input: {
  candidateId: string;
  ruleId: string;
  ruleVersion: string;
  ownerProfileId: string;
  expectedOutcome: string;
  reason: string;
  candidateSnapshot?: DecisionCandidateSnapshot;
}): Promise<DecisionOutcomeCommandResult> {
  const invalid = validateProposal(input);
  if (invalid) return { ok: false, status: "ERROR", message: invalid };
  try {
    const command = {
      p_candidate_id: input.candidateId,
      p_rule_id: input.ruleId,
      p_rule_version: input.ruleVersion,
      p_owner_profile_id: input.ownerProfileId,
      p_expected_outcome: input.expectedOutcome.trim(),
      p_reason: input.reason.trim() || null,
      p_idempotency_key: crypto.randomUUID(),
    };
    const { data, error } = input.candidateSnapshot
      ? await supabase.rpc("create_decision_outcome_proposal_with_snapshot", {
          ...command, p_candidate_snapshot: input.candidateSnapshot,
        })
      : await supabase.rpc("create_decision_outcome_proposal", command);
    if (error) return { ok: false, ...safeFailure(error) };
    return parseCommandResult(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر إرسال مقترح القرار إلى الخادم." };
  }
}

export async function commandDecisionOutcome(input: {
  outcomeId: string;
  expectedVersion: number;
  eventType: Exclude<DecisionOutcomeEventType, "DEFER" | "RESUBMIT_FOR_REVIEW">;
  reason?: string;
  ownerProfileId?: string;
  eventId?: string;
  idempotencyKey?: string;
  measuredOutcome?: CashflowMeasurementProof & { measuredAt: string };
}): Promise<DecisionOutcomeCommandResult> {
  if (!UUID.test(input.outcomeId) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 ||
      (input.reason?.length ?? 0) > 2000 ||
      (input.eventId !== undefined && !UUID.test(input.eventId)) ||
      (input.idempotencyKey !== undefined && !UUID.test(input.idempotencyKey)) ||
      (input.eventType === "ASSIGN" && (!input.ownerProfileId || !UUID.test(input.ownerProfileId))) ||
      (input.eventType === "MEASURE" && !input.measuredOutcome)) {
    return { ok: false, status: "ERROR", message: "أمر القرار لا يستوفي الحقول المطلوبة." };
  }
  try {
    const measured = input.measuredOutcome;
    const { data, error } = await supabase.rpc("command_decision_outcome", {
      p_outcome_id: input.outcomeId,
      p_event_id: input.eventId ?? crypto.randomUUID(),
      p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      p_expected_version: input.expectedVersion,
      p_event_type: input.eventType,
      p_reason: input.reason?.trim() || null,
      p_owner_profile_id: input.ownerProfileId ?? null,
      p_measured_outcome: measured ? {
        metricKey: measured.metricKey, value: measured.value, unit: measured.unit,
        currency: measured.currency, status: measured.status, completeness: measured.completeness,
        quality: measured.quality, period: measured.period, asOf: measured.asOf,
        formulaId: measured.formulaId, formulaVersion: measured.formulaVersion,
        measuredAt: measured.measuredAt, evidenceIds: measured.evidenceIds,
      } : null,
    });
    if (error) return { ok: false, ...safeFailure(error) };
    return parseCommandResult(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر إرسال أمر القرار إلى الخادم." };
  }
}

/** Persists a reasoned deferral through its dedicated manager-only RPC. */
export async function deferDecisionOutcome(input: {
  outcomeId: string;
  expectedVersion: number;
  reason: string;
  eventId?: string;
  idempotencyKey?: string;
}): Promise<DecisionOutcomeCommandResult> {
  const reason = input.reason.trim();
  if (!UUID.test(input.outcomeId) ||
      !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 ||
      reason.length < 3 || reason.length > 2000 ||
      (input.eventId !== undefined && !UUID.test(input.eventId)) ||
      (input.idempotencyKey !== undefined && !UUID.test(input.idempotencyKey))) {
    return { ok: false, status: "ERROR", message: "أدخل سبب التأجيل وتحقق من إصدار القرار." };
  }
  try {
    const { data, error } = await supabase.rpc("defer_decision_outcome", {
      p_outcome_id: input.outcomeId,
      p_event_id: input.eventId ?? crypto.randomUUID(),
      p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      p_expected_version: input.expectedVersion,
      p_reason: reason,
    });
    if (error) return { ok: false, ...safeFailure(error) };
    return parseCommandResult(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر إرسال تأجيل القرار إلى الخادم." };
  }
}

/** Returns a deferred decision to review through a separate, auditable command. */
export async function resumeDeferredDecisionOutcome(input: {
  outcomeId: string;
  expectedVersion: number;
  reason: string;
  eventId?: string;
  idempotencyKey?: string;
}): Promise<DecisionOutcomeCommandResult> {
  const reason = input.reason.trim();
  if (!UUID.test(input.outcomeId) ||
      !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 ||
      reason.length < 3 || reason.length > 2000 ||
      (input.eventId !== undefined && !UUID.test(input.eventId)) ||
      (input.idempotencyKey !== undefined && !UUID.test(input.idempotencyKey))) {
    return { ok: false, status: "ERROR", message: "أدخل سبب إعادة القرار للمراجعة وتحقق من إصداره." };
  }
  try {
    const { data, error } = await supabase.rpc("resume_deferred_decision_outcome", {
      p_outcome_id: input.outcomeId,
      p_event_id: input.eventId ?? crypto.randomUUID(),
      p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      p_expected_version: input.expectedVersion,
      p_reason: reason,
    });
    if (error) return { ok: false, ...safeFailure(error) };
    return parseCommandResult(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر إعادة القرار المؤجل إلى المراجعة." };
  }
}
