import type { ExecutiveAnalyticsPrintDocument } from "@/lib/executive-analytics-print";
import { formatCurrency, formatDateShort, formatNumber } from "@/lib/format";

export function ExecutiveAnalyticsPrintSheet({ document }: { document: ExecutiveAnalyticsPrintDocument }) {
  const generatedAt = new Intl.DateTimeFormat("ar-YE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(document.generatedAt));

  return (
    <article
      className="executive-analytics-print-sheet"
      data-testid="executive-analytics-print-document"
      dir="rtl"
      lang="ar"
    >
      <header className="executive-analytics-print-header">
        <div>
          <h1>متجر الأغبري | Aghbari Commerce</h1>
          <p>التقرير التنفيذي — تحليل المبيعات الفعلية</p>
        </div>
        <div className="executive-analytics-print-date">
          <strong>وقت استخراج التقرير</strong>
          <span>{generatedAt}</span>
        </div>
      </header>

      <section className="executive-analytics-print-section">
        <h2>المؤشرات التنفيذية</h2>
        <table>
          <thead><tr><th>المؤشر</th><th>القيمة</th></tr></thead>
          <tbody>
            {document.kpis.map((kpi) => (
              <tr key={kpi.key}>
                <th scope="row">{kpi.label}</th>
                <td>{kpi.format === "currency" ? formatCurrency(kpi.value) : formatNumber(kpi.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="executive-analytics-print-section">
        <h2>اتجاه المبيعات — جميع الأيام المعادة من الخادم ({formatNumber(document.salesTrend.length)} يومًا)</h2>
        <table>
          <thead><tr><th>التاريخ</th><th>الطلبات المؤهلة</th><th>المبيعات المؤهلة</th></tr></thead>
          <tbody>
            {document.salesTrend.map((day, index) => (
              <tr key={day.day + "-" + index} data-testid="executive-analytics-sales-row">
                <td>{formatDateShort(day.day)}</td>
                <td>{formatNumber(day.orders)}</td>
                <td>{formatCurrency(day.sales)}</td>
              </tr>
            ))}
            {document.salesTrend.length === 0 ? <tr><td colSpan={3}>لا توجد أيام في الفترة المعادة.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="executive-analytics-print-section">
        <h2>أعلى الأصناف مبيعًا — كامل القائمة المعادة</h2>
        <table>
          <thead><tr><th>رمز الصنف</th><th>الصنف</th><th>الكمية</th><th>المبيعات</th></tr></thead>
          <tbody>
            {document.topProducts.map((product, index) => (
              <tr key={(product.itemCode ?? "no-code") + "-" + product.productName + "-" + index}>
                <td>{product.itemCode ?? "—"}</td>
                <td>{product.productName}</td>
                <td>{formatNumber(product.quantity)}</td>
                <td>{formatCurrency(product.sales)}</td>
              </tr>
            ))}
            {document.topProducts.length === 0 ? <tr><td colSpan={4}>لا توجد أصناف قابلة للترتيب.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="executive-analytics-print-section">
        <h2>أعلى العملاء قيمةً — كامل القائمة المعادة</h2>
        <table>
          <thead><tr><th>العميل</th><th>عدد الطلبات</th><th>المبيعات</th></tr></thead>
          <tbody>
            {document.topCustomers.map((customer, index) => (
              <tr key={customer.customerName + "-" + index}>
                <td>{customer.customerName}</td>
                <td>{formatNumber(customer.orderCount)}</td>
                <td>{formatCurrency(customer.sales)}</td>
              </tr>
            ))}
            {document.topCustomers.length === 0 ? <tr><td colSpan={3}>لا توجد طلبات مرتبطة بعملاء ضمن الفترة.</td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="executive-analytics-print-section">
        <h2>التقدير الحتمي لسبعة أيام</h2>
        {document.forecast.ready ? (
          <>
            <p>خط أساس تخطيطي: {formatCurrency(document.forecast.expectedTotal)}؛ متوسط يومي: {formatCurrency(document.forecast.dailyBaseline)}.</p>
            <p>سيناريو أقل: {formatCurrency(document.forecast.lowerScenario)}؛ سيناريو أعلى: {formatCurrency(document.forecast.upperScenario)}.</p>
            <p>متوسط الخطأ المطلق في الاختبار: {formatCurrency(document.forecast.meanAbsoluteError)}.</p>
            <p>آخر يوم تاريخي: {formatDateShort(document.forecast.lastHistoricalDay)}.</p>
            <table>
              <thead><tr><th>اليوم المتوقع</th><th>تقدير المبيعات</th></tr></thead>
              <tbody>
                {document.forecast.days.map((day) => (
                  <tr key={day.day} data-testid="executive-analytics-forecast-row">
                    <td>{formatDateShort(day.day)}</td><td>{formatCurrency(day.expectedSales)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="executive-analytics-print-note">هذا خط أساس تخطيطي حتمي مع نطاق وصفي من خطأ الاختبار؛ ليس نطاق ثقة إحصائيًا أو وعدًا بالإيراد.</p>
          </>
        ) : (
          <div data-testid="executive-analytics-forecast-unavailable">
            <p>حالة التقدير: غير متاح.</p>
            <p>سبب عدم الإتاحة كما أعاده محرك التقدير: <code>{document.forecast.reason}</code></p>
            <p>الأيام الصالحة المتاحة: {formatNumber(document.forecast.availableDays)}.</p>
            <p className="executive-analytics-print-note">لم تُنشأ قيم توقع بديلة أو افتراضية.</p>
          </div>
        )}
      </section>

      <footer className="executive-analytics-print-footer">
        مصدر المؤشرات هو مجاميع التحليل الخادمية للفترة والمؤسسة الحالية. القيم المعروضة لا تتضمن معرّفات داخلية أو تكلفة أو هامش ربح.
      </footer>
    </article>
  );
}
