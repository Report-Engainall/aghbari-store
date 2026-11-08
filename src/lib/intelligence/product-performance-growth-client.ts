import { supabase } from "@/lib/supabase";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot } from "./types";
import type { GrowthOpportunitySignal } from "./growth-opportunities";

export interface ProductPerformanceGrowthContext {
  asOf: string;
  period: EvidencePeriod;
  baselinePeriod: EvidencePeriod;
  totalProductUnitCount: number;
  returnedProductUnitCount: number;
  uncomparableUnitCount: number;
  completePopulation: boolean;
  evidenceRecords: EvidenceRecord[];
  metrics: MetricSnapshot[];
  signals: GrowthOpportunitySignal[];
  warnings: string[];
}

export type ProductPerformanceGrowthFetchResult =
  | { ok: true; context: ProductPerformanceGrowthContext }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function object(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Row : null;
}
function day(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const parsed = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value));
}
function period(value: unknown): EvidencePeriod | null {
  const raw = object(value);
  if (!raw || !day(raw.from) || !day(raw.to) || raw.from > raw.to) return null;
  return { from: raw.from, to: raw.to };
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function quantity(value: unknown): number | null {
  const parsed = typeof value === "number" ? value
    : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}
function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function mapFailure(error: unknown): ProductPerformanceGrowthFetchResult {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "42501" || failure?.code === "28000" || failure?.code === "PGRST301") {
    return { ok: false, status: "DENIED", message: "لا تملك صلاحية قراءة مؤشرات أداء المنتجات." };
  }
  if (failure?.code === "PGRST202" || failure?.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(failure?.message ?? "")) {
    return { ok: false, status: "UNAVAILABLE", message: "مصدر أداء المنتجات غير متاح قبل تطبيق ترحيل رادار النمو." };
  }
  return { ok: false, status: "ERROR", message: "تعذر قراءة أداء المنتجات من مصدر المؤسسة المعتمد." };
}

export async function fetchProductPerformanceGrowthContext(
  periodDays: 30 | 60 | 90 | 180 | 365,
  asOf: string,
): Promise<ProductPerformanceGrowthFetchResult> {
  if (![30,60,90,180,365].includes(periodDays) || !timestamp(asOf)) {
    return { ok: false, status: "ERROR", message: "فترة أداء المنتجات أو وقت اللقطة غير صالح." };
  }
  try {
    const { data, error } = await supabase.rpc("fetch_product_performance_growth_aggregate", {
      p_period_days: periodDays,
      p_as_of: asOf,
    });
    if (error) return mapFailure(error);

    const raw = object(data);
    const sourceTables = raw?.sourceTables;
    const currentPeriod = period(raw?.period);
    const baselinePeriod = period(raw?.baselinePeriod);
    if (!raw || !currentPeriod || !baselinePeriod || !timestamp(raw.asOf) || Date.parse(raw.asOf) !== Date.parse(asOf) ||
        currentPeriod.to !== asOf.slice(0,10) || baselinePeriod.to >= currentPeriod.from ||
        !count(raw.totalCount) || !count(raw.returnedCount) || !count(raw.uncomparableUnitCount) ||
        typeof raw.completePopulation !== "boolean" || !Array.isArray(raw.products) ||
        raw.products.length > 2000 || raw.returnedCount !== raw.products.length ||
        raw.totalCount < raw.returnedCount || raw.uncomparableUnitCount > raw.totalCount ||
        !Array.isArray(sourceTables) ||
        sourceTables.length !== 3 ||
        !["orders","order_items","products"].every(table => sourceTables.includes(table)) ||
        raw.returnedCount !== Math.min(raw.totalCount,2000) ||
        !["EMPTY","VERIFIED","PARTIAL"].includes(String(raw.status)) || raw.sideEffects !== "NONE") {
      return { ok: false, status: "ERROR", message: "استجابة أداء المنتجات ناقصة أو لا تطابق عقد المصدر؛ حُجبت الإشارات." };
    }

    const currentDays = (Date.parse(currentPeriod.to+"T00:00:00.000Z") - Date.parse(currentPeriod.from+"T00:00:00.000Z")) / 86400000 + 1;
    const baselineDays = (Date.parse(baselinePeriod.to+"T00:00:00.000Z") - Date.parse(baselinePeriod.from+"T00:00:00.000Z")) / 86400000 + 1;
    const expectedComplete = raw.totalCount <= 2000 && raw.uncomparableUnitCount === 0;
    const expectedStatus = raw.totalCount === 0 ? "EMPTY" : expectedComplete ? "VERIFIED" : "PARTIAL";
    if (currentDays !== periodDays || baselineDays !== periodDays ||
        raw.completePopulation !== expectedComplete || raw.status !== expectedStatus) {
      return { ok: false, status: "ERROR", message: "فترة المقارنة أو تغطية أداء المنتجات لا تطابق تعريف المصدر؛ حُجبت الإشارات." };
    }

    const evidenceRecords: EvidenceRecord[] = [];
    const metrics: MetricSnapshot[] = [];
    const signals: GrowthOpportunitySignal[] = [];
    const seen = new Set<string>();
    let withheldUnitRows = 0;

    for (const item of raw.products) {
      const product = object(item);
      if (!product || typeof product.productRef !== "string" || !UUID.test(product.productRef) ||
          !text(product.productLabel, 140) || !text(product.unitOfMeasure, 80) ||
          typeof product.unitComparable !== "boolean") {
        return { ok: false, status: "ERROR", message: "تحتوي حزمة أداء المنتجات على مرجع أو وحدة قياس غير صالحة." };
      }
      const currentQuantity = quantity(product.currentQuantity);
      const currentOrders = count(product.currentOrderCount) ? product.currentOrderCount : null;
      const baselineQuantity = quantity(product.baselineQuantity);
      const baselineOrders = count(product.baselineOrderCount) ? product.baselineOrderCount : null;
      if (currentQuantity === null || currentOrders === null || baselineQuantity === null || baselineOrders === null ||
          (currentQuantity === 0) !== (currentOrders === 0) ||
          (baselineQuantity === 0) !== (baselineOrders === 0)) {
        return { ok: false, status: "ERROR", message: "كميات المنتجات وأعداد الطلبات لا تتطابق مع بعض؛ حُجبت المقارنة." };
      }

      const productRef = product.productRef.toLowerCase();
      const unit = product.unitOfMeasure.trim();
      const key = productRef + "|" + unit.toLowerCase();
      if (seen.has(key)) {
        return { ok: false, status: "ERROR", message: "يوجد سجل مكرر للمنتج ووحدة القياس؛ حُجبت المقارنة." };
      }
      seen.add(key);

      const evidencePrefix = "product-performance:" + productRef + ":";
      const evidenceSuffix = typeof product.evidenceId === "string" && product.evidenceId.startsWith(evidencePrefix)
        ? product.evidenceId.slice(evidencePrefix.length) : "";
      const evidenceId = /^[0-9a-f]{32}$/.test(evidenceSuffix) ? product.evidenceId as string : "";
      if (!evidenceId || evidenceId.length > 180) {
        return { ok: false, status: "ERROR", message: "مرجع إثبات أداء المنتج غير صالح." };
      }

      const signalId = "product-performance:" + productRef + ":" + encodeURIComponent(unit);
      const subjectLabel = product.productLabel.trim() + " · " + unit;
      signals.push({
        id: signalId,
        kind: "PRODUCT_PERFORMANCE_CHANGE",
        subjectRef: productRef,
        subjectLabel,
        observedMetricId: signalId + ":current-quantity",
        sampleMetricId: signalId + ":current-orders",
        baselineMetricId: signalId + ":baseline-quantity",
        baselineSampleMetricId: signalId + ":baseline-orders",
      });

      if (!product.unitComparable) {
        withheldUnitRows += 1;
        continue;
      }

      const currentEvidenceId = evidenceId + ":current";
      const baselineEvidenceId = evidenceId + ":baseline";
      const makeEvidence = (id: string, evidencePeriod: EvidencePeriod): EvidenceRecord => ({
        id,
        source: { kind: "TABLE", name: "orders.order_items.product_performance", recordId: productRef, version: "v1" },
        sourceTimestamp: asOf,
        asOf,
        period: evidencePeriod,
        status: "VERIFIED",
        completeness: "COMPLETE",
        quality: "ACCEPTABLE",
        warnings: [],
      });
      evidenceRecords.push(makeEvidence(currentEvidenceId,currentPeriod));
      evidenceRecords.push(makeEvidence(baselineEvidenceId,baselinePeriod));

      const formulaId = "nasr1.product-order-quantity";
      const sampleFormulaId = "nasr1.product-order-sample-count";
      const makeMetric = (
        id: string,
        metricKey: string,
        value: number,
        unitType: "QUANTITY" | "COUNT",
        metricPeriod: EvidencePeriod,
        sourceEvidenceId: string,
        lineageFormulaId: string,
        transformation: string,
      ): MetricSnapshot => ({
        id,
        key: metricKey,
        value,
        unit: unitType,
        ...(unitType === "QUANTITY" ? { unitOfMeasure: unit } : {}),
        status: "VERIFIED",
        completeness: "COMPLETE",
        quality: "ACCEPTABLE",
        period: metricPeriod,
        asOf,
        lineage: {
          evidenceIds: [sourceEvidenceId],
          calculatedAt: asOf,
          formulaId: lineageFormulaId,
          formulaVersion: "1",
          transformations: [transformation],
        },
        warnings: [],
      });

      metrics.push(
        makeMetric(signalId+":current-quantity","product.order_items.quantity",currentQuantity,"QUANTITY",currentPeriod,currentEvidenceId,formulaId,
          "sum positive order_items.quantity for same-tenant active products in confirmed/processing/shipped/delivered orders in the inclusive UTC current period"),
        makeMetric(signalId+":baseline-quantity","product.order_items.quantity",baselineQuantity,"QUANTITY",baselinePeriod,baselineEvidenceId,formulaId,
          "sum positive order_items.quantity for same-tenant active products in confirmed/processing/shipped/delivered orders in the equal-length preceding UTC baseline period"),
        makeMetric(signalId+":current-orders","product.orders.sample_count",currentOrders,"COUNT",currentPeriod,currentEvidenceId,sampleFormulaId,
          "count distinct qualifying same-tenant orders containing this product and unit in the current UTC period"),
        makeMetric(signalId+":baseline-orders","product.orders.sample_count",baselineOrders,"COUNT",baselinePeriod,baselineEvidenceId,sampleFormulaId,
          "count distinct qualifying same-tenant orders containing this product and unit in the baseline UTC period"),
      );
    }

    return {
      ok: true,
      context: {
        asOf,
        period: currentPeriod,
        baselinePeriod,
        totalProductUnitCount: raw.totalCount,
        returnedProductUnitCount: raw.returnedCount,
        uncomparableUnitCount: raw.uncomparableUnitCount,
        completePopulation: raw.completePopulation && withheldUnitRows === 0,
        evidenceRecords,
        metrics,
        signals,
        warnings: [
          "PRODUCT_QUANTITY_MEASURES_CONFIRMED_ORDER_LINES_NOT_SHIPPED_OR_RECOGNIZED_SALES",
          "PRODUCT_COHORT_USES_ORDER_CREATED_AT_AND_CURRENT_STATUS_NOT_HISTORICAL_STATUS_AT_PERIOD_END",
          "PRODUCT_SCOPE_INCLUDES_ONLY_PRODUCT_UNIT_GROUPS_WITH_QUALIFYING_ORDER_LINES_IN_EITHER_COMPARISON_PERIOD",
          ...(raw.returnedCount < raw.totalCount ? ["PRODUCT_PERFORMANCE_POPULATION_TRUNCATED"] : []),
          ...(withheldUnitRows > 0 ? ["PRODUCT_UNIT_VARIANTS_WITHHELD"] : []),
        ],
      },
    };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بمصدر أداء المنتجات." };
  }
}
