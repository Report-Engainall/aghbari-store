import type {
  DataCompleteness,
  DataQuality,
  EvidencePassport,
  EvidencePeriod,
  EvidenceRecord,
  EvidenceStatus,
  MetricSnapshot,
} from "./types";
import { buildEvidencePassport } from "./evidence-passport";
import { decimalToMinorUnits, minorUnitsToNumber } from "./financial-precision";

export type EvidenceSourceComparisonStatus =
  | "MATCHED"
  | "VARIANCE"
  | "NOT_COMPARABLE"
  | "WITHHELD";

export type EvidenceSourceComparisonReason =
  | "INVALID_INPUT"
  | "COMPARISON_KEY_REQUIRED"
  | "LEFT_PASSPORT_INVALID"
  | "RIGHT_PASSPORT_INVALID"
  | "LEFT_METRIC_MISSING"
  | "RIGHT_METRIC_MISSING"
  | "METRIC_AMBIGUOUS"
  | "LEFT_EVIDENCE_NOT_VERIFIED"
  | "RIGHT_EVIDENCE_NOT_VERIFIED"
  | "METRIC_VALUE_NOT_NUMERIC"
  | "METRIC_VALUE_OUT_OF_RANGE"
  | "METRIC_VALUE_PRECISION_INVALID"
  | "ZERO_BASELINE_PERCENT_UNDEFINED"
  | "METRIC_UNIT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "UNIT_OF_MEASURE_MISMATCH"
  | "PERIOD_MISSING_OR_MISMATCH"
  | "AS_OF_MISMATCH"
  | "FORMULA_MISMATCH"
  | "COMPARISON_ARITHMETIC_UNSAFE";

export interface EvidenceSourceReferenceSummary {
  sourceName: string;
  sourceKind: EvidenceRecord["source"]["kind"];
  sourceVersion: string | null;
  sourceTimestamp: string;
  asOf: string;
  sourceAgeMilliseconds: number | null;
  status: EvidenceStatus;
  completeness: DataCompleteness;
  quality: DataQuality;
}

export interface EvidenceMetricComparisonSide {
  value: number | null;
  unit: MetricSnapshot["unit"];
  currency: string | null;
  unitOfMeasure: string | null;
  period: EvidencePeriod | null;
  asOf: string;
  status: EvidenceStatus;
  completeness: DataCompleteness;
  quality: DataQuality;
  formulaId: string;
  formulaVersion: string;
  sources: EvidenceSourceReferenceSummary[];
}

export interface EvidenceSourceComparison {
  status: EvidenceSourceComparisonStatus;
  comparisonKey: string | null;
  metricKey: string;
  left: EvidenceMetricComparisonSide | null;
  right: EvidenceMetricComparisonSide | null;
  difference: number | null;
  differencePercent: number | null;
  reasons: EvidenceSourceComparisonReason[];
  explanation: string;
}

function normalizePassport(passport: EvidencePassport | null | undefined): EvidencePassport | null {
  if (!passport || typeof passport !== "object" ||
      typeof passport.id !== "string" ||
      typeof passport.generatedAt !== "string" ||
      typeof passport.asOf !== "string" ||
      !Array.isArray(passport.evidenceRecords) ||
      !Array.isArray(passport.metrics)) {
    return null;
  }
  try {
    return buildEvidencePassport({
      id: passport.id,
      generatedAt: passport.generatedAt,
      asOf: passport.asOf,
      evidenceRecords: passport.evidenceRecords,
      metrics: passport.metrics,
    });
  } catch {
    return null;
  }
}

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validPeriod(period: EvidencePeriod | null): boolean {
  return Boolean(period && validDay(period.from) && validDay(period.to) && period.from <= period.to);
}

function metricSources(
  metric: MetricSnapshot,
  records: readonly EvidenceRecord[],
): EvidenceSourceReferenceSummary[] {
  const byId = new Map(records.map(record => [record.id, record]));
  const seen = new Set<string>();
  const result: EvidenceSourceReferenceSummary[] = [];
  for (const id of metric.lineage.evidenceIds) {
    const record = byId.get(id);
    if (!record) continue;
    const key = [
      record.source.kind,
      record.source.name,
      record.source.version ?? "",
      record.sourceTimestamp,
      record.asOf,
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      sourceName: record.source.name,
      sourceKind: record.source.kind,
      sourceVersion: record.source.version ?? null,
      sourceTimestamp: record.sourceTimestamp,
      asOf: record.asOf,
      sourceAgeMilliseconds: Number.isFinite(Date.parse(record.sourceTimestamp)) &&
        Number.isFinite(Date.parse(record.asOf)) &&
        Date.parse(record.sourceTimestamp) <= Date.parse(record.asOf)
        ? Date.parse(record.asOf) - Date.parse(record.sourceTimestamp)
        : null,
      status: record.status,
      completeness: record.completeness,
      quality: record.quality,
    });
  }
  return result;
}

function metricDisplayValue(metric: MetricSnapshot): number | null {
  if (metric.unit === "CURRENCY") {
    const minorUnits = decimalToMinorUnits(metric.value, 2, true);
    return minorUnits === null ? null : minorUnitsToNumber(minorUnits, 2);
  }
  return typeof metric.value === "number" &&
    Number.isFinite(metric.value) &&
    Math.abs(metric.value) <= Number.MAX_SAFE_INTEGER
    ? metric.value
    : null;
}

function metricSide(
  metric: MetricSnapshot,
  records: readonly EvidenceRecord[],
): EvidenceMetricComparisonSide {
  const evidenceTrusted = metric.status === "VERIFIED" &&
    metric.completeness === "COMPLETE" &&
    metric.quality === "ACCEPTABLE";
  const value = evidenceTrusted ? metricDisplayValue(metric) : null;
  return {
    value,
    unit: metric.unit,
    currency: metric.currency ?? null,
    unitOfMeasure: metric.unitOfMeasure ?? null,
    period: metric.period ? { ...metric.period } : null,
    asOf: metric.asOf,
    status: metric.status,
    completeness: metric.completeness,
    quality: metric.quality,
    formulaId: metric.lineage.formulaId,
    formulaVersion: metric.lineage.formulaVersion,
    sources: metricSources(metric, records),
  };
}

function findMetric(
  passport: EvidencePassport,
  metricKey: string,
): { metric: MetricSnapshot | null; reason: EvidenceSourceComparisonReason | null } {
  const matches = passport.metrics.filter(metric => metric.key === metricKey);
  if (matches.length === 0) return { metric: null, reason: "LEFT_METRIC_MISSING" };
  if (matches.length !== 1) return { metric: null, reason: "METRIC_AMBIGUOUS" };
  return { metric: matches[0], reason: null };
}

/**
 * Compares two independently verified metric snapshots. It never averages or
 * promotes weak evidence; a difference is calculated only for exact compatible
 * key/unit/currency/UOM/period/as-of/formula context.
 *
 * comparisonKey must be resolved by the authorized caller (for example, a
 * stable product/customer/account key). It is returned as a label only and is
 * not independently verified by this client-side projection.
 */
export function compareEvidenceMetricSources(input: {
  comparisonKey: string;
  metricKey: string;
  left: EvidencePassport;
  right: EvidencePassport;
}): EvidenceSourceComparison {
  const empty = (
    status: EvidenceSourceComparisonStatus,
    reason: EvidenceSourceComparisonReason,
    explanation: string,
  ): EvidenceSourceComparison => ({
    status,
    comparisonKey: typeof input?.comparisonKey === "string" && input.comparisonKey.trim()
      ? input.comparisonKey.trim()
      : null,
    metricKey: typeof input?.metricKey === "string" ? input.metricKey : "",
    left: null,
    right: null,
    difference: null,
    differencePercent: null,
    reasons: [reason],
    explanation,
  });

  if (!input || typeof input !== "object" ||
      typeof input.comparisonKey !== "string" ||
      typeof input.metricKey !== "string" ||
      !input.metricKey.trim() || input.metricKey.length > 160 ||
      input.comparisonKey.length > 160) {
    return empty("WITHHELD", "INVALID_INPUT", "لا يمكن مقارنة مصدرين دون مفتاح مقارنة ومؤشر صالحين.");
  }
  if (!input.comparisonKey.trim()) {
    return empty("WITHHELD", "COMPARISON_KEY_REQUIRED", "مفتاح المقارنة غير متاح؛ قد لا يمثل المصدران الكيان نفسه.");
  }

  const leftPassport = normalizePassport(input.left);
  if (!leftPassport) {
    return empty("WITHHELD", "LEFT_PASSPORT_INVALID", "لقطة المصدر الأول غير صالحة أو غير مكتملة.");
  }
  const rightPassport = normalizePassport(input.right);
  if (!rightPassport) {
    return empty("WITHHELD", "RIGHT_PASSPORT_INVALID", "لقطة المصدر الثاني غير صالحة أو غير مكتملة.");
  }

  const leftMatch = findMetric(leftPassport, input.metricKey);
  const rightMatch = findMetric(rightPassport, input.metricKey);
  const reasons: EvidenceSourceComparisonReason[] = [];
  if (!leftMatch.metric) reasons.push(
    leftMatch.reason === "METRIC_AMBIGUOUS" ? "METRIC_AMBIGUOUS" : "LEFT_METRIC_MISSING",
  );
  if (!rightMatch.metric) reasons.push(
    rightMatch.reason === "METRIC_AMBIGUOUS" ? "METRIC_AMBIGUOUS" : "RIGHT_METRIC_MISSING",
  );
  if (reasons.length) {
    return {
      status: "WITHHELD",
      comparisonKey: input.comparisonKey.trim(),
      metricKey: input.metricKey,
      left: leftMatch.metric ? metricSide(leftMatch.metric, leftPassport.evidenceRecords) : null,
      right: rightMatch.metric ? metricSide(rightMatch.metric, rightPassport.evidenceRecords) : null,
      difference: null,
      differencePercent: null,
      reasons,
      explanation: "المؤشر مفقود أو مكرر في إحدى اللقطتين؛ لم يُحتسب فرق.",
    };
  }

  const leftMetric = leftMatch.metric as MetricSnapshot;
  const rightMetric = rightMatch.metric as MetricSnapshot;
  const left = metricSide(leftMetric, leftPassport.evidenceRecords);
  const right = metricSide(rightMetric, rightPassport.evidenceRecords);

  if (leftMetric.status !== "VERIFIED" ||
      leftMetric.completeness !== "COMPLETE" ||
      leftMetric.quality !== "ACCEPTABLE" ||
      left.sources.length === 0) reasons.push("LEFT_EVIDENCE_NOT_VERIFIED");
  if (rightMetric.status !== "VERIFIED" ||
      rightMetric.completeness !== "COMPLETE" ||
      rightMetric.quality !== "ACCEPTABLE" ||
      right.sources.length === 0) reasons.push("RIGHT_EVIDENCE_NOT_VERIFIED");
  if (reasons.length) {
    return {
      status: "WITHHELD",
      comparisonKey: input.comparisonKey.trim(),
      metricKey: input.metricKey,
      left,
      right,
      difference: null,
      differencePercent: null,
      reasons,
      explanation: "أحد المصدرين لا يملك سلسلة إثبات مكتملة ومقبولة؛ حُجبت المقارنة الرقمية.",
    };
  }

  if (leftMetric.unit !== rightMetric.unit) reasons.push("METRIC_UNIT_MISMATCH");
  if ((leftMetric.currency ?? "").toUpperCase() !== (rightMetric.currency ?? "").toUpperCase())
    reasons.push("CURRENCY_MISMATCH");
  if ((leftMetric.unitOfMeasure ?? "") !== (rightMetric.unitOfMeasure ?? ""))
    reasons.push("UNIT_OF_MEASURE_MISMATCH");
  if (!validPeriod(leftMetric.period) || !validPeriod(rightMetric.period) ||
      leftMetric.period?.from !== rightMetric.period?.from ||
      leftMetric.period?.to !== rightMetric.period?.to)
    reasons.push("PERIOD_MISSING_OR_MISMATCH");
  if (!Number.isFinite(Date.parse(leftMetric.asOf)) ||
      !Number.isFinite(Date.parse(rightMetric.asOf)) ||
      Date.parse(leftMetric.asOf) !== Date.parse(rightMetric.asOf))
    reasons.push("AS_OF_MISMATCH");
  if (leftMetric.lineage.formulaId !== rightMetric.lineage.formulaId ||
      leftMetric.lineage.formulaVersion !== rightMetric.lineage.formulaVersion)
    reasons.push("FORMULA_MISMATCH");

  if (reasons.length) {
    return {
      status: "NOT_COMPARABLE",
      comparisonKey: input.comparisonKey.trim(),
      metricKey: input.metricKey,
      left,
      right,
      difference: null,
      differencePercent: null,
      reasons,
      explanation: "المصدران موثوقان كلٌ على حدة لكن سياق القياس مختلف؛ عُرضت القيمتان دون دمج أو احتساب فرق.",
    };
  }

  let difference: number | null = null;
  let differencePercent: number | null = null;

  if (leftMetric.unit === "CURRENCY") {
    const leftMinor = decimalToMinorUnits(leftMetric.value, 2, true);
    const rightMinor = decimalToMinorUnits(rightMetric.value, 2, true);
    if (leftMinor === null || rightMinor === null) {
      return {
        status: "WITHHELD",
        comparisonKey: input.comparisonKey.trim(),
        metricKey: input.metricKey,
        left,
        right,
        difference: null,
        differencePercent: null,
        reasons: ["METRIC_VALUE_PRECISION_INVALID"],
        explanation: "القيمة المالية لا تطابق دقة منزلتين عشريتين أو تتجاوز الحد الآمن؛ حُجبت المقارنة.",
      };
    }
    const differenceMinor = rightMinor - leftMinor;
    difference = minorUnitsToNumber(differenceMinor, 2);
    differencePercent = leftMinor === 0n
      ? null
      : (Number(differenceMinor) / Number(leftMinor < 0n ? -leftMinor : leftMinor)) * 100;
  } else {
    if (typeof leftMetric.value !== "number" || typeof rightMetric.value !== "number" ||
        !Number.isFinite(leftMetric.value) || !Number.isFinite(rightMetric.value)) {
      return {
        status: "WITHHELD",
        comparisonKey: input.comparisonKey.trim(),
        metricKey: input.metricKey,
        left,
        right,
        difference: null,
        differencePercent: null,
        reasons: ["METRIC_VALUE_NOT_NUMERIC"],
        explanation: "القيم ليست أرقاماً صالحة للمقارنة؛ لم يُستبدل المجهول بصفر.",
      };
    }
    if (Math.abs(leftMetric.value) > Number.MAX_SAFE_INTEGER || Math.abs(rightMetric.value) > Number.MAX_SAFE_INTEGER) {
      return {
        status: "WITHHELD", comparisonKey: input.comparisonKey.trim(), metricKey: input.metricKey,
        left, right, difference: null, differencePercent: null,
        reasons: ["METRIC_VALUE_OUT_OF_RANGE"],
        explanation: "إحدى القيم تتجاوز الحدود الرقمية الآمنة؛ أبقينا قيمتي المصدر منفصلتين.",
      };
    }
    difference = rightMetric.value - leftMetric.value;
    differencePercent = leftMetric.value === 0 ? null : (difference / Math.abs(leftMetric.value)) * 100;
  }

  if (difference === null || !Number.isFinite(difference) || Math.abs(difference) > Number.MAX_SAFE_INTEGER ||
      (differencePercent !== null &&
        (!Number.isFinite(differencePercent) || Math.abs(differencePercent) > Number.MAX_SAFE_INTEGER))) {
    return {
      status: "WITHHELD",
      comparisonKey: input.comparisonKey.trim(),
      metricKey: input.metricKey,
      left,
      right,
      difference: null,
      differencePercent: null,
      reasons: ["COMPARISON_ARITHMETIC_UNSAFE"],
      explanation: "الفرق الحسابي يتجاوز الحدود الآمنة؛ أبقينا قيمتي المصدر منفصلتين.",
    };
  }

  return {
    status: difference === 0 ? "MATCHED" : "VARIANCE",
    comparisonKey: input.comparisonKey.trim(),
    metricKey: input.metricKey,
    left,
    right,
    difference,
    differencePercent,
    reasons: differencePercent === null ? ["ZERO_BASELINE_PERCENT_UNDEFINED"] : [],
    explanation: differencePercent === null
      ? "احتُسب الفرق المطلق؛ نسبة التغير غير معرفة لأن خط الأساس يساوي صفراً."
      : difference === 0
        ? "القيمتان متطابقتان ضمن المفتاح والفترة والعملات والوحدة والمعادلة نفسها."
        : "يوجد فرق بين المصدرين؛ لم يُحسب متوسط ولم يُعدّل أي مصدر.",
  };
}
