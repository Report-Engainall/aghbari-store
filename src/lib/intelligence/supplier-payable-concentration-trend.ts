import type { SupplierPostedPayableActivitySnapshot } from "./supplier-posted-payable-activity-client";
import {
  decimalToMinorUnits,
  percentageToHundredths,
  roundedPercentageHundredths,
} from "./financial-precision";

export type SupplierPayableTrendDirection = "INCREASED" | "DECREASED" | "UNCHANGED";
export type SupplierPayableTrendStatus = "VERIFIED" | "PARTIAL" | "NOT_COMPARABLE" | "UNAVAILABLE";
export type SupplierPayableTrendWithheldReason =
  | "CURRENT_CURRENCY_MISSING"
  | "BASELINE_CURRENCY_MISSING"
  | "INSUFFICIENT_SUPPLIER_DIVERSITY"
  | "CURRENCY_NEEDS_REVIEW"
  | "CONCENTRATION_UNAVAILABLE";

export interface SupplierPayableConcentrationTrend {
  status: SupplierPayableTrendStatus;
  asOf: string | null;
  currentPeriod: { from: string; to: string } | null;
  baselinePeriod: { from: string; to: string } | null;
  formulaId: "nasr1.top5-posted-supplier-payable-concentration-period-delta";
  formulaVersion: "1";
  comparisons: Array<{
    currency: string;
    currentPercent: number;
    baselinePercent: number;
    changePercentagePoints: number;
    direction: SupplierPayableTrendDirection;
    currentSupplierCount: number;
    baselineSupplierCount: number;
    currentEntryCount: number;
    baselineEntryCount: number;
  }>;
  withheld: Array<{ currency: string | null; reason: SupplierPayableTrendWithheldReason }>;
  warnings: string[];
}

const DAY_MS = 86_400_000;
const FORMULA_ID = "nasr1.top5-posted-supplier-payable-concentration-period-delta" as const;

function utcDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const millis = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0, 10) === value ? millis : null;
}
function validTime(value: string): boolean {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function sameWindow(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  const af = utcDay(a.from), at = utcDay(a.to), bf = utcDay(b.from), bt = utcDay(b.to);
  if (af === null || at === null || bf === null || bt === null || af > at || bf > bt) return false;
  const aDays = (at - af) / DAY_MS + 1;
  const bDays = (bt - bf) / DAY_MS + 1;
  return aDays === bDays && aDays <= 366 && at + DAY_MS === bf;
}
function round2(value: number): number {
  return Number(value.toFixed(2));
}

function validSnapshotContract(snapshot: SupplierPostedPayableActivitySnapshot): boolean {
  if (
    snapshot.completeSourceAggregation !== true ||
    !Number.isSafeInteger(snapshot.sourceEntryCount) || snapshot.sourceEntryCount < 0 ||
    !Number.isSafeInteger(snapshot.currencyCount) || snapshot.currencyCount !== snapshot.currencies.length ||
    snapshot.currencies.length > 20 ||
    snapshot.activityScope !== "POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS" ||
    snapshot.formulaId !== "nasr1.posted-supplier-payable-credit-concentration" ||
    snapshot.formulaVersion !== "1"
  ) return false;

  const currencies = new Set<string>();
  let totalEntries = 0n;
  let hasReviewCurrency = false;
  for (const row of snapshot.currencies) {
    if (
      !/^[A-Z]{3}$/.test(row.currency) || currencies.has(row.currency) ||
      (row.status !== "VERIFIED" && row.status !== "NEEDS_REVIEW") ||
      !Number.isSafeInteger(row.supplierCount) || row.supplierCount < 1 ||
      !Number.isSafeInteger(row.sourceEntryCount) || row.sourceEntryCount < row.supplierCount
    ) return false;
    currencies.add(row.currency);
    totalEntries += BigInt(row.sourceEntryCount);

    const gross = decimalToMinorUnits(row.grossPayableCreditAmount, 2);
    const debit = decimalToMinorUnits(row.postedSupplierCreditNoteDebitAmount, 2);
    const net = decimalToMinorUnits(row.netPayableMovementAmount, 2, true);
    const top5 = decimalToMinorUnits(row.top5GrossPayableCreditAmount, 2);
    const percent = row.top5GrossPayableCreditPercent === null
      ? null : percentageToHundredths(row.top5GrossPayableCreditPercent);
    if (
      gross === null || debit === null || net === null || top5 === null ||
      net !== gross - debit ||
      (row.status === "VERIFIED" && (
        gross <= 0n || top5 > gross || percent === null || percent <= 0n ||
        percent !== roundedPercentageHundredths(top5, gross)
      )) ||
      (row.status === "NEEDS_REVIEW" && (gross !== 0n || top5 !== 0n || percent !== null))
    ) return false;
    if (row.status === "NEEDS_REVIEW") hasReviewCurrency = true;
  }

  if (totalEntries !== BigInt(snapshot.sourceEntryCount)) return false;
  if (snapshot.status === "EMPTY") {
    return snapshot.sourceEntryCount === 0 && snapshot.currencyCount === 0 &&
      snapshot.currencies.length === 0;
  }
  if (snapshot.status === "VERIFIED") {
    return snapshot.sourceEntryCount > 0 && snapshot.currencyCount > 0 && !hasReviewCurrency;
  }
  if (snapshot.status === "NEEDS_REVIEW") {
    return snapshot.sourceEntryCount > 0 && snapshot.currencyCount > 0 && hasReviewCurrency;
  }
  return false;
}
function empty(
  status: SupplierPayableTrendStatus,
  current: SupplierPostedPayableActivitySnapshot | null,
  baseline: SupplierPostedPayableActivitySnapshot | null,
  warning: string,
): SupplierPayableConcentrationTrend {
  return {
    status,
    asOf: current?.asOf ?? baseline?.asOf ?? null,
    currentPeriod: current?.period ?? null,
    baselinePeriod: baseline?.period ?? null,
    formulaId: FORMULA_ID,
    formulaVersion: "1",
    comparisons: [],
    withheld: [],
    warnings: [warning],
  };
}

/**
 * Compares the top-five share of posted, source-linked supplier payable credits
 * across adjacent equal-length windows. It does not imply the same five suppliers
 * appear in both periods and never represents total purchases or closing payables.
 */
export function buildSupplierPayableConcentrationTrend(
  current: SupplierPostedPayableActivitySnapshot | null,
  baseline: SupplierPostedPayableActivitySnapshot | null,
): SupplierPayableConcentrationTrend {
  if (!current || !baseline) return empty("UNAVAILABLE", current, baseline, "SUPPLIER_TREND_SOURCE_UNAVAILABLE");
  if (!validTime(current.asOf) || !validTime(baseline.asOf) ||
      Date.parse(current.asOf) !== Date.parse(baseline.asOf)) {
    return empty("NOT_COMPARABLE", current, baseline, "SUPPLIER_TREND_AS_OF_MISMATCH");
  }
  if (!sameWindow(baseline.period, current.period)) {
    return empty("NOT_COMPARABLE", current, baseline, "SUPPLIER_TREND_PERIODS_NOT_ADJACENT_AND_EQUAL");
  }
  if (current.activityScope !== baseline.activityScope) {
    return empty("NOT_COMPARABLE", current, baseline, "SUPPLIER_TREND_SOURCE_SCOPE_MISMATCH");
  }
  if (!validSnapshotContract(current) || !validSnapshotContract(baseline)) {
    return empty("NOT_COMPARABLE", current, baseline, "SUPPLIER_TREND_SOURCE_CONTRACT_INVALID");
  }
  if (current.formulaId !== baseline.formulaId || current.formulaVersion !== baseline.formulaVersion) {
    return empty("NOT_COMPARABLE", current, baseline, "SUPPLIER_TREND_FORMULA_MISMATCH");
  }
  const sourceReady = (snapshot: SupplierPostedPayableActivitySnapshot): boolean =>
    snapshot.completeSourceAggregation && (
      (snapshot.status === "VERIFIED" && snapshot.sourceEntryCount > 0) ||
      (snapshot.status === "EMPTY" && snapshot.sourceEntryCount === 0 && snapshot.currencies.length === 0)
    );
  if (!sourceReady(current) || !sourceReady(baseline)) {
    return empty("PARTIAL", current, baseline, "SUPPLIER_TREND_SOURCE_NOT_FULLY_VERIFIED");
  }

  const currentRows = new Map(current.currencies.map(row => [row.currency, row]));
  const baselineRows = new Map(baseline.currencies.map(row => [row.currency, row]));
  const currencies = [...new Set([...currentRows.keys(), ...baselineRows.keys()])].sort();
  const comparisons: SupplierPayableConcentrationTrend["comparisons"] = [];
  const withheld: SupplierPayableConcentrationTrend["withheld"] = [];

  for (const currency of currencies) {
    const now = currentRows.get(currency);
    const before = baselineRows.get(currency);
    if (!now) {
      withheld.push({ currency, reason: "CURRENT_CURRENCY_MISSING" });
      continue;
    }
    if (!before) {
      withheld.push({ currency, reason: "BASELINE_CURRENCY_MISSING" });
      continue;
    }
    if (now.status !== "VERIFIED" || before.status !== "VERIFIED") {
      withheld.push({ currency, reason: "CURRENCY_NEEDS_REVIEW" });
      continue;
    }
    if (now.supplierCount <= 5 || before.supplierCount <= 5) {
      withheld.push({ currency, reason: "INSUFFICIENT_SUPPLIER_DIVERSITY" });
      continue;
    }
    const currentPercent = now.top5GrossPayableCreditPercent;
    const baselinePercent = before.top5GrossPayableCreditPercent;
    if (currentPercent === null || baselinePercent === null ||
        !Number.isFinite(currentPercent) || !Number.isFinite(baselinePercent) ||
        currentPercent < 0 || currentPercent > 100 || baselinePercent < 0 || baselinePercent > 100) {
      withheld.push({ currency, reason: "CONCENTRATION_UNAVAILABLE" });
      continue;
    }
    const change = round2(currentPercent - baselinePercent);
    comparisons.push({
      currency,
      currentPercent,
      baselinePercent,
      changePercentagePoints: change,
      direction: change > 0.005 ? "INCREASED" : change < -0.005 ? "DECREASED" : "UNCHANGED",
      currentSupplierCount: now.supplierCount,
      baselineSupplierCount: before.supplierCount,
      currentEntryCount: now.sourceEntryCount,
      baselineEntryCount: before.sourceEntryCount,
    });
  }

  const status: SupplierPayableTrendStatus = comparisons.length === 0
    ? "NOT_COMPARABLE"
    : withheld.length > 0 ? "PARTIAL" : "VERIFIED";
  return {
    status,
    asOf: current.asOf,
    currentPeriod: current.period,
    baselinePeriod: baseline.period,
    formulaId: FORMULA_ID,
    formulaVersion: "1",
    comparisons,
    withheld,
    warnings: withheld.length ? ["SUPPLIER_TREND_SOME_CURRENCIES_WITHHELD"] : [],
  };
}
