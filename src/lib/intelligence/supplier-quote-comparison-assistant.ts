import type { SupplierQuote } from "@/lib/supplier-quotes";
import type { SupplierPerformanceSnapshot } from "./supplier-performance";

export type SupplierQuoteComparisonWithheldReason =
  | "UNIT_MISSING"
  | "PRODUCT_SNAPSHOT_MISMATCH"
  | "LINE_TOTAL_MISMATCH"
  | "INSUFFICIENT_DISTINCT_SUPPLIERS";

export interface SupplierQuoteSupplierPerformance {
  state: "AVAILABLE" | "NO_ELIGIBLE_ORDERS_IN_PERIOD" | "NOT_IN_RETURNED_PAGE" | "SOURCE_UNAVAILABLE";
  purchaseOrderCount: number | null;
  completedOrderCount: number | null;
  openOrderCount: number | null;
  inconsistentReceivedCount: number | null;
  backlogLineCount: number | null;
  leadTimeSampleCount: number | null;
  medianLeadDays: number | null;
  p90LeadDays: number | null;
  completedWithoutPromiseCount: number | null;
  promisedDeliverySampleCount: number | null;
  onTimePercent: number | null;
}

export interface SupplierQuotePerformanceSource {
  status: "NOT_REQUESTED" | "READY" | "PARTIAL" | "DENIED" | "UNAVAILABLE" | "ERROR";
  asOf: string | null;
  period: { from: string; to: string } | null;
  totalSupplierCount: number | null;
  returnedSupplierCount: number | null;
  completePopulation: boolean | null;
  message: string | null;
}

export interface SupplierQuoteComparisonOffer {
  supplierPerformance?: SupplierQuoteSupplierPerformance;
  supplierName: string;
  quoteNumber: string;
  unitCost: number;
  deliveryDays: number | null;
  paymentTerms: string | null;
  validUntil: string | null;
  updatedAt: string;
}

export interface SupplierQuoteProductComparison {
  key: string;
  productName: string;
  itemCode: string;
  quantity: number;
  unit: string;
  currency: string;
  offerCount: number;
  offers: SupplierQuoteComparisonOffer[];
  omittedOfferCount: number;
  lowestUnitCost: number;
  secondLowestUnitCost: number | null;
  differenceToNextUnitCost: number | null;
  deliveryProfile: { shortestDays: number | null; longestDays: number | null; withDays: number; withoutDays: number; fastestCount: number };
  paymentTermsCoverage: { recorded: number; missing: number };
}

export interface SupplierQuoteComparisonWithheld {
  key: string;
  productName: string;
  itemCode: string;
  reason: SupplierQuoteComparisonWithheldReason;
}

export interface SupplierQuotePriceHistory {
  key: string;
  productName: string;
  itemCode: string;
  supplierName: string;
  quantity: number;
  unit: string;
  currency: string;
  quoteCount: number;
  first: { quoteNumber: string; createdAt: string; unitCost: number; status: SupplierQuote["status"] };
  latest: { quoteNumber: string; createdAt: string; unitCost: number; status: SupplierQuote["status"] };
  changeAmount: number;
  changePercent: number | null;
  direction: "INCREASED" | "DECREASED" | "UNCHANGED";
}

export interface SupplierQuoteComparisonAssistantResult {
  kind: "SUPPLIER_QUOTE_COMPARISON";
  state: "READY" | "PARTIAL" | "EMPTY";
  intent: "SUPPLIER_QUOTE_COMPARISON_OVERVIEW";
  sourceRpc: "fetch_purchase_supplier_quotes";
  queriedAt: string;
  supplierPerformance: SupplierQuotePerformanceSource;
  quoteCount: number;
  completePopulation: boolean;
  quoteCounts: { received: number; awarded: number; expired: number };
  comparisonGroupCount: number;
  comparisons: SupplierQuoteProductComparison[];
  comparisonsTruncated: boolean;
  priceHistory: SupplierQuotePriceHistory[];
  priceHistoryGroupCount: number;
  priceHistoryTruncated: boolean;
  withheldGroupCount: number;
  withheld: SupplierQuoteComparisonWithheld[];
  warnings: string[];
  answer: string;
}

type Candidate = { quote: SupplierQuote; productId: string; line: SupplierQuote["items"][number] };
type SupplierPerformanceInput =
  | { ok: true; snapshot: SupplierPerformanceSnapshot }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };
const SOURCE_LIMIT = 200;
const MAX_RENDERED_COMPARISONS = 20;
const MAX_RENDERED_OFFERS = 10;
const MAX_RENDERED_WITHHELD = 30;

function validTime(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

/**
 * Mirrors the SQL quote-line rule: quantity NUMERIC(15,3) multiplied by
 * unit_cost NUMERIC(15,2), then rounded once into line_total NUMERIC(15,2).
 * BigInt avoids a one-cent acceptance caused by binary floating-point drift.
 */
function supplierQuoteLineTotalMatchesSourceRounding(candidate: Candidate): boolean {
  const { quantity_quoted: quantity, unit_cost: unitCost, line_total: lineTotal } = candidate.line;
  if (
    !Number.isFinite(quantity) || quantity <= 0 ||
    !Number.isFinite(unitCost) || unitCost < 0 ||
    !Number.isFinite(lineTotal) || lineTotal < 0
  ) return false;

  const scaledInteger = (value: number, scale: number): bigint | null => {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value.toString());
    if (!match) return null;
    const fraction = match[2] ?? "";
    if (fraction.length > scale) return null;
    return BigInt(match[1]) * (10n ** BigInt(scale)) +
      BigInt(fraction.padEnd(scale, "0") || "0");
  };

  const quantityMilli = scaledInteger(quantity, 3);
  const unitCostCents = scaledInteger(unitCost, 2);
  const lineTotalCents = scaledInteger(lineTotal, 2);
  if (quantityMilli === null || unitCostCents === null || lineTotalCents === null) return false;
  const expectedLineTotalCents = (quantityMilli * unitCostCents + 500n) / 1000n;
  return expectedLineTotalCents === lineTotalCents;
}

function newestFirst(a: Candidate, b: Candidate): number {
  const time = Date.parse(b.quote.updated_at) - Date.parse(a.quote.updated_at);
  if (time !== 0) return time;
  return b.quote.id.localeCompare(a.quote.id);
}

function compareOffers(a: SupplierQuoteComparisonOffer, b: SupplierQuoteComparisonOffer): number {
  return a.unitCost - b.unitCost ||
    a.supplierName.localeCompare(b.supplierName, "ar") ||
    a.quoteNumber.localeCompare(b.quoteNumber);
}

/**
 * Compares only persisted, currently received supplier offers for the same product,
 * exact quoted quantity, unit of measure and currency. It never awards a quote or
 * creates a purchase order. The RPC has a 200-row ceiling and no total/cursor;
 * exactly 200 returned rows are therefore conservatively marked PARTIAL.
 */
export function buildSupplierQuoteComparisonAssistant(
  quotes: readonly SupplierQuote[],
  queriedAt: string,
  supplierPerformance?: SupplierPerformanceInput,
): SupplierQuoteComparisonAssistantResult {
  if (!Array.isArray(quotes) || quotes.length > SOURCE_LIMIT || !validTime(queriedAt)) {
    throw new Error("supplier_quote_comparison_input_invalid");
  }
  const performanceMap = new Map<string, SupplierPerformanceSnapshot["suppliers"][number]>();
  const performanceSnapshot = supplierPerformance?.ok ? supplierPerformance.snapshot : null;
  if (performanceSnapshot) {
    for (const item of performanceSnapshot.suppliers) performanceMap.set(item.supplierId, item);
  }
  const performanceSource: SupplierQuotePerformanceSource = performanceSnapshot ? {
    status: performanceSnapshot.completePopulation ? "READY" : "PARTIAL",
    asOf: performanceSnapshot.asOf,
    period: { from: performanceSnapshot.period.from, to: performanceSnapshot.period.to },
    totalSupplierCount: performanceSnapshot.totalSupplierCount,
    returnedSupplierCount: performanceSnapshot.returnedSupplierCount,
    completePopulation: performanceSnapshot.completePopulation,
    message: performanceSnapshot.completePopulation ? null : "قائمة أداء الموردين جزئية؛ قد لا تظهر جميع الموردين في الصفحة المعادة.",
  } : supplierPerformance && !supplierPerformance.ok ? {
    status: supplierPerformance.status,
    asOf: null,
    period: null,
    totalSupplierCount: null,
    returnedSupplierCount: null,
    completePopulation: null,
    message: supplierPerformance.message,
  } : {
    status: "NOT_REQUESTED",
    asOf: null,
    period: null,
    totalSupplierCount: null,
    returnedSupplierCount: null,
    completePopulation: null,
    message: null,
  };
  const performanceFor = (supplierId: string): SupplierQuoteSupplierPerformance | undefined => {
    if (!supplierPerformance) return undefined;
    if (!performanceSnapshot) return {
      state: "SOURCE_UNAVAILABLE",
      purchaseOrderCount: null,
      completedOrderCount: null,
      openOrderCount: null,
      inconsistentReceivedCount: null,
      backlogLineCount: null,
      leadTimeSampleCount: null,
      medianLeadDays: null,
      p90LeadDays: null,
      completedWithoutPromiseCount: null,
      promisedDeliverySampleCount: null,
      onTimePercent: null,
    };
    const supplier = performanceMap.get(supplierId);
    if (!supplier) {
      const state = performanceSnapshot.completePopulation ? "NO_ELIGIBLE_ORDERS_IN_PERIOD" : "NOT_IN_RETURNED_PAGE";
      return {
        state,
        purchaseOrderCount: null,
        completedOrderCount: null,
        openOrderCount: null,
        inconsistentReceivedCount: null,
        backlogLineCount: null,
        leadTimeSampleCount: 0,
        medianLeadDays: null,
        p90LeadDays: null,
        completedWithoutPromiseCount: 0,
        promisedDeliverySampleCount: 0,
        onTimePercent: null,
      };
    }
    return {
      state: "AVAILABLE",
      purchaseOrderCount: supplier.purchaseOrderCount,
      completedOrderCount: supplier.completedOrderCount,
      openOrderCount: supplier.openOrderCount,
      inconsistentReceivedCount: supplier.inconsistentReceivedCount,
      backlogLineCount: supplier.backlogLineCount,
      leadTimeSampleCount: supplier.leadTimeSampleCount,
      medianLeadDays: supplier.leadTimeSampleCount >= 3 ? supplier.medianLeadDays : null,
      p90LeadDays: supplier.leadTimeSampleCount >= 10 ? supplier.p90LeadDays : null,
      completedWithoutPromiseCount: supplier.completedWithoutPromiseCount,
      promisedDeliverySampleCount: supplier.promisedDeliverySampleCount,
      onTimePercent: supplier.promisedDeliverySampleCount >= 3 ? supplier.onTimePercent : null,
    };
  };

  const quoteCounts = { received: 0, awarded: 0, expired: 0 };
  for (const quote of quotes) {
    if (quote.status === "received") quoteCounts.received += 1;
    else if (quote.status === "awarded") quoteCounts.awarded += 1;
    else if (quote.status === "expired") quoteCounts.expired += 1;
  }

  const byProduct = new Map<string, Candidate[]>();
  for (const quote of quotes) {
    if (quote.status !== "received") continue;
    for (const line of quote.items) {
      const rows = byProduct.get(line.product_id) ?? [];
      rows.push({ quote, productId: line.product_id, line });
      byProduct.set(line.product_id, rows);
    }
  }

  const comparisons: SupplierQuoteProductComparison[] = [];
  const withheld: SupplierQuoteComparisonWithheld[] = [];
  for (const [productId, productRows] of byProduct) {
    const groups = new Map<string, Candidate[]>();
    for (const candidate of productRows) {
      const key = JSON.stringify([
        candidate.line.unit,
        candidate.quote.currency,
        candidate.line.quantity_quoted,
      ]);
      const rows = groups.get(key) ?? [];
      rows.push(candidate);
      groups.set(key, rows);
    }

    for (const [basis, candidates] of groups) {
      const key = productId + ":" + basis;
      const first = candidates[0];
      const productName = first.line.product_name;
      const itemCode = first.line.item_code;
      const addWithheld = (reason: SupplierQuoteComparisonWithheldReason) => {
        withheld.push({ key, productName, itemCode, reason });
      };

      const units = new Set(candidates.map(item => item.line.unit?.trim() ?? ""));
      if (units.size !== 1 || !first.line.unit?.trim()) {
        addWithheld("UNIT_MISSING");
        continue;
      }
      const productNames = new Set(candidates.map(item => item.line.product_name.trim()));
      const itemCodes = new Set(candidates.map(item => item.line.item_code.trim()));
      if (productNames.size !== 1 || itemCodes.size !== 1) {
        addWithheld("PRODUCT_SNAPSHOT_MISMATCH");
        continue;
      }
      if (candidates.some(item => !supplierQuoteLineTotalMatchesSourceRounding(item))) {
        addWithheld("LINE_TOTAL_MISMATCH");
        continue;
      }

      // A supplier can submit several revisions. Keep its latest saved offer
      // for this exact comparison basis so one supplier cannot occupy several ranks.
      const latestBySupplier = new Map<string, Candidate>();
      for (const candidate of [...candidates].sort(newestFirst)) {
        if (!latestBySupplier.has(candidate.quote.supplier_id)) {
          latestBySupplier.set(candidate.quote.supplier_id, candidate);
        }
      }
      const distinctOffers = [...latestBySupplier.values()];
      if (distinctOffers.length < 2) {
        addWithheld("INSUFFICIENT_DISTINCT_SUPPLIERS");
        continue;
      }

      const offers = distinctOffers.map(item => ({
        supplierPerformance: performanceFor(item.quote.supplier_id),
        supplierName: item.quote.supplier_name,
        quoteNumber: item.quote.quote_number,
        unitCost: item.line.unit_cost,
        deliveryDays: item.quote.delivery_days,
        paymentTerms: item.quote.payment_terms?.trim() || null,
        validUntil: item.quote.valid_until,
        updatedAt: item.quote.updated_at,
      })).sort(compareOffers);
      const days = offers.map(offer => offer.deliveryDays).filter((value): value is number => value !== null && Number.isInteger(value) && value >= 0);
      const shortestDays = days.length ? Math.min(...days) : null;
      const lowestUnitCost = offers[0].unitCost;
      const secondLowestUnitCost = offers[1]?.unitCost ?? null;
      comparisons.push({
        key,
        productName,
        itemCode,
        quantity: first.line.quantity_quoted,
        unit: first.line.unit as string,
        currency: first.quote.currency,
        offerCount: offers.length,
        offers: offers.slice(0, MAX_RENDERED_OFFERS),
        omittedOfferCount: Math.max(0, offers.length - MAX_RENDERED_OFFERS),
        lowestUnitCost,
        secondLowestUnitCost,
        differenceToNextUnitCost: secondLowestUnitCost === null
          ? null
          : Number((secondLowestUnitCost - lowestUnitCost).toFixed(2)),
        deliveryProfile: {
          shortestDays,
          longestDays: days.length ? Math.max(...days) : null,
          withDays: days.length,
          withoutDays: offers.length - days.length,
          fastestCount: shortestDays === null ? 0 : offers.filter(offer => offer.deliveryDays === shortestDays).length,
        },
        paymentTermsCoverage: {
          recorded: offers.filter(offer => offer.paymentTerms !== null).length,
          missing: offers.filter(offer => offer.paymentTerms === null).length,
        },
      });
    }
  }

  comparisons.sort((a, b) =>
    a.productName.localeCompare(b.productName, "ar") ||
    a.itemCode.localeCompare(b.itemCode) ||
    a.quantity - b.quantity ||
    a.unit.localeCompare(b.unit) ||
    a.currency.localeCompare(b.currency)
  );
  withheld.sort((a, b) =>
    a.productName.localeCompare(b.productName, "ar") ||
    a.itemCode.localeCompare(b.itemCode) ||
    a.reason.localeCompare(b.reason)
  );

  // Historical quote observations include received, awarded and expired records.
  // They remain separate from the live-offer comparison above and use created_at,
  // never updated_at, as the source observation time.
  const historyByBasis = new Map<string, Candidate[]>();
  for (const quote of quotes) {
    for (const line of quote.items) {
      const basis = JSON.stringify([quote.supplier_id, line.product_id, line.quantity_quoted, line.unit, quote.currency]);
      const rows = historyByBasis.get(basis) ?? [];
      rows.push({ quote, productId: line.product_id, line });
      historyByBasis.set(basis, rows);
    }
  }
  const priceHistory: SupplierQuotePriceHistory[] = [];
  const queryTime = Date.parse(queriedAt);
  for (const [basis, rows] of historyByBasis) {
    if (rows.length < 2) continue;
    const firstRow = rows[0];
    const productName = firstRow.line.product_name;
    const itemCode = firstRow.line.item_code;
    if (!firstRow.line.unit?.trim() ||
        new Set(rows.map(row => row.line.product_name.trim())).size !== 1 ||
        new Set(rows.map(row => row.line.item_code.trim())).size !== 1 ||
        rows.some(row => !validTime(row.quote.created_at) ||
          Date.parse(row.quote.created_at) > queryTime ||
          !Number.isFinite(row.line.quantity_quoted) || row.line.quantity_quoted <= 0 ||
          !supplierQuoteLineTotalMatchesSourceRounding(row))) continue;
    const ordered = [...rows].sort((a, b) =>
      Date.parse(a.quote.created_at) - Date.parse(b.quote.created_at) ||
      a.quote.id.localeCompare(b.quote.id)
    );
    const first = ordered[0];
    const latest = ordered[ordered.length - 1];
    if (Date.parse(first.quote.created_at) === Date.parse(latest.quote.created_at)) continue;
    const changeAmount = Number((latest.line.unit_cost - first.line.unit_cost).toFixed(2));
    const changePercent = first.line.unit_cost > 0
      ? Number((changeAmount / first.line.unit_cost * 100).toFixed(2))
      : null;
    priceHistory.push({
      key: basis,
      productName,
      itemCode,
      supplierName: first.quote.supplier_name,
      quantity: first.line.quantity_quoted,
      unit: first.line.unit as string,
      currency: first.quote.currency,
      quoteCount: rows.length,
      first: {
        quoteNumber: first.quote.quote_number,
        createdAt: first.quote.created_at,
        unitCost: first.line.unit_cost,
        status: first.quote.status,
      },
      latest: {
        quoteNumber: latest.quote.quote_number,
        createdAt: latest.quote.created_at,
        unitCost: latest.line.unit_cost,
        status: latest.quote.status,
      },
      changeAmount,
      changePercent,
      direction: changeAmount > 0 ? "INCREASED" : changeAmount < 0 ? "DECREASED" : "UNCHANGED",
    });
  }
  priceHistory.sort((a, b) =>
    a.productName.localeCompare(b.productName, "ar") ||
    a.supplierName.localeCompare(b.supplierName, "ar") ||
    a.quantity - b.quantity ||
    a.unit.localeCompare(b.unit) ||
    a.currency.localeCompare(b.currency)
  );

  const completePopulation = quotes.length < SOURCE_LIMIT;
  const state: SupplierQuoteComparisonAssistantResult["state"] = quotes.length === 0
    ? "EMPTY"
    : completePopulation && ["READY", "NOT_REQUESTED"].includes(performanceSource.status) ? "READY" : "PARTIAL";
  const warnings: string[] = [];
  if (!completePopulation) {
    warnings.push("SOURCE_LIMIT_REACHED: تعرض الخدمة أحدث 200 عرض فقط ولا تعيد total أو cursor؛ قد توجد عروض أقدم لم تدخل المقارنة.");
  }
  if (withheld.length > 0) {
    warnings.push("NON_COMPARABLE_OFFERS_WITHHELD: لا تقارن العروض عند اختلاف الوحدة أو الكمية أو العملة أو لقطة الصنف أو سلامة إجمالي السطر.");
  }
  if (!["READY", "NOT_REQUESTED"].includes(performanceSource.status)) {
    warnings.push("SUPPLIER_PERFORMANCE_NOT_COMPLETE: بيانات الأداء الفعلي للموردين غير مكتملة أو غير متاحة؛ بقيت مقارنة الأسعار وشروط العرض مستقلة.");
  }
  if (comparisons.length > MAX_RENDERED_COMPARISONS) {
    warnings.push("COMPARISON_RENDER_LIMIT: عُرضت أول 20 مجموعة مقارنة فقط.");
  }
  if (priceHistory.length > 40) {
    warnings.push("PRICE_HISTORY_RENDER_LIMIT: عُرضت أول 40 مجموعة سجل سعري فقط.");
  }

  const answer = quotes.length === 0
    ? "لا توجد عروض موردين محفوظة في المصدر المصرح به."
    : quoteCounts.received === 0
      ? "تم تحميل " + quotes.length + " عرضاً، لكن لا يوجد عرض مستلم وساري حالياً ضمن المصدر للمقارنة."
      : comparisons.length === 0
        ? "تم تحميل " + quotes.length + " عرضاً، لكن لم تتوافر مجموعتان من عروض موردين مختلفين للصنف نفسه وبالكمية والوحدة والعملة نفسها؛ لم تُنشأ مقارنة تخمينية."
        : "تم تكوين " + comparisons.length + " مجموعة مقارنة من عروض الموردين المحفوظة. ترتيب العروض مبني على تكلفة الوحدة المسجلة فقط، وليس توصية بالترسية أو تقييماً لجودة المورد.";

  return {
    kind: "SUPPLIER_QUOTE_COMPARISON",
    state,
    intent: "SUPPLIER_QUOTE_COMPARISON_OVERVIEW",
    sourceRpc: "fetch_purchase_supplier_quotes",
    queriedAt,
    supplierPerformance: performanceSource,
    quoteCount: quotes.length,
    completePopulation,
    quoteCounts,
    comparisonGroupCount: comparisons.length,
    comparisons: comparisons.slice(0, MAX_RENDERED_COMPARISONS),
    comparisonsTruncated: comparisons.length > MAX_RENDERED_COMPARISONS,
    priceHistory: priceHistory.slice(0, 40),
    priceHistoryGroupCount: priceHistory.length,
    priceHistoryTruncated: priceHistory.length > 40,
    withheldGroupCount: withheld.length,
    withheld: withheld.slice(0, MAX_RENDERED_WITHHELD),
    warnings,
    answer,
  };
}
