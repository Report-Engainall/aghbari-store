export type ProductActivityStatus =
  | "active_last_30_days"
  | "slow_moving_90_days"
  | "stagnant_over_90_days"
  | "never_sold";

export type StoreProductActivityRow = {
  product_id: string;
  item_code: string;
  product_name: string;
  unit: string;
  catalog_status: string;
  activity_status: ProductActivityStatus;
  sold_quantity_last_30_days: number;
  sold_quantity_last_90_days: number;
  last_sold_at: string | null;
  days_since_last_sale: number | null;
  available_quantity: number | null;
};

export type StoreProductActivityReport = {
  generated_at: string;
  recent_days: number;
  slow_days: number;
  total_products: number;
  returned_products: number;
  truncated: boolean;
  summary: {
    active_last_30_days: number;
    slow_moving_90_days: number;
    stagnant_over_90_days: number;
    never_sold: number;
    stock_unknown_count: number;
  };
  products: StoreProductActivityRow[];
};

export const PRODUCT_ACTIVITY_STATUS_LABELS: Record<ProductActivityStatus, string> = {
  active_last_30_days: "نشط حديثًا — آخر 30 يومًا",
  slow_moving_90_days: "بطيء الحركة — 31 إلى 90 يومًا",
  stagnant_over_90_days: "راكد — أكثر من 90 يومًا",
  never_sold: "لم يُبع سابقًا",
};

type RecordValue = Record<string, unknown>;

function record(value: unknown, label: string): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("استجابة تقرير حركة الأصناف غير صالحة: " + label + ".");
  }
  return value as RecordValue;
}

function textValue(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.trim() === "")) {
    throw new Error("استجابة تقرير حركة الأصناف تفتقد " + label + ".");
  }
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("قيمة غير صالحة في تقرير حركة الأصناف: " + label + ".");
  }
  return value;
}

function nonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 999999999999) {
    throw new Error("قيمة غير صالحة في تقرير حركة الأصناف: " + label + ".");
  }
  return value;
}

const VALID_STATUSES = new Set<ProductActivityStatus>([
  "active_last_30_days", "slow_moving_90_days", "stagnant_over_90_days", "never_sold",
]);

export function parseStoreProductActivityReport(value: unknown): StoreProductActivityReport {
  const root = record(value, "الجذر");
  const generatedAt = textValue(root.generated_at, "تاريخ الإنشاء");
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error("تاريخ إنشاء تقرير حركة الأصناف غير صالح.");
  const recentDays = nonNegativeInteger(root.recent_days, "نافذة النشاط");
  const slowDays = nonNegativeInteger(root.slow_days, "نافذة الركود");
  if (recentDays !== 30 || slowDays !== 90) throw new Error("نافذة تحليل حركة الأصناف لا تطابق العقد الحالي.");

  const totalProducts = nonNegativeInteger(root.total_products, "إجمالي الأصناف");
  const returnedProducts = nonNegativeInteger(root.returned_products, "عدد الصفوف");
  if (returnedProducts > 5000 || returnedProducts > totalProducts) throw new Error("عدد صفوف تقرير حركة الأصناف خارج الحدود.");
  if (typeof root.truncated !== "boolean" || root.truncated !== (totalProducts > returnedProducts)) {
    throw new Error("علامة اكتمال تقرير حركة الأصناف غير متسقة.");
  }

  const s = record(root.summary, "الملخص");
  const summary = {
    active_last_30_days: nonNegativeInteger(s.active_last_30_days, "الأصناف النشطة حديثًا"),
    slow_moving_90_days: nonNegativeInteger(s.slow_moving_90_days, "الأصناف بطيئة الحركة"),
    stagnant_over_90_days: nonNegativeInteger(s.stagnant_over_90_days, "الأصناف الراكدة"),
    never_sold: nonNegativeInteger(s.never_sold, "الأصناف التي لم تبع"),
    stock_unknown_count: nonNegativeInteger(s.stock_unknown_count, "الأرصدة غير المتاحة"),
  };
  if (
    summary.active_last_30_days + summary.slow_moving_90_days +
      summary.stagnant_over_90_days + summary.never_sold !== totalProducts ||
    summary.stock_unknown_count > totalProducts
  ) throw new Error("ملخص تقرير حركة الأصناف لا يتطابق مع إجمالي المؤسسة.");

  if (!Array.isArray(root.products)) throw new Error("قائمة الأصناف في التقرير غير صالحة.");
  const products: StoreProductActivityRow[] = root.products.map((raw, index) => {
    const row = record(raw, "الصنف " + (index + 1));
    const status = textValue(row.activity_status, "حالة حركة الصنف");
    if (!VALID_STATUSES.has(status as ProductActivityStatus)) throw new Error("حالة حركة صنف غير معروفة في التقرير.");
    const lastSoldAt = row.last_sold_at === null ? null : textValue(row.last_sold_at, "تاريخ آخر بيع");
    if (lastSoldAt !== null && !Number.isFinite(Date.parse(lastSoldAt))) throw new Error("تاريخ آخر بيع في تقرير حركة الأصناف غير صالح.");
    const days = row.days_since_last_sale === null ? null : nonNegativeInteger(row.days_since_last_sale, "الأيام منذ آخر بيع");
    if ((status === "never_sold") !== (lastSoldAt === null) || (lastSoldAt === null) !== (days === null)) {
      throw new Error("تاريخ آخر بيع وتصنيف حركة الصنف غير متسقين.");
    }
    let available: number | null;
    if (row.available_quantity === null) available = null;
    else if (typeof row.available_quantity === "number" && Number.isFinite(row.available_quantity) && Math.abs(row.available_quantity) <= 999999999999) {
      available = row.available_quantity;
    } else throw new Error("رصيد المخزون في تقرير حركة الأصناف غير صالح.");
    return {
      product_id: textValue(row.product_id, "معرّف الصنف"),
      item_code: textValue(row.item_code, "كود الصنف", true),
      product_name: textValue(row.product_name, "اسم الصنف"),
      unit: textValue(row.unit, "وحدة الصنف", true),
      catalog_status: textValue(row.catalog_status, "حالة الكتالوج"),
      activity_status: status as ProductActivityStatus,
      sold_quantity_last_30_days: nonNegativeNumber(row.sold_quantity_last_30_days, "كمية 30 يومًا"),
      sold_quantity_last_90_days: nonNegativeNumber(row.sold_quantity_last_90_days, "كمية 90 يومًا"),
      last_sold_at: lastSoldAt,
      days_since_last_sale: days,
      available_quantity: available,
    };
  });
  if (returnedProducts !== products.length) throw new Error("عدد صفوف التقرير لا يطابق عدد الأصناف المعادة.");
  // A complete report must reconcile category and unknown-stock totals to the exact
  // rows that will be shown/exported. A truncated report deliberately contains only
  // a prefix of the rows, so its organization-wide summary must not be recomputed
  // from that partial slice.
  if (!root.truncated) {
    const observed = {
      active_last_30_days: products.filter((row) => row.activity_status === "active_last_30_days").length,
      slow_moving_90_days: products.filter((row) => row.activity_status === "slow_moving_90_days").length,
      stagnant_over_90_days: products.filter((row) => row.activity_status === "stagnant_over_90_days").length,
      never_sold: products.filter((row) => row.activity_status === "never_sold").length,
      stock_unknown_count: products.filter((row) => row.available_quantity === null).length,
    };
    if (
      observed.active_last_30_days !== summary.active_last_30_days ||
      observed.slow_moving_90_days !== summary.slow_moving_90_days ||
      observed.stagnant_over_90_days !== summary.stagnant_over_90_days ||
      observed.never_sold !== summary.never_sold ||
      observed.stock_unknown_count !== summary.stock_unknown_count
    ) {
      throw new Error("ملخص تقرير حركة الأصناف لا يتطابق مع الصفوف التفصيلية.");
    }
  }
  return { generated_at: generatedAt, recent_days: recentDays, slow_days: slowDays, total_products: totalProducts,
    returned_products: returnedProducts, truncated: root.truncated, summary, products };
}


export type ProductActivityRowsSort =
  | 'days_since_sale_desc'
  | 'sold_30_desc'
  | 'sold_30_asc'
  | 'name_asc'
  | 'stock_asc';

export type ProductActivityRowsPage<T> = {
  rows: T[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
  from: number;
  to: number;
};

/** Search and filter only the rows already authorized by the server report. */
export function filterProductActivityRows(
  rows: readonly StoreProductActivityRow[],
  status: ProductActivityStatus | 'all',
  search: string,
): StoreProductActivityRow[] {
  const needle = search.trim().toLocaleLowerCase('ar');
  return rows.filter((row) => {
    if (status !== 'all' && row.activity_status !== status) return false;
    if (!needle) return true;
    return [row.item_code, row.product_name, row.unit]
      .some((value) => value.toLocaleLowerCase('ar').includes(needle));
  });
}

type IndexedProductActivityRow = { row: StoreProductActivityRow; index: number };

function compareProductActivityRows(
  a: IndexedProductActivityRow,
  b: IndexedProductActivityRow,
  sort: ProductActivityRowsSort,
): number {
  switch (sort) {
    case 'days_since_sale_desc':
      return (b.row.days_since_last_sale ?? -1) - (a.row.days_since_last_sale ?? -1);
    case 'sold_30_desc':
      return b.row.sold_quantity_last_30_days - a.row.sold_quantity_last_30_days;
    case 'sold_30_asc':
      return a.row.sold_quantity_last_30_days - b.row.sold_quantity_last_30_days;
    case 'name_asc':
      return a.row.product_name.localeCompare(b.row.product_name, 'ar');
    case 'stock_asc': {
      const aUnknown = a.row.available_quantity === null;
      const bUnknown = b.row.available_quantity === null;
      if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
      return (a.row.available_quantity ?? 0) - (b.row.available_quantity ?? 0);
    }
  }
}

/** Deterministic sorting; unknown sale dates and stock stay last, never become zero. */
export function sortProductActivityRows(
  rows: readonly StoreProductActivityRow[],
  sort: ProductActivityRowsSort,
): StoreProductActivityRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compareProductActivityRows(a, b, sort) || a.index - b.index)
    .map(({ row }) => row);
}

/** Clamp the requested page so filtering/refetching cannot render an empty out-of-range page. */
export function paginateProductActivityRows<T>(
  rows: readonly T[],
  requestedPage: number,
  pageSize = 25,
): ProductActivityRowsPage<T> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 250) {
    throw new Error('حجم صفحة تقرير حركة الأصناف غير صالح.');
  }
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(totalPages, Math.max(1, requestedPage))
    : 1;
  const fromIndex = (page - 1) * pageSize;
  const pageRows = rows.slice(fromIndex, fromIndex + pageSize);
  return {
    rows: pageRows,
    page,
    pageSize,
    totalRows,
    totalPages,
    from: totalRows === 0 ? 0 : fromIndex + 1,
    to: fromIndex + pageRows.length,
  };
}
