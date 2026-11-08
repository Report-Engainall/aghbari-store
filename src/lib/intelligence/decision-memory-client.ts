import { supabase } from "@/lib/supabase";
import type {
  DecisionMemoryAlternative,
  DecisionMemoryCorrection,
  DecisionMemoryReviewDisposition,
  DecisionMemorySnapshot,
  DecisionMemoryStatement,
} from "./decision-memory";
import type {
  DataCompleteness,
  DataQuality,
  EvidencePeriod,
  EvidenceRecord,
  EvidenceStatus,
  MetricSnapshot,
  MetricUnit,
} from "./types";

type UnknownRecord = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statementKinds = new Set(["FACT", "OPINION", "HYPOTHESIS"]);
const evidenceStatuses = new Set<EvidenceStatus>(["VERIFIED", "NEEDS_REVIEW", "UNVERIFIED", "UNAVAILABLE"]);
const completenessValues = new Set<DataCompleteness>(["COMPLETE", "PARTIAL", "UNKNOWN"]);
const qualityValues = new Set<DataQuality>(["ACCEPTABLE", "WARNINGS", "INVALID", "UNKNOWN"]);
const metricUnits = new Set<MetricUnit>(["COUNT", "RATIO", "CURRENCY", "CURRENCY_PER_UNIT", "QUANTITY", "DAYS", "TEXT"]);
const sourceKinds = new Set(["TABLE", "RPC", "IMPORT_SNAPSHOT", "LEDGER", "MOVEMENT", "SYSTEM_PROBE", "MANUAL"]);

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord : null;
}
function stringValue(value: unknown, max = 2000): value is string {
  return typeof value === "string" && value.length <= max;
}
function requiredString(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function iso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && value.includes("T");
}
function period(value: unknown): EvidencePeriod | null {
  const raw = record(value);
  if (!raw || !requiredString(raw.from, 10) || !requiredString(raw.to, 10) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.from) || !/^\d{4}-\d{2}-\d{2}$/.test(raw.to) ||
      raw.from > raw.to) return null;
  return { from: raw.from, to: raw.to };
}
function addDays(day: string, count: number): string {
  const value = new Date(day + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}
function stringArray(value: unknown, max = 200): string[] | null {
  if (!Array.isArray(value) || value.length > max || value.some(item => !requiredString(item, 2000))) return null;
  return value as string[];
}
function parseStatement(value: unknown, expectedKind: "FACT" | "OPINION" | "HYPOTHESIS"): DecisionMemoryStatement | null {
  const raw = record(value);
  const ids = stringArray(raw?.evidenceIds, 50);
  const sourceIds = raw?.sourceEvidenceIds === undefined ? [] : stringArray(raw.sourceEvidenceIds, 50);
  if (!raw || raw.kind !== expectedKind || !requiredString(raw.id, 100) ||
      !requiredString(raw.text, 2000) || !requiredString(raw.actorRole, 100) ||
      !iso(raw.recordedAt) || !ids || sourceIds === null ||
      (expectedKind === "FACT" && ids.length === 0) ||
      (sourceIds.length > 0 && sourceIds.length !== ids.length)) return null;
  return {
    id: raw.id, kind: expectedKind, text: raw.text, actorRole: raw.actorRole,
    recordedAt: raw.recordedAt, evidenceIds: ids,
    ...(sourceIds.length ? { sourceEvidenceIds: sourceIds } : {}),
  };
}
function parseAlternative(value: unknown): DecisionMemoryAlternative | null {
  const raw = record(value);
  const ids = stringArray(raw?.evidenceIds, 50);
  if (!raw || !requiredString(raw.id, 100) || !requiredString(raw.label, 300) ||
      !(raw.rationale === null || raw.rationale === undefined || stringValue(raw.rationale, 1000)) || !ids) return null;
  return { id: raw.id, label: raw.label, rationale: typeof raw.rationale === "string" ? raw.rationale : null, evidenceIds: ids };
}
function parseCorrection(value: unknown): DecisionMemoryCorrection | null {
  const raw = record(value);
  const ids = stringArray(raw?.evidenceIds, 100);
  if (!raw || !requiredString(raw.id, 100) ||
      !Number.isInteger(raw.fromVersion) || (raw.fromVersion as number) < 1 ||
      !Number.isInteger(raw.toVersion) || (raw.toVersion as number) !== (raw.fromVersion as number) + 1 ||
      !iso(raw.recordedAt) || !requiredString(raw.actorRole, 100) ||
      !requiredString(raw.reason, 2000) || !requiredString(raw.originalText, 4000) ||
      !requiredString(raw.correctedText, 4000) || !ids) return null;
  return {
    id: raw.id, fromVersion: raw.fromVersion as number, toVersion: raw.toVersion as number,
    recordedAt: raw.recordedAt, actorRole: raw.actorRole, reason: raw.reason,
    originalText: raw.originalText, correctedText: raw.correctedText, evidenceIds: ids,
  };
}
function parseMetric(value: unknown): MetricSnapshot | null {
  if (value === null || value === undefined) return null;
  const raw = record(value);
  const lineage = record(raw?.lineage);
  const ids = stringArray(lineage?.evidenceIds, 500);
  const transformations = stringArray(lineage?.transformations, 100);
  const metricPeriod = raw?.period === null ? null : period(raw?.period);
  if (!raw || !lineage || !requiredString(raw.id, 150) || !requiredString(raw.key, 150) ||
      !(raw.value === null || (typeof raw.value === "number" && Number.isFinite(raw.value)) ||
        (typeof raw.value === "string" && raw.value.trim().length > 0 && raw.value.length <= 100)) ||
      typeof raw.unit !== "string" || !metricUnits.has(raw.unit as MetricUnit) ||
      (raw.currency !== undefined && raw.currency !== null && !requiredString(raw.currency, 3)) ||
      (raw.unitOfMeasure !== undefined && raw.unitOfMeasure !== null && !requiredString(raw.unitOfMeasure, 80)) ||
      typeof raw.status !== "string" || !evidenceStatuses.has(raw.status as EvidenceStatus) ||
      typeof raw.completeness !== "string" || !completenessValues.has(raw.completeness as DataCompleteness) ||
      typeof raw.quality !== "string" || !qualityValues.has(raw.quality as DataQuality) ||
      (raw.period !== null && !metricPeriod) || !iso(raw.asOf) || !ids || !transformations ||
      !iso(lineage.calculatedAt) || !requiredString(lineage.formulaId, 150) ||
      !requiredString(lineage.formulaVersion, 80)) return null;
  const warnings = stringArray(raw.warnings, 100);
  if (!warnings) return null;
  return {
    id: raw.id, key: raw.key, value: raw.value as number | string | null,
    unit: raw.unit as MetricUnit,
    ...(typeof raw.currency === "string" ? { currency: raw.currency } : {}),
    ...(typeof raw.unitOfMeasure === "string" ? { unitOfMeasure: raw.unitOfMeasure } : {}),
    status: raw.status as EvidenceStatus, completeness: raw.completeness as DataCompleteness,
    quality: raw.quality as DataQuality, period: metricPeriod, asOf: raw.asOf,
    lineage: {
      evidenceIds: ids, calculatedAt: lineage.calculatedAt,
      formulaId: lineage.formulaId, formulaVersion: lineage.formulaVersion,
      transformations,
    },
    warnings,
  };
}
function parseEvidenceRecord(value: unknown): EvidenceRecord | null {
  const raw = record(value);
  const source = record(raw?.source);
  const sourcePeriod = raw?.period === null ? null : period(raw?.period);
  const warnings = stringArray(raw?.warnings, 100);
  if (!raw || !source || !requiredString(raw.id, 500) ||
      !requiredString(source.name, 150) || typeof source.kind !== "string" ||
      !sourceKinds.has(source.kind) ||
      (source.recordId !== undefined && !requiredString(source.recordId, 150)) ||
      !iso(raw.sourceTimestamp) || !iso(raw.asOf) ||
      (raw.period !== null && !sourcePeriod) ||
      (raw.currency !== undefined && raw.currency !== null && !requiredString(raw.currency, 3)) ||
      typeof raw.status !== "string" || !evidenceStatuses.has(raw.status as EvidenceStatus) ||
      typeof raw.completeness !== "string" || !completenessValues.has(raw.completeness as DataCompleteness) ||
      typeof raw.quality !== "string" || !qualityValues.has(raw.quality as DataQuality) || !warnings) return null;
  return {
    id: raw.id,
    source: {
      kind: source.kind as EvidenceRecord["source"]["kind"], name: source.name,
      ...(typeof source.recordId === "string" ? { recordId: source.recordId } : {}),
    },
    sourceTimestamp: raw.sourceTimestamp, asOf: raw.asOf, period: sourcePeriod,
    ...(typeof raw.currency === "string" ? { currency: raw.currency } : {}),
    status: raw.status as EvidenceStatus, completeness: raw.completeness as DataCompleteness,
    quality: raw.quality as DataQuality, warnings,
  };
}

/** Strictly parse the server-authenticated, tenant-scoped immutable memory DTO. */
export function parseDecisionMemorySnapshot(value: unknown): DecisionMemorySnapshot | null {
  const raw = record(value);
  const snapshotPeriod = period(raw?.period);
  const facts = Array.isArray(raw?.facts) ? raw.facts.map(item => parseStatement(item, "FACT")) : null;
  const opinions = Array.isArray(raw?.opinions) ? raw.opinions.map(item => parseStatement(item, "OPINION")) : null;
  const hypotheses = Array.isArray(raw?.hypotheses) ? raw.hypotheses.map(item => parseStatement(item, "HYPOTHESIS")) : null;
  const alternatives = Array.isArray(raw?.alternatives) ? raw.alternatives.map(parseAlternative) : null;
  const corrections = Array.isArray(raw?.corrections) ? raw.corrections.map(parseCorrection) : null;
  const evidence = Array.isArray(raw?.evidenceRecords) ? raw.evidenceRecords.map(parseEvidenceRecord) : null;
  const assumptions = stringArray(raw?.assumptions, 100);
  const lessons = stringArray(raw?.lessons, 100);
  const expectedMetric = parseMetric(raw?.expectedMetric);
  const actualMetric = parseMetric(raw?.actualMetric);
  const disposition = raw?.reviewDisposition;
  if (!raw || !requiredString(raw.id, 80) || !requiredString(raw.decisionId, 80) ||
      !Number.isInteger(raw.version) || (raw.version as number) < 1 ||
      !iso(raw.capturedAt) || !iso(raw.asOf) || !snapshotPeriod ||
      !(raw.problem === null || raw.problem === undefined || stringValue(raw.problem, 2000)) ||
      typeof raw.factsReviewed !== "boolean" || !facts || facts.some(item => !item) ||
      !opinions || opinions.some(item => !item) || !hypotheses || hypotheses.some(item => !item) ||
      !assumptions || !alternatives || alternatives.some(item => !item) ||
      !(raw.chosenOptionId === null || raw.chosenOptionId === undefined || requiredString(raw.chosenOptionId, 100)) ||
      typeof raw.assumptionsReviewed !== "boolean" ||
      !(raw.actionTaken === null || raw.actionTaken === undefined || stringValue(raw.actionTaken, 2000)) ||
      !(disposition === null || disposition === "SCHEDULED" || disposition === "NOT_SCHEDULED" || disposition === "NOT_REQUIRED") ||
      !(raw.reviewAt === null || raw.reviewAt === undefined || iso(raw.reviewAt)) ||
      !(raw.expectedMetric === null || raw.expectedMetric === undefined || expectedMetric) ||
      !(raw.actualMetric === null || raw.actualMetric === undefined || actualMetric) ||
      typeof raw.lessonsReviewed !== "boolean" || !lessons ||
      !corrections || corrections.some(item => !item) ||
      !evidence || evidence.some(item => !item)) return null;
  return {
    id: raw.id, decisionId: raw.decisionId, version: raw.version as number,
    capturedAt: raw.capturedAt, asOf: raw.asOf, period: snapshotPeriod,
    problem: typeof raw.problem === "string" ? raw.problem : null,
    factsReviewed: raw.factsReviewed, facts: facts as DecisionMemoryStatement[],
    opinions: opinions as DecisionMemoryStatement[], hypotheses: hypotheses as DecisionMemoryStatement[],
    assumptions, alternatives: alternatives as DecisionMemoryAlternative[],
    chosenOptionId: typeof raw.chosenOptionId === "string" ? raw.chosenOptionId : null,
    assumptionsReviewed: raw.assumptionsReviewed,
    actionTaken: typeof raw.actionTaken === "string" ? raw.actionTaken : null,
    reviewDisposition: disposition as DecisionMemoryReviewDisposition | null,
    reviewAt: typeof raw.reviewAt === "string" ? raw.reviewAt : null,
    expectedMetric, actualMetric,
    lessonsReviewed: raw.lessonsReviewed, lessons,
    corrections: corrections as DecisionMemoryCorrection[],
    evidenceRecords: evidence as EvidenceRecord[],
  };
}

export interface DecisionMemorySaveInput {
  decisionOutcomeId: string;
  expectedVersion: number;
  asOf: string;
  period: EvidencePeriod;
  problem: string;
  factsReviewed: boolean;
  facts: Array<{ id: string; text: string; evidenceIds: string[] }>;
  opinions: Array<{ id: string; text: string }>;
  hypotheses: Array<{ id: string; text: string }>;
  assumptions: string[];
  alternatives: Array<{ id: string; label: string; rationale: string | null }>;
  chosenOptionId: string | null;
  assumptionsReviewed: boolean;
  actionTaken: string;
  reviewDisposition: DecisionMemoryReviewDisposition;
  reviewAt: string | null;
  expectedMetric: { key: "cashflow.expected_collections"; currency: string } | null;
  lessonsReviewed: boolean;
  lessons: string[];
  reason?: string;
}
export type DecisionMemorySaveResult =
  | { ok: true; version: number; duplicate: boolean }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "CONFLICT" | "ERROR"; message: string };

function failure(error: unknown): Omit<Extract<DecisionMemorySaveResult, { ok: false }>, "ok"> {
  const raw = record(error);
  const code = typeof raw?.code === "string" ? raw.code : "";
  if (code === "42501") return { status: "DENIED", message: "يتطلب توثيق ذاكرة القرار صلاحية الإدارة المالية، أو أن مصدر الإثبات خارج المؤسسة الحالية." };
  if (code === "40001") return { status: "CONFLICT", message: "تغير إصدار ذاكرة القرار؛ أعد تحميل السجل قبل التصحيح." };
  if (code === "23505") return { status: "CONFLICT", message: "تعارض مفتاح التكرار؛ لم يُنشأ إصدار مكرر." };
  if (code === "22023") return { status: "ERROR", message: "رفض الخادم سجل الذاكرة بسبب حقل أو تاريخ أو إثبات غير صالح." };
  return { status: "UNAVAILABLE", message: "خدمة ذاكرة القرارات غير متاحة؛ لم يُعرض نجاح محلي." };
}

export async function saveDecisionMemorySnapshot(input: DecisionMemorySaveInput): Promise<DecisionMemorySaveResult> {
  if (!UUID.test(input.decisionOutcomeId) ||
      !Number.isInteger(input.expectedVersion) || input.expectedVersion < 0 ||
      !iso(input.asOf) || !period(input.period) ||
      input.period.from < input.asOf.slice(0, 10) || input.period.to > addDays(input.asOf.slice(0, 10), 90) ||
      input.problem.length > 2000 || input.actionTaken.length > 2000 ||
      input.facts.length > 100 || input.opinions.length > 100 ||
      input.hypotheses.length > 100 || input.assumptions.length > 100 ||
      input.alternatives.length > 50 || input.lessons.length > 100 ||
      input.facts.some(item => !requiredString(item.text, 2000) || !item.evidenceIds.length ||
        item.evidenceIds.length > 50 || item.evidenceIds.some(id => !/^(invoice|payment):[0-9a-f-]{36}$/i.test(id))) ||
      input.opinions.some(item => !requiredString(item.text, 2000)) ||
      input.hypotheses.some(item => !requiredString(item.text, 2000)) ||
      input.assumptions.some(item => !requiredString(item, 2000)) ||
      input.lessons.some(item => !requiredString(item, 2000)) ||
      input.alternatives.some(item => !requiredString(item.label, 300)) ||
      (input.chosenOptionId !== null && !input.alternatives.some(item => item.id === input.chosenOptionId)) ||
      (input.reviewDisposition === "SCHEDULED" && (!input.reviewAt || !iso(input.reviewAt) || Date.parse(input.reviewAt) <= Date.now())) ||
      (input.reviewDisposition !== "SCHEDULED" && input.reviewAt !== null) ||
      (input.expectedMetric !== null && (!input.expectedMetric ||
        input.expectedMetric.key !== "cashflow.expected_collections" ||
        !/^[A-Z]{3}$/.test(input.expectedMetric.currency))) ||
      (input.expectedVersion > 0 && !requiredString(input.reason, 2000))) {
    return { ok: false, status: "ERROR", message: "أكمل حقول القرار، واربط كل واقعة بمعرّف مصدر فعلي صالح." };
  }
  const snapshot = {
    asOf: input.asOf,
    period: input.period,
    problem: input.problem.trim() || null,
    factsReviewed: input.factsReviewed,
    facts: input.facts.map(item => ({ id: item.id, kind: "FACT", text: item.text.trim(), evidenceIds: item.evidenceIds })),
    opinions: input.opinions.map(item => ({ id: item.id, kind: "OPINION", text: item.text.trim(), evidenceIds: [] })),
    hypotheses: input.hypotheses.map(item => ({ id: item.id, kind: "HYPOTHESIS", text: item.text.trim(), evidenceIds: [] })),
    assumptions: input.assumptions.map(item => item.trim()),
    alternatives: input.alternatives,
    chosenOptionId: input.chosenOptionId,
    assumptionsReviewed: input.assumptionsReviewed,
    actionTaken: input.actionTaken.trim() || null,
    reviewDisposition: input.reviewDisposition,
    reviewAt: input.reviewAt,
    expectedMetric: input.expectedMetric,
    lessonsReviewed: input.lessonsReviewed,
    lessons: input.lessons.map(item => item.trim()),
  };
  try {
    const { data, error } = await supabase.rpc("save_decision_memory_snapshot", {
      p_decision_outcome_id: input.decisionOutcomeId,
      p_expected_version: input.expectedVersion,
      p_snapshot: snapshot,
      p_reason: input.reason?.trim() || null,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) return { ok: false, ...failure(error) };
    const raw = record(data);
    const saved = parseDecisionMemorySnapshot(raw?.snapshot);
    if (!raw || raw.ok !== true || typeof raw.duplicate !== "boolean" || !saved ||
        saved.decisionId !== input.decisionOutcomeId) {
      return { ok: false, status: "ERROR", message: "لم تُرجع الخدمة إصدار ذاكرة محفوظاً قابلاً للتحقق؛ لم يُعرض نجاح." };
    }
    return { ok: true, version: saved.version, duplicate: raw.duplicate };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الوصول إلى خدمة ذاكرة القرارات." };
  }
}
