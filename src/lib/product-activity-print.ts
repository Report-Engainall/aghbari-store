import type { StoreProductActivityReport } from "@/lib/product-activity-report";

export type ProductActivityPrintDocument = {
  generatedAt: string;
  recentDays: number;
  slowDays: number;
  totalProducts: number;
  returnedProducts: number;
  summary: {
    activeLast30Days: number;
    slowMoving90Days: number;
    stagnantOver90Days: number;
    neverSold: number;
    stockUnknownCount: number;
  };
  products: Array<{
    itemCode: string | null;
    productName: string;
    unit: string;
    catalogStatus: string;
    activityStatus: "active_last_30_days" | "slow_moving_90_days" | "stagnant_over_90_days" | "never_sold";
    soldQuantityLast30Days: number;
    soldQuantityLast90Days: number;
    lastSoldAt: string | null;
    daysSinceLastSale: number | null;
    availableQuantity: number | null;
  }>;
};

function safeCount(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("تعذر تجهيز التقرير للطباعة بسبب عدد غير صالح: " + label + ".");
  }
  return value;
}
function safeQuantity(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999999999999) {
    throw new Error("تعذر تجهيز التقرير للطباعة بسبب كمية غير صالحة: " + label + ".");
  }
  return value;
}
function validDate(value: string | null, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("تعذر تجهيز التقرير للطباعة بسبب تاريخ غير صالح: " + label + ".");
  }
  return value;
}
function requiredText(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("تعذر تجهيز التقرير للطباعة بسبب نص مفقود: " + label + ".");
  }
  return value.trim();
}

/**
 * A print-only allowlist. The product UUID and all unknown/raw fields are omitted.
 * Rows are taken from the complete server report, never the filtered/paginated UI view.
 */
export function projectProductActivityPrintDocument(
  source: StoreProductActivityReport,
): ProductActivityPrintDocument {
  if (!Number.isFinite(Date.parse(source.generated_at))) {
    throw new Error("تاريخ إنشاء تقرير حركة الأصناف غير صالح للطباعة.");
  }
  const recentDays = safeCount(source.recent_days, "نافذة النشاط");
  const slowDays = safeCount(source.slow_days, "حد الركود");
  const totalProducts = safeCount(source.total_products, "إجمالي أصناف المؤسسة");
  const returnedProducts = safeCount(source.returned_products, "عدد الصفوف المعادة");
  if (recentDays !== 30 || slowDays !== 90) {
    throw new Error("نافذة تقرير حركة الأصناف لا تطابق حدود التحليل المعتمدة.");
  }
  if (totalProducts > 5000 || returnedProducts > 5000) {
    throw new Error("لا يمكن طباعة أكثر من 5000 صنف في تقرير واحد.");
  }
  if (source.truncated) {
    throw new Error("لا يمكن طباعة تقرير جزئي على أنه تقرير كامل؛ تجاوز التقرير حد الصفوف.");
  }
  if (totalProducts !== returnedProducts || source.products.length !== returnedProducts) {
    throw new Error("تقرير حركة الأصناف غير مكتمل ولا يمكن طباعته كتقرير كامل.");
  }

  const summary = {
    activeLast30Days: safeCount(source.summary.active_last_30_days, "الأصناف النشطة"),
    slowMoving90Days: safeCount(source.summary.slow_moving_90_days, "الأصناف بطيئة الحركة"),
    stagnantOver90Days: safeCount(source.summary.stagnant_over_90_days, "الأصناف الراكدة"),
    neverSold: safeCount(source.summary.never_sold, "الأصناف التي لم تبع"),
    stockUnknownCount: safeCount(source.summary.stock_unknown_count, "الأرصدة غير المتاحة"),
  };
  if (
    summary.activeLast30Days + summary.slowMoving90Days +
      summary.stagnantOver90Days + summary.neverSold !== totalProducts
  ) {
    throw new Error("ملخص تقرير حركة الأصناف لا يطابق عدد الأصناف الكامل.");
  }

  const products = source.products.map((row) => ({
    itemCode: row.item_code.trim() || null,
    productName: requiredText(row.product_name, "اسم الصنف"),
    unit: row.unit.trim(),
    catalogStatus: requiredText(row.catalog_status, "حالة الكتالوج"),
    activityStatus: row.activity_status,
    soldQuantityLast30Days: safeQuantity(row.sold_quantity_last_30_days, "كمية 30 يومًا"),
    soldQuantityLast90Days: safeQuantity(row.sold_quantity_last_90_days, "كمية 90 يومًا"),
    lastSoldAt: validDate(row.last_sold_at, "آخر بيع"),
    daysSinceLastSale: row.days_since_last_sale === null ? null : safeCount(row.days_since_last_sale, "الأيام منذ آخر بيع"),
    availableQuantity: row.available_quantity === null
      ? null
      : (() => {
          if (typeof row.available_quantity !== "number" || !Number.isFinite(row.available_quantity) || Math.abs(row.available_quantity) > 999999999999) {
            throw new Error("رصيد المخزون غير صالح في تقرير الطباعة.");
          }
          return row.available_quantity;
        })(),
  }));
  const unknownStockRows = products.filter((row) => row.availableQuantity === null).length;
  if (unknownStockRows !== summary.stockUnknownCount) {
    throw new Error("عدد الأرصدة غير المتاحة لا يطابق الصفوف المطبوعة.");
  }

  return {
    generatedAt: source.generated_at,
    recentDays,
    slowDays,
    totalProducts,
    returnedProducts,
    summary,
    products,
  };
}
