import { supabase } from "@/lib/supabase";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot } from "./types";
import type { GrowthOpportunitySignal } from "./growth-opportunities";

export interface UnavailableProductSearchDemandContext {
  asOf: string;
  period: EvidencePeriod;
  coverageStartedOn: string | null;
  status: "VERIFIED" | "EMPTY" | "PARTIAL";
  totalProductCount: number;
  returnedProductCount: number;
  completePopulation: boolean;
  evidenceRecords: EvidenceRecord[];
  metrics: MetricSnapshot[];
  signals: GrowthOpportunitySignal[];
  warnings: string[];
}

export type UnavailableProductSearchDemandFetchResult =
  | { ok: true; context: UnavailableProductSearchDemandContext }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PERIODS = new Set([30, 60, 90, 180, 365]);

function object(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}
function day(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const parsed = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function text(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}
function mapFailure(error: unknown): UnavailableProductSearchDemandFetchResult {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "42501" || failure?.code === "28000" || failure?.code === "PGRST301") {
    return { ok: false, status: "DENIED", message: "لا تملك صلاحية قراءة طلب العملاء على الأصناف غير المتاحة." };
  }
  if (failure?.code === "PGRST202" || failure?.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(failure?.message ?? "")) {
    return { ok: false, status: "UNAVAILABLE", message: "مصدر طلب الأصناف غير المتاحة غير مفعّل في قاعدة البيانات الحالية." };
  }
  return { ok: false, status: "ERROR", message: "تعذر قراءة مصدر طلب الأصناف غير المتاحة." };
}

/**
 * Records only product references already shown to the customer by the catalog.
 * PostgreSQL re-matches the same search against the tenant catalog and verifies
 * zero available quantity before writing a pseudonymous per-customer/day fact.
 * Raw query text is used for the match only and is never persisted.
 */
export async function recordStorefrontUnavailableProductSearch(input: {
  search: string;
  categoryId: string | null;
  productIds: string[];
}): Promise<boolean> {
  const search = typeof input.search === "string" ? input.search.trim() : "";
  const productIds = Array.isArray(input.productIds) ? [...new Set(input.productIds)] : [];
  if (search.length < 2 || search.length > 120 || productIds.length < 1 ||
      productIds.length > 24 || productIds.some(id => !UUID.test(id))) return false;

  try {
    const { data, error } = await supabase.rpc("record_storefront_unavailable_product_search", {
      p_search: search,
      p_product_ids: productIds,
      p_category_id: input.categoryId,
    });
    if (error) return false;
    const result = object(data);
    return result?.status === "RECORDED";
  } catch {
    return false;
  }
}

/**
 * Reads manager-only search-demand aggregates. A period before the tenant's
 * actual tracking start is PARTIAL, never an EMPTY/no-demand claim.
 */
export async function fetchUnavailableProductSearchDemand(
  periodDays: 30 | 60 | 90 | 180 | 365,
  asOf: string,
): Promise<UnavailableProductSearchDemandFetchResult> {
  const asOfTime = Date.parse(asOf);
  if (!PERIODS.has(periodDays) || !timestamp(asOf) || !Number.isFinite(asOfTime)) {
    return { ok: false, status: "ERROR", message: "فترة قياس طلب الأصناف أو وقت اللقطة غير صالح." };
  }
  const to = new Date(asOfTime).toISOString().slice(0, 10);
  const fromDate = new Date(to + "T00:00:00.000Z");
  fromDate.setUTCDate(fromDate.getUTCDate() - (periodDays - 1));
  const from = fromDate.toISOString().slice(0, 10);

  try {
    const { data, error } = await supabase.rpc("fetch_unavailable_product_search_demand", {
      p_from: from,
      p_to: to,
      p_as_of: asOf,
    });
    if (error) return mapFailure(error);

    const raw = object(data);
    const rawPeriod = object(raw?.period);
    const coverageStartedOn = raw?.coverageStartedOn === null ? null : raw?.coverageStartedOn;
    const sourceTables = raw?.sourceTables;
    if (!raw || !rawPeriod || !timestamp(raw.asOf) || Date.parse(raw.asOf) !== asOfTime ||
        !day(rawPeriod.from) || !day(rawPeriod.to) ||
        rawPeriod.from !== from || rawPeriod.to !== to ||
        (coverageStartedOn !== null && !day(coverageStartedOn)) ||
        !count(raw.totalCount) || !count(raw.returnedCount) ||
        typeof raw.completePopulation !== "boolean" ||
        !Array.isArray(raw.products) || raw.products.length > 500 ||
        raw.returnedCount !== raw.products.length || raw.totalCount < raw.returnedCount ||
        !Array.isArray(sourceTables) ||
        sourceTables.length !== 2 ||
        !["storefront_unavailable_product_search_observations", "products"].every(
          name => sourceTables.includes(name),
        ) ||
        raw.sideEffects !== "NONE" ||
        !["EMPTY", "VERIFIED", "PARTIAL"].includes(String(raw.status)) ||
        !Array.isArray(raw.warnings) || raw.warnings.some(item => typeof item !== "string")) {
      return { ok: false, status: "ERROR", message: "استجابة طلب الأصناف غير المتاحة ناقصة أو لا تطابق عقد المصدر." };
    }

    const expectedComplete = coverageStartedOn !== null &&
      from >= coverageStartedOn && raw.totalCount <= 500;
    const expectedStatus = expectedComplete
      ? raw.totalCount === 0 ? "EMPTY" : "VERIFIED"
      : "PARTIAL";
    if (raw.completePopulation !== expectedComplete || raw.status !== expectedStatus ||
        raw.returnedCount !== Math.min(raw.totalCount, 500)) {
      return { ok: false, status: "ERROR", message: "تغطية فترة طلب الأصناف أو حالة المجتمع لا تطابق بداية التتبع الفعلية." };
    }

    const evidenceRecords: EvidenceRecord[] = [];
    const metrics: MetricSnapshot[] = [];
    const signals: GrowthOpportunitySignal[] = [];
    const seen = new Set<string>();

    for (const item of raw.products) {
      const row = object(item);
      if (!row || typeof row.productRef !== "string" || !UUID.test(row.productRef) ||
          !(row.productLabel === null || text(row.productLabel, 140)) ||
          !count(row.searchCount) || !count(row.distinctSearchers) ||
          row.searchCount < 1 || row.distinctSearchers < 1 ||
          row.distinctSearchers > row.searchCount ||
          !day(row.firstObservedOn) || !day(row.lastObservedOn) ||
          row.firstObservedOn < from || row.lastObservedOn > to ||
          row.firstObservedOn > row.lastObservedOn ||
          !timestamp(row.sourceTimestamp) || Date.parse(row.sourceTimestamp) > asOfTime) {
        return { ok: false, status: "ERROR", message: "صف طلب صنف غير مكتمل أو يتجاوز فترة القياس؛ حُجبت الإشارات." };
      }
      const productRef = row.productRef.toLowerCase();
      if (seen.has(productRef)) {
        return { ok: false, status: "ERROR", message: "تكرر مرجع صنف في حزمة طلب البحث؛ حُجبت الإشارات." };
      }
      seen.add(productRef);

      const signalId = "unavailable-product-search:" + productRef + ":" + from + ":" + to;
      const evidenceId = "unavailable-product-search-evidence:" + productRef + ":" + from + ":" + to;
      const complete = expectedComplete;
      const evidenceStatus = complete ? "VERIFIED" as const : "NEEDS_REVIEW" as const;
      const completeness = complete ? "COMPLETE" as const : "PARTIAL" as const;
      const quality = complete ? "ACCEPTABLE" as const : "WARNINGS" as const;

      evidenceRecords.push({
        id: evidenceId,
        source: {
          kind: "TABLE",
          name: "storefront_unavailable_product_search_observations",
          recordId: productRef,
          version: "1",
        },
        sourceTimestamp: row.sourceTimestamp,
        asOf,
        period: { from, to },
        status: evidenceStatus,
        completeness,
        quality,
        warnings: complete ? [] : ["SEARCH_DEMAND_WINDOW_OR_POPULATION_PARTIAL"],
      });

      const metricBase = "growth:" + signalId;
      const formulaId = "nasr1.storefront-unavailable-product-search-count";
      const sampleFormulaId = "nasr1.storefront-unavailable-product-searcher-count";
      const makeMetric = (
        id: string,
        key: string,
        value: number,
        metricFormulaId: string,
        transformation: string,
      ): MetricSnapshot => ({
        id,
        key,
        value,
        unit: "COUNT",
        status: evidenceStatus,
        completeness,
        quality,
        period: { from, to },
        asOf,
        lineage: {
          evidenceIds: [evidenceId],
          calculatedAt: asOf,
          formulaId: metricFormulaId,
          formulaVersion: "1",
          transformations: [transformation],
        },
        warnings: complete ? [] : ["SEARCH_DEMAND_WINDOW_OR_POPULATION_PARTIAL"],
      });

      const observedMetricId = metricBase + ":search-count";
      const sampleMetricId = metricBase + ":distinct-searchers";
      metrics.push(
        makeMetric(
          observedMetricId,
          "storefront.unavailable_product_searches",
          row.searchCount,
          formulaId,
          "COUNT unique authenticated customer/product/UTC-day observations with known zero available quantity",
        ),
        makeMetric(
          sampleMetricId,
          "storefront.distinct_unavailable_product_searchers",
          row.distinctSearchers,
          sampleFormulaId,
          "COUNT DISTINCT pseudonymous customer fingerprints for the product and period",
        ),
      );

      signals.push({
        id: signalId,
        kind: "PRODUCT_UNAVAILABLE_DEMAND",
        subjectRef: productRef,
        ...(typeof row.productLabel === "string" ? { subjectLabel: row.productLabel } : {}),
        observedMetricId,
        sampleMetricId,
      });
    }

    return {
      ok: true,
      context: {
        asOf,
        period: { from, to },
        coverageStartedOn: coverageStartedOn as string | null,
        status: raw.status as "VERIFIED" | "EMPTY" | "PARTIAL",
        totalProductCount: raw.totalCount,
        returnedProductCount: raw.returnedCount,
        completePopulation: expectedComplete,
        evidenceRecords,
        metrics,
        signals,
        warnings: raw.warnings as string[],
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: "ERROR",
      message: error instanceof Error ? error.message : "تعذر تركيب أدلة طلب الأصناف غير المتاحة.",
    };
  }
}

export type UnavailableProductDemandFollowUpResult =
  | { ok: true; taskId: string; reused: boolean; searchCount: number; distinctSearchers: number }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR" | "NOT_ELIGIBLE"; message: string };

/**
 * Manager-authorized, explicit action for a verified product demand signal.
 * The server re-derives the sample and enforces one task per product/window.
 */
export async function createUnavailableProductDemandFollowUpTask(input: {
  productId: string;
  period: EvidencePeriod;
  asOf: string;
}): Promise<UnavailableProductDemandFollowUpResult> {
  if (!UUID.test(input.productId) ||
      !day(input.period.from) || !day(input.period.to) ||
      input.period.from > input.period.to ||
      !timestamp(input.asOf) ||
      input.period.to !== new Date(Date.parse(input.asOf)).toISOString().slice(0, 10)) {
    return { ok: false, status: "ERROR", message: "مرجع الصنف أو فترة دليل الطلب غير صالحة." };
  }

  try {
    const { data, error } = await supabase.rpc("create_unavailable_product_demand_follow_up_task", {
      p_product_id: input.productId,
      p_from: input.period.from,
      p_to: input.period.to,
      p_as_of: input.asOf,
    });
    if (error) {
      const failure = error as { code?: string };
      if (failure.code === "42501" || failure.code === "28000" || failure.code === "PGRST301") {
        return { ok: false, status: "DENIED", message: "إنشاء مهمة متابعة طلب الأصناف متاح للمدير أو المسؤول المخوّل فقط." };
      }
      if (failure.code === "PGRST202" || failure.code === "42883") {
        return { ok: false, status: "UNAVAILABLE", message: "مسار إنشاء مهمة مراجعة الطلب غير متاح قبل تطبيق ترحيل الوظيفة." };
      }
      return { ok: false, status: "ERROR", message: "تعذر إنشاء مهمة مراجعة طلب الصنف من مصدره الموثق." };
    }

    const raw = object(data);
    if (!raw || !["CREATED", "REUSED", "NOT_ELIGIBLE"].includes(String(raw.status)) ||
        raw.sideEffects !== (raw.status === "NOT_ELIGIBLE" ? "NONE" : "OPERATIONAL_TASK_ONLY")) {
      return { ok: false, status: "ERROR", message: "استجابة إنشاء مهمة طلب الصنف لا تطابق عقد الخدمة." };
    }
    if (raw.status === "NOT_ELIGIBLE") {
      const reason = raw.reason === "DEMAND_PERIOD_NOT_FULLY_TRACKED"
        ? "الفترة تتجاوز بداية التتبع الفعلية؛ لم تُنشأ مهمة من سجل ناقص."
        : raw.reason === "PRODUCT_NOT_ACTIVE_IN_CURRENT_ORGANIZATION"
          ? "الصنف لم يعد نشطاً داخل المؤسسة الحالية."
          : "العينة الحالية لا تحقق حد خمسة مشاهدات وثلاثة عملاء مميزين.";
      return { ok: false, status: "NOT_ELIGIBLE", message: reason };
    }
    if (typeof raw.taskId !== "string" || !UUID.test(raw.taskId) ||
        !count(raw.searchCount) || raw.searchCount < 5 ||
        !count(raw.distinctSearchers) || raw.distinctSearchers < 3 ||
        raw.distinctSearchers > raw.searchCount) {
      return { ok: false, status: "ERROR", message: "بيانات المهمة أو عينة الطلب غير مكتملة." };
    }
    return {
      ok: true,
      taskId: raw.taskId,
      reused: raw.status === "REUSED",
      searchCount: raw.searchCount,
      distinctSearchers: raw.distinctSearchers,
    };
  } catch {
    return { ok: false, status: "ERROR", message: "تعذر الاتصال بمسار مهمة مراجعة الطلب." };
  }
}

