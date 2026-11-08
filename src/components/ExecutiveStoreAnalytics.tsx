import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, FileSpreadsheet, Package, Printer, RefreshCw, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { Empty, ErrorBox, Loading } from '@/components/AdminPages';
import { fetchStoreExecutiveAnalytics, fetchStoreProductActivityReport } from '@/lib/api';
import { StaffDashboardMetrics } from '@/components/StaffDashboardMetrics';
import { buildSalesForecast, calculateWhatIfSales } from '@/lib/sales-forecast';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/format';
import { PRODUCT_ACTIVITY_STATUS_LABELS, filterProductActivityRows, paginateProductActivityRows, sortProductActivityRows, type ProductActivityStatus, type ProductActivityRowsSort, type StoreProductActivityReport } from '@/lib/product-activity-report';
import { downloadProductActivityWorkbookXlsx } from '@/lib/product-activity-xlsx';
import { projectProductActivityPrintDocument } from '@/lib/product-activity-print';
import { ProductActivityPrintSheet } from '@/components/ProductActivityPrintSheet';
import { downloadExecutiveAnalyticsWorkbookXlsx } from '@/lib/executive-analytics-xlsx';
import { projectExecutiveAnalyticsPrintDocument } from '@/lib/executive-analytics-print';
import { ExecutiveAnalyticsPrintSheet } from '@/components/ExecutiveAnalyticsPrintSheet';
import { useFetch } from '@/lib/useFetch';

function SalesForecastPanel({ points }: { points: ReadonlyArray<{ day: string; orders: number; sales: number }> }) {
  const [changePercent, setChangePercent] = useState('0');
  const forecast = buildSalesForecast(points);

  if (!forecast.ready) {
    const reason = forecast.reason === 'insufficient_history'
      ? 'يلزم 21 يومًا متتاليًا على الأقل قبل إظهار تقدير قابل للاختبار.'
      : forecast.reason === 'missing_days'
        ? 'توجد فجوات في تواريخ المصدر. لم تُحوّل الأيام المفقودة إلى مبيعات صفرية.'
        : 'توجد تواريخ أو قيم مبيعات غير صالحة؛ أُوقف التقدير بدل تخمين القيم.';
    return (
      <section className="panel" style={{ marginTop: 16 }} aria-live="polite">
        <div className="panel-head">
          <div>
            <h3>التقدير التنبؤي للمبيعات</h3>
            <p>لا يُعرض التقدير إلا بعد فحص اكتمال السلسلة التاريخية وصلاحية مبالغها.</p>
          </div>
          <TrendingUp size={20} />
        </div>
        <p className="report-note">{reason} الأيام الصالحة المتاحة: {forecast.availableDays}.</p>
      </section>
    );
  }

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h3>التقدير التنبؤي للمبيعات — 7 أيام</h3>
          <p>خط أساس حتمي من متوسط آخر 7 أيام، بعد اختباره على 7 أيام تاريخية سابقة.</p>
        </div>
        <TrendingUp size={20} />
      </div>
      <div className="report-grid">
        <article className="report-metric">
          <span>التقدير الأساسي للفترة</span>
          <strong>{formatCurrency(forecast.expectedTotal)}</strong>
          <small>متوسط يومي: {formatCurrency(forecast.dailyBaseline)}</small>
        </article>
        <article className="report-metric">
          <span>سيناريو تخطيطي أقل</span>
          <strong>{formatCurrency(forecast.lowerScenario)}</strong>
          <small>الأساس مطروحًا منه خطأ الاختبار للفترة</small>
        </article>
        <article className="report-metric">
          <span>سيناريو تخطيطي أعلى</span>
          <strong>{formatCurrency(forecast.upperScenario)}</strong>
          <small>الأساس مضافًا إليه خطأ الاختبار للفترة</small>
        </article>
        <article className="report-metric">
          <span>متوسط الخطأ المطلق في الاختبار</span>
          <strong>{formatCurrency(forecast.meanAbsoluteError)}</strong>
          <small>لكل يوم من الأيام السبعة المختبرة</small>
        </article>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table>
          <thead><tr><th>اليوم المتوقع</th><th>تقدير المبيعات</th></tr></thead>
          <tbody>{forecast.days.map((day) => (
            <tr key={day.day}><td>{formatDateShort(day.day)}</td><td>{formatCurrency(day.expectedSales)}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <section aria-label="محاكاة سيناريو المبيعات" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--border, #d6dfe4)' }}>
        <h4>محاكاة «ماذا لو؟»</h4>
        <p className="report-note">أدخل نسبة افتراضية من اختيارك لتوضيح أثرها الحسابي على خط الأساس. هذه ليست توقعًا إضافيًا ولا تغيّر بيانات المتجر.</p>
        <label style={{ display: 'grid', gap: 6, maxWidth: 320, marginTop: 10 }}>
          <span>التغير الافتراضي في المبيعات (%) — من ‎-100 إلى ‎500</span>
          <input
            type="number"
            inputMode="decimal"
            min={-100}
            max={500}
            step={1}
            value={changePercent}
            onChange={(event) => setChangePercent(event.currentTarget.value)}
            aria-describedby="sales-what-if-help"
            style={{ minHeight: 40, padding: '8px 10px', border: '1px solid var(--border, #d6dfe4)', borderRadius: 8, maxWidth: 220 }}
          />
        </label>
        <p id="sales-what-if-help" className="report-note" style={{ marginTop: 8 }}>
          {calculateWhatIfSales(forecast.expectedTotal, changePercent.trim() === '' ? Number.NaN : Number(changePercent)) === null
            ? 'أدخل نسبة رقمية ضمن الحدود المحددة. لم يتم حساب سيناريو غير صالح.'
            : <>القيمة الحسابية الافتراضية للفترة: <strong>{formatCurrency(calculateWhatIfSales(forecast.expectedTotal, Number(changePercent)) as number)}</strong></>}
        </p>
      </section>
      <p className="report-note" style={{ marginTop: 12 }}>
        يغطي هذا التقدير الأيام السبعة التالية لآخر يوم متاح في المصدر ({formatDateShort(forecast.lastHistoricalDay)}).
        حُسب متوسط الخطأ بمقارنة كل يوم من آخر 7 أيام فعلية بمتوسط الأيام السبعة السابقة له.
        نطاق التخطيط هو الأساس ± (متوسط الخطأ × 7)، وليس نطاق ثقة إحصائيًا أو وعدًا بالإيراد.
        لا يغيّر التقدير الطلبات أو المخزون أو القيود المالية ولا يثبت سببًا تجاريًا.
      </p>
    </section>
  );
}


type ExecutiveAnalyticsData = Awaited<ReturnType<typeof fetchStoreExecutiveAnalytics>>;
type SalesTrendPoint = ExecutiveAnalyticsData["sales_trend"][number];
type TopProductRow = ExecutiveAnalyticsData["top_products"][number];
type TopCustomerRow = ExecutiveAnalyticsData["top_customers"][number];

function ExecutiveSalesTrendRow({ day, maximum }: { day: SalesTrendPoint; maximum: number }) {
  const width = Math.min(100, (day.sales / maximum) * 100);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "78px minmax(40px, 1fr) auto", alignItems: "center", gap: 8, paddingBlock: 5 }}>
      <small>{formatDateShort(day.day)}</small>
      <div aria-label={"مبيعات " + day.day} role="img" style={{ height: 8, background: "var(--muted, #e2e8f0)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ height: "100%", width: width + "%", background: "var(--primary, #0f766e)", borderRadius: 999 }} />
      </div>
      <span style={{ minWidth: 78, textAlign: "end", fontVariantNumeric: "tabular-nums" }}>{formatCurrency(day.sales)}</span>
    </div>
  );
}

function ExecutiveSalesTrendSection({
  days,
  maximum,
}: {
  days: SalesTrendPoint[];
  maximum: number;
}) {
  return (
    <section>
      <h3>اتجاه المبيعات — 30 يومًا</h3>
      <p className="report-note">المبالغ لا تشمل الطلبات الملغاة أو المرفوضة.</p>
      <div style={{ maxHeight: 320, overflowY: "auto", paddingInlineEnd: 4 }}>
        {days.map((day) => <ExecutiveSalesTrendRow key={day.day} day={day} maximum={maximum} />)}
      </div>
    </section>
  );
}

function ExecutiveTopProductRow({ product }: { product: TopProductRow }) {
  return (
    <tr>
      <td><strong>{product.product_name}</strong><small style={{ display: "block" }}>{product.item_code || "دون رمز صنف"}</small></td>
      <td>{formatNumber(product.quantity)}</td>
      <td>{formatCurrency(product.sales)}</td>
    </tr>
  );
}

function ExecutiveTopProductsTable({ products }: { products: TopProductRow[] }) {
  if (products.length === 0) return <Empty text="لا توجد بنود طلبات قابلة للترتيب." />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead><tr><th>الصنف</th><th>الكمية</th><th>المبيعات</th></tr></thead>
        <tbody>
          {products.map((product) => (
            <ExecutiveTopProductRow key={product.item_code + ":" + product.product_name} product={product} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExecutiveTopCustomersTable({ customers }: { customers: TopCustomerRow[] }) {
  if (customers.length === 0) return <Empty text="لا توجد طلبات مرتبطة بعملاء داخل المؤسسة." />;
  return (
    <div style={{ overflowX: "auto" }}>
      <table>
        <thead><tr><th>العميل</th><th>الطلبات</th><th>المبيعات</th></tr></thead>
        <tbody>
          {customers.map((customer) => (
            <tr key={customer.customer_id}>
              <td>{customer.customer_name}</td>
              <td>{formatNumber(customer.order_count)}</td>
              <td>{formatCurrency(customer.sales)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExecutiveSalesRankings({ data }: { data: ExecutiveAnalyticsData }) {
  return (
    <section>
      <h3>أعلى الأصناف مبيعًا</h3>
      <ExecutiveTopProductsTable products={data.top_products} />
      <h3 style={{ marginTop: 18 }}>أعلى العملاء قيمةً</h3>
      <ExecutiveTopCustomersTable customers={data.top_customers} />
    </section>
  );
}

function ExecutiveSalesDetails({
  data,
  maximum,
}: {
  data: ExecutiveAnalyticsData;
  maximum: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 16, marginTop: 16 }}>
      <ExecutiveSalesTrendSection days={data.sales_trend} maximum={maximum} />
      <ExecutiveSalesRankings data={data} />
    </div>
  );
}

export function ExecutiveStoreAnalytics() {
  const { data, loading, error, refetch } = useFetch(fetchStoreExecutiveAnalytics);
  const [exportError, setExportError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const maxDaySales = Math.max(1, ...(data?.sales_trend.map((day) => day.sales) ?? [0]));
  const printDocument = useMemo(
    () => data ? projectExecutiveAnalyticsPrintDocument(data) : null,
    [data],
  );

  function exportExecutiveWorkbook() {
    if (!data) return;
    try {
      setExportError(null);
      downloadExecutiveAnalyticsWorkbookXlsx({
        generated_at: data.generated_at,
        kpis: data.kpis,
        sales_trend: data.sales_trend,
        top_products: data.top_products,
        top_customers: data.top_customers,
        forecast: buildSalesForecast(data.sales_trend),
      });
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'تعذر تجهيز ملف التحليل التنفيذي.');
    }
  }

  function printExecutiveReport() {
    if (!data || !printDocument || typeof window === "undefined" || typeof document === "undefined" || typeof window.print !== "function") {
      setPrintError('الطباعة غير متاحة؛ يجب تحميل تقرير تنفيذي كامل وصالح أولاً.');
      return;
    }
    setPrintError(null);
    const body = document.body;
    const previousMode = body.getAttribute('data-print-mode');
    body.setAttribute('data-print-mode', 'executive-analytics');
    let restored = false;
    const restorePrintMode = () => {
      if (restored) return;
      restored = true;
      if (previousMode === null) body.removeAttribute('data-print-mode');
      else body.setAttribute('data-print-mode', previousMode);
      window.removeEventListener('afterprint', restorePrintMode);
    };
    window.addEventListener('afterprint', restorePrintMode, { once: true });
    try {
      window.print();
    } catch {
      restorePrintMode();
      setPrintError('تعذر فتح نافذة الطباعة في هذا المتصفح.');
    }
  }

  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h2>تحليل المبيعات الفعلية</h2>
          <p>مجاميع خادمية كاملة للمؤسسة الحالية، منفصلة عن تحليلات ملفات Onyx.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn secondary" type="button" onClick={() => void refetch()} disabled={loading}>
            <RefreshCw size={16} /> تحديث التحليل
          </button>
          <button className="btn primary" type="button" onClick={exportExecutiveWorkbook} disabled={loading || !data}>
            <FileSpreadsheet size={16} /> تنزيل التحليل التنفيذي Excel
          </button>
          <button className="btn secondary" type="button" onClick={printExecutiveReport} disabled={loading || !printDocument}>
            <Printer size={16} /> طباعة التقرير التنفيذي / PDF
          </button>
        </div>
      </div>

      {exportError ? <ErrorBox message={exportError} /> : null}
      {printError ? <ErrorBox message={printError} /> : null}
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : !data ? <Empty text="لا توجد بيانات تحليل موثوقة لعرضها." /> : (
        <>
          <div className="report-grid">
            <article className="report-metric">
              <TrendingUp size={20} /><span>المبيعات غير الملغاة</span>
              <strong>{formatCurrency(data.kpis.eligible_sales)}</strong>
              <small>بعد استبعاد الملغاة والمرفوضة</small>
            </article>
            <article className="report-metric">
              <BarChart3 size={20} /><span>مبيعات آخر 30 يومًا</span>
              <strong>{formatCurrency(data.kpis.sales_last_30_days)}</strong>
              <small>{formatNumber(data.kpis.orders_last_30_days)} طلبًا غير ملغى</small>
            </article>
            <article className="report-metric">
              <Users size={20} /><span>العملاء ذوو الطلبات الحديثة</span>
              <strong>{formatNumber(data.kpis.customers_last_30_days)}</strong>
              <small>آخر 30 يومًا</small>
            </article>
            <article className="report-metric">
              <Package size={20} /><span>الأصناف النشطة</span>
              <strong>{formatNumber(data.kpis.active_products)}</strong>
              <small>من سجل المؤسسة الحالية</small>
            </article>
            <article className="report-metric">
              <TrendingUp size={20} /><span>طلبات قيد المعالجة</span>
              <strong>{formatNumber(data.kpis.pending_orders)}</strong>
              <small>بحسب حالات سير العمل الحالية</small>
            </article>
            <article className="report-metric">
              <ShoppingCart size={20} />
              <span>إجمالي الطلبات</span>
              <strong>{formatNumber(data.kpis.total_orders)}</strong>
              <small>يتضمن جميع الحالات</small>
            </article>
          </div>

          <ExecutiveSalesDetails data={data} maximum={maxDaySales} />
          <SalesForecastPanel points={data.sales_trend} />
          <p className="report-note" style={{ marginTop: 12 }}>
            آخر تحديث: {formatDateShort(data.generated_at)}. مصدر الأرقام هو سجل الطلبات وبنوده في المؤسسة الحالية؛ اتجاه المبيعات يستبعد الحالات الملغاة والمرفوضة ولا يقدّر البيانات المفقودة.
          </p>
        </>
      )}
      <ProductActivityReport />
      <StaffDashboardMetrics />
      {printDocument && typeof document !== 'undefined'
        ? createPortal(<ExecutiveAnalyticsPrintSheet document={printDocument} />, document.body)
        : null}
    </section>
  );
}


export type ProductActivityReportProps = {
  /** Optional server report injection for deterministic component acceptance tests. */
  reportOverride?: StoreProductActivityReport | null;
};

export function ProductActivityReport({ reportOverride }: ProductActivityReportProps = {}) {
  const fetched = useFetch(fetchStoreProductActivityReport);
  const data = reportOverride === undefined ? fetched.data : reportOverride;
  const loading = reportOverride === undefined ? fetched.loading : false;
  const error = reportOverride === undefined ? fetched.error : null;
  const refetch = fetched.refetch;
  const [filter, setFilter] = useState<ProductActivityStatus | 'all'>('stagnant_over_90_days');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<ProductActivityRowsSort>('days_since_sale_desc');
  const [page, setPage] = useState(1);
  const [exportError, setExportError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const printProjection = useMemo(() => {
    if (!data || data.truncated) return { document: null, error: null };
    try {
      return { document: projectProductActivityPrintDocument(data), error: null };
    } catch (cause) {
      return {
        document: null,
        error: cause instanceof Error ? cause.message : 'تعذر تجهيز تقرير حركة الأصناف للطباعة.',
      };
    }
  }, [data]);
  const printDocument = printProjection.document;
  const filteredRows = useMemo(
    () => filterProductActivityRows(data?.products ?? [], filter, search),
    [data?.products, filter, search],
  );
  const sortedRows = useMemo(
    () => sortProductActivityRows(filteredRows, sort),
    [filteredRows, sort],
  );
  const pagination = useMemo(
    () => paginateProductActivityRows(sortedRows, page, 25),
    [sortedRows, page],
  );
  const quantity = (value: number) => new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 3 }).format(value);

  function exportWorkbook() {
    if (!data) return;
    try {
      setExportError(null);
      downloadProductActivityWorkbookXlsx(data);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'تعذر إنشاء ملف Excel.');
    }
  }

  function printFullReport() {
    if (!data || !printDocument || typeof window === 'undefined' || typeof document === 'undefined' || typeof window.print !== 'function') {
      setPrintError('الطباعة غير متاحة؛ يجب تحميل تقرير كامل وصالح أولاً.');
      return;
    }
    setPrintError(null);
    const body = document.body;
    const previousMode = body.getAttribute('data-print-mode');
    body.setAttribute('data-print-mode', 'product-activity');
    let restored = false;
    const restorePrintMode = () => {
      if (restored) return;
      restored = true;
      if (previousMode === null) body.removeAttribute('data-print-mode');
      else body.setAttribute('data-print-mode', previousMode);
      window.removeEventListener('afterprint', restorePrintMode);
    };
    window.addEventListener('afterprint', restorePrintMode, { once: true });
    try {
      window.print();
    } catch {
      restorePrintMode();
      setPrintError('تعذر فتح نافذة الطباعة في هذا المتصفح.');
    }
  }

  function updateFilter(value: ProductActivityStatus | 'all') {
    setFilter(value);
    setPage(1);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateSort(value: ProductActivityRowsSort) {
    setSort(value);
    setPage(1);
  }

  return (
    <section className="panel" style={{ marginTop: 20 }} aria-labelledby="product-activity-title">
      <div className="panel-head">
        <div>
          <h2 id="product-activity-title">حركة الأصناف والركود</h2>
          <p>نشاط 30 يومًا، حركة 31–90 يومًا، ركود أكثر من 90 يومًا، وأصناف لم تُبع — محسوبة في قاعدة البيانات.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn secondary" type="button" onClick={() => void refetch()} disabled={loading}>
            <RefreshCw size={16} /> تحديث
          </button>
          <button className="btn primary" type="button" onClick={exportWorkbook} disabled={loading || !data || data.products.length === 0 || data.truncated}>
            تنزيل Excel كامل (.xlsx)
          </button>
          <button className="btn secondary" type="button" onClick={printFullReport} disabled={loading || !data || !printDocument}>
            <Printer size={16} /> طباعة التقرير الكامل / PDF
          </button>
        </div>
      </div>

      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : !data ? <Empty text="تعذر الحصول على تقرير حركة الأصناف." /> : (
        <>
          <div className="report-grid">
            <article className="report-metric"><span>نشط خلال آخر 30 يومًا</span><strong>{formatNumber(data.summary.active_last_30_days)}</strong></article>
            <article className="report-metric"><span>بطيء الحركة — 31 إلى 90 يومًا</span><strong>{formatNumber(data.summary.slow_moving_90_days)}</strong></article>
            <article className="report-metric"><span>راكد لأكثر من 90 يومًا</span><strong>{formatNumber(data.summary.stagnant_over_90_days)}</strong></article>
            <article className="report-metric"><span>لم يُبع سابقًا</span><strong>{formatNumber(data.summary.never_sold)}</strong></article>
            <article className="report-metric"><span>أرصدة غير متاحة</span><strong>{formatNumber(data.summary.stock_unknown_count)}</strong><small>لا تُعامل الأرصدة المجهولة على أنها صفر.</small></article>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap', marginTop: 16 }}>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 260px', minWidth: 0 }}>
              <span>البحث بالاسم أو كود الصنف أو الوحدة</span>
              <input
                type="search"
                value={search}
                onChange={(event) => updateSearch(event.currentTarget.value)}
                placeholder="ابحث عن صنف..."
                aria-label="البحث في تقرير حركة الأصناف"
                style={{ minHeight: 40, padding: '8px 10px', border: '1px solid var(--border, #d6dfe4)', borderRadius: 8, width: '100%', boxSizing: 'border-box' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 210px', minWidth: 0 }}>
              <span>حالة الحركة</span>
              <select value={filter} onChange={(event) => updateFilter(event.currentTarget.value as ProductActivityStatus | 'all')} style={{ minHeight: 40, padding: '8px 10px', border: '1px solid var(--border, #d6dfe4)', borderRadius: 8, width: '100%', boxSizing: 'border-box' }}>
                <option value="all">كل الأصناف</option>
                <option value="stagnant_over_90_days">الراكدة — أكثر من 90 يومًا</option>
                <option value="never_sold">لم تُبع سابقًا</option>
                <option value="slow_moving_90_days">بطيئة الحركة — 31 إلى 90 يومًا</option>
                <option value="active_last_30_days">نشطة — آخر 30 يومًا</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6, flex: '1 1 210px', minWidth: 0 }}>
              <span>ترتيب النتائج</span>
              <select value={sort} onChange={(event) => updateSort(event.currentTarget.value as ProductActivityRowsSort)} style={{ minHeight: 40, padding: '8px 10px', border: '1px solid var(--border, #d6dfe4)', borderRadius: 8, width: '100%', boxSizing: 'border-box' }}>
                <option value="days_since_sale_desc">الأطول منذ آخر بيع</option>
                <option value="sold_30_asc">الأقل مبيعًا آخر 30 يومًا</option>
                <option value="sold_30_desc">الأعلى مبيعًا آخر 30 يومًا</option>
                <option value="stock_asc">الأقل مخزونًا (المجهول أخيرًا)</option>
                <option value="name_asc">اسم الصنف أبجديًا</option>
              </select>
            </label>
          </div>
          <p role="status" aria-live="polite" style={{ margin: '12px 0 8px' }}>
            نتائج العرض: {formatNumber(pagination.totalRows)} صنفًا — {pagination.from === 0 ? 'لا توجد صفوف' : 'من ' + formatNumber(pagination.from) + ' إلى ' + formatNumber(pagination.to)}
            {' '}من إجمالي {formatNumber(data.total_products)} صنفًا في التقرير.
          </p>

          {data.truncated ? <p className="report-note" role="alert" style={{ marginTop: 12 }}>تجاوز العدد حد التقرير البالغ 5000 صنف؛ عُطّل التصدير حتى لا ينتج ملف جزئي على أنه كامل.</p> : null}
          {exportError ? <ErrorBox message={exportError} /> : null}
          {printProjection.error ? <ErrorBox message={printProjection.error} /> : null}
          {printError ? <ErrorBox message={printError} /> : null}

          {pagination.rows.length === 0 ? <Empty text="لا توجد أصناف مطابقة للبحث وحالة الحركة المحددة." /> : (
            <div style={{ overflowX: 'auto', maxWidth: '100%', minWidth: 0, marginTop: 12 }}>
              <table>
                <thead><tr><th>كود الصنف</th><th>الصنف</th><th>حالة الحركة</th><th>مباع آخر 30 يومًا</th><th>مباع آخر 90 يومًا</th><th>آخر بيع</th><th>أيام منذ البيع</th><th>المتاح بالمخازن النشطة</th></tr></thead>
                <tbody>{pagination.rows.map((product) => (
                  <tr key={product.product_id}>
                    <td>{product.item_code || 'دون رمز'}</td>
                    <td><strong>{product.product_name}</strong><small style={{ display: 'block' }}>{product.unit} · {product.catalog_status === 'active' ? 'نشط بالكتالوج' : product.catalog_status === 'inactive' ? 'موقوف بالكتالوج' : product.catalog_status}</small></td>
                    <td>{PRODUCT_ACTIVITY_STATUS_LABELS[product.activity_status]}</td>
                    <td>{quantity(product.sold_quantity_last_30_days)}</td>
                    <td>{quantity(product.sold_quantity_last_90_days)}</td>
                    <td>{product.last_sold_at ? formatDateShort(product.last_sold_at) : 'لم يُسجل بيع'}</td>
                    <td>{product.days_since_last_sale === null ? '—' : formatNumber(product.days_since_last_sale)}</td>
                    <td>{product.available_quantity === null ? 'غير متاح' : quantity(product.available_quantity)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {pagination.totalPages > 1 ? (
            <nav aria-label="ترقيم صفحات تقرير حركة الأصناف" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginTop: 14 }}>
              <button className="btn secondary" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={pagination.page <= 1}>السابق</button>
              <span>صفحة {formatNumber(pagination.page)} من {formatNumber(pagination.totalPages)}</span>
              <button className="btn secondary" type="button" onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))} disabled={pagination.page >= pagination.totalPages}>التالي</button>
            </nav>
          ) : null}
          <p className="report-note" style={{ marginTop: 12 }}>
            ملف Excel الكامل لا يتأثر بالبحث أو التصفية أو صفحة العرض؛ يُصدّر جميع صفوف التقرير الخادمي. آخر تحديث: {formatDateShort(data.generated_at)}.
            المصدر هو بنود الطلبات المرتبطة بمعرّف الصنف؛ الطلبات الملغاة والمرفوضة لا تدخل في الحساب.
            الرصيد يُجمع من المخازن النشطة بالمؤسسة؛ «غير متاح» لا يعني صفرًا. البنود التاريخية بلا معرّف صنف لا تُطابق تخمينيًا.
          </p>
        </>
      )}
      {printDocument && typeof document !== 'undefined' ? createPortal(<ProductActivityPrintSheet document={printDocument} />, document.body) : null}
    </section>
  );
}
