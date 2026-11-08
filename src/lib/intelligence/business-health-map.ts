import type { CashflowForecast, CashflowForecastPoint } from "./cashflow-forecast";
import type { CustomerRetentionReport } from "./customer-retention";
import type { DeadStockClass, DeadStockReport } from "./dead-stock";
import type { EvidencePeriod, EvidenceStatus } from "./types";
import type { LiquidityPosition, LiquiditySnapshot } from "./liquidity";
import type { ReplenishmentRecommendation } from "./replenishment";
import type { ProductRevenueConcentrationSnapshot } from "./product-revenue-concentration-client";
import type { SupplierPostedPayableActivitySnapshot } from "./supplier-posted-payable-activity-client";
import { buildSupplierPayableConcentrationTrend, type SupplierPayableConcentrationTrend } from "./supplier-payable-concentration-trend";

export const BUSINESS_HEALTH_MAP_POLICY_VERSION = "1.0.0";

export interface BusinessHealthReplenishmentSource {
  id: string;
  asOf: string;
  period: EvidencePeriod;
  recommendations: ReplenishmentRecommendation[];
}
export interface BusinessHealthMapInput {
  id: string;
  generatedAt: string;
  asOf: string;
  period: EvidencePeriod;
  liquidity?: LiquiditySnapshot | null;
  cashflow?: CashflowForecast | null;
  deadStock?: DeadStockReport | null;
  replenishment?: BusinessHealthReplenishmentSource | null;
  retention?: CustomerRetentionReport | null;
  productRevenueConcentration?: ProductRevenueConcentrationSnapshot | null;
  productRevenueConcentrationUnavailableReason?: string;
  supplierPostedPayableActivity?: SupplierPostedPayableActivitySnapshot | null;
  supplierPostedPayableActivityUnavailableReason?: string;
  supplierPostedPayableActivityPriorPeriod?: SupplierPostedPayableActivitySnapshot | null;
  supplierPostedPayableActivityPriorPeriodUnavailableReason?: string;
}
export interface BusinessHealthAmount {
  value: number | null;
  currency: string;
  status: EvidenceStatus;
  source: "LIQUIDITY" | "DEAD_STOCK";
  formulaId: string | null;
  formulaVersion: string | null;
  evidenceIds: string[];
  note: string;
  sourceAsOf: string | null;
  sourcePeriod: EvidencePeriod | null;
}
export interface BusinessHealthCurrencyPosition {
  currency: string;
  status: EvidenceStatus;
  netAvailableLiquidity: BusinessHealthAmount;
  expectedCollections: BusinessHealthAmount;
  overdueReceivables: BusinessHealthAmount;
  dueObligations: BusinessHealthAmount;
  stagnantStockExposure: BusinessHealthAmount;
  warnings: string[];
}
export interface BusinessHealthStockSummary {
  status: EvidenceStatus;
  sourceAsOf: string | null;
  sourcePeriod: EvidencePeriod | null;
  totalProducts: number | null;
  classes: Array<{ classification: DeadStockClass; count: number | null; status: EvidenceStatus }>;
  totalsByCurrency: Array<{
    currency: string; exposure: number | null; status: EvidenceStatus;
    verifiedItems: number; withheldItems: number; formulaId: string;
    formulaVersion: string; evidenceIds: string[];
  }>;
  warnings: string[];
}
export interface BusinessHealthReplenishmentSummary {
  status: EvidenceStatus;
  sourceAsOf: string | null;
  sourcePeriod: EvidencePeriod | null;
  recommendedCount: number | null;
  noActionCount: number | null;
  withheldCount: number | null;
  recommendations: Array<{
    productRef: string; quantity: number; quantityUnit: string;
    evidenceIds: string[]; warnings: string[];
  }>;
  warnings: string[];
}
export interface BusinessHealthAttention {
  id: string;
  kind: "NEGATIVE_NET_LIQUIDITY" | "OVERDUE_RECEIVABLES" | "STAGNANT_STOCK" | "REPLENISHMENT" | "SCHEDULED_OUTFLOW";
  severity: "HIGH" | "MEDIUM" | "LOW";
  currency: string | null;
  message: string;
  value: number | null;
  unit: string | null;
  source: string;
  evidenceIds: string[];
}
export interface BusinessHealthCalculability {
  status: "NOT_CALCULABLE" | "VERIFIED" | "PARTIAL" | "NEEDS_REVIEW" | "EMPTY";
  missingInputs: string[];
  reason: string;
}
export interface BusinessHealthMapResult {
  id: string;
  generatedAt: string;
  asOf: string;
  period: EvidencePeriod;
  policyVersion: string;
  status: EvidenceStatus;
  currencies: BusinessHealthCurrencyPosition[];
  cashflow: CashflowForecastPoint[];
  stock: BusinessHealthStockSummary;
  replenishment: BusinessHealthReplenishmentSummary;
  customerFocus: Array<{
    currency: string; top5SalesConcentration: number | null; customerCount: number | null;
    status: EvidenceStatus; sourcePeriod: EvidencePeriod;
  }>;
  productRevenueConcentration: ProductRevenueConcentrationSnapshot | null;
  supplierPostedPayableActivity: SupplierPostedPayableActivitySnapshot | null;
  supplierPostedPayableActivityTrend: SupplierPayableConcentrationTrend;
  calculations: {
    cashConversionCycle: BusinessHealthCalculability;
    daysSalesOutstanding: BusinessHealthCalculability;
    daysPayableOutstanding: BusinessHealthCalculability;
    productRevenueConcentration: BusinessHealthCalculability;
    supplierPostedPayableActivityConcentration: BusinessHealthCalculability;
    supplierRevenueConcentration: BusinessHealthCalculability;
  };
  /** Withheld until mutually exclusive source populations are proven. */
  totalCapitalAtRisk: null;
  totalCapitalAtRiskReason: string;
  attention: BusinessHealthAttention[];
  warnings: string[];
}
const STOCK_CLASSES: DeadStockClass[] = ["ACTIVE", "SLOW_MOVING", "STAGNANT", "ZERO_MOVEMENT", "UNKNOWN"];
const HORIZONS = [7, 30, 90] as const;

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
function samePeriod(a: EvidencePeriod | null | undefined, b: EvidencePeriod): boolean {
  return validPeriod(a) && a.from === b.from && a.to === b.to;
}
function finite(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : null;
}
function unique(values: string[]): string[] {
  return [...new Set(values.filter(value => typeof value === "string" && value.trim().length > 0))];
}
function rollup(statuses: EvidenceStatus[]): EvidenceStatus {
  if (!statuses.length || statuses.every(status => status === "UNAVAILABLE")) return "UNAVAILABLE";
  if (statuses.includes("UNVERIFIED")) return "UNVERIFIED";
  if (statuses.includes("NEEDS_REVIEW")) return "NEEDS_REVIEW";
  if (statuses.includes("UNAVAILABLE")) return "NEEDS_REVIEW";
  return "VERIFIED";
}
function amount(
  value: number | null,
  currency: string,
  status: EvidenceStatus,
  source: BusinessHealthAmount["source"],
  formulaId: string | null,
  formulaVersion: string | null,
  evidenceIds: string[],
  note: string,
  sourceAsOf: string | null = null,
  sourcePeriod: EvidencePeriod | null = null,
): BusinessHealthAmount {
  const actual = status === "VERIFIED" ? finite(value) : null;
  return { value: actual, currency, status: actual === null && status === "VERIFIED" ? "NEEDS_REVIEW" : status,
    source, formulaId, formulaVersion, evidenceIds: actual === null ? [] : unique(evidenceIds), note, sourceAsOf, sourcePeriod };
}
function unavailable(currency: string, note: string, status: EvidenceStatus = "UNAVAILABLE"): BusinessHealthAmount {
  return amount(null, currency, status, "LIQUIDITY", null, null, [], note);
}
function liquidityMetric(position: LiquidityPosition | undefined, key: "net" | "collections" | "overdue" | "obligations" | "stock", currency: string): BusinessHealthAmount {
  if (!position) return unavailable(currency, "مصدر السيولة غير متاح");
  switch (key) {
    case "net":
      return amount(position.netAvailableLiquidity, currency, position.status, "LIQUIDITY",
        position.formulaId, position.formulaVersion, position.lineage.evidenceIds,
        "صافي السيولة = الرصيد المتاح + التحصيلات المتوقعة − الالتزامات المستحقة", position.asOf, position.period);
    case "collections":
      return amount(position.expectedCollections, currency, position.expectedCollectionsStatus, "LIQUIDITY",
        position.formulaId, position.formulaVersion, position.lineage.evidenceIds,
        "التحصيلات داخلة بالفعل في صافي السيولة؛ هذا عرض تفسيري فقط ولا يُجمع مرة أخرى", position.asOf, position.period);
    case "overdue":
      return amount(position.overdueReceivables, currency, position.overdueReceivablesStatus, "LIQUIDITY",
        position.formulaId, position.formulaVersion, position.lineage.evidenceIds,
        "الذمم المتأخرة منفصلة ولا تضاف إلى صافي السيولة أو التحصيلات مرة أخرى", position.asOf, position.period);
    case "obligations":
      return amount(position.dueObligations, currency, position.dueObligationsStatus, "LIQUIDITY",
        position.formulaId, position.formulaVersion, position.lineage.evidenceIds,
        "الالتزامات المستحقة مخصومة بالفعل من صافي السيولة", position.asOf, position.period);
    case "stock":
      return amount(position.stagnantStockExposure, currency, position.stagnantStockExposureStatus, "LIQUIDITY",
        "dead-stock.exposure", "1.0.0", position.lineage.evidenceIds,
        "تعرض المخزون الراكد رأس مال غير نقدي، ولا يخصم من السيولة", position.asOf, position.period);
  }
}
function deadStockAmount(report: DeadStockReport | null | undefined, currency: string, asOf: string): BusinessHealthAmount {
  if (!report) return unavailable(currency, "تقرير المخزون غير متاح");
  if (report.asOf !== asOf || !validPeriod(report.period)) return unavailable(currency, "تاريخ أو فترة تقرير المخزون غير صالحة", "NEEDS_REVIEW");
  const totals = report.totalsByCurrency.filter(row => row.currency === currency);
  if (totals.length !== 1) return unavailable(currency, totals.length ? "ملخص العملة مكرر" : "لا توجد قيمة تعرض لهذه العملة", totals.length ? "UNVERIFIED" : "UNAVAILABLE");
  const total = totals[0];
  const rows = report.items.filter(row => row.currency === currency && row.exposureStatus === "VERIFIED" && row.financialExposure !== null);
  const versions = unique(rows.map(row => row.formulaId + "@" + row.formulaVersion));
  const evidenceIds = unique(rows.flatMap(row => row.evidenceIds));
  const valid = total.exposure !== null && total.verifiedItems > 0 && total.withheldItems === 0 &&
    rows.length === total.verifiedItems && versions.length === 1 && evidenceIds.length > 0;
  return amount(valid ? total.exposure : null, currency, valid ? "VERIFIED" : "NEEDS_REVIEW",
    "DEAD_STOCK", versions.length === 1 ? rows[0].formulaId : null,
    versions.length === 1 ? rows[0].formulaVersion : null, evidenceIds,
    valid ? "التعرض محسوب من الكميات المتاحة وتكلفة الوحدة المثبتة" : "التعرض محجوب لعدم اكتمال أو اتساق تكلفة المخزون",
    report.asOf, report.period);
}
function mergeStockExposure(a: BusinessHealthAmount, b: BusinessHealthAmount): BusinessHealthAmount {
  if (a.status === "VERIFIED" && b.status === "VERIFIED" && a.value !== null && b.value !== null) {
    const evidenceOverlap = a.evidenceIds.some(id => b.evidenceIds.includes(id));
    const sameSourceScope = a.sourceAsOf === b.sourceAsOf && validPeriod(b.sourcePeriod) &&
      samePeriod(a.sourcePeriod, b.sourcePeriod);
    if (Math.abs(a.value - b.value) <= 0.005 && evidenceOverlap && sameSourceScope) {
      return { ...b, evidenceIds: unique([...a.evidenceIds, ...b.evidenceIds]),
        note: "قياسان متطابقان ولهما دليل مشترك؛ تم احتسابهما مرة واحدة" };
    }
    return unavailable(a.currency, "تعارض أو تداخل غير مثبت بين مصدري تكلفة المخزون؛ تم حجب القيمة", "NEEDS_REVIEW");
  }
  if (a.status === "VERIFIED" && a.value !== null && b.status === "UNAVAILABLE") return { ...a, note: "قيمة مثبتة من محرك السيولة؛ تقرير المخزون التفصيلي غير متاح" };
  if (b.status === "VERIFIED" && b.value !== null && a.status === "UNAVAILABLE") return { ...b, note: "قيمة مثبتة من تقرير المخزون؛ لا يوجد قياس مقابل في السيولة" };
  if (a.status === "VERIFIED" && a.value !== null && b.status !== "VERIFIED") return { ...a, note: "قيمة مثبتة؛ مصدر المقارنة الآخر يحتاج مراجعة" };
  if (b.status === "VERIFIED" && b.value !== null && a.status !== "VERIFIED") return { ...b, note: "قيمة مثبتة؛ مصدر المقارنة الآخر يحتاج مراجعة" };
  return unavailable(a.currency, "لا يوجد تعرض مخزون مثبت من المصادر المتاحة", rollup([a.status, b.status]));
}
function buildStock(report: DeadStockReport | null | undefined, asOf: string): BusinessHealthStockSummary {
  const empty = STOCK_CLASSES.map(classification => ({ classification, count: null, status: "UNAVAILABLE" as EvidenceStatus }));
  if (!report) return { status: "UNAVAILABLE", sourceAsOf: null, sourcePeriod: null, totalProducts: null, classes: empty, totalsByCurrency: [], warnings: ["DEAD_STOCK_SOURCE_NOT_SUPPLIED"] };
  if (report.asOf !== asOf || !validPeriod(report.period)) return {
    status: "NEEDS_REVIEW", sourceAsOf: report.asOf, sourcePeriod: report.period,
    totalProducts: null, classes: empty, totalsByCurrency: [], warnings: ["DEAD_STOCK_AS_OF_OR_PERIOD_MISMATCH"],
  };
  const refs = report.items.map(row => row.productRef);
  if (refs.some((ref, index) => !ref.trim() || refs.indexOf(ref) !== index)) return {
    status: "UNVERIFIED", sourceAsOf: report.asOf, sourcePeriod: report.period,
    totalProducts: null, classes: empty, totalsByCurrency: [], warnings: ["DUPLICATE_PRODUCT_REFERENCE_IN_DEAD_STOCK"],
  };
  const movementComplete = report.status === "VERIFIED" && report.items.every(row => row.movementStatus === "VERIFIED");
  const classes = STOCK_CLASSES.map(classification => ({
    classification, count: movementComplete ? report.items.filter(row => row.classification === classification).length : null,
    status: movementComplete ? "VERIFIED" as const : report.status === "UNVERIFIED" ? "UNVERIFIED" as const : "NEEDS_REVIEW" as const,
  }));
  const totalsByCurrency = report.totalsByCurrency.map(total => {
    const rows = report.items.filter(row => row.currency === total.currency && row.exposureStatus === "VERIFIED" && row.financialExposure !== null);
    const versions = unique(rows.map(row => row.formulaId + "@" + row.formulaVersion));
    const ids = unique(rows.flatMap(row => row.evidenceIds));
    const valid = total.exposure !== null && total.verifiedItems > 0 && total.withheldItems === 0 &&
      rows.length === total.verifiedItems && versions.length === 1 && ids.length > 0;
    return {
      currency: total.currency, exposure: valid ? total.exposure : null, status: valid ? "VERIFIED" as const : "NEEDS_REVIEW" as const,
      verifiedItems: total.verifiedItems, withheldItems: total.withheldItems,
      formulaId: valid ? rows[0].formulaId : "dead-stock.exposure",
      formulaVersion: valid ? rows[0].formulaVersion : report.ruleVersion,
      evidenceIds: valid ? ids : [],
    };
  });
  return {
    status: report.status, sourceAsOf: report.asOf, sourcePeriod: report.period,
    totalProducts: movementComplete ? report.items.length : null, classes, totalsByCurrency,
    warnings: [...report.warnings, ...(movementComplete ? [] : ["DEAD_STOCK_MOVEMENT_COVERAGE_INCOMPLETE"])],
  };
}
function buildCashflow(forecast: CashflowForecast | null | undefined, asOf: string): { points: CashflowForecastPoint[]; status: EvidenceStatus; warnings: string[] } {
  if (!forecast) return { points: [], status: "UNAVAILABLE", warnings: ["CASHFLOW_SOURCE_NOT_SUPPLIED"] };
  if (forecast.asOf !== asOf) return { points: [], status: "NEEDS_REVIEW", warnings: ["CASHFLOW_AS_OF_MISMATCH"] };
  const seen = new Set<string>();
  const points: CashflowForecastPoint[] = [];
  const warnings: string[] = [];
  for (const point of forecast.points) {
    const key = point.currency + ":" + point.horizonDays;
    if (seen.has(key) || !/^[A-Z]{3}$/.test(point.currency) || !HORIZONS.includes(point.horizonDays)) {
      warnings.push("CASHFLOW_POINT_DUPLICATE_OR_INVALID:" + key);
      continue;
    }
    seen.add(key);
    const verified = point.status === "VERIFIED" && point.scheduleComplete && point.asOf === asOf &&
      point.evidenceIds.length > 0 && finite(point.projectedBalance) !== null;
    points.push({
      ...point,
      openingBalance: verified ? finite(point.openingBalance) : null,
      knownInflows: verified ? finite(point.knownInflows) : null,
      knownOutflows: verified ? finite(point.knownOutflows) : null,
      projectedBalance: verified ? finite(point.projectedBalance) : null,
      status: verified ? "VERIFIED" : point.status === "UNVERIFIED" ? "UNVERIFIED" : point.status === "UNAVAILABLE" ? "UNAVAILABLE" : "NEEDS_REVIEW",
      scheduleComplete: verified,
      evidenceIds: verified ? unique(point.evidenceIds) : [],
      formulaVersions: verified ? unique(point.formulaVersions) : [],
      warnings: [...point.warnings, ...(verified ? [] : ["CASHFLOW_POINT_NOT_COMPLETE_OR_VERIFIED"])],
    });
  }
  return { points, status: rollup(points.map(point => point.status)), warnings: unique([...forecast.warnings, ...warnings]) };
}
function buildReplenishment(source: BusinessHealthReplenishmentSource | null | undefined, asOf: string): BusinessHealthReplenishmentSummary {
  if (!source) return { status: "UNAVAILABLE", sourceAsOf: null, sourcePeriod: null, recommendedCount: null, noActionCount: null, withheldCount: null, recommendations: [], warnings: ["REPLENISHMENT_SOURCE_NOT_SUPPLIED"] };
  if (source.asOf !== asOf || !validPeriod(source.period)) return {
    status: "NEEDS_REVIEW", sourceAsOf: source.asOf, sourcePeriod: source.period,
    recommendedCount: null, noActionCount: null, withheldCount: null, recommendations: [], warnings: ["REPLENISHMENT_AS_OF_OR_PERIOD_MISMATCH"],
  };
  const refs = source.recommendations.map(row => row.productRef);
  if (refs.some((ref, index) => !ref.trim() || refs.indexOf(ref) !== index)) return {
    status: "UNVERIFIED", sourceAsOf: source.asOf, sourcePeriod: source.period,
    recommendedCount: null, noActionCount: null, withheldCount: null, recommendations: [], warnings: ["DUPLICATE_OR_EMPTY_REPLENISHMENT_PRODUCT_REFERENCE"],
  };
  const recommendations = source.recommendations.filter(row =>
    row.status === "VERIFIED" && row.action === "RECOMMEND" && finite(row.recommendedQuantity) !== null &&
    (row.recommendedQuantity as number) > 0 && Boolean(row.quantityUnit?.trim()) && row.automaticPurchase === false && row.evidenceIds.length > 0
  ).map(row => ({
    productRef: row.productRef, quantity: row.recommendedQuantity as number, quantityUnit: row.quantityUnit as string,
    evidenceIds: unique(row.evidenceIds), warnings: row.warnings,
  }));
  const invalidRows = source.recommendations.some(row =>
    row.status !== "VERIFIED" || (row.action === "RECOMMEND" &&
      (row.recommendedQuantity === null || !row.quantityUnit?.trim() || row.automaticPurchase !== false || !row.evidenceIds.length))
  );
  const complete = !invalidRows;
  return {
    status: complete ? "VERIFIED" : "NEEDS_REVIEW",
    sourceAsOf: source.asOf, sourcePeriod: source.period,
    recommendedCount: complete ? recommendations.length : null,
    noActionCount: complete ? source.recommendations.filter(row => row.action === "NO_ACTION").length : null,
    withheldCount: source.recommendations.length - recommendations.length,
    recommendations, warnings: complete ? [] : ["SOME_REPLENISHMENT_RECOMMENDATIONS_WITHHELD"],
  };
}
function buildCustomerFocus(report: CustomerRetentionReport | null | undefined, asOf: string) {
  if (!report) return { rows: [] as BusinessHealthMapResult["customerFocus"], status: "UNAVAILABLE" as EvidenceStatus, warnings: ["CUSTOMER_RETENTION_SOURCE_NOT_SUPPLIED"] };
  if (report.asOf !== asOf || !validPeriod(report.period)) return {
    rows: [] as BusinessHealthMapResult["customerFocus"], status: "NEEDS_REVIEW" as EvidenceStatus, warnings: ["CUSTOMER_RETENTION_AS_OF_OR_PERIOD_MISMATCH"],
  };
  const rows = report.focusByCurrency.map(item => {
    const valid = report.status === "VERIFIED" && item.status === "VERIFIED" &&
      item.totalSales !== null && finite(item.top5SalesConcentration) !== null;
    return {
      currency: item.currency, top5SalesConcentration: valid ? item.top5SalesConcentration : null,
      customerCount: valid ? item.customerCount : null, status: valid ? "VERIFIED" as const : "NEEDS_REVIEW" as const,
      sourcePeriod: report.period,
    };
  });
  return { rows, status: report.status, warnings: report.warnings };
}
function notCalculable(missingInputs: string[], reason: string): BusinessHealthCalculability {
  return { status: "NOT_CALCULABLE", missingInputs, reason };
}
function buildAttention(currencies: BusinessHealthCurrencyPosition[], cashflow: CashflowForecastPoint[], replenishment: BusinessHealthReplenishmentSummary): BusinessHealthAttention[] {
  const rows: BusinessHealthAttention[] = [];
  for (const item of currencies) {
    if (item.netAvailableLiquidity.status === "VERIFIED" && item.netAvailableLiquidity.value !== null && item.netAvailableLiquidity.value < 0) rows.push({
      id: "negative-liquidity:" + item.currency, kind: "NEGATIVE_NET_LIQUIDITY", severity: "HIGH", currency: item.currency,
      message: "صافي السيولة المثبت سالب؛ راجع الرصيد والتحصيلات والالتزامات", value: item.netAvailableLiquidity.value,
      unit: item.currency, source: item.netAvailableLiquidity.formulaId ?? "liquidity.net-available", evidenceIds: item.netAvailableLiquidity.evidenceIds,
    });
    if (item.overdueReceivables.status === "VERIFIED" && item.overdueReceivables.value !== null && item.overdueReceivables.value > 0) rows.push({
      id: "overdue:" + item.currency, kind: "OVERDUE_RECEIVABLES", severity: "MEDIUM", currency: item.currency,
      message: "توجد ذمم متأخرة مثبتة تحتاج مراجعة التحصيل", value: item.overdueReceivables.value,
      unit: item.currency, source: item.overdueReceivables.formulaId ?? "liquidity.overdue-receivables", evidenceIds: item.overdueReceivables.evidenceIds,
    });
    if (item.stagnantStockExposure.status === "VERIFIED" && item.stagnantStockExposure.value !== null && item.stagnantStockExposure.value > 0) rows.push({
      id: "dead-stock:" + item.currency, kind: "STAGNANT_STOCK", severity: "MEDIUM", currency: item.currency,
      message: "يوجد تعرض مخزون راكد مثبت؛ راجع التوريد والتسعير والمرتجعات المسموح بها", value: item.stagnantStockExposure.value,
      unit: item.currency, source: item.stagnantStockExposure.formulaId ?? "dead-stock.exposure", evidenceIds: item.stagnantStockExposure.evidenceIds,
    });
  }
  if (replenishment.status === "VERIFIED" && (replenishment.recommendedCount ?? 0) > 0) rows.push({
    id: "replenishment:" + replenishment.recommendedCount, kind: "REPLENISHMENT", severity: "LOW", currency: null,
    message: "توجد توصيات إعادة توريد مثبتة؛ راجع الكميات والوارد قبل إنشاء مسودة شراء", value: replenishment.recommendedCount,
    unit: "صنف", source: "inventory.replenishment-target", evidenceIds: unique(replenishment.recommendations.flatMap(row => row.evidenceIds)),
  });
  for (const point of cashflow) {
    if (point.horizonDays === 7 && point.status === "VERIFIED" && point.knownOutflows !== null && point.knownOutflows > 0) rows.push({
      id: "scheduled-outflow:" + point.currency + ":7", kind: "SCHEDULED_OUTFLOW", severity: "MEDIUM", currency: point.currency,
      message: "توجد التزامات نقدية مجدولة خلال 7 أيام", value: point.knownOutflows,
      unit: point.currency, source: point.formulaId, evidenceIds: point.evidenceIds,
    });
  }
  return rows;
}

/** Composes verified engine outputs without double-counting overlapping capital categories. */
export function buildBusinessHealthMap(input: BusinessHealthMapInput): BusinessHealthMapResult {
  if (!input.id.trim() || !validTime(input.generatedAt) || !validTime(input.asOf) ||
      Date.parse(input.generatedAt) < Date.parse(input.asOf) || !validPeriod(input.period)) throw new Error("business_health_map_input_invalid");
  const warnings: string[] = [];
  const liquidityValid = input.liquidity?.asOf === input.asOf && validPeriod(input.liquidity.period);
  const liquidity = liquidityValid ? input.liquidity : null;
  if (input.liquidity && !liquidityValid) warnings.push("LIQUIDITY_AS_OF_OR_PERIOD_MISMATCH");
  const rawPositions = liquidity?.positions ?? [];
  const duplicateCurrencies = rawPositions.map(row => row.currency).filter((currency, index, all) => all.indexOf(currency) !== index);
  const currencyCodes = unique([...rawPositions.map(row => row.currency), ...(input.deadStock?.totalsByCurrency.map(row => row.currency) ?? [])]).sort();
  const currencies = currencyCodes.map(currency => {
    const matches = rawPositions.filter(row => row.currency === currency);
    const ambiguous = matches.length > 1 || duplicateCurrencies.includes(currency);
    const position = matches.length === 1 ? matches[0] : undefined;
    const net = ambiguous ? unavailable(currency, "تكرار موضع العملة", "UNVERIFIED") : liquidityMetric(position, "net", currency);
    const collections = ambiguous ? unavailable(currency, "تكرار موضع العملة", "UNVERIFIED") : liquidityMetric(position, "collections", currency);
    const overdue = ambiguous ? unavailable(currency, "تكرار موضع العملة", "UNVERIFIED") : liquidityMetric(position, "overdue", currency);
    const obligations = ambiguous ? unavailable(currency, "تكرار موضع العملة", "UNVERIFIED") : liquidityMetric(position, "obligations", currency);
    const stockLiquidity = ambiguous ? unavailable(currency, "تكرار موضع العملة", "UNVERIFIED") : liquidityMetric(position, "stock", currency);
    const stockDetail = deadStockAmount(input.deadStock, currency, input.asOf);
    const stock = mergeStockExposure(stockLiquidity, stockDetail);
    return {
      currency,
      status: rollup([net.status, collections.status, overdue.status, obligations.status, stock.status]),
      netAvailableLiquidity: net, expectedCollections: collections, overdueReceivables: overdue,
      dueObligations: obligations, stagnantStockExposure: stock,
      warnings: unique([...(position?.warnings ?? []), ...(ambiguous ? ["DUPLICATE_LIQUIDITY_CURRENCY"] : []),
        ...(stock.note.includes("تعارض") ? ["STOCK_EXPOSURE_SOURCE_CONFLICT"] : [])]),
    };
  });
  const cashflow: CashflowForecastPoint[] = [];
  const cashflowWarnings: string[] = [];
  const seenCashflowPoints = new Set<string>();
  if (input.cashflow && input.cashflow.asOf === input.asOf) {
    for (const point of input.cashflow.points) {
      const key = point.currency + ":" + point.horizonDays;
      if (seenCashflowPoints.has(key) || !/^[A-Z]{3}$/.test(point.currency) || !HORIZONS.includes(point.horizonDays)) {
        cashflowWarnings.push("CASHFLOW_POINT_DUPLICATE_OR_INVALID:" + key);
        continue;
      }
      seenCashflowPoints.add(key);
      const evidenceIds = unique(point.evidenceIds);
      const verified = point.status === "VERIFIED" && point.scheduleComplete && point.asOf === input.asOf &&
        validPeriod(point.period) && evidenceIds.length > 0 && unique(point.formulaVersions).length > 0 &&
        finite(point.openingBalance) !== null && finite(point.knownInflows) !== null &&
        finite(point.knownOutflows) !== null && finite(point.projectedBalance) !== null;
      cashflow.push({
        ...point,
        openingBalance: verified ? finite(point.openingBalance) : null,
        knownInflows: verified ? finite(point.knownInflows) : null,
        knownOutflows: verified ? finite(point.knownOutflows) : null,
        projectedBalance: verified ? finite(point.projectedBalance) : null,
        status: verified ? "VERIFIED" : point.status === "UNVERIFIED" ? "UNVERIFIED" :
          point.status === "UNAVAILABLE" ? "UNAVAILABLE" : "NEEDS_REVIEW",
        scheduleComplete: verified,
        evidenceIds: verified ? evidenceIds : [],
        formulaVersions: verified ? unique(point.formulaVersions) : [],
        warnings: [...point.warnings, ...(verified ? [] : ["CASHFLOW_POINT_NOT_COMPLETE_OR_VERIFIED"])],
      });
    }
  } else if (input.cashflow) {
    cashflowWarnings.push("CASHFLOW_AS_OF_MISMATCH");
  }
  const cashflowStatus = !input.cashflow ? "UNAVAILABLE" :
    input.cashflow.asOf !== input.asOf ? "NEEDS_REVIEW" : rollup(cashflow.map(point => point.status));
  warnings.push(...cashflowWarnings);
  const stock = buildStock(input.deadStock, input.asOf);
  const replenishment = buildReplenishment(input.replenishment, input.asOf);
  const customer = buildCustomerFocus(input.retention, input.asOf);

  const suppliedConcentration = input.productRevenueConcentration ?? null;
  const concentrationAligned = Boolean(
    suppliedConcentration &&
    Date.parse(suppliedConcentration.asOf) === Date.parse(input.asOf) &&
    suppliedConcentration.period.from === input.period.from &&
    suppliedConcentration.period.to === input.period.to
  );
  const productRevenueConcentration = concentrationAligned ? suppliedConcentration : null;
  if (suppliedConcentration && !concentrationAligned) warnings.push("PRODUCT_REVENUE_CONCENTRATION_AS_OF_OR_PERIOD_MISMATCH");
  if (!productRevenueConcentration && input.productRevenueConcentrationUnavailableReason) {
    warnings.push("PRODUCT_REVENUE_CONCENTRATION_UNAVAILABLE");
  }
  const concentrationCalculation: BusinessHealthCalculability = productRevenueConcentration
    ? {
        status: productRevenueConcentration.status,
        missingInputs: productRevenueConcentration.currencies
          .filter(item => item.status !== "VERIFIED")
          .flatMap(item => [
            ...(item.unmappedLineCount ? [item.currency + ": سطور بلا منتج مرتبط"] : []),
            ...(item.invalidCreditLineCount ? [item.currency + ": إشعارات دائنة غير متطابقة"] : []),
            ...(item.invoicesWithoutLines ? [item.currency + ": فواتير بلا سطور"] : []),
          ]),
        reason: productRevenueConcentration.status === "VERIFIED"
          ? "تركيز أعلى خمسة منتجات محسوب من قيمة سطور الفواتير الصادرة بعد طرح الإشعارات الدائنة المنشورة، لكل عملة مستقلة."
          : productRevenueConcentration.status === "EMPTY"
            ? "لا توجد فواتير صادرة ضمن الفترة؛ لا يوجد مجتمع يمكن حساب التركّز عليه."
            : "لم تُعرض نسب التركّز للعملات التي لا يكتمل ربط جميع سطور فواتيرها وإشعاراتها الدائنة.",
      }
    : notCalculable(
        ["مصدر سطور فواتير المنتجات حسب العملة والفترة", "ربط الإشعارات الدائنة المنشورة بسطر الفاتورة الأصلي", "تغطية منتج مكتملة لكل سطر"],
        input.productRevenueConcentrationUnavailableReason ?? "مصدر تركّز قيمة الفواتير غير متاح في هذه اللقطة."
      );
  const suppliedSupplierActivity = input.supplierPostedPayableActivity ?? null;
  const supplierActivityAligned = Boolean(suppliedSupplierActivity &&
    Date.parse(suppliedSupplierActivity.asOf) === Date.parse(input.asOf) &&
    suppliedSupplierActivity.period.from === input.period.from &&
    suppliedSupplierActivity.period.to === input.period.to);
  const supplierPostedPayableActivity = supplierActivityAligned ? suppliedSupplierActivity : null;
  if (suppliedSupplierActivity && !supplierActivityAligned) warnings.push("SUPPLIER_POSTED_PAYABLE_ACTIVITY_AS_OF_OR_PERIOD_MISMATCH");
  if (!supplierPostedPayableActivity && input.supplierPostedPayableActivityUnavailableReason)
    warnings.push("SUPPLIER_POSTED_PAYABLE_ACTIVITY_UNAVAILABLE");
  const supplierPostedPayableActivityTrend = buildSupplierPayableConcentrationTrend(
    supplierPostedPayableActivity,
    input.supplierPostedPayableActivityPriorPeriod ?? null,
  );
  if (input.supplierPostedPayableActivityPriorPeriodUnavailableReason) {
    warnings.push("SUPPLIER_POSTED_PAYABLE_ACTIVITY_PRIOR_PERIOD_UNAVAILABLE");
  }
  warnings.push(...supplierPostedPayableActivityTrend.warnings);
  const supplierActivityCalculation: BusinessHealthCalculability = supplierPostedPayableActivity
    ? {
        status: supplierPostedPayableActivity.status,
        missingInputs: supplierPostedPayableActivity.currencies.filter(item=>item.status!=="VERIFIED")
          .map(item=>item.currency+": لا يوجد مقام موجب لحساب تركّز قيود الاستلام الدائنة المنشورة"),
        reason: supplierPostedPayableActivity.status==="VERIFIED"
          ? "تركيز أعلى خمسة موردين محسوب داخل قيود الالتزامات الدائنة المنشورة والمربوطة بإيصالات الاستلام فقط؛ الإشعارات الدائنة المنشورة معروضة كحركة مدينة منفصلة."
          : supplierPostedPayableActivity.status==="EMPTY"
            ? "لا توجد قيود استلام أو إشعارات دائن للموردين مستوفية لنطاق المصدر المنشور خلال الفترة."
            : "مصدر القيود متصالح، لكن توجد عملة بلا إجمالي دائن موجب؛ حُجب تركّزها دون مقام تقديري.",
      }
    : notCalculable(["قيود يومية منشورة ومربوطة بإيصالات الاستلام وإشعارات المورد الدائنة","تطابق مجاميع المصدر حسب العملة"],
        input.supplierPostedPayableActivityUnavailableReason ?? "مصدر حركة الالتزامات المنشورة للموردين غير متاح لهذه اللقطة.");
  const calculations = {
    cashConversionCycle: notCalculable(
      ["DIO: أيام المخزون من متوسط المخزون وتكلفة المبيعات", "DSO: أيام التحصيل من متوسط الذمم والمبيعات الآجلة", "DPO: أيام السداد من متوسط الدائنين والمشتريات الآجلة"],
      "لا تتوفر مدخلات مكتملة ومتسقة للفترة تسمح بحساب دورة التحويل النقدي دون افتراضات."
    ),
    daysSalesOutstanding: notCalculable(["متوسط الذمم المدينة", "المبيعات الآجلة للفترة وعدد أيامها"],
      "الذمم المتأخرة وحدها لا تمثل متوسط الذمم ولا تكفي لحساب أيام التحصيل."),
    daysPayableOutstanding: notCalculable(["متوسط الذمم الدائنة", "المشتريات الآجلة أو تكلفة المبيعات المناسبة للفترة وعدد أيامها"],
      "الالتزامات المستحقة وحدها لا تمثل متوسط الدائنين أو مشتريات الفترة."),
    productRevenueConcentration: concentrationCalculation,
    supplierPostedPayableActivityConcentration: supplierActivityCalculation,
    supplierRevenueConcentration: notCalculable(["إنفاق أو مشتريات مكتملة لكل مورد حسب العملة والفترة", "مجتمع الموردين الكامل وتغطية غير مقطوعة"],
      "لم تتوفر بعد مجموعة بيانات المشتريات الكاملة حسب المورد."),
  };
  const concentrationEvidenceStatus: EvidenceStatus = concentrationCalculation.status === "VERIFIED"
    ? "VERIFIED"
    : concentrationCalculation.status === "NEEDS_REVIEW" ? "NEEDS_REVIEW" :
      concentrationCalculation.status === "NOT_CALCULABLE" || concentrationCalculation.status === "EMPTY"
        ? "UNAVAILABLE" : "NEEDS_REVIEW";
  const supplierActivityEvidenceStatus: EvidenceStatus = supplierActivityCalculation.status === "VERIFIED"
    ? "VERIFIED"
    : supplierActivityCalculation.status === "NOT_CALCULABLE" || supplierActivityCalculation.status === "EMPTY"
      ? "UNAVAILABLE" : "NEEDS_REVIEW";
  const attention = buildAttention(currencies, cashflow, replenishment);
  const status = rollup([
    ...currencies.map(position => position.status), cashflowStatus, stock.status, replenishment.status,
    customer.status, concentrationEvidenceStatus, supplierActivityEvidenceStatus,
  ]);
  warnings.push(
    ...(input.cashflow?.warnings ?? []), ...stock.warnings, ...replenishment.warnings, ...customer.warnings,
    ...currencies.flatMap(position => position.warnings),
    ...(productRevenueConcentration?.status === "PARTIAL" ? ["PRODUCT_REVENUE_CONCENTRATION_PARTIAL"] : []),
    ...(productRevenueConcentration?.status === "EMPTY" ? ["PRODUCT_REVENUE_CONCENTRATION_EMPTY"] : []),
    ...(supplierPostedPayableActivity?.status === "NEEDS_REVIEW" ? ["SUPPLIER_POSTED_PAYABLE_ACTIVITY_NEEDS_REVIEW"] : []),
    ...(supplierPostedPayableActivity?.status === "EMPTY" ? ["SUPPLIER_POSTED_PAYABLE_ACTIVITY_EMPTY"] : []),
  );
  return {
    id: input.id, generatedAt: input.generatedAt, asOf: input.asOf, period: input.period,
    policyVersion: BUSINESS_HEALTH_MAP_POLICY_VERSION, status, currencies, cashflow, stock, replenishment,
    customerFocus: customer.rows, productRevenueConcentration, supplierPostedPayableActivity, supplierPostedPayableActivityTrend, calculations, totalCapitalAtRisk: null,
    totalCapitalAtRiskReason: "الإجمالي محجوب لأن الذمم والتحصيلات والالتزامات والمخزون والوارد المجدول قد تتداخل؛ تُعرض المكونات منفصلة إلى أن تثبت مجموعات مصادر متنافية.",
    attention, warnings: unique(warnings),
  };
}
