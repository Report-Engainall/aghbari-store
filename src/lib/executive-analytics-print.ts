import type { StoreExecutiveAnalytics } from "@/lib/executive-analytics";
import { buildSalesForecast, type SalesForecastResult } from "@/lib/sales-forecast";

export type ExecutiveAnalyticsPrintKpi = {
  key: string;
  label: string;
  value: number;
  format: "currency" | "number";
};

export type ExecutiveAnalyticsPrintForecast =
  | {
      ready: true;
      expectedTotal: number;
      dailyBaseline: number;
      lowerScenario: number;
      upperScenario: number;
      meanAbsoluteError: number;
      lastHistoricalDay: string;
      days: Array<{ day: string; expectedSales: number }>;
    }
  | {
      ready: false;
      reason: string;
      availableDays: number;
    };

export type ExecutiveAnalyticsPrintDocument = {
  generatedAt: string;
  kpis: ExecutiveAnalyticsPrintKpi[];
  salesTrend: Array<{ day: string; orders: number; sales: number }>;
  topProducts: Array<{ itemCode: string | null; productName: string; quantity: number; sales: number }>;
  topCustomers: Array<{ customerName: string; orderCount: number; sales: number }>;
  forecast: ExecutiveAnalyticsPrintForecast;
};

function requireNonNegative(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("تعذر تجهيز الطباعة بسبب قيمة غير صالحة: " + label + ".");
  }
  return value;
}

function requireCount(value: number, label: string): number {
  const number = requireNonNegative(value, label);
  if (!Number.isSafeInteger(number)) {
    throw new Error("تعذر تجهيز الطباعة بسبب عدد غير صحيح: " + label + ".");
  }
  return number;
}

function requireText(value: string, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("تعذر تجهيز الطباعة بسبب نص مفقود: " + label + ".");
  }
  return value.trim();
}

function requireIsoDay(value: string, label: string): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value + "T00:00:00.000Z")) ||
    new Date(value + "T00:00:00.000Z").toISOString().slice(0, 10) !== value
  ) {
    throw new Error("تعذر تجهيز الطباعة بسبب تاريخ غير صالح: " + label + ".");
  }
  return value;
}

function projectForecast(forecast: SalesForecastResult): ExecutiveAnalyticsPrintForecast {
  if (!forecast.ready) {
    return {
      ready: false,
      reason: forecast.reason,
      availableDays: requireCount(forecast.availableDays, "الأيام الصالحة للتقدير"),
    };
  }
  return {
    ready: true,
    expectedTotal: requireNonNegative(forecast.expectedTotal, "التقدير الأساسي"),
    dailyBaseline: requireNonNegative(forecast.dailyBaseline, "المتوسط اليومي"),
    lowerScenario: requireNonNegative(forecast.lowerScenario, "السيناريو الأقل"),
    upperScenario: requireNonNegative(forecast.upperScenario, "السيناريو الأعلى"),
    meanAbsoluteError: requireNonNegative(forecast.meanAbsoluteError, "متوسط الخطأ"),
    lastHistoricalDay: requireIsoDay(forecast.lastHistoricalDay, "آخر يوم تاريخي"),
    days: forecast.days.map((day) => ({
      day: requireIsoDay(day.day, "يوم التقدير"),
      expectedSales: requireNonNegative(day.expectedSales, "قيمة يوم التقدير"),
    })),
  };
}

/**
 * Explicit printable allowlist. Raw analytics records and customer identifiers
 * never cross this projection boundary.
 */
export function projectExecutiveAnalyticsPrintDocument(
  source: StoreExecutiveAnalytics,
): ExecutiveAnalyticsPrintDocument {
  if (!Number.isFinite(Date.parse(source.generated_at))) {
    throw new Error("تاريخ إنشاء التحليل التنفيذي غير صالح للطباعة.");
  }

  const kpis: ExecutiveAnalyticsPrintKpi[] = [
    { key: "eligible_sales", label: "المبيعات المؤهلة غير الملغاة", value: requireNonNegative(source.kpis.eligible_sales, "المبيعات المؤهلة"), format: "currency" },
    { key: "sales_last_30_days", label: "مبيعات آخر 30 يومًا", value: requireNonNegative(source.kpis.sales_last_30_days, "مبيعات آخر 30 يومًا"), format: "currency" },
    { key: "orders_last_30_days", label: "طلبات آخر 30 يومًا", value: requireCount(source.kpis.orders_last_30_days, "طلبات آخر 30 يومًا"), format: "number" },
    { key: "customers_last_30_days", label: "العملاء ذوو الطلبات الحديثة", value: requireCount(source.kpis.customers_last_30_days, "العملاء ذوو الطلبات الحديثة"), format: "number" },
    { key: "active_products", label: "الأصناف النشطة", value: requireCount(source.kpis.active_products, "الأصناف النشطة"), format: "number" },
    { key: "pending_orders", label: "طلبات قيد المعالجة", value: requireCount(source.kpis.pending_orders, "طلبات قيد المعالجة"), format: "number" },
    { key: "total_orders", label: "إجمالي الطلبات — كل الحالات", value: requireCount(source.kpis.total_orders, "إجمالي الطلبات"), format: "number" },
  ];

  const salesTrend = source.sales_trend.map((day) => ({
    day: requireIsoDay(day.day, "تاريخ اتجاه المبيعات"),
    orders: requireCount(day.orders, "عدد الطلبات اليومية"),
    sales: requireNonNegative(day.sales, "المبيعات اليومية"),
  }));

  const topProducts = source.top_products.map((product) => ({
    itemCode: typeof product.item_code === "string" && product.item_code.trim() ? product.item_code.trim() : null,
    productName: requireText(product.product_name, "اسم الصنف"),
    quantity: requireNonNegative(product.quantity, "كمية الصنف"),
    sales: requireNonNegative(product.sales, "مبيعات الصنف"),
  }));

  const topCustomers = source.top_customers.map((customer) => ({
    customerName: requireText(customer.customer_name, "اسم العميل"),
    orderCount: requireCount(customer.order_count, "عدد طلبات العميل"),
    sales: requireNonNegative(customer.sales, "مبيعات العميل"),
  }));

  return {
    generatedAt: source.generated_at,
    kpis,
    salesTrend,
    topProducts,
    topCustomers,
    forecast: projectForecast(buildSalesForecast(source.sales_trend)),
  };
}
