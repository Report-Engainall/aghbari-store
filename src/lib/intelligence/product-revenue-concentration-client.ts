import { supabase } from "@/lib/supabase";
import {
  decimalToMinorUnits,
  minorUnitsToNumber,
  percentageToHundredths,
  roundedPercentageHundredths,
} from "./financial-precision";

export interface ProductRevenueConcentrationCurrency {
  currency: string;
  status: "VERIFIED" | "PARTIAL" | "NEEDS_REVIEW";
  invoiceCount: number;
  invoiceLineCount: number;
  productCount: number;
  mappedLineCount: number;
  unmappedLineCount: number;
  invalidCreditLineCount: number;
  invoicesWithoutLines: number;
  grossInvoiceLineAmount: number;
  netInvoiceLineAmount: number | null;
  top5NetInvoiceLineAmount: number | null;
  top5ConcentrationPercent: number | null;
}

export interface ProductRevenueConcentrationSnapshot {
  status: "VERIFIED" | "PARTIAL" | "EMPTY";
  asOf: string;
  period: { from: string; to: string };
  completePopulation: boolean;
  invoiceCount: number;
  invoiceWithoutLinesCount: number;
  currencyCount: number;
  currencies: ProductRevenueConcentrationCurrency[];
  formulaId: "nasr1.invoice-line-product-concentration-net-posted-credit-memos";
  formulaVersion: "1";
  formulaDescription: string;
}

export type ProductRevenueConcentrationFetchResult =
  | { ok: true; snapshot: ProductRevenueConcentrationSnapshot }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

type Row = Record<string, unknown>;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY = /^[A-Z]{3}$/;
const FORMULA_ID = "nasr1.invoice-line-product-concentration-net-posted-credit-memos";

function object(value: unknown): Row | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Row
    : null;
}
function validDay(value: unknown): value is string {
  if (typeof value !== "string" || !DAY.test(value)) return false;
  const millis = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(millis) && new Date(millis).toISOString().slice(0,10) === value;
}
function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.includes("T") && Number.isFinite(Date.parse(value));
}
function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function mapFailure(error: unknown): ProductRevenueConcentrationFetchResult {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "42501" || failure?.code === "28000" || failure?.code === "PGRST301") {
    return { ok: false, status: "DENIED", message: "لا تملك صلاحية قراءة تركّز قيمة الفواتير حسب المنتج." };
  }
  if (failure?.code === "PGRST202" || failure?.code === "42883" ||
      /function .* does not exist|could not find the function/i.test(failure?.message ?? "")) {
    return { ok: false, status: "UNAVAILABLE", message: "مصدر تركّز قيمة الفواتير غير متاح قبل تطبيق ترحيل خريطة صحة الأعمال." };
  }
  return { ok: false, status: "ERROR", message: "تعذر قراءة تركّز الفواتير من المصدر المالي المعتمد." };
}

export async function fetchProductRevenueConcentration(input: {
  from: string;
  to: string;
  asOf: string;
}): Promise<ProductRevenueConcentrationFetchResult> {
  if (!validDay(input.from) || !validDay(input.to) || input.from > input.to ||
      Date.parse(input.to+"T00:00:00.000Z")-Date.parse(input.from+"T00:00:00.000Z")>365*86400000 ||
      !validTimestamp(input.asOf)) {
    return { ok: false, status: "ERROR", message: "فترة أو وقت لقطة تركّز الفواتير غير صالح." };
  }
  try {
    const { data, error } = await supabase.rpc("fetch_business_health_product_revenue_concentration", {
      p_from: input.from,
      p_to: input.to,
      p_as_of: input.asOf,
    });
    if (error) return mapFailure(error);

    const raw = object(data);
    const rawPeriod = object(raw?.period);
    if (!raw || !validTimestamp(raw.asOf) || Date.parse(raw.asOf) !== Date.parse(input.asOf) ||
        !integer(raw.invoiceCount) || !integer(raw.invoiceWithoutLinesCount) ||
        !integer(raw.currencyCount) || !Array.isArray(raw.currencies) ||
        raw.currencies.length > 20 || raw.currencyCount !== raw.currencies.length ||
        rawPeriod?.from !== input.from || rawPeriod?.to !== input.to ||
        typeof raw.completePopulation !== "boolean" ||
        !["VERIFIED","PARTIAL","EMPTY"].includes(String(raw.status)) ||
        raw.formulaId !== FORMULA_ID || raw.formulaVersion !== "1" ||
        typeof raw.formulaDescription !== "string" || raw.formulaDescription.length > 1000 ||
        raw.sideEffects !== "NONE") {
      return { ok: false, status: "ERROR", message: "استجابة تركّز الفواتير لا تطابق عقد المصدر؛ حُجبت الأرقام." };
    }

    const currencies: ProductRevenueConcentrationCurrency[] = [];
    const seenCurrencies = new Set<string>();
    for (const item of raw.currencies) {
      const row = object(item);
      if (!row || typeof row.currency !== "string" || !CURRENCY.test(row.currency) ||
          seenCurrencies.has(row.currency) ||
          !["VERIFIED","PARTIAL","NEEDS_REVIEW"].includes(String(row.status)) ||
          !integer(row.invoiceCount) || !integer(row.invoiceLineCount) ||
          !integer(row.productCount) || !integer(row.mappedLineCount) ||
          !integer(row.unmappedLineCount) || !integer(row.invalidCreditLineCount) ||
          !integer(row.invoicesWithoutLines) ||
          row.mappedLineCount + row.unmappedLineCount !== row.invoiceLineCount) {
        return { ok: false, status: "ERROR", message: "يوجد صف عملة ناقص أو مكرر في تركّز الفواتير." };
      }
      const grossMinor = decimalToMinorUnits(row.grossInvoiceLineAmount, 2);
      const netMinor = row.netInvoiceLineAmount === null ? null : decimalToMinorUnits(row.netInvoiceLineAmount, 2) ?? undefined;
      const top5Minor = row.top5NetInvoiceLineAmount === null ? null : decimalToMinorUnits(row.top5NetInvoiceLineAmount, 2) ?? undefined;
      const percentMinor = row.top5ConcentrationPercent === null ? null : percentageToHundredths(row.top5ConcentrationPercent) ?? undefined;
      const expectedPercentMinor = netMinor !== null && netMinor !== undefined &&
        top5Minor !== null && top5Minor !== undefined && netMinor > 0n
        ? roundedPercentageHundredths(top5Minor, netMinor) : null;
      const gross = grossMinor === null ? null : minorUnitsToNumber(grossMinor, 2);
      const net = netMinor === null || netMinor === undefined ? null : minorUnitsToNumber(netMinor, 2);
      const top5 = top5Minor === null || top5Minor === undefined ? null : minorUnitsToNumber(top5Minor, 2);
      const percent = percentMinor === null || percentMinor === undefined ? null : Number(percentMinor) / 100;
      if (grossMinor === null || gross === null ||
          netMinor === undefined || net === undefined ||
          top5Minor === undefined || top5 === undefined ||
          percentMinor === undefined ||
          (row.status === "VERIFIED" &&
            (row.unmappedLineCount !== 0 || row.invalidCreditLineCount !== 0 || row.invoicesWithoutLines !== 0 ||
             row.invoiceLineCount === 0 || row.productCount === 0 || netMinor === null || netMinor <= 0n ||
             top5Minor === null || top5Minor > netMinor || percentMinor === null ||
             percentMinor !== expectedPercentMinor)) ||
          (row.status !== "VERIFIED" && (netMinor !== null || top5Minor !== null || percentMinor !== null))) {
        return { ok: false, status: "ERROR", message: "تركيز العملة يتضمن نسبة غير متوافقة مع تغطية سطور الفواتير." };
      }
      seenCurrencies.add(row.currency);
      currencies.push({
        currency: row.currency,
        status: row.status as ProductRevenueConcentrationCurrency["status"],
        invoiceCount: row.invoiceCount,
        invoiceLineCount: row.invoiceLineCount,
        productCount: row.productCount,
        mappedLineCount: row.mappedLineCount,
        unmappedLineCount: row.unmappedLineCount,
        invalidCreditLineCount: row.invalidCreditLineCount,
        invoicesWithoutLines: row.invoicesWithoutLines,
        grossInvoiceLineAmount: gross,
        netInvoiceLineAmount: net,
        top5NetInvoiceLineAmount: top5,
        top5ConcentrationPercent: percent,
      });
    }

    const completePopulation = currencies.every(item => item.status === "VERIFIED") &&
      raw.invoiceWithoutLinesCount === 0;
    const expectedStatus = raw.invoiceCount === 0 ? "EMPTY" :
      completePopulation ? "VERIFIED" : "PARTIAL";
    if (raw.completePopulation !== completePopulation || raw.status !== expectedStatus ||
        currencies.reduce((sum,item)=>sum+BigInt(item.invoiceCount),0n)!==BigInt(raw.invoiceCount) ||
        currencies.reduce((sum,item)=>sum+BigInt(item.invoicesWithoutLines),0n)!==BigInt(raw.invoiceWithoutLinesCount)) {
      return { ok: false, status: "ERROR", message: "تغطية الفواتير والعملات لا تتطابق مع المجاميع؛ لم تُعرض نسبة تركّز." };
    }
    return {
      ok: true,
      snapshot: {
        status: raw.status as ProductRevenueConcentrationSnapshot["status"],
        asOf: raw.asOf,
        period: { from: input.from, to: input.to },
        completePopulation,
        invoiceCount: raw.invoiceCount,
        invoiceWithoutLinesCount: raw.invoiceWithoutLinesCount,
        currencyCount: raw.currencyCount,
        currencies,
        formulaId: FORMULA_ID,
        formulaVersion: "1",
        formulaDescription: raw.formulaDescription,
      },
    };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بمصدر تركّز الفواتير." };
  }
}
