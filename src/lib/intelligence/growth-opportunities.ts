import { buildEvidencePassport } from "./evidence-passport";
import type { EvidencePeriod, EvidenceRecord, EvidenceStatus, MetricSnapshot, MetricUnit } from "./types";

export const GROWTH_OPPORTUNITY_POLICY_VERSION = "1.0.0";

export type GrowthOpportunityKind =
  | "QUOTE_UNCONVERTED"
  | "PRODUCT_UNAVAILABLE_DEMAND"
  | "CUSTOMER_ACTIVITY_DECLINE"
  | "REPEAT_PURCHASE"
  | "PRODUCT_PERFORMANCE_CHANGE";

export type GrowthOpportunityPriority = "P1" | "P2" | "P3";
export type GrowthOpportunityDirection = "OBSERVED" | "DECLINING" | "REPEAT" | "INCREASING" | "NEW_ACTIVITY";

export interface GrowthOpportunitySignal {
  id: string;
  kind: GrowthOpportunityKind;
  /** Opaque same-tenant source reference. Never use a customer name, phone or email here. */
  subjectRef: string;
  /** Metric IDs are returned by the authenticated aggregate contract, never selected from the browser. */
  observedMetricId: string;
  sampleMetricId: string;
  baselineMetricId?: string;
  baselineSampleMetricId?: string;
  /** Optional actual source amount. It is displayed as source evidence, never as predicted profit. */
  sourceAmountMetricId?: string;
  /** Display label from the authenticated source, e.g. a product name; never a person/customer name. */
  subjectLabel?: string;
}

export interface GrowthOpportunity {
  id: string;
  signalId: string;
  kind: GrowthOpportunityKind;
  subjectRef: string;
  title: string;
  classification: "GROWTH" | "DEMAND" | "RETENTION" | "TREND";
  direction: GrowthOpportunityDirection;
  priority: GrowthOpportunityPriority;
  what: string;
  why: string;
  soWhat: string;
  whatNext: string;
  owner: string;
  expectedOutcome: string;
  observedValue: number;
  baselineValue: number | null;
  changePercent: number | null;
  unit: MetricUnit;
  currency?: string;
  unitOfMeasure?: string;
  sampleSize: number;
  baselineSampleSize: number | null;
  sourceAmount: { value: number; currency: string } | null;
  asOf: string;
  period: EvidencePeriod;
  baselinePeriod: EvidencePeriod | null;
  proof: {
    evidenceIds: string[];
    metricKeys: string[];
    formulaVersions: string[];
  };
  policyVersion: string;
  warnings: string[];
}

export interface GrowthOpportunityWithheld {
  signalId: string;
  kind: GrowthOpportunityKind | "UNKNOWN";
  reason:
    | "INVALID_SIGNAL"
    | "DUPLICATE_SIGNAL"
    | "METRIC_MISSING"
    | "METRIC_AMBIGUOUS"
    | "METRIC_NOT_VERIFIED"
    | "METRIC_SCOPE_MISMATCH"
    | "SAMPLE_INSUFFICIENT"
    | "INVALID_COMPARISON"
    | "SOURCE_AMOUNT_WITHHELD";
}

export interface GrowthOpportunityRadarResult {
  generatedAt: string;
  asOf: string;
  status: EvidenceStatus;
  evaluatedSignals: number;
  opportunities: GrowthOpportunity[];
  withheld: GrowthOpportunityWithheld[];
  summary: Record<GrowthOpportunityKind, number>;
  warnings: string[];
}

type MetricRead = { metric: MetricSnapshot; value: number };

const DAY_MS = 86_400_000;
const MIN_QUOTE_SAMPLE = 3;
const MIN_UNAVAILABLE_SEARCHES = 5;
const MIN_DISTINCT_SEARCHERS = 3;
const MIN_PRIOR_ORDERS_FOR_DECLINE = 3;
const CUSTOMER_DECLINE_THRESHOLD_PERCENT = 30;
const MIN_PRODUCT_PERIOD_TRANSACTIONS = 5;
const PRODUCT_TREND_THRESHOLD_PERCENT = 20;

const titles: Record<GrowthOpportunityKind, string> = {
  QUOTE_UNCONVERTED: "عروض أسعار لم تتحول إلى طلب",
  PRODUCT_UNAVAILABLE_DEMAND: "طلب مثبت على منتج غير متاح",
  CUSTOMER_ACTIVITY_DECLINE: "تراجع موثق في نشاط عميل",
  REPEAT_PURCHASE: "عميل لديه نمط شراء متكرر",
  PRODUCT_PERFORMANCE_CHANGE: "تغير موثق في أداء المنتج",
};

function validTime(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function day(value: string): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null;
}

function validPeriod(period: EvidencePeriod | null | undefined): period is EvidencePeriod {
  const from = period ? day(period.from) : null;
  const to = period ? day(period.to) : null;
  return from !== null && to !== null && from <= to;
}

function samePeriod(a: EvidencePeriod | null, b: EvidencePeriod | null): boolean {
  return a !== null && b !== null && a.from === b.from && a.to === b.to;
}

function comparablePeriods(baseline: EvidencePeriod | null, current: EvidencePeriod | null): boolean {
  if (!validPeriod(baseline) || !validPeriod(current)) return false;
  const baselineFrom = day(baseline.from) as number;
  const baselineTo = day(baseline.to) as number;
  const currentFrom = day(current.from) as number;
  const currentTo = day(current.to) as number;
  const baselineDays = (baselineTo - baselineFrom) / DAY_MS + 1;
  const currentDays = (currentTo - currentFrom) / DAY_MS + 1;
  return baselineTo < currentFrom && baselineDays === currentDays;
}

function numeric(value: number | string | null): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
  }
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

function readMetric(
  id: string | undefined,
  index: Map<string, MetricSnapshot[]>,
  asOf: string,
): { read: MetricRead | null; reason: GrowthOpportunityWithheld["reason"] | null } {
  if (!id || !id.trim()) return { read: null, reason: "METRIC_MISSING" };
  const matches = index.get(id) ?? [];
  if (matches.length === 0) return { read: null, reason: "METRIC_MISSING" };
  if (matches.length !== 1) return { read: null, reason: "METRIC_AMBIGUOUS" };
  const metric = matches[0];
  if (metric.status !== "VERIFIED" || metric.completeness !== "COMPLETE" || metric.quality !== "ACCEPTABLE") {
    return { read: null, reason: "METRIC_NOT_VERIFIED" };
  }
  if (metric.asOf !== asOf || !validPeriod(metric.period) || !metric.lineage?.evidenceIds?.length ||
      !metric.lineage.formulaId?.trim() || !metric.lineage.formulaVersion?.trim() ||
      !validTime(metric.lineage.calculatedAt) || Date.parse(metric.lineage.calculatedAt) > Date.parse(asOf)) {
    return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  }
  if ((metric.unit === "CURRENCY" || metric.unit === "CURRENCY_PER_UNIT") && !metric.currency?.trim()) {
    return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  }
  if ((metric.unit === "QUANTITY" || metric.unit === "CURRENCY_PER_UNIT") && !metric.unitOfMeasure?.trim()) {
    return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  }
  const value = numeric(metric.value);
  if (value === null) return { read: null, reason: "METRIC_NOT_VERIFIED" };
  return { read: { metric, value }, reason: null };
}

function countMetric(read: MetricRead): boolean {
  return read.metric.unit === "COUNT" && Number.isSafeInteger(read.value);
}

function sampleFor(
  id: string | undefined,
  reference: MetricRead,
  index: Map<string, MetricSnapshot[]>,
  asOf: string,
): { read: MetricRead | null; reason: GrowthOpportunityWithheld["reason"] | null } {
  const result = readMetric(id, index, asOf);
  if (!result.read) return result;
  if (!countMetric(result.read) || !samePeriod(result.read.metric.period, reference.metric.period)) {
    return { read: null, reason: "METRIC_SCOPE_MISMATCH" };
  }
  return result;
}

function priorityFor(kind: GrowthOpportunityKind, direction: GrowthOpportunityDirection, changePercent: number | null): GrowthOpportunityPriority {
  if (kind === "CUSTOMER_ACTIVITY_DECLINE") return changePercent !== null && Math.abs(changePercent) >= 50 ? "P1" : "P2";
  if (kind === "QUOTE_UNCONVERTED" || kind === "PRODUCT_UNAVAILABLE_DEMAND") return "P2";
  if (kind === "PRODUCT_PERFORMANCE_CHANGE" && direction === "DECLINING") return "P2";
  return "P3";
}

function recommendation(kind: GrowthOpportunityKind, direction: GrowthOpportunityDirection): {
  classification: GrowthOpportunity["classification"];
  what: string;
  soWhat: string;
  whatNext: string;
  owner: string;
  expectedOutcome: string;
} {
  switch (kind) {
    case "QUOTE_UNCONVERTED":
      return {
        classification: "GROWTH",
        what: "مراجعة عروض الأسعار المفتوحة أو غير المحولة",
        soWhat: "هناك عروض موثقة لم تسجل لها عملية طلب؛ لا يعني ذلك أن العميل وافق أو أن القيمة ستتحول إلى مبيعات.",
        whatNext: "افتح عرض السعر وسجل سبب عدم التحويل أو الخطوة التالية، ثم تابع العميل وفق تفضيله.",
        owner: "المبيعات",
        expectedOutcome: "تسجيل نتيجة المتابعة أو سبب عدم التحويل على سجل العرض الأصلي.",
      };
    case "PRODUCT_UNAVAILABLE_DEMAND":
      return {
        classification: "DEMAND",
        what: "التحقق من طلب العملاء على المنتج غير المتاح",
        soWhat: "تكرار البحث دون توفر مثبت قد يكشف فجوة طلب، لكنه لا يثبت كمية مبيعات مفقودة.",
        whatNext: "راجع المنتج والمخزون وموعد التوريد والبدائل المتاحة قبل تقديم وعد للعميل.",
        owner: "المبيعات والمخزون",
        expectedOutcome: "تسجيل قرار التوفر أو البديل على المنتج الأصلي دون إنشاء شراء تلقائي.",
      };
    case "CUSTOMER_ACTIVITY_DECLINE":
      return {
        classification: "RETENTION",
        what: "متابعة تراجع نشاط العميل المثبت",
        soWhat: "التغير مقارنة بفترة سابقة متساوية المدة إشارة متابعة، وليس دليلاً على سبب التراجع أو نية العميل.",
        whatNext: "راجع سجل الطلبات والتواصل، ثم اسأل العميل عن احتياجه دون افتراض سبب شخصي.",
        owner: "المبيعات",
        expectedOutcome: "توثيق نتيجة المتابعة أو تحديث خطة خدمة العميل بموافقته.",
      };
    case "REPEAT_PURCHASE":
      return {
        classification: "GROWTH",
        what: "إعداد متابعة اختيارية لإعادة الطلب",
        soWhat: "سجل الطلبات يثبت تكرار الشراء؛ لا يثبت موعد الطلب القادم أو موافقة العميل.",
        whatNext: "راجع الأصناف والكميات السابقة وجهّز مقترح إعادة طلب للمراجعة قبل إرساله.",
        owner: "المبيعات",
        expectedOutcome: "مقترح إعادة طلب مرتبط بالسجل الأصلي، ولا يُرسل دون موافقة.",
      };
    case "PRODUCT_PERFORMANCE_CHANGE":
      return {
        classification: "TREND",
        what: direction === "INCREASING" || direction === "NEW_ACTIVITY" ? "مراجعة تحسن أداء المنتج" : "مراجعة تراجع أداء المنتج",
        soWhat: "الاتجاه محسوب من فترتين متساويتين ومصدرين مكتملين؛ لا يثبت سبب التغير أو الربحية.",
        whatNext: "قارن الاتجاه بالتوفر والتكلفة والطلبات والمرتجعات قبل تعديل السعر أو الشراء.",
        owner: "إدارة المبيعات والمخزون",
        expectedOutcome: "تسجيل قرار متابعة يستند إلى سجل المنتج دون تغيير تلقائي للسعر أو المخزون.",
      };
  }
}

function periodLengthMetric(metric: MetricRead): boolean {
  return validPeriod(metric.metric.period);
}

/** Builds a deterministic growth radar from tenant-scoped metric snapshots; it never calls a model or writes business state. */
export function buildGrowthOpportunityRadar(input: {
  id: string;
  generatedAt: string;
  asOf: string;
  evidenceRecords: EvidenceRecord[];
  metrics: MetricSnapshot[];
  signals: GrowthOpportunitySignal[];
  /** True only when every source population required for this radar was complete. */
  sourceSnapshotVerified?: boolean;
}): GrowthOpportunityRadarResult {
  if (!input.id.trim() || !validTime(input.generatedAt) || !validTime(input.asOf) ||
      Date.parse(input.generatedAt) < Date.parse(input.asOf)) {
    throw new Error("growth_radar_timestamp_or_id_invalid");
  }
  if (!Array.isArray(input.evidenceRecords) || !Array.isArray(input.metrics) || !Array.isArray(input.signals)) {
    throw new Error("growth_radar_evidence_payload_invalid");
  }
  const passport = buildEvidencePassport({
    id: "growth-radar:" + input.id,
    generatedAt: input.generatedAt,
    asOf: input.asOf,
    evidenceRecords: input.evidenceRecords,
    metrics: input.metrics,
  });
  const metricIndex = new Map<string, MetricSnapshot[]>();
  for (const metric of passport.metrics) {
    const rows = metricIndex.get(metric.id) ?? [];
    rows.push(metric);
    metricIndex.set(metric.id, rows);
  }

  const opportunities: GrowthOpportunity[] = [];
  const withheld: GrowthOpportunityWithheld[] = [];
  const seenSignalIds = new Set<string>();
  const summary: Record<GrowthOpportunityKind, number> = {
    QUOTE_UNCONVERTED: 0,
    PRODUCT_UNAVAILABLE_DEMAND: 0,
    CUSTOMER_ACTIVITY_DECLINE: 0,
    REPEAT_PURCHASE: 0,
    PRODUCT_PERFORMANCE_CHANGE: 0,
  };

  const addWithheld = (signal: GrowthOpportunitySignal, reason: GrowthOpportunityWithheld["reason"]) => {
    withheld.push({ signalId: signal.id || "unknown", kind: signal.kind || "UNKNOWN", reason });
  };

  for (const signal of input.signals) {
    if (!signal || typeof signal.id !== "string" || !signal.id.trim() ||
        typeof signal.subjectRef !== "string" || !signal.subjectRef.trim() || signal.subjectRef.length > 160 ||
        (signal.subjectLabel !== undefined && (typeof signal.subjectLabel !== "string" ||
          !signal.subjectLabel.trim() || signal.subjectLabel.length > 240)) ||
        !["QUOTE_UNCONVERTED", "PRODUCT_UNAVAILABLE_DEMAND", "CUSTOMER_ACTIVITY_DECLINE", "REPEAT_PURCHASE", "PRODUCT_PERFORMANCE_CHANGE"].includes(signal.kind)) {
      addWithheld(signal ?? ({} as GrowthOpportunitySignal), "INVALID_SIGNAL");
      continue;
    }
    if (seenSignalIds.has(signal.id)) {
      addWithheld(signal, "DUPLICATE_SIGNAL");
      continue;
    }
    seenSignalIds.add(signal.id);

    const observedResult = readMetric(signal.observedMetricId, metricIndex, input.asOf);
    if (!observedResult.read) {
      addWithheld(signal, observedResult.reason ?? "METRIC_MISSING");
      continue;
    }
    const observed = observedResult.read;
    const sampleResult = sampleFor(signal.sampleMetricId, observed, metricIndex, input.asOf);
    if (!sampleResult.read) {
      addWithheld(signal, sampleResult.reason ?? "METRIC_MISSING");
      continue;
    }
    const sample = sampleResult.read;
    let baseline: MetricRead | null = null;
    let baselineSample: MetricRead | null = null;
    let direction: GrowthOpportunityDirection = "OBSERVED";
    let changePercent: number | null = null;
    let eligible = false;
    let reason: GrowthOpportunityWithheld["reason"] | null = null;

    if (signal.kind === "QUOTE_UNCONVERTED") {
      if (!countMetric(observed) || observed.metric.unit !== "COUNT" || sample.value < MIN_QUOTE_SAMPLE ||
          observed.value < 1 || observed.value > sample.value) {
        reason = "SAMPLE_INSUFFICIENT";
      } else eligible = true;
    } else if (signal.kind === "PRODUCT_UNAVAILABLE_DEMAND") {
      if (!countMetric(observed) || observed.metric.unit !== "COUNT" ||
          observed.value < MIN_UNAVAILABLE_SEARCHES || sample.value < MIN_DISTINCT_SEARCHERS ||
          sample.value > observed.value) {
        reason = "SAMPLE_INSUFFICIENT";
      } else eligible = true;
    } else if (signal.kind === "CUSTOMER_ACTIVITY_DECLINE") {
      const baselineResult = readMetric(signal.baselineMetricId, metricIndex, input.asOf);
      if (!baselineResult.read) reason = baselineResult.reason ?? "METRIC_MISSING";
      else {
        baseline = baselineResult.read;
        if (!countMetric(observed) || !countMetric(baseline) ||
            !comparablePeriods(baseline.metric.period, observed.metric.period) ||
            baseline.value < MIN_PRIOR_ORDERS_FOR_DECLINE || observed.value >= baseline.value) {
          reason = "INVALID_COMPARISON";
        } else {
          changePercent = ((observed.value - baseline.value) / baseline.value) * 100;
          direction = "DECLINING";
          eligible = Number.isFinite(changePercent) && Math.abs(changePercent) >= CUSTOMER_DECLINE_THRESHOLD_PERCENT;
        }
      }
    } else if (signal.kind === "REPEAT_PURCHASE") {
      if (!countMetric(observed) || sample.value !== observed.value || observed.value < 2) {
        reason = "SAMPLE_INSUFFICIENT";
      } else {
        direction = "REPEAT";
        eligible = true;
      }
    } else if (signal.kind === "PRODUCT_PERFORMANCE_CHANGE") {
      const baselineResult = readMetric(signal.baselineMetricId, metricIndex, input.asOf);
      if (!baselineResult.read) reason = baselineResult.reason ?? "METRIC_MISSING";
      else {
        baseline = baselineResult.read;
        const baselineSampleResult = sampleFor(signal.baselineSampleMetricId, baseline, metricIndex, input.asOf);
        if (!baselineSampleResult.read) reason = baselineSampleResult.reason ?? "METRIC_MISSING";
        else {
          baselineSample = baselineSampleResult.read;
          const supportedPerformanceUnit = observed.metric.unit === "CURRENCY" || observed.metric.unit === "QUANTITY";
          const compatibleUnit = supportedPerformanceUnit && baseline.metric.unit === observed.metric.unit &&
            baseline.metric.key === observed.metric.key &&
            baseline.metric.lineage.formulaId === observed.metric.lineage.formulaId &&
            baseline.metric.lineage.formulaVersion === observed.metric.lineage.formulaVersion &&
            (observed.metric.unit !== "CURRENCY" || baseline.metric.currency === observed.metric.currency) &&
            (observed.metric.unit !== "QUANTITY" || baseline.metric.unitOfMeasure === observed.metric.unitOfMeasure);
          const enoughCurrentSample = observed.value === 0
            ? sample.value === 0
            : sample.value >= MIN_PRODUCT_PERIOD_TRANSACTIONS;
          const enoughBaselineSample = baseline.value === 0
            ? baselineSample.value === 0
            : baselineSample.value >= MIN_PRODUCT_PERIOD_TRANSACTIONS;
          if (!compatibleUnit || !periodLengthMetric(baseline) ||
              !comparablePeriods(baseline.metric.period, observed.metric.period) ||
              !enoughCurrentSample || !enoughBaselineSample) {
            reason = "INVALID_COMPARISON";
          } else if (baseline.value === 0 && observed.value > 0) {
            direction = "NEW_ACTIVITY";
            eligible = true;
          } else if (baseline.value > 0 && observed.value === 0) {
            direction = "DECLINING";
            changePercent = -100;
            eligible = true;
          } else if (baseline.value > 0) {
            changePercent = ((observed.value - baseline.value) / baseline.value) * 100;
            if (Number.isFinite(changePercent) && changePercent >= PRODUCT_TREND_THRESHOLD_PERCENT) {
              direction = "INCREASING";
              eligible = true;
            } else if (Number.isFinite(changePercent) && changePercent <= -PRODUCT_TREND_THRESHOLD_PERCENT) {
              direction = "DECLINING";
              eligible = true;
            }
          }
        }
      }
    }

    if (reason) {
      addWithheld(signal, reason);
      continue;
    }
    if (!eligible) continue;

    if (signal.kind !== "CUSTOMER_ACTIVITY_DECLINE" && signal.kind !== "PRODUCT_PERFORMANCE_CHANGE" &&
        observed.metric.unit !== "COUNT") {
      addWithheld(signal, "METRIC_SCOPE_MISMATCH");
      continue;
    }

    const sourceMetrics = [observed.metric, sample.metric, ...(baseline ? [baseline.metric] : []),
      ...(baselineSample ? [baselineSample.metric] : [])];
    const warnings: string[] = [];
    let sourceAmount: GrowthOpportunity["sourceAmount"] = null;
    if (signal.sourceAmountMetricId) {
      const amountResult = readMetric(signal.sourceAmountMetricId, metricIndex, input.asOf);
      if (amountResult.read && amountResult.read.metric.unit === "CURRENCY" &&
          samePeriod(amountResult.read.metric.period, observed.metric.period)) {
        sourceAmount = { value: amountResult.read.value, currency: amountResult.read.metric.currency as string };
        sourceMetrics.push(amountResult.read.metric);
      } else {
        warnings.push("SOURCE_AMOUNT_WITHHELD_NOT_COMPARABLE");
      }
    }

    const copy = recommendation(signal.kind, direction);
    const evidenceIds = [...new Set(sourceMetrics.flatMap(metric => metric.lineage.evidenceIds))];
    const formulaVersions = [...new Set(sourceMetrics.map(metric => metric.lineage.formulaId + "@" + metric.lineage.formulaVersion))];
    if (signal.kind === "CUSTOMER_ACTIVITY_DECLINE" || signal.kind === "PRODUCT_PERFORMANCE_CHANGE") {
      formulaVersions.push("growth-opportunity-comparison@" + GROWTH_OPPORTUNITY_POLICY_VERSION);
    }
    const baselinePeriod = baseline?.metric.period && validPeriod(baseline.metric.period) ? baseline.metric.period : null;
    const sampleSize = signal.kind === "REPEAT_PURCHASE" ? observed.value : sample.value;
    const baselineSampleSize = baselineSample?.value ?? (signal.kind === "CUSTOMER_ACTIVITY_DECLINE" ? baseline?.value ?? null : null);
    const reasonText = signal.kind === "CUSTOMER_ACTIVITY_DECLINE"
      ? "عدد الطلبات تراجع بنسبة " + Math.abs(changePercent as number).toFixed(1) + "% مقارنة بفترة سابقة متساوية المدة."
      : signal.kind === "PRODUCT_PERFORMANCE_CHANGE"
        ? direction === "NEW_ACTIVITY"
          ? "رُصد نشاط حالي بعد فترة أساس مكتملة لم تسجل قيمة؛ لا تُعرض نسبة نمو غير معرفة."
          : "تغير المؤشر بنسبة " + (changePercent as number).toFixed(1) + "% مقارنة بفترة سابقة متساوية المدة."
        : signal.kind === "QUOTE_UNCONVERTED"
          ? "عروض غير محولة: " + observed.value + " من أصل " + sample.value + " عروض في الفترة."
          : signal.kind === "PRODUCT_UNAVAILABLE_DEMAND"
            ? "عمليات بحث غير متاحة: " + observed.value + " من " + sample.value + " باحثين مميزين على الأقل."
            : "عدد الطلبات المسجلة لهذا المرجع: " + observed.value + ".";

    const priority = priorityFor(signal.kind, direction, changePercent);
    opportunities.push({
      id: "growth:" + signal.id + ":" + input.asOf,
      signalId: signal.id,
      kind: signal.kind,
      subjectRef: signal.subjectRef,
      title: signal.subjectLabel ? titles[signal.kind] + " · " + signal.subjectLabel : titles[signal.kind],
      classification: copy.classification,
      direction,
      priority,
      what: copy.what,
      why: reasonText,
      soWhat: copy.soWhat,
      whatNext: copy.whatNext,
      owner: copy.owner,
      expectedOutcome: copy.expectedOutcome,
      observedValue: observed.value,
      baselineValue: baseline?.value ?? null,
      changePercent,
      unit: observed.metric.unit,
      ...(observed.metric.currency ? { currency: observed.metric.currency } : {}),
      ...(observed.metric.unitOfMeasure ? { unitOfMeasure: observed.metric.unitOfMeasure } : {}),
      sampleSize,
      baselineSampleSize,
      sourceAmount,
      asOf: input.asOf,
      period: observed.metric.period as EvidencePeriod,
      baselinePeriod,
      proof: {
        evidenceIds,
        metricKeys: [...new Set(sourceMetrics.map(metric => metric.key))],
        formulaVersions: [...new Set(formulaVersions)],
      },
      policyVersion: GROWTH_OPPORTUNITY_POLICY_VERSION,
      warnings,
    });
    summary[signal.kind] += 1;
  }

  opportunities.sort((a, b) => {
    const rank: Record<GrowthOpportunityPriority, number> = { P1: 0, P2: 1, P3: 2 };
    return rank[a.priority] - rank[b.priority] || a.kind.localeCompare(b.kind) || a.subjectRef.localeCompare(b.subjectRef);
  });

  // A caller must explicitly certify the complete required source population.
  // An omitted flag is unknown coverage, never an implicit VERIFIED assertion.
  const populationWarning = input.sourceSnapshotVerified === true
    ? null
    : input.sourceSnapshotVerified === false
      ? "SOURCE_POPULATION_INCOMPLETE"
      : "SOURCE_POPULATION_COMPLETENESS_NOT_CONFIRMED";
  let status: EvidenceStatus = input.sourceSnapshotVerified === true ? "VERIFIED" : "NEEDS_REVIEW";
  if (input.signals.length === 0) status = input.sourceSnapshotVerified === true ? "VERIFIED" : "UNAVAILABLE";
  else if (withheld.length > 0) status = opportunities.length > 0 ? "NEEDS_REVIEW" :
    withheld.some(item => item.reason === "METRIC_NOT_VERIFIED" || item.reason === "METRIC_AMBIGUOUS") ? "UNVERIFIED" : "NEEDS_REVIEW";

  return {
    generatedAt: input.generatedAt,
    asOf: input.asOf,
    status,
    evaluatedSignals: input.signals.length,
    opportunities,
    withheld,
    summary,
    warnings: [...new Set([
      ...passport.warnings,
      ...(withheld.length ? ["SOME_SIGNALS_WITHHELD"] : []),
      ...(populationWarning ? [populationWarning] : []),
    ])],
  };
}
