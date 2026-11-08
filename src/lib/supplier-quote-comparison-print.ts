import type { SupplierQuote, SupplierQuoteLine } from "@/lib/supplier-quotes";

export type SupplierQuoteComparisonDocument = {
  generatedAt: string;
  quoteCount: number;
  lineCount: number;
  currencies: string[];
  offers: Array<{
    supplierName: string;
    supplierCode: string;
    quoteNumber: string;
    supplierReference: string | null;
    currency: string;
    status: SupplierQuote["status"];
    statusLabel: string;
    validUntil: string | null;
    deliveryDays: number | null;
    paymentTerms: string | null;
    createdAt: string;
    lineCount: number;
    total: number;
  }>;
  products: Array<{
    productName: string;
    itemCode: string;
    unit: string | null;
    currency: string;
    receivedOfferCount: number;
    lowestUnitCost: number | null;
    lowestSupplierName: string | null;
    lowestQuoteNumber: string | null;
    lowestDeliveryDays: number | null;
  }>;
  lines: Array<{
    supplierName: string;
    quoteNumber: string;
    productName: string;
    itemCode: string;
    unit: string | null;
    quantity: number;
    unitCost: number;
    lineTotal: number;
    currency: string;
    statusLabel: string;
    isLowestComparableCost: boolean;
  }>;
};

const statusLabels: Record<SupplierQuote["status"], string> = {
  received: "مستلم — قابل للمقارنة",
  awarded: "تمت الترسية — مرتبط بمسار أمر شراء",
  expired: "منتهي الصلاحية",
};

function text(value: string, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("حقل " + label + " غير صالح في مقارنة عروض الموردين.");
  }
  return value.trim();
}
function optionalText(value: string | null, label: string, max = 1000): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > max) {
    throw new Error("حقل " + label + " غير صالح في مقارنة عروض الموردين.");
  }
  return value.trim() || null;
}
function date(value: string, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("تاريخ " + label + " غير صالح في مقارنة عروض الموردين.");
  }
  return new Date(value).toISOString();
}
function optionalDate(value: string | null, label: string): string | null {
  return value === null ? null : date(value, label);
}
function finiteAmount(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 9999999999999.99) {
    throw new Error("مبلغ " + label + " غير صالح في مقارنة عروض الموردين.");
  }
  return value;
}
function currency(value: string): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    throw new Error("عملة عرض المورد غير صالحة.");
  }
  return value;
}
function status(value: string): value is SupplierQuote["status"] {
  return value === "received" || value === "awarded" || value === "expired";
}
function line(row: SupplierQuoteLine, quoteCurrency: string, quoteId: string, index: number) {
  const productId = text(row.product_id, "مرجع الصنف", 64);
  const lineId = text(row.id, "مرجع بند العرض", 64);
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(productId) || !uuidPattern.test(lineId)) {
    throw new Error("مرجع داخلي غير صالح في بند عرض المورد.");
  }
  const quantity = finiteAmount(row.quantity_quoted, "الكمية");
  const unitCost = finiteAmount(row.unit_cost, "تكلفة الوحدة");
  const lineTotal = finiteAmount(row.line_total, "إجمالي البند");
  if (quantity <= 0 || Math.round(quantity * 1000) !== quantity * 1000) {
    throw new Error("كمية عرض المورد يجب أن تكون موجبة وبحد أقصى ثلاث منازل عشرية.");
  }
  const expected = Math.round(quantity * unitCost * 100) / 100;
  if (Math.abs(expected - lineTotal) > 0.011) {
    throw new Error("إجمالي بند عرض المورد لا يطابق الكمية وتكلفة الوحدة.");
  }
  return {
    quoteId,
    productId,
    lineId,
    index,
    productName: text(row.product_name, "اسم الصنف", 240),
    itemCode: text(row.item_code, "رمز الصنف", 80),
    unit: optionalText(row.unit, "وحدة الصنف", 80),
    quantity,
    unitCost,
    lineTotal,
    currency: currency(quoteCurrency),
  };
}

/** Projects only business comparison fields; internal UUIDs and quote notes never enter the output. */
export function projectSupplierQuoteComparisonDocument(
  quotes: SupplierQuote[],
  generatedAt = new Date().toISOString(),
): SupplierQuoteComparisonDocument {
  if (!Array.isArray(quotes) || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("لقطة عروض الموردين غير مكتملة؛ أوقف إنشاء التقرير.");
  }
  const seenQuotes = new Set<string>();
  const currencies = new Set<string>();
  const products = new Map<string, {
    productName: string;
    itemCode: string;
    unit: string | null;
    currency: string;
    receivedOfferCount: number;
    lowestUnitCost: number | null;
    lowestSupplierName: string | null;
    lowestQuoteNumber: string | null;
    lowestDeliveryDays: number | null;
  }>();
  const rawLines: Array<{
    quoteId: string;
    productId: string;
    lineId: string;
    index: number;
    productName: string;
    itemCode: string;
    unit: string | null;
    quantity: number;
    unitCost: number;
    lineTotal: number;
    currency: string;
    supplierName: string;
    quoteNumber: string;
    status: SupplierQuote["status"];
    deliveryDays: number | null;
  }> = [];
  const offers = quotes.map((quote) => {
    const quoteId = text(quote.id, "مرجع العرض", 64);
    if (!/^[0-9a-f-]{36}$/i.test(quoteId) || seenQuotes.has(quoteId)) {
      throw new Error("مرجع عرض مكرر أو غير صالح؛ أوقف إنشاء التقرير.");
    }
    seenQuotes.add(quoteId);
    if (!status(quote.status)) throw new Error("حالة عرض مورد غير معروفة.");
    const quoteCurrency = currency(quote.currency);
    currencies.add(quoteCurrency);
    const supplierName = text(quote.supplier_name, "اسم المورد", 240);
    const supplierCode = optionalText(quote.supplier_code, "رمز المورد", 80) ?? "";
    const quoteNumber = text(quote.quote_number, "رقم العرض", 80);
    const createdAt = date(quote.created_at, "تسجيل العرض");
    const validUntil = optionalDate(quote.valid_until, "صلاحية العرض");
    if (!Array.isArray(quote.items) || quote.items.length > 100) {
      throw new Error("عدد بنود عرض المورد خارج النطاق المسموح.");
    }
    const quoteLines = quote.items.map((item, index) => line(item, quoteCurrency, quoteId, index));
    for (const row of quoteLines) {
      rawLines.push({
        ...row,
        supplierName,
        quoteNumber,
        status: quote.status,
        deliveryDays: quote.delivery_days,
      });
      const key = row.productId + ":" + quoteCurrency;
      const current = products.get(key) ?? {
        productName: row.productName,
        itemCode: row.itemCode,
        unit: row.unit,
        currency: quoteCurrency,
        receivedOfferCount: 0,
        lowestUnitCost: null,
        lowestSupplierName: null,
        lowestQuoteNumber: null,
        lowestDeliveryDays: null,
      };
      if (current.productName !== row.productName || current.itemCode !== row.itemCode || current.unit !== row.unit) {
        throw new Error("تعارض اسم أو رمز أو وحدة الصنف بين عروض الموردين.");
      }
      if (quote.status === "received") {
        current.receivedOfferCount += 1;
        if (current.lowestUnitCost === null || row.unitCost < current.lowestUnitCost) {
          current.lowestUnitCost = row.unitCost;
          current.lowestSupplierName = supplierName;
          current.lowestQuoteNumber = quoteNumber;
          current.lowestDeliveryDays = quote.delivery_days;
        }
      }
      products.set(key, current);
    }
    const total = quoteLines.reduce((sum, row) => sum + row.lineTotal, 0);
    if (!Number.isFinite(total)) throw new Error("إجمالي عرض المورد خارج النطاق.");
    return {
      supplierName,
      supplierCode,
      quoteNumber,
      supplierReference: optionalText(quote.supplier_reference, "مرجع المورد", 120),
      currency: quoteCurrency,
      status: quote.status,
      statusLabel: statusLabels[quote.status],
      validUntil,
      deliveryDays: quote.delivery_days,
      paymentTerms: optionalText(quote.payment_terms, "شروط الدفع", 1000),
      createdAt,
      lineCount: quoteLines.length,
      total: Math.round(total * 100) / 100,
    };
  });
  const productRows = [...products.values()].sort((a, b) =>
    a.productName.localeCompare(b.productName, "ar") || a.currency.localeCompare(b.currency),
  );
  const lines = rawLines.map((row) => {
    const product = products.get(row.productId + ":" + row.currency);
    return {
      supplierName: row.supplierName,
      quoteNumber: row.quoteNumber,
      productName: row.productName,
      itemCode: row.itemCode,
      unit: row.unit,
      quantity: row.quantity,
      unitCost: row.unitCost,
      lineTotal: row.lineTotal,
      currency: row.currency,
      statusLabel: statusLabels[row.status],
      isLowestComparableCost: row.status === "received" && product?.lowestUnitCost === row.unitCost,
    };
  });
  return {
    generatedAt: new Date(generatedAt).toISOString(),
    quoteCount: offers.length,
    lineCount: lines.length,
    currencies: [...currencies].sort(),
    offers,
    products: productRows,
    lines,
  };
}
