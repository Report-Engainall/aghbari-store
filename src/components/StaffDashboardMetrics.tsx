import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/format";

type Metrics = {
  orders_total: number;
  orders_pending: number;
  orders_confirmed: number;
  orders_preparing: number;
  orders_ready: number;
  orders_completed: number;
  orders_cancelled: number;
  completed_sales: number;
  active_customers: number;
  active_products: number;
  available_stock: number | null;
  receivables_issued: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numericValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function countValue(value: unknown, label: string): number {
  const parsed = numericValue(value);
  if (parsed === null || !Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("تعذر التحقق من قيمة " + label + ".");
  }
  return parsed;
}

function metricValue(value: unknown, label: string): number {
  const parsed = numericValue(value);
  if (parsed === null || parsed < 0) throw new Error("تعذر التحقق من قيمة " + label + ".");
  return parsed;
}

function nullableMetric(value: unknown, label: string): number | null {
  if (value === null) return null;
  return metricValue(value, label);
}

function parseMetricsRow(value: unknown): Metrics {
  if (!isRecord(value)) throw new Error("استجابة مؤشرات الإدارة غير مكتملة.");
  return {
    orders_total: countValue(value.orders_total, "إجمالي الطلبات"),
    orders_pending: countValue(value.orders_pending, "الطلبات المعلقة"),
    orders_confirmed: countValue(value.orders_confirmed, "الطلبات المؤكدة"),
    orders_preparing: countValue(value.orders_preparing, "الطلبات قيد التجهيز"),
    orders_ready: countValue(value.orders_ready, "الطلبات الجاهزة"),
    orders_completed: countValue(value.orders_completed, "الطلبات المكتملة"),
    orders_cancelled: countValue(value.orders_cancelled, "الطلبات الملغاة"),
    completed_sales: metricValue(value.completed_sales, "المبيعات المكتملة"),
    active_customers: countValue(value.active_customers, "العملاء المعتمدون"),
    active_products: countValue(value.active_products, "الأصناف النشطة"),
    available_stock: nullableMetric(value.available_stock, "المخزون المتاح"),
    receivables_issued: nullableMetric(value.receivables_issued, "الذمم المستحقة"),
  };
}

function amountLabel(value: number | null): string {
  if (value === null) return "غير متاح";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stockLabel(value: number | null): string {
  if (value === null) return "غير متاح";
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
}

type CountKey = keyof Pick<Metrics,
  "orders_total" | "orders_pending" | "orders_confirmed" | "orders_preparing" |
  "orders_ready" | "orders_completed" | "orders_cancelled" | "active_customers" | "active_products">;

const COUNT_CARDS: { key: CountKey; label: string; hint: string }[] = [
  { key: "orders_total", label: "إجمالي الطلبات", hint: "كل الحالات المسجلة" },
  { key: "orders_pending", label: "طلبات معلقة", hint: "بانتظار التأكيد" },
  { key: "orders_confirmed", label: "طلبات مؤكدة", hint: "اعتمدها الموظف" },
  { key: "orders_preparing", label: "قيد التجهيز", hint: "تشمل حالة المعالجة" },
  { key: "orders_ready", label: "جاهزة أو مشحونة", hint: "بحسب حالة سير العمل" },
  { key: "orders_completed", label: "طلبات مكتملة", hint: "مسلمة للعميل" },
  { key: "orders_cancelled", label: "ملغاة أو مرفوضة", hint: "لا تدخل ضمن المبيعات المكتملة" },
  { key: "active_customers", label: "العملاء المعتمدون", hint: "حسابات مقبولة في المؤسسة" },
  { key: "active_products", label: "الأصناف النشطة", hint: "من سجل المؤسسة الحالية" },
];

export function StaffDashboardMetrics() {
  const { user, ready } = useAuth();
  const canRead = Boolean(ready && user?.roles.some((role) =>
    ["admin", "manager", "staff", "accountant"].includes(role)));
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError("");
    try {
      const result = await supabase.rpc("get_staff_dashboard_metrics");
      if (result.error) throw new Error("تعذر تحميل مؤشرات الإدارة من قاعدة البيانات.");
      if (!Array.isArray(result.data) || result.data.length !== 1) {
        throw new Error("عدد سجلات مؤشرات الإدارة غير متوقع.");
      }
      setMetrics(parseMetricsRow(result.data[0]));
    } catch (cause) {
      setMetrics(null);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل مؤشرات الإدارة.");
    } finally {
      setLoading(false);
    }
  }, [canRead]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  if (!canRead) return null;

  return (
    <section className="panel" aria-label="مؤشرات الطلبات والمخزون والذمم" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h2>مؤشرات التشغيل والتحصيل</h2>
          <p>قراءة مباشرة من بيانات المؤسسة؛ القيم غير القابلة للجمع لا تتحول إلى صفر.</p>
        </div>
        <button className="btn secondary" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          <RefreshCw size={16} /> {loading ? "جارٍ التحديث..." : "تحديث المؤشرات"}
        </button>
      </div>

      {loading && !metrics ? <p role="status">جارٍ تحميل المؤشرات...</p> : null}
      {error ? <p role="alert" className="report-note">{error}</p> : null}
      {metrics && !error ? (
        <>
          <div className="report-grid">
            {COUNT_CARDS.map((card) => (
              <article className="report-metric" key={card.key}>
                <span>{card.label}</span>
                <strong>{formatNumber(metrics[card.key])}</strong>
                <small>{card.hint}</small>
              </article>
            ))}
            <article className="report-metric">
              <span>المبيعات المكتملة</span>
              <strong>{amountLabel(metrics.completed_sales)}</strong>
              <small>بعملة المؤسسة؛ الطلبات المسلمة فقط</small>
            </article>
            <article className="report-metric">
              <span>المخزون المتاح</span>
              <strong>{stockLabel(metrics.available_stock)}</strong>
              <small>{metrics.available_stock === null ? "توجد تغطية مخزون ناقصة أو وحدات غير متجانسة؛ راجع بطاقة المخزون" : "مجموع الكميات بوحدة قياس متجانسة"}</small>
            </article>
            <article className="report-metric">
              <span>الذمم المستحقة</span>
              <strong>{amountLabel(metrics.receivables_issued)}</strong>
              <small>{metrics.receivables_issued === null ? "توجد أرصدة بعملات مختلفة؛ راجع الذمم حسب العملة" : "الفواتير ناقص المدفوعات المسجلة، بعملة واحدة"}</small>
            </article>
          </div>
          <p className="report-note" style={{ marginTop: 12 }}>
            تستخدم هذه اللوحة دفتر الطلبات والمؤشرات الخادمية ودفتر الفواتير والمدفوعات؛ لا تنشئ حساب خزينة أو رصيدًا نقديًا منفصلًا عن دفتر الأستاذ.
          </p>
        </>
      ) : null}
    </section>
  );
}
