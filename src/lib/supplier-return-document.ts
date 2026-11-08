import type { SupplierReturn } from "@/lib/supplier-returns";

export type SupplierReturnDocumentLine = {
  itemCode: string;
  productName: string;
  unit: string | null;
  sourceReceivedQuantity: number;
  quantityReturned: number;
  unitCost: number | null;
  lineTotal: number | null;
};

export type SupplierReturnDocument = {
  returnNumber: string;
  sourceReceiptNumber: string;
  purchaseOrderNumber: string;
  supplierName: string;
  warehouseName: string;
  currency: string;
  status: "draft" | "posted";
  statusLabel: string;
  reason: string;
  createdAt: string;
  postedAt: string | null;
  generatedAt: string;
  costsComplete: boolean;
  totalCost: number | null;
  items: SupplierReturnDocumentLine[];
};

function requiredText(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("تعذر إنشاء مستند المرتجع: حقل " + label + " غير صالح.");
  }
  return value.trim();
}

function validDate(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error("تعذر إنشاء مستند المرتجع: تاريخ " + label + " غير صالح.");
  }
  return new Date(value).toISOString();
}

function nullableDate(value: unknown, label: string): string | null {
  return value === null ? null : validDate(value, label);
}

function cents(value: unknown): bigint | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
      value > Number.MAX_SAFE_INTEGER / 100) return null;
  return BigInt(Math.round(value * 100));
}

function validQuantity(value: unknown, label: string, allowZero = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) ||
      value < (allowZero ? 0 : 0.001) || value > 999999999999.999 ||
      Math.round(value * 1000) !== value * 1000) {
    throw new Error("تعذر إنشاء مستند المرتجع: كمية " + label + " غير صالحة.");
  }
  return value;
}

/**
 * Projects one saved, manager-visible supplier return. Cost fields are all-or-nothing:
 * incomplete or unreconciled source cost is withheld rather than shown as zero.
 */
export function projectSupplierReturnDocument(
  source: SupplierReturn,
  generatedAt = new Date().toISOString(),
): SupplierReturnDocument {
  if (!source || (source.status !== "draft" && source.status !== "posted") ||
      !Array.isArray(source.items) || source.items.length === 0 || source.items.length > 1000) {
    throw new Error("سجل مرتجع المورد غير مكتمل؛ أوقف إنشاء المستند.");
  }
  if (!/^[A-Z]{3}$/.test(source.currency)) {
    throw new Error("عملة المرتجع غير صالحة؛ أوقف إنشاء المستند.");
  }

  const seen = new Set<string>();
  let allCostsAvailable = source.totalCost !== null;
  let lineCostTotal = 0n;
  const items = source.items.map((item) => {
    const identity = requiredText(item.id, "بند المرتجع", 80);
    if (seen.has(identity)) throw new Error("يوجد بند مرتجع مكرر؛ أوقف إنشاء المستند.");
    seen.add(identity);

    const sourceReceivedQuantity = validQuantity(item.sourceReceivedQuantity, "المستلمة من المصدر");
    const quantityReturned = validQuantity(item.quantityReturned, "المرتجعة");
    if (quantityReturned > sourceReceivedQuantity) {
      throw new Error("كمية المرتجع تتجاوز كمية المصدر؛ أوقف إنشاء المستند.");
    }

    const unitCostCents = item.unitCost === null ? null : cents(item.unitCost);
    const lineTotalCents = item.lineTotal === null ? null : cents(item.lineTotal);
    if (unitCostCents === null || lineTotalCents === null) {
      allCostsAvailable = false;
    } else {
      const expectedLineCents = BigInt(Math.round(Number(quantityReturned.toFixed(3)) * 1000)) *
        unitCostCents / 1000n;
      const difference = expectedLineCents > lineTotalCents
        ? expectedLineCents - lineTotalCents : lineTotalCents - expectedLineCents;
      if (difference > 1n) allCostsAvailable = false;
      lineCostTotal += lineTotalCents;
    }

    return {
      itemCode: requiredText(item.itemCode, "رمز الصنف", 120),
      productName: requiredText(item.productName, "اسم الصنف", 300),
      unit: item.unit === null ? null : requiredText(item.unit, "وحدة الصنف", 80),
      sourceReceivedQuantity,
      quantityReturned,
      unitCost: unitCostCents === null ? null : Number(unitCostCents) / 100,
      lineTotal: lineTotalCents === null ? null : Number(lineTotalCents) / 100,
    };
  });

  const totalCostCents = source.totalCost === null ? null : cents(source.totalCost);
  if (totalCostCents === null || totalCostCents !== lineCostTotal) allCostsAvailable = false;
  if (!allCostsAvailable) {
    for (const item of items) {
      item.unitCost = null;
      item.lineTotal = null;
    }
  }

  return {
    returnNumber: requiredText(source.returnNumber, "رقم المرتجع", 120),
    sourceReceiptNumber: requiredText(source.sourceReceiptNumber, "رقم إيصال المصدر", 120),
    purchaseOrderNumber: requiredText(source.purchaseOrderNumber, "رقم أمر الشراء", 120),
    supplierName: requiredText(source.supplierName, "اسم المورد", 300),
    warehouseName: requiredText(source.warehouseName, "اسم المخزن", 300),
    currency: source.currency,
    status: source.status,
    statusLabel: source.status === "posted" ? "مُرحّل للمخزون" : "مسودة غير مُرحّلة",
    reason: requiredText(source.reason, "سبب المرتجع", 1000),
    createdAt: validDate(source.createdAt, "إنشاء المرتجع"),
    postedAt: nullableDate(source.postedAt, "ترحيل المرتجع"),
    generatedAt: validDate(generatedAt, "إنشاء المستند"),
    costsComplete: allCostsAvailable,
    totalCost: allCostsAvailable && totalCostCents !== null ? Number(totalCostCents) / 100 : null,
    items,
  };
}
