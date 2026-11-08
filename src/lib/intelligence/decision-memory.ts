import type { DecisionOutcomeView } from "./decision-outcome-client";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot } from "./types";

export const DECISION_MEMORY_POLICY_VERSION = "1.0.0";

export type DecisionMemoryStatementKind = "FACT" | "OPINION" | "HYPOTHESIS";
export interface DecisionMemoryStatement {
  id: string;
  kind: DecisionMemoryStatementKind;
  text: string;
  actorRole: string;
  recordedAt: string;
  evidenceIds: string[];
  sourceEvidenceIds?: string[];
}
export interface DecisionMemoryAlternative {
  id: string;
  label: string;
  rationale: string | null;
  evidenceIds: string[];
}
export interface DecisionMemoryCorrection {
  id: string;
  fromVersion: number;
  toVersion: number;
  recordedAt: string;
  actorRole: string;
  reason: string;
  originalText: string;
  correctedText: string;
  evidenceIds: string[];
}
export type DecisionMemoryReviewDisposition = "SCHEDULED" | "NOT_SCHEDULED" | "NOT_REQUIRED";
export interface DecisionMemorySnapshot {
  id: string;
  decisionId: string;
  version: number;
  capturedAt: string;
  asOf: string;
  period: EvidencePeriod;
  problem: string | null;
  factsReviewed: boolean;
  opinions: DecisionMemoryStatement[];
  hypotheses: DecisionMemoryStatement[];
  facts: DecisionMemoryStatement[];
  assumptions: string[];
  alternatives: DecisionMemoryAlternative[];
  chosenOptionId: string | null;
  assumptionsReviewed: boolean;
  actionTaken: string | null;
  reviewDisposition: DecisionMemoryReviewDisposition | null;
  reviewAt: string | null;
  expectedMetric: MetricSnapshot | null;
  actualMetric: MetricSnapshot | null;
  lessonsReviewed: boolean;
  lessons: string[];
  corrections: DecisionMemoryCorrection[];
  evidenceRecords: EvidenceRecord[];
}
export type DecisionMemoryMissingField =
  | "PROBLEM_CONTEXT" | "FACTS_REVIEWED" | "FACTS_WITH_EVIDENCE" | "ALTERNATIVES"
  | "CHOSEN_OPTION" | "ASSUMPTIONS_REVIEWED" | "ACTION_TAKEN" | "REVIEW_DISPOSITION"
  | "REVIEW_DATE" | "EXPECTED_METRIC" | "ACTUAL_METRIC" | "LESSONS_REVIEWED";
export interface DecisionMemoryMetricResult {
  metricKey: string; value: number; unit: MetricSnapshot["unit"]; currency: string | null;
  unitOfMeasure: string | null; period: EvidencePeriod; asOf: string;
  formulaId: string; formulaVersion: string; evidenceIds: string[];
}
export interface DecisionMemoryMetricComparison {
  status: "VERIFIED" | "WITHHELD";
  expected: DecisionMemoryMetricResult | null; actual: DecisionMemoryMetricResult | null;
  difference: number | null; differencePercent: number | null; reason: string | null;
}
export interface DecisionMemoryRecord {
  decisionId: string; candidateRef: string; ruleId: string; ruleVersion: string;
  state: DecisionOutcomeView["state"]; version: number; createdAt: string; updatedAt: string;
  owner: string; ownerProfileId: string | null; proposedResult: string; decisionReason: string | null;
  approvalAt: string | null; executionAt: string | null; eventCount: number;
  events: DecisionOutcomeView["history"]; legacyMeasurement: DecisionOutcomeView["measuredOutcome"];
  candidateSnapshot: DecisionOutcomeView["candidateSnapshot"];
  snapshotVersion: number | null; capturedAt: string | null; snapshot: DecisionMemorySnapshot | null; problem: string | null;
  factsReviewed: boolean;
  facts: DecisionMemoryStatement[]; opinions: DecisionMemoryStatement[]; hypotheses: DecisionMemoryStatement[];
  assumptionsReviewed: boolean;
  assumptions: string[];
  lessonsReviewed: boolean;
  withheldFacts: number; alternatives: DecisionMemoryAlternative[]; chosenAlternative: DecisionMemoryAlternative | null;
  actionTaken: string | null; reviewDisposition: DecisionMemoryReviewDisposition | null; reviewAt: string | null;
  expectedMetric: DecisionMemoryMetricResult | null; metricComparison: DecisionMemoryMetricComparison;
  lessons: string[]; corrections: DecisionMemoryCorrection[]; missingFields: DecisionMemoryMissingField[];
  warnings: string[]; memoryStatus: "VERIFIED" | "PARTIAL" | "UNVERIFIED";
  precedents: Array<{ decisionId: string; ruleVersion: string; state: DecisionOutcomeView["state"]; createdAt: string; measured: boolean }>;
}
export interface DecisionMemoryBookResult {
  generatedAt: string; policyVersion: string; status: "VERIFIED" | "PARTIAL" | "EMPTY" | "UNAVAILABLE";
  loadedCount: number; totalCount: number; completeCount: number; partialCount: number;
  measuredCount: number; verifiedMeasurementCount: number; correctionCount: number;
  records: DecisionMemoryRecord[]; warnings: string[];
}

export interface DecisionMemoryPrecedentMatch {
  record: DecisionMemoryRecord;
  matchedTerms: string[];
  matchReasons: string[];
  comparisonStatus: "COMPARABLE" | "NOT_COMPARABLE" | "OUTCOME_UNVERIFIED";
  contextDifferences: string[];
}

const decisionSearchStopwords = new Set([
  "هذا","هذه","ذلك","تلك","على","الى","إلى","عن","من","في","مع","بعد","قبل",
  "عند","بين","ضمن","كان","كانت","تم","قد","هو","هي","ما","ماذا","كيف","هل",
]);

function normalizeDecisionSearchText(value: string): string {
  return value.normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase();
}

function decisionSearchTokens(value: string): string[] {
  const normalized = normalizeDecisionSearchText(value);
  const tokens = normalized.match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return [...new Set(tokens.filter(token => !decisionSearchStopwords.has(token)))].slice(0, 240);
}

function decisionRecordSearchText(record: DecisionMemoryRecord): string {
  return [
    record.ruleId, record.candidateRef, record.proposedResult, record.decisionReason ?? "",
    record.problem ?? "", ...record.facts.map(item => item.text),
    ...record.opinions.map(item => item.text), ...record.hypotheses.map(item => item.text),
    ...record.assumptions, ...record.alternatives.flatMap(item => [item.label, item.rationale ?? ""]),
    record.chosenAlternative?.label ?? "", record.actionTaken ?? "", ...record.lessons,
  ].join(" ");
}

function metricContextDifferences(
  left: DecisionMemoryMetricResult,
  right: DecisionMemoryMetricResult,
  label: string,
): string[] {
  const differences: string[] = [];
  if (left.metricKey !== right.metricKey) differences.push(label + ": المؤشر مختلف");
  if (left.unit !== right.unit) differences.push(label + ": وحدة القياس مختلفة");
  if ((left.currency ?? "").toUpperCase() !== (right.currency ?? "").toUpperCase())
    differences.push(label + ": العملة مختلفة أو غير محددة");
  if ((left.unitOfMeasure ?? "") !== (right.unitOfMeasure ?? ""))
    differences.push(label + ": وحدة الصنف مختلفة أو غير محددة");
  if (left.period.from !== right.period.from || left.period.to !== right.period.to)
    differences.push(label + ": الفترة مختلفة");
  if (left.formulaId !== right.formulaId || left.formulaVersion !== right.formulaVersion)
    differences.push(label + ": المعادلة أو إصدارها مختلف");
  return differences;
}

/**
 * Finds earlier decisions by deterministic same-rule and shared-context matching.
 * Results are limited to the records actually supplied by the authorized source.
 * This is a retrieval aid, not an ML similarity score or a causal recommendation.
 */
export function searchSimilarDecisionMemory(input: {
  records: DecisionMemoryRecord[];
  decisionId: string;
  query?: string;
  limit?: number;
}): DecisionMemoryPrecedentMatch[] {
  const { records, decisionId } = input;
  const limit = input.limit ?? 5;
  const query = input.query ?? "";
  if (!Array.isArray(records) || !decisionId.trim() ||
      !Number.isInteger(limit) || limit < 1 || limit > 20 ||
      typeof query !== "string" || query.length > 500) {
    throw new Error("decision_memory_search_input_invalid");
  }
  const target = records.find(record => record.decisionId === decisionId);
  if (!target || !Number.isFinite(Date.parse(target.createdAt))) return [];

  const queryTokens = decisionSearchTokens(query);
  const targetTokens = decisionSearchTokens(decisionRecordSearchText(target) + " " + query);
  if (!targetTokens.length) return [];

  const targetRule = target.ruleId.trim().toLowerCase();
  return records
    .filter(candidate =>
      candidate.decisionId !== target.decisionId &&
      Number.isFinite(Date.parse(candidate.createdAt)) &&
      Date.parse(candidate.createdAt) < Date.parse(target.createdAt))
    .map(candidate => {
      const candidateTokens = new Set(decisionSearchTokens(decisionRecordSearchText(candidate)));
      const matchedTerms = targetTokens.filter(token => candidateTokens.has(token));
      const sameRule = Boolean(targetRule) && candidate.ruleId.trim().toLowerCase() === targetRule;
      const matchReasons = [
        ...(sameRule ? ["نفس قاعدة القرار"] : []),
        ...(matchedTerms.length ? ["مصطلحات وسياق مشترك"] : []),
        ...(queryTokens.some(token => matchedTerms.includes(token)) ? ["تطابق مع عبارة البحث الإضافية"] : []),
      ];
      const actualLeft = target.metricComparison.actual;
      const actualRight = candidate.metricComparison.actual;
      const actualDifferences = actualLeft && actualRight
        ? metricContextDifferences(actualLeft, actualRight, "النتيجة الفعلية")
        : ["النتيجة الفعلية الموثقة غير متاحة في أحد القرارين"];
      const expectedLeft = target.metricComparison.expected;
      const expectedRight = candidate.metricComparison.expected;
      const expectedDifferences = expectedLeft && expectedRight
        ? metricContextDifferences(expectedLeft, expectedRight, "خط الأساس المتوقع")
        : ["خط الأساس المتوقع غير متاح في أحد القرارين"];
      const comparisonStatus: DecisionMemoryPrecedentMatch["comparisonStatus"] =
        !actualLeft || !actualRight
          ? "OUTCOME_UNVERIFIED"
          : actualDifferences.length
            ? "NOT_COMPARABLE"
            : "COMPARABLE";
      return {
        record: candidate,
        matchedTerms,
        matchReasons,
        comparisonStatus,
        contextDifferences: [...actualDifferences, ...expectedDifferences],
        ranking: (sameRule ? 100 : 0) + matchedTerms.length * 4 +
          (candidate.state === "MEASURED" && actualRight ? 2 : 0),
      };
    })
    .filter(match => match.matchReasons.length > 0)
    .sort((left, right) =>
      right.ranking - left.ranking ||
      right.record.createdAt.localeCompare(left.record.createdAt) ||
      left.record.decisionId.localeCompare(right.record.decisionId))
    .slice(0, limit)
    .map(({ ranking: _ranking, ...match }) => match);
}

export interface DecisionPolicyReviewObservation {
  decisionId: string;
  createdAt: string;
  expected: DecisionMemoryMetricResult;
  actual: DecisionMemoryMetricResult;
  difference: number;
  differencePercent: number | null;
  lessons: string[];
  evidenceIds: string[];
}

export interface DecisionPolicyReviewCalibration {
  sampleCount: number;
  meanExpectedValue: number | null;
  meanActualValue: number | null;
  meanSignedDifference: number | null;
  medianSignedDifference: number | null;
  meanAbsoluteDifference: number | null;
  meanAbsoluteDifferencePercent: number | null;
  percentageSampleCount: number;
  zeroBaselineCount: number;
  aboveExpectedCount: number;
  belowExpectedCount: number;
  equalExpectedCount: number;
}
export interface DecisionPolicyReviewSuggestion {
  id: string;
  ruleId: string;
  ruleVersion: string;
  metricKey: string;
  unit: DecisionMemoryMetricResult["unit"];
  currency: string | null;
  unitOfMeasure: string | null;
  period: EvidencePeriod;
  formulaId: string;
  formulaVersion: string;
  status: "DRAFT_REQUIRES_HUMAN_REVIEW";
  observations: DecisionPolicyReviewObservation[];
  calibration: DecisionPolicyReviewCalibration;
  lessons: string[];
  evidenceIds: string[];
  reviewInstruction: string;
}

function boundedMean(values: number[]): number | null {
  if (!values.length || values.some(value => !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) return null;
  const mean = values.reduce((sum, value) => sum + value / values.length, 0);
  return Number.isFinite(mean) && Math.abs(mean) <= Number.MAX_SAFE_INTEGER ? mean : null;
}
function medianValue(values: number[]): number | null {
  if (!values.length || values.some(value => !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  const median = sorted[middle - 1] / 2 + sorted[middle] / 2;
  return Number.isFinite(median) && Math.abs(median) <= Number.MAX_SAFE_INTEGER ? median : null;
}
function validReviewComparisonArithmetic(
  comparison: DecisionMemoryMetricComparison,
  expected: DecisionMemoryMetricResult,
  actual: DecisionMemoryMetricResult,
): boolean {
  const difference = actual.value - expected.value;
  if (!Number.isFinite(expected.value) || Math.abs(expected.value) > Number.MAX_SAFE_INTEGER ||
      !Number.isFinite(actual.value) || Math.abs(actual.value) > Number.MAX_SAFE_INTEGER ||
      !Number.isFinite(difference) || Math.abs(difference) > Number.MAX_SAFE_INTEGER ||
      typeof comparison.difference !== "number" || !Number.isFinite(comparison.difference) ||
      Math.abs(comparison.difference - difference) > 0.005) return false;
  if (expected.value === 0) return comparison.differencePercent === null;
  const percent = (difference / Math.abs(expected.value)) * 100;
  return Number.isFinite(percent) && Math.abs(percent) <= Number.MAX_SAFE_INTEGER &&
    typeof comparison.differencePercent === "number" &&
    Number.isFinite(comparison.differencePercent) &&
    Math.abs(comparison.differencePercent - percent) <= 0.005;
}
function buildDecisionPolicyReviewCalibration(
  observations: DecisionPolicyReviewObservation[],
): DecisionPolicyReviewCalibration {
  const differences = observations.map(item => item.difference);
  const percentageDifferences = observations.flatMap(item =>
    item.differencePercent === null ? [] : [Math.abs(item.differencePercent)]);
  return {
    sampleCount: observations.length,
    meanExpectedValue: boundedMean(observations.map(item => item.expected.value)),
    meanActualValue: boundedMean(observations.map(item => item.actual.value)),
    meanSignedDifference: boundedMean(differences),
    medianSignedDifference: medianValue(differences),
    meanAbsoluteDifference: boundedMean(differences.map(Math.abs)),
    meanAbsoluteDifferencePercent: boundedMean(percentageDifferences),
    percentageSampleCount: percentageDifferences.length,
    zeroBaselineCount: observations.filter(item => item.expected.value === 0).length,
    aboveExpectedCount: differences.filter(value => value > 0).length,
    belowExpectedCount: differences.filter(value => value < 0).length,
    equalExpectedCount: differences.filter(value => value === 0).length,
  };
}

/**
 * Projects measured, evidence-backed lessons into review drafts linked to the
 * exact rule version and metric context. This never changes a policy or source.
 */
export function buildDecisionPolicyReviewSuggestions(
  records: DecisionMemoryRecord[],
): DecisionPolicyReviewSuggestion[] {
  if (!Array.isArray(records)) throw new Error("decision_policy_review_input_invalid");
  const groups = new Map<string, DecisionPolicyReviewSuggestion>();
  for (const record of records) {
    const comparison = record.metricComparison;
    const expected = comparison.expected;
    const actual = comparison.actual;
    const lessons = unique(record.lessons.map(lesson => lesson.trim()));
    if (record.state !== "MEASURED" ||
        record.memoryStatus !== "VERIFIED" ||
        !record.lessonsReviewed ||
        !lessons.length ||
        comparison.status !== "VERIFIED" ||
        !expected || !actual ||
        !record.ruleId.trim() || !record.ruleVersion.trim() ||
        !validPeriod(expected.period) || !validPeriod(actual.period) ||
        !record.createdAt || !Number.isFinite(Date.parse(record.createdAt)) ||
        !validReviewComparisonArithmetic(comparison, expected, actual) ||
        !expected.evidenceIds.length || !actual.evidenceIds.length) {
      continue;
    }

    const sameContext = expected.metricKey === actual.metricKey &&
      expected.unit === actual.unit &&
      expected.currency === actual.currency &&
      expected.unitOfMeasure === actual.unitOfMeasure &&
      expected.period.from === actual.period.from &&
      expected.period.to === actual.period.to &&
      expected.formulaId === actual.formulaId &&
      expected.formulaVersion === actual.formulaVersion;
    if (!sameContext) continue;

    const groupKey = JSON.stringify([
      record.ruleId, record.ruleVersion,
      actual.metricKey, actual.unit, actual.currency, actual.unitOfMeasure,
      actual.period.from, actual.period.to, actual.formulaId, actual.formulaVersion,
    ]);
    const observation: DecisionPolicyReviewObservation = {
      decisionId: record.decisionId,
      createdAt: record.createdAt,
      expected,
      actual,
      difference: comparison.difference as number,
      differencePercent: comparison.differencePercent,
      lessons,
      evidenceIds: unique([...expected.evidenceIds, ...actual.evidenceIds]),
    };
    const existing = groups.get(groupKey);
    if (existing) {
      existing.observations.push(observation);
      existing.lessons = unique([...existing.lessons, ...observation.lessons]);
      existing.evidenceIds = unique([...existing.evidenceIds, ...observation.evidenceIds]);
      continue;
    }
    groups.set(groupKey, {
      id: groupKey,
      ruleId: record.ruleId,
      ruleVersion: record.ruleVersion,
      metricKey: actual.metricKey,
      unit: actual.unit,
      currency: actual.currency,
      unitOfMeasure: actual.unitOfMeasure,
      period: actual.period,
      formulaId: actual.formulaId,
      formulaVersion: actual.formulaVersion,
      status: "DRAFT_REQUIRES_HUMAN_REVIEW",
      observations: [observation],
      calibration: buildDecisionPolicyReviewCalibration([observation]),
      lessons: observation.lessons,
      evidenceIds: observation.evidenceIds,
      reviewInstruction:
        "راجع صلاحية القاعدة وإصدارها ومدخلاتها في ضوء الدروس والنتائج المثبتة، ثم استخدم المحاكاة وسير الاعتماد المعتاد. لا يغيّر هذا الاقتراح القاعدة أو السعر أو الائتمان أو المخزون. الفروق فوق/تحت المتوقع وصفية ولا تثبت جودة القرار أو سببيته.",
    });
  }
  return [...groups.values()]
    .map(suggestion => ({
      ...suggestion,
      calibration: buildDecisionPolicyReviewCalibration(suggestion.observations),
      observations: suggestion.observations.sort((a,b) =>
        b.createdAt.localeCompare(a.createdAt) || a.decisionId.localeCompare(b.decisionId)),
    }))
    .sort((a,b) =>
      b.observations.length - a.observations.length ||
      b.observations[0].createdAt.localeCompare(a.observations[0].createdAt) ||
      a.id.localeCompare(b.id));
}

function validTime(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}
function validPeriod(period: EvidencePeriod | null | undefined): period is EvidencePeriod {
  if (!period || !/^\d{4}-\d{2}-\d{2}$/.test(period.from) || !/^\d{4}-\d{2}-\d{2}$/.test(period.to)) return false;
  const from = Date.parse(period.from + "T00:00:00.000Z");
  const to = Date.parse(period.to + "T00:00:00.000Z");
  return Number.isFinite(from) && Number.isFinite(to) && from <= to &&
    new Date(from).toISOString().slice(0, 10) === period.from &&
    new Date(to).toISOString().slice(0, 10) === period.to;
}
function samePeriod(a: EvidencePeriod | null, b: EvidencePeriod | null): boolean {
  return Boolean(a && b && validPeriod(a) && validPeriod(b) && a.from === b.from && a.to === b.to);
}
function finiteNumber(value: number | string | null): number | null {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && Math.abs(parsed) <= Number.MAX_SAFE_INTEGER ? parsed : null;
}
function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values.filter(value => value.trim().length > 0))];
}
function evidenceIndex(records: EvidenceRecord[]): Map<string, EvidenceRecord[]> {
  const result = new Map<string, EvidenceRecord[]>();
  for (const record of records) {
    const rows = result.get(record.id) ?? [];
    rows.push(record);
    result.set(record.id, rows);
  }
  return result;
}
function validEvidenceRecord(record: EvidenceRecord, at: string, period: EvidencePeriod): boolean {
  return record.status === "VERIFIED" && record.completeness === "COMPLETE" &&
    record.quality === "ACCEPTABLE" && validTime(record.sourceTimestamp) &&
    validTime(record.asOf) && Date.parse(record.sourceTimestamp) <= Date.parse(at) &&
    Date.parse(record.asOf) <= Date.parse(at) && validPeriod(record.period) &&
    record.period.from === period.from && record.period.to === period.to;
}
function verifiedMetric(metric: MetricSnapshot | null, evidence: Map<string, EvidenceRecord[]>, noLaterThan: string) {
  if (!metric) return { metric: null as DecisionMemoryMetricResult | null, reason: "METRIC_MISSING" as string | null };
  if (metric.status !== "VERIFIED" || metric.completeness !== "COMPLETE" || metric.quality !== "ACCEPTABLE") {
    return { metric: null, reason: "METRIC_NOT_VERIFIED" };
  }
  if (!validTime(metric.asOf) || Date.parse(metric.asOf) > Date.parse(noLaterThan) ||
      !validPeriod(metric.period) || !metric.lineage?.formulaId?.trim() ||
      !metric.lineage?.formulaVersion?.trim() || !validTime(metric.lineage.calculatedAt) ||
      Date.parse(metric.lineage.calculatedAt) > Date.parse(noLaterThan)) {
    return { metric: null, reason: "METRIC_SCOPE_INVALID" };
  }
  if ((metric.unit === "CURRENCY" || metric.unit === "CURRENCY_PER_UNIT") && !metric.currency?.trim()) {
    return { metric: null, reason: "METRIC_CURRENCY_MISSING" };
  }
  if ((metric.unit === "QUANTITY" || metric.unit === "CURRENCY_PER_UNIT") && !metric.unitOfMeasure?.trim()) {
    return { metric: null, reason: "METRIC_UOM_MISSING" };
  }
  const value = finiteNumber(metric.value);
  const ids = metric.lineage.evidenceIds ?? [];
  if (value === null || ids.length === 0 || unique(ids).length !== ids.length) {
    return { metric: null, reason: "METRIC_VALUE_OR_EVIDENCE_INVALID" };
  }
  for (const id of ids) {
    const matches = evidence.get(id) ?? [];
    if (matches.length !== 1 || !validEvidenceRecord(matches[0], metric.asOf, metric.period)) {
      return { metric: null, reason: matches.length > 1 ? "EVIDENCE_AMBIGUOUS" : "EVIDENCE_NOT_VERIFIED" };
    }
    if (matches[0].currency && metric.currency && matches[0].currency !== metric.currency) {
      return { metric: null, reason: "EVIDENCE_CURRENCY_MISMATCH" };
    }
  }
  return {
    metric: {
      metricKey: metric.key, value, unit: metric.unit, currency: metric.currency ?? null,
      unitOfMeasure: metric.unitOfMeasure ?? null, period: metric.period, asOf: metric.asOf,
      formulaId: metric.lineage.formulaId, formulaVersion: metric.lineage.formulaVersion,
      evidenceIds: unique(ids),
    } as DecisionMemoryMetricResult,
    reason: null,
  };
}
function isVerifiedStatement(statement: DecisionMemoryStatement, evidence: Map<string, EvidenceRecord[]>,
  capturedAt: string, period: EvidencePeriod): boolean {
  if (!statement.id.trim() || !statement.text.trim() || !statement.actorRole.trim() ||
      !validTime(statement.recordedAt) || Date.parse(statement.recordedAt) > Date.parse(capturedAt)) return false;
  if (statement.kind !== "FACT") return true;
  if (!statement.evidenceIds.length || unique(statement.evidenceIds).length !== statement.evidenceIds.length) return false;
  return statement.evidenceIds.every(id => {
    const matches = evidence.get(id) ?? [];
    return matches.length === 1 && validEvidenceRecord(matches[0], statement.recordedAt, period);
  });
}
function validCorrections(corrections: DecisionMemoryCorrection[], capturedAt: string, version: number): DecisionMemoryCorrection[] {
  const ordered = [...corrections].sort((a,b)=>a.toVersion-b.toVersion || a.recordedAt.localeCompare(b.recordedAt));
  if (!ordered.length) return [];
  const result: DecisionMemoryCorrection[] = [];
  let lastVersion = 1;
  let lastTime = Number.NEGATIVE_INFINITY;
  const seen = new Set<string>();
  for (const correction of ordered) {
    const recordedAt = Date.parse(correction.recordedAt);
    if (!correction.id.trim() || seen.has(correction.id) || correction.fromVersion !== lastVersion ||
        correction.toVersion !== correction.fromVersion + 1 || !validTime(correction.recordedAt) ||
        recordedAt < lastTime || recordedAt > Date.parse(capturedAt) || !correction.actorRole.trim() ||
        correction.reason.trim().length < 3 || !correction.originalText.trim() || !correction.correctedText.trim()) continue;
    seen.add(correction.id);
    result.push(correction);
    lastVersion = correction.toVersion;
    lastTime = recordedAt;
  }
  return lastVersion === version ? result : [];
}
function compareMetrics(expected: DecisionMemoryMetricResult | null, actual: DecisionMemoryMetricResult | null,
  expectedReason: string | null, actualReason: string | null): DecisionMemoryMetricComparison {
  if (!expected || !actual) return {
    status: "WITHHELD", expected, actual, difference: null, differencePercent: null,
    reason: expectedReason ?? actualReason ?? "EXPECTED_OR_ACTUAL_METRIC_MISSING",
  };
  const compatible = expected.metricKey === actual.metricKey && expected.unit === actual.unit &&
    expected.currency === actual.currency && expected.unitOfMeasure === actual.unitOfMeasure &&
    expected.formulaId === actual.formulaId && expected.formulaVersion === actual.formulaVersion &&
    samePeriod(expected.period, actual.period) && Date.parse(actual.asOf) > Date.parse(expected.asOf);
  if (!compatible) return {
    status: "WITHHELD", expected, actual, difference: null, differencePercent: null,
    reason: "METRIC_PERIOD_UNIT_CURRENCY_OR_FORMULA_CHANGED",
  };
  const difference = actual.value - expected.value;
  const differencePercent = expected.value === 0
    ? null
    : (difference / Math.abs(expected.value)) * 100;
  if (!Number.isFinite(difference) || Math.abs(difference) > Number.MAX_SAFE_INTEGER ||
      (differencePercent !== null &&
        (!Number.isFinite(differencePercent) || Math.abs(differencePercent) > Number.MAX_SAFE_INTEGER))) {
    return {
      status: "WITHHELD", expected, actual, difference: null, differencePercent: null,
      reason: "OUTCOME_ARITHMETIC_UNSAFE",
    };
  }
  return {
    status: "VERIFIED", expected, actual, difference, differencePercent,
    reason: expected.value === 0 ? "ZERO_BASELINE_PERCENT_WITHHELD" : null,
  };
}
const missingLabels: Record<DecisionMemoryMissingField,string> = {
  PROBLEM_CONTEXT:"سياق المشكلة قبل القرار", FACTS_REVIEWED:"توثيق مراجعة الوقائع",
  FACTS_WITH_EVIDENCE:"ربط الوقائع بأدلة المصدر", ALTERNATIVES:"البدائل التي تمت دراستها",
  CHOSEN_OPTION:"الخيار الذي تم اختياره", ASSUMPTIONS_REVIEWED:"الافتراضات ومراجعتها صراحة",
  ACTION_TAKEN:"الإجراء التنفيذي الناتج عن القرار", REVIEW_DISPOSITION:"تحديد ما إذا كانت المراجعة مجدولة أو غير مطلوبة",
  REVIEW_DATE:"تاريخ المراجعة عند اختيار الجدولة", EXPECTED_METRIC:"خط الأساس/الهدف المتوقع ومعادلته",
  ACTUAL_METRIC:"النتيجة الفعلية مع الدليل والمعادلة", LESSONS_REVIEWED:"توثيق مراجعة الدروس المستفادة",
};
export function decisionMemoryMissingLabels(): Record<DecisionMemoryMissingField,string> { return { ...missingLabels }; }

/** Read-only decision memory. Missing historical snapshots remain explicitly incomplete. */
export function buildDecisionMemoryBook(input: {
  generatedAt: string;
  outcomes: DecisionOutcomeView[];
  snapshots: DecisionMemorySnapshot[];
  totalOutcomes?: number;
  sourceCoverageComplete?: boolean;
  sourceCoverageWarning?: string;
}): DecisionMemoryBookResult {
  if (!validTime(input.generatedAt) || !Array.isArray(input.outcomes) || !Array.isArray(input.snapshots)) {
    throw new Error("decision_memory_input_invalid");
  }
  const totalCount = input.totalOutcomes ?? input.outcomes.length;
  const sourceCoverageComplete = input.sourceCoverageComplete !== false;
  if (!Number.isInteger(totalCount) || totalCount < input.outcomes.length) throw new Error("decision_memory_total_invalid");
  const snapshotsByDecision = new Map<string, DecisionMemorySnapshot[]>();
  const suppliedSnapshots = input.snapshots.length ? input.snapshots : input.outcomes.flatMap(outcome => outcome.memorySnapshot ? [outcome.memorySnapshot] : []);
  for (const snapshot of suppliedSnapshots) {
    const rows = snapshotsByDecision.get(snapshot.decisionId) ?? [];
    rows.push(snapshot);
    snapshotsByDecision.set(snapshot.decisionId, rows);
  }
  const outcomeIds = new Set<string>();
  for (const outcome of input.outcomes) {
    if (outcomeIds.has(outcome.id)) throw new Error("decision_memory_duplicate_outcome");
    outcomeIds.add(outcome.id);
  }
  const records: DecisionMemoryRecord[] = input.outcomes.slice()
    .sort((a,b)=>b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
    .map(outcome => {
      const candidates = snapshotsByDecision.get(outcome.id) ?? [];
      const snapshot = candidates.length === 1 ? candidates[0] : null;
      const warnings: string[] = [];
      const missingFields: DecisionMemoryMissingField[] = [];
      if (candidates.length > 1) warnings.push("DUPLICATE_DECISION_MEMORY_SNAPSHOT");
      if (!snapshot) {
        missingFields.push("PROBLEM_CONTEXT","FACTS_REVIEWED","ALTERNATIVES","CHOSEN_OPTION",
          "ASSUMPTIONS_REVIEWED","ACTION_TAKEN","REVIEW_DISPOSITION");
        if (outcome.state === "MEASURED") missingFields.push("EXPECTED_METRIC","ACTUAL_METRIC","LESSONS_REVIEWED");
      }
      let problem:string|null=null, facts:DecisionMemoryStatement[]=[], opinions:DecisionMemoryStatement[]=[],
        hypotheses:DecisionMemoryStatement[]=[], assumptions:string[]=[], factsReviewed=false, assumptionsReviewed=false, lessonsReviewed=false, withheldFacts=0, alternatives:DecisionMemoryAlternative[]=[],
        chosenAlternative:DecisionMemoryAlternative|null=null, actionTaken:string|null=null,
        reviewDisposition:DecisionMemoryReviewDisposition|null=null, reviewAt:string|null=null,
        expectedMetric:DecisionMemoryMetricResult|null=null,
        metricComparison:DecisionMemoryMetricComparison=compareMetrics(null,null,"MEMORY_SNAPSHOT_MISSING","MEMORY_SNAPSHOT_MISSING"),
        lessons:string[]=[], corrections:DecisionMemoryCorrection[]=[], snapshotVersion:number|null=null,capturedAt:string|null=null;
      if (snapshot) {
        const evidence=evidenceIndex(snapshot.evidenceRecords??[]);
        const snapshotValid=snapshot.id.trim()!=="" && snapshot.decisionId===outcome.id &&
          Number.isInteger(snapshot.version) && snapshot.version>=1 && validTime(snapshot.capturedAt) &&
          validTime(snapshot.asOf) && Date.parse(snapshot.capturedAt)<=Date.parse(input.generatedAt) &&
          Date.parse(snapshot.asOf)<=Date.parse(outcome.createdAt) && Date.parse(snapshot.asOf)<=Date.parse(snapshot.capturedAt) &&
          validPeriod(snapshot.period);
        if(!snapshotValid){
          warnings.push("DECISION_MEMORY_SNAPSHOT_SCOPE_INVALID");
          missingFields.push("PROBLEM_CONTEXT","FACTS_REVIEWED","ALTERNATIVES","CHOSEN_OPTION",
            "ASSUMPTIONS_REVIEWED","ACTION_TAKEN","REVIEW_DISPOSITION");
          if(outcome.state==="MEASURED") missingFields.push("EXPECTED_METRIC","ACTUAL_METRIC","LESSONS_REVIEWED");
        } else {
          snapshotVersion=snapshot.version;capturedAt=snapshot.capturedAt;
          if(snapshot.problem?.trim()) problem=snapshot.problem.trim(); else missingFields.push("PROBLEM_CONTEXT");
          factsReviewed=snapshot.factsReviewed===true;
           if(snapshot.factsReviewed===true){
            facts=(snapshot.facts??[]).filter(statement=>statement.kind==="FACT"&&isVerifiedStatement(statement,evidence,snapshot.capturedAt,snapshot.period));
            withheldFacts=(snapshot.facts??[]).length-facts.length;
            if(withheldFacts){warnings.push("FACTS_WITHHELD_WITHOUT_VERIFIED_EVIDENCE");missingFields.push("FACTS_WITH_EVIDENCE");}
          } else missingFields.push("FACTS_REVIEWED");
          opinions=(snapshot.opinions??[]).filter(statement=>statement.kind==="OPINION"&&isVerifiedStatement(statement,evidence,snapshot.capturedAt,snapshot.period));
          hypotheses=(snapshot.hypotheses??[]).filter(statement=>statement.kind==="HYPOTHESIS"&&isVerifiedStatement(statement,evidence,snapshot.capturedAt,snapshot.period));
          assumptions=(snapshot.assumptions??[]).filter(value=>typeof value==="string"&&value.trim().length>0);
          if(Array.isArray(snapshot.alternatives)&&snapshot.alternatives.some(item=>item.id.trim()&&item.label.trim()))
            alternatives=snapshot.alternatives.filter(item=>item.id.trim()&&item.label.trim());
          else missingFields.push("ALTERNATIVES");
          if(snapshot.chosenOptionId&&alternatives.some(item=>item.id===snapshot.chosenOptionId))
            chosenAlternative=alternatives.find(item=>item.id===snapshot.chosenOptionId)??null;
          else if(outcome.state!=="REJECTED") missingFields.push("CHOSEN_OPTION");
          assumptionsReviewed=snapshot.assumptionsReviewed===true;
           if(snapshot.assumptionsReviewed!==true) missingFields.push("ASSUMPTIONS_REVIEWED");
          if(["APPROVED","ASSIGNED","EXECUTING","EXECUTED","MEASURED"].includes(outcome.state)){
            if(snapshot.actionTaken?.trim()) actionTaken=snapshot.actionTaken.trim(); else missingFields.push("ACTION_TAKEN");
          } else actionTaken=snapshot.actionTaken?.trim()||null;
          if(snapshot.reviewDisposition==="SCHEDULED"||snapshot.reviewDisposition==="NOT_SCHEDULED"||snapshot.reviewDisposition==="NOT_REQUIRED"){
            reviewDisposition=snapshot.reviewDisposition;
            if(reviewDisposition==="SCHEDULED"){
              if(validTime(snapshot.reviewAt??"")&&Date.parse(snapshot.reviewAt as string)>=Date.parse(snapshot.capturedAt)) reviewAt=snapshot.reviewAt as string;
              else missingFields.push("REVIEW_DATE");
            }
          } else missingFields.push("REVIEW_DISPOSITION");
          const expectedCheck=verifiedMetric(snapshot.expectedMetric,evidence,snapshot.capturedAt);
          const actualCheck=verifiedMetric(snapshot.actualMetric,evidence,input.generatedAt);
          if(snapshot.expectedMetric&&!expectedCheck.metric) warnings.push("EXPECTED_METRIC_WITHHELD:"+expectedCheck.reason);
          if(snapshot.actualMetric&&!actualCheck.metric) warnings.push("ACTUAL_METRIC_WITHHELD:"+actualCheck.reason);
          expectedMetric=expectedCheck.metric;
          let actualMetric=actualCheck.metric;
          if(outcome.state==="MEASURED"){
            if(!expectedMetric) missingFields.push("EXPECTED_METRIC");
            if(!actualMetric) missingFields.push("ACTUAL_METRIC");
            lessonsReviewed=snapshot.lessonsReviewed===true;
             if(!snapshot.lessonsReviewed) missingFields.push("LESSONS_REVIEWED");
            else lessons=(snapshot.lessons??[]).filter(value=>typeof value==="string"&&value.trim().length>0);
          } else if(actualMetric){warnings.push("ACTUAL_METRIC_PRESENT_BEFORE_MEASURED_STATE");actualMetric=null;}
          if(actualMetric&&outcome.state==="MEASURED"&&!outcome.measuredOutcome){
            warnings.push("DECISION_OUTCOME_MEASUREMENT_SUMMARY_MISSING");actualMetric=null;missingFields.push("ACTUAL_METRIC");
          } else if(actualMetric&&outcome.measuredOutcome&&
            (Math.abs(actualMetric.value-outcome.measuredOutcome.value)>0.005||
             actualMetric.currency!==outcome.measuredOutcome.currency||actualMetric.asOf!==outcome.measuredOutcome.asOf)){
            warnings.push("DECISION_OUTCOME_MEASUREMENT_CONFLICT");actualMetric=null;missingFields.push("ACTUAL_METRIC");
          }
          metricComparison=compareMetrics(expectedMetric,actualMetric,expectedCheck.reason,actualCheck.reason);
          corrections=validCorrections(snapshot.corrections??[],snapshot.capturedAt,snapshot.version);
          if(corrections.length!==(snapshot.corrections??[]).length) warnings.push("CORRECTION_HISTORY_WITHHELD_OR_INVALID");
        }
      }
      const precedents=input.outcomes.filter(previous=>previous.id!==outcome.id&&previous.ruleId===outcome.ruleId&&
        validTime(previous.createdAt)&&Date.parse(previous.createdAt)<Date.parse(outcome.createdAt))
        .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,3)
        .map(previous=>({decisionId:previous.id,ruleVersion:previous.ruleVersion,state:previous.state,createdAt:previous.createdAt,
          measured:previous.state==="MEASURED"&&previous.measuredOutcome!==null}));
      const memoryStatus=missingFields.length===0&&withheldFacts===0&&corrections.length===(snapshot?.corrections??[]).length
        ?"VERIFIED" as const:snapshot?"PARTIAL" as const:"UNVERIFIED" as const;
      return {
        decisionId:outcome.id,candidateRef:outcome.candidateId,ruleId:outcome.ruleId,ruleVersion:outcome.ruleVersion,
        state:outcome.state,version:outcome.version,createdAt:outcome.createdAt,updatedAt:outcome.updatedAt,owner:outcome.ownerLabel,ownerProfileId:outcome.ownerProfileId,
        proposedResult:outcome.expectedOutcome,decisionReason:outcome.reason,approvalAt:outcome.approvedAt,executionAt:outcome.executedAt,
        eventCount:outcome.eventCount,events:outcome.history,legacyMeasurement:outcome.measuredOutcome,
        candidateSnapshot:outcome.candidateSnapshot,
        snapshotVersion,capturedAt,snapshot,problem,factsReviewed,facts,opinions,hypotheses,assumptionsReviewed,assumptions,lessonsReviewed,withheldFacts,alternatives,chosenAlternative,
        actionTaken,reviewDisposition,reviewAt,expectedMetric,metricComparison,lessons,corrections,
        missingFields:unique(missingFields),warnings,memoryStatus,precedents,
      };
    });
  const completeCount=records.filter(record=>record.memoryStatus==="VERIFIED").length;
  const partialCount=records.length-completeCount;
  const measuredCount=records.filter(record=>record.state==="MEASURED").length;
  const verifiedMeasurementCount=records.filter(record=>record.metricComparison.status==="VERIFIED").length;
  const correctionCount=records.reduce((sum,record)=>sum+record.corrections.length,0);
  const warnings=unique([
    ...(suppliedSnapshots.length===0&&records.length?["DECISION_MEMORY_SNAPSHOT_SOURCE_NOT_AVAILABLE"]:[]),
    ...(totalCount>input.outcomes.length?["DECISION_HISTORY_IS_PAGINATED"]:[]),
    ...(!sourceCoverageComplete?[input.sourceCoverageWarning??"DECISION_HISTORY_SOURCE_COVERAGE_UNVERIFIED"]:[]),
    ...records.flatMap(record=>record.warnings),
  ]);
  return {
    generatedAt:input.generatedAt,policyVersion:DECISION_MEMORY_POLICY_VERSION,
    status:!records.length
      ?totalCount===0&&sourceCoverageComplete?"EMPTY":"UNAVAILABLE"
      :partialCount>0||totalCount>input.outcomes.length||!sourceCoverageComplete?"PARTIAL":"VERIFIED",
    loadedCount:records.length,totalCount,completeCount,partialCount,measuredCount,verifiedMeasurementCount,
    correctionCount,records,warnings,
  };
}
