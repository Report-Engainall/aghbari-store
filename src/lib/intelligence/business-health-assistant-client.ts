import { createCashflowScheduleRequest, fetchCashflowSchedule } from "./cashflow-schedule-client";
import type { CashflowScheduleSnapshot } from "./cashflow-schedule-client";
import { createInventoryIntelligencePeriod, fetchInventoryIntelligence } from "./inventory-intelligence-client";
import { fetchCustomerRetentionAggregate } from "./customer-retention-client";
import { buildBusinessHealthMap, type BusinessHealthMapResult } from "./business-health-map";
import { buildCashflowForecast } from "./cashflow-forecast";
import { buildDeadStockReport } from "./dead-stock";
import { buildLiquiditySnapshot, type LiquidityCurrencyInput } from "./liquidity";
import { buildReplenishmentRecommendations } from "./replenishment";
import type { MetricSnapshot } from "./types";
import { fetchProductRevenueConcentration } from "./product-revenue-concentration-client";
import { fetchSupplierPostedPayableActivity } from "./supplier-posted-payable-activity-client";

export type BusinessHealthAssistantSource =
  | { status: "READY"; asOf: string; period: { from: string; to: string } }
  | { status: "UNAVAILABLE"; message: string };

export interface BusinessHealthAssistantSources {
  inventory: {
    status: "READY";
    asOf: string;
    period: { from: string; to: string };
    totalProducts: number;
    returnedProducts: number;
  };
  cashflow: BusinessHealthAssistantSource & {
    status: "READY";
    period: { from: string; to: string };
    scheduleStatus: string;
    completeness: string;
    warnings: string[];
  } | { status: "UNAVAILABLE"; message: string };
  retention: BusinessHealthAssistantSource & {
    status: "READY";
    period: { from: string; to: string };
    populationComplete: boolean;
    customerCount: number | null;
  } | { status: "UNAVAILABLE"; message: string };
  productRevenueConcentration:
    | { status: "READY"; invoiceCount: number; currencyCount: number; completePopulation: boolean; asOf: string }
    | { status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };
  supplierPostedPayableActivity:
    | { sourceStatus: "READY"; resultStatus: "VERIFIED" | "NEEDS_REVIEW" | "EMPTY"; sourceEntryCount: number; currencyCount: number; completeSourceAggregation: boolean; asOf: string }
    | { sourceStatus: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };
}

export interface BusinessHealthAssistantData {
  state: "READY" | "PARTIAL";
  answer: string;
  map: BusinessHealthMapResult;
  sources: BusinessHealthAssistantSources;
}

export type BusinessHealthAssistantFetchResult =
  | { ok: true; data: BusinessHealthAssistantData }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

function metricSnapshots(data: CashflowScheduleSnapshot): MetricSnapshot[] {
  const scheduled: MetricSnapshot[] = data.schedule.entries.map(entry => ({
    id: entry.amount.id,
    key: entry.amount.key,
    value: entry.amount.value,
    unit: "CURRENCY",
    currency: entry.amount.currency,
    status: entry.amount.status,
    completeness: entry.amount.completeness,
    quality: entry.amount.quality,
    period: null,
    asOf: entry.amount.asOf,
    lineage: {
      evidenceIds: entry.amount.lineage.evidenceIds,
      calculatedAt: entry.amount.asOf,
      formulaId: entry.amount.lineage.formulaId,
      formulaVersion: entry.amount.lineage.formulaVersion,
      transformations: ["server-sourced scheduled movement", entry.direction, "due date " + entry.dueDate],
    },
    warnings: [],
  }));
  const collections: MetricSnapshot[] = data.measurementMetrics.map(proof => ({
    id: "metric:cashflow.expected-collections:" + proof.currency + ":" + proof.period.from + ":" + proof.period.to,
    key: proof.metricKey,
    value: proof.value,
    unit: proof.unit,
    currency: proof.currency,
    status: proof.status,
    completeness: proof.completeness,
    quality: proof.quality,
    period: proof.period,
    asOf: proof.asOf,
    lineage: {
      evidenceIds: proof.evidenceIds,
      calculatedAt: proof.asOf,
      formulaId: proof.formulaId,
      formulaVersion: proof.formulaVersion,
      transformations: ["same-tenant scheduled invoices less recorded payments"],
    },
    warnings: [],
  }));
  return [...scheduled, ...collections];
}

function buildCashflow(data: CashflowScheduleSnapshot) {
  const metrics = metricSnapshots(data);
  const byId = new Map(metrics.map(metric => [metric.id, metric]));
  const forecast = buildCashflowForecast({
    id: "business-health-cashflow:" + data.asOf,
    generatedAt: data.asOf,
    asOf: data.asOf,
    evidenceRecords: data.evidenceRecords,
    openingBalances: [],
    entries: data.schedule.entries.flatMap(entry => {
      const amount = byId.get(entry.amount.id);
      return amount ? [{ id: entry.id, direction: entry.direction, dueDate: entry.dueDate, amount }] : [];
    }),
    scheduleStatus: data.schedule.status,
    scheduleCompleteness: data.schedule.completeness,
    scheduleQuality: data.schedule.quality,
  });
  const currencies: LiquidityCurrencyInput[] = data.measurementMetrics.map(proof => ({
    currency: proof.currency,
    // Bank/cash opening balances and due obligations are deliberately absent, not assumed.
    availableBalance: null,
    expectedCollections: {
      id: "metric:liquidity.expected-collections:" + proof.currency,
      key: proof.metricKey,
      value: proof.value,
      unit: proof.unit,
      currency: proof.currency,
      status: proof.status,
      completeness: proof.completeness,
      quality: proof.quality,
      period: proof.period,
      asOf: proof.asOf,
      lineage: {
        evidenceIds: proof.evidenceIds,
        calculatedAt: proof.asOf,
        formulaId: proof.formulaId,
        formulaVersion: proof.formulaVersion,
        transformations: ["same-tenant scheduled invoices less recorded payments"],
      },
      warnings: [],
    },
    dueObligations: null,
  }));
  const liquidity = buildLiquiditySnapshot({
    id: "business-health-liquidity:" + data.asOf,
    generatedAt: data.asOf,
    asOf: data.asOf,
    period: data.period,
    evidenceRecords: data.evidenceRecords,
    currencies,
  });
  return { forecast, liquidity };
}

function previousEqualUtcPeriod(period: { from: string; to: string }): { from: string; to: string } | null {
  const day = (value: string): number | null => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const millis = Date.parse(value + "T00:00:00.000Z");
    return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value ? millis : null;
  };
  const from = day(period.from);
  const to = day(period.to);
  if (from === null || to === null || from > to) return null;
  const durationDays = Math.round((to - from) / 86_400_000) + 1;
  if (durationDays < 1 || durationDays > 366) return null;
  const previousTo = from - 86_400_000;
  const previousFrom = previousTo - (durationDays - 1) * 86_400_000;
  return {
    from: new Date(previousFrom).toISOString().slice(0, 10),
    to: new Date(previousTo).toISOString().slice(0, 10),
  };
}

export async function fetchBusinessHealthAssistantSummary(now = new Date()): Promise<BusinessHealthAssistantFetchResult> {
  if (!Number.isFinite(now.getTime())) {
    return { ok: false, status: "ERROR", message: "وقت احتساب خريطة صحة الأعمال غير صالح." };
  }
  try {
    const inventoryRequest = createInventoryIntelligencePeriod(now, 92);
    const cashflowRequest = createCashflowScheduleRequest({ horizonDays: 90, now });
    const supplierPriorPeriod = previousEqualUtcPeriod(inventoryRequest.period);
    const [inventory, cashflow, retention, productRevenueConcentration, supplierPostedPayableActivity, supplierPostedPayableActivityPrior] = await Promise.all([
      fetchInventoryIntelligence(inventoryRequest.period, inventoryRequest.asOf),
      fetchCashflowSchedule(cashflowRequest),
      fetchCustomerRetentionAggregate(90, inventoryRequest.asOf),
      fetchProductRevenueConcentration({
        from: inventoryRequest.period.from,
        to: inventoryRequest.period.to,
        asOf: inventoryRequest.asOf,
      }),
      fetchSupplierPostedPayableActivity({
        from: inventoryRequest.period.from,
        to: inventoryRequest.period.to,
        asOf: inventoryRequest.asOf,
      }),
      supplierPriorPeriod
        ? fetchSupplierPostedPayableActivity({
            from: supplierPriorPeriod.from,
            to: supplierPriorPeriod.to,
            asOf: inventoryRequest.asOf,
          })
        : Promise.resolve({
            ok: false as const,
            status: "ERROR" as const,
            message: "تعذر إنشاء فترة سابقة مساوية وآمنة لمقارنة تركّز الموردين.",
          }),
    ]);

    if (inventory.ok === false) {
      if (inventory.status === "DENIED") return { ok: false, status: "DENIED", message: inventory.message };
      return { ok: false, status: inventory.status === "ERROR" ? "ERROR" : "UNAVAILABLE", message: inventory.message };
    }
    if (cashflow.ok === false && cashflow.status === "DENIED" ||
        retention.ok === false && retention.status === "DENIED") {
      return { ok: false, status: "DENIED", message: "لا تملك الصلاحية المطلوبة لقراءة جميع مصادر خريطة صحة الأعمال." };
    }

    const { forecast, liquidity } = cashflow.ok
      ? buildCashflow(cashflow.data)
      : { forecast: null, liquidity: null };
    const deadStock = buildDeadStockReport({
      id: "business-health-dead-stock:" + inventory.data.asOf,
      asOf: inventory.data.asOf,
      period: inventory.data.period,
      evidenceRecords: inventory.data.evidenceRecords,
      products: inventory.data.deadStockProducts,
      rule: {
        id: "dead-stock-days",
        version: "1.0.0",
        activeWithinDays: 30,
        stagnantAfterDays: 90,
        lowTurnoverRatio: 0.1,
        turnoverWindowDays: 92,
      },
    });
    const replenishment = buildReplenishmentRecommendations({
      id: "business-health-replenishment:" + inventory.data.asOf,
      asOf: inventory.data.asOf,
      period: inventory.data.period,
      evidenceRecords: inventory.data.evidenceRecords,
      products: inventory.data.replenishmentProducts,
    });
    const map = buildBusinessHealthMap({
      id: "business-health-assistant:" + inventory.data.asOf,
      generatedAt: inventory.data.asOf,
      asOf: inventory.data.asOf,
      period: inventory.data.period,
      liquidity,
      cashflow: forecast,
      deadStock,
      retention: retention.ok ? retention.data : null,
      productRevenueConcentration: productRevenueConcentration.ok
        ? productRevenueConcentration.snapshot : null,
      productRevenueConcentrationUnavailableReason: productRevenueConcentration.ok
        ? undefined : productRevenueConcentration.message,
      supplierPostedPayableActivity: supplierPostedPayableActivity.ok ? supplierPostedPayableActivity.snapshot : null,
      supplierPostedPayableActivityUnavailableReason: supplierPostedPayableActivity.ok
        ? undefined : supplierPostedPayableActivity.message,
      supplierPostedPayableActivityPriorPeriod: supplierPostedPayableActivityPrior.ok
        ? supplierPostedPayableActivityPrior.snapshot : null,
      supplierPostedPayableActivityPriorPeriodUnavailableReason: supplierPostedPayableActivityPrior.ok
        ? undefined : supplierPostedPayableActivityPrior.message,
      replenishment: {
        id: "business-health-replenishment-source:" + inventory.data.asOf,
        asOf: inventory.data.asOf,
        period: inventory.data.period,
        recommendations: replenishment.recommendations,
      },
    });

    const sources: BusinessHealthAssistantSources = {
      inventory: {
        status: "READY",
        asOf: inventory.data.asOf,
        period: inventory.data.period,
        totalProducts: inventory.data.totalProducts,
        returnedProducts: inventory.data.returnedProducts,
      },
      cashflow: cashflow.ok
        ? {
            status: "READY",
            asOf: cashflow.data.asOf,
            period: cashflow.data.period,
            scheduleStatus: cashflow.data.schedule.status,
            completeness: cashflow.data.completeness,
            warnings: cashflow.data.warnings,
          }
        : { status: "UNAVAILABLE", message: cashflow.message },
      retention: retention.ok
        ? {
            status: "READY",
            asOf: retention.data.asOf,
            period: retention.data.period,
            populationComplete: retention.data.status === "VERIFIED" && retention.data.population.total !== null,
            customerCount: retention.data.population.total,
          }
        : { status: "UNAVAILABLE", message: retention.message },
      productRevenueConcentration: productRevenueConcentration.ok
        ? {
            status: "READY",
            invoiceCount: productRevenueConcentration.snapshot.invoiceCount,
            currencyCount: productRevenueConcentration.snapshot.currencyCount,
            completePopulation: productRevenueConcentration.snapshot.completePopulation,
            asOf: productRevenueConcentration.snapshot.asOf,
          }
        : {
            status: productRevenueConcentration.status,
            message: productRevenueConcentration.message,
          },
      supplierPostedPayableActivity: supplierPostedPayableActivity.ok
        ? {
            sourceStatus: "READY",
            resultStatus: supplierPostedPayableActivity.snapshot.status,
            sourceEntryCount: supplierPostedPayableActivity.snapshot.sourceEntryCount,
            currencyCount: supplierPostedPayableActivity.snapshot.currencyCount,
            completeSourceAggregation: supplierPostedPayableActivity.snapshot.completeSourceAggregation,
            asOf: supplierPostedPayableActivity.snapshot.asOf,
          }
        : { sourceStatus: supplierPostedPayableActivity.status, message: supplierPostedPayableActivity.message },
    };
    const allSourcesReady =
      sources.inventory.status === "READY" &&
      sources.cashflow.status === "READY" &&
      sources.retention.status === "READY" &&
      sources.productRevenueConcentration.status === "READY" &&
      sources.productRevenueConcentration.completePopulation &&
      sources.supplierPostedPayableActivity.sourceStatus === "READY" &&
      sources.supplierPostedPayableActivity.resultStatus === "VERIFIED" &&
      sources.supplierPostedPayableActivity.completeSourceAggregation &&
      map.supplierPostedPayableActivityTrend.status === "VERIFIED";
    const state = allSourcesReady && map.status === "VERIFIED" ? "READY" : "PARTIAL";
    const answer = state === "READY"
      ? "اكتملت قراءة مصادر خريطة صحة الأعمال عند " + map.asOf + "؛ عُرضت المؤشرات المثبتة فقط، مع إبقاء العملات منفصلة ومنع جمع المكونات المتداخلة."
      : "أُنشئت خريطة صحة الأعمال عند " + map.asOf + " من المصادر المتاحة. بعض المكونات أو الفترات أو الأدلة غير مكتملة؛ راجع حالات المصدر والمؤشرات المحجوبة قبل اتخاذ قرار.";
    return { ok: true, data: { state, answer, map, sources } };
  } catch {
    return { ok: false, status: "ERROR", message: "تعذر تجميع خريطة صحة الأعمال من مصادر التطبيق المعتمدة؛ لم تُستخدم بيانات بديلة." };
  }
}
