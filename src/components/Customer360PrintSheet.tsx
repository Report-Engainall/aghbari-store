import { formatDateShort, formatNumber } from "@/lib/format";
import { formatCustomer360Money } from "@/lib/customer-360";
import type { Customer360PrintDocument } from "@/lib/customer-360-print";

const tierLabels: Record<string, string> = {
  retail: "تجزئة",
  wholesale: "جملة",
  wholesale_wholesale: "جملة الجملة",
};
const statusLabels: Record<string, string> = {
  approved: "معتمد",
  pending: "قيد المراجعة",
  rejected: "مرفوض",
  suspended: "موقوف",
  active: "نشط",
  inactive: "غير نشط",
};
const invoiceStatusLabels: Record<string, string> = {
  issued: "صادرة",
  partially_paid: "مدفوعة جزئيًا",
  paid: "مدفوعة",
  void: "ملغاة",
};

function money(value: number | null, currency: string): string {
  return formatCustomer360Money(value, currency);
}
function date(value: string | null): string {
  return value ? formatDateShort(value) : "غير متاح";
}
function number(value: number | null): string {
  return value === null ? "غير متاح" : formatNumber(value);
}
function decimal(value: number | null): string {
  return value === null ? "غير متاح" : new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(value);
}
function invoiceStatus(value: string): string {
  return invoiceStatusLabels[value] ?? value;
}

function RecentOrderRows({
  rows,
}: {
  rows: Customer360PrintDocument["recentOrders"];
}) {
  if (rows.length === 0) {
    return <tr><td colSpan={5}>لا توجد طلبات حديثة.</td></tr>;
  }

  return (
    <>
      {rows.map((row, index) => (
        <tr
          key={row.orderNumber + "-" + index}
          data-testid="customer-360-print-order-row"
        >
          <td>{row.orderNumber}</td>
          <td>{date(row.createdAt)}</td>
          <td>{row.status}</td>
          <td>{number(row.totalItems)}</td>
          <td>{money(row.totalAmount, "YER")}</td>
        </tr>
      ))}
    </>
  );
}

function RecentOrdersSection({
  document,
}: {
  document: Customer360PrintDocument;
}) {
  return (
    <section className="customer-360-print-section">
      <h2>آخر الطلبات ({formatNumber(document.recentOrders.length)} من {formatNumber(document.orderSummary.orderCount)})</h2>
      <p className="customer-360-print-note">التفاصيل أدناه لأحدث 20 طلبًا فقط؛ إجمالي الطلبات محسوب من سجل العميل الكامل.</p>
      <table>
        <thead>
          <tr>
            <th>رقم الطلب</th>
            <th>التاريخ</th>
            <th>الحالة</th>
            <th>الأصناف</th>
            <th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          <RecentOrderRows rows={document.recentOrders} />
        </tbody>
      </table>
    </section>
  );
}

function OrderSummarySection({ document }: { document: Customer360PrintDocument }) {
  return (
<section className="customer-360-print-section">
        <h2>ملخص الطلبات الكامل</h2>
        <table>
          <thead><tr><th>المؤشر</th><th>القيمة</th></tr></thead>
          <tbody>
            <tr><th>إجمالي الطلبات</th><td>{formatNumber(document.orderSummary.orderCount)}</td></tr>
            <tr><th>الطلبات المعلقة</th><td>{formatNumber(document.orderSummary.pendingOrderCount)}</td></tr>
            <tr><th>الطلبات المنفذة</th><td>{formatNumber(document.orderSummary.fulfilledOrderCount)}</td></tr>
            <tr><th>الطلبات الملغاة</th><td>{formatNumber(document.orderSummary.cancelledOrderCount)}</td></tr>
            <tr><th>قيمة الطلبات غير الملغاة</th><td>{money(document.orderSummary.nonCancelledOrderValue, "YER")}</td></tr>
            <tr><th>متوسط قيمة الطلب</th><td>{money(document.orderSummary.averageOrderValue, "YER")}</td></tr>
            <tr><th>آخر طلب</th><td>{date(document.orderSummary.lastOrderAt)}</td></tr>
            <tr><th>الأيام منذ آخر طلب</th><td>{number(document.orderSummary.daysSinceLastOrder)}</td></tr>
            <tr><th>متوسط المدة بين الطلبات (يوم)</th><td>{decimal(document.orderSummary.averageDaysBetweenOrders)}</td></tr>
            <tr><th>الرصيد المسجل بالبطاقة</th><td>{money(document.customer.currentBalance, "YER")}</td></tr>
            <tr><th>الحد الائتماني المسجل</th><td>{money(document.customer.creditLimit, "YER")}</td></tr>
            <tr><th>المبالغ غير الصالحة</th><td>{formatNumber(document.orderSummary.invalidOrderAmountCount)}</td></tr>
          </tbody>
        </table>
        <h3>توزيع حالات الطلبات — المصدر الكامل</h3>
        <table><thead><tr><th>الحالة</th><th>العدد</th></tr></thead><tbody>
          {document.orderSummary.statusDistribution.map((row, index) => <tr key={row.status + "-" + index}><td>{row.status}</td><td>{formatNumber(row.count)}</td></tr>)}
          {document.orderSummary.statusDistribution.length === 0 ? <tr><td colSpan={2}>لا توجد حالات طلبات مسجلة.</td></tr> : null}
        </tbody></table>
      </section>
  );
}

function FinanceByCurrencySection({ document }: { document: Customer360PrintDocument }) {
  return (
<section className="customer-360-print-section">
        <h2>الدفتر المالي الكامل حسب العملة</h2>
        <table>
          <thead><tr><th>العملة</th><th>الفواتير</th><th>الإجمالي</th><th>المسدّد</th><th>الإشعارات الدائنة</th><th>المتبقي</th><th>المتأخرة</th><th>المتأخرات</th><th>دون استحقاق</th><th>مبالغ غير معروفة</th></tr></thead>
          <tbody>
            {document.financeByCurrency.map((row) => <tr key={row.currency}>
              <td>{row.currency}</td><td>{formatNumber(row.invoiceCount)}</td>
              <td>{money(row.invoicedTotal, row.currency)}</td><td>{money(row.paidTotal, row.currency)}</td>
              <td>{money(row.creditMemoTotal, row.currency)}</td><td>{money(row.outstandingTotal, row.currency)}</td>
              <td>{formatNumber(row.overdueInvoiceCount)}</td><td>{money(row.overdueOutstanding, row.currency)}</td>
              <td>{formatNumber(row.unknownDueDateInvoiceCount)}</td><td>{money(row.unknownDueDateOutstanding, row.currency)}</td>
            </tr>)}
            {document.financeByCurrency.length === 0 ? <tr><td colSpan={10}>لا توجد فواتير في دفتر العميل.</td></tr> : null}
          </tbody>
        </table>
        {document.financeByCurrency.some((row) => row.invalidTotalAmountCount > 0) ? <p className="customer-360-print-note">توجد {formatNumber(document.financeByCurrency.reduce((sum, row) => sum + row.invalidTotalAmountCount, 0))} إجماليات فواتير غير صالحة؛ بقيت المجاميع غير المؤكدة «غير متاحة» ولم تُحوّل إلى أصفار.</p> : null}
      </section>
  );
}

function RecentInvoicePrintRow({ row, index }: {
  row: Customer360PrintDocument["recentInvoices"][number];
  index: number;
}) {
  return (
    <tr>
      <td>{row.invoiceNumber}</td><td>{date(row.issuedAt)}</td><td>{date(row.dueAt)}</td>
      <td>{invoiceStatus(row.status)}</td><td>{row.currency}</td>
      <td>{money(row.totalAmount, row.currency)}</td><td>{money(row.paidAmount, row.currency)}</td>
      <td>{money(row.creditMemoAmount, row.currency)}</td><td>{money(row.outstandingAmount, row.currency)}</td>
    </tr>
  );
}

function RecentInvoicesSection({ document }: { document: Customer360PrintDocument }) {
  return (
<section className="customer-360-print-section">
        <h2>آخر الفواتير ({formatNumber(document.recentInvoices.length)} معروضة)</h2>
        <p className="customer-360-print-note">التفاصيل أدناه لأحدث 20 فاتورة فقط؛ إجماليات الدفتر المالي أعلاه كاملة ومفصولة حسب العملة.</p>
        <table><thead><tr><th>الفاتورة</th><th>الإصدار</th><th>الاستحقاق</th><th>الحالة</th><th>العملة</th><th>الإجمالي</th><th>المسدّد</th><th>الدائن</th><th>المتبقي</th></tr></thead><tbody>
          {document.recentInvoices.map((row, index) => (
            <RecentInvoicePrintRow key={row.invoiceNumber + "-" + index} row={row} index={index} />
          ))}
          {document.recentInvoices.length === 0 ? <tr><td colSpan={9}>لا توجد فواتير حديثة.</td></tr> : null}
        </tbody></table>
      </section>
  );
}

function RecentPaymentsSection({ document }: { document: Customer360PrintDocument }) {
  return (
<section className="customer-360-print-section">
        <h2>آخر الدفعات ({formatNumber(document.recentPayments.length)} معروضة)</h2>
        <p className="customer-360-print-note">لا تُعرض عملة أو قيمة دفعة إذا كانت فاتورتها خارج أحدث 20 فاتورة المعادة؛ لا تُستنتج العملة من عميل أو مستند آخر.</p>
        <table><thead><tr><th>التاريخ</th><th>الفاتورة</th><th>طريقة الدفع</th><th>المبلغ</th></tr></thead><tbody>
          {document.recentPayments.map((row, index) => <tr key={row.paidAt + "-" + index}>
            <td>{date(row.paidAt)}</td><td>{row.invoiceReference}</td><td>{row.paymentMethod ?? "غير محددة"}</td>
            <td>{row.currency ? money(row.amount, row.currency) : "غير متاح — عملة الفاتورة خارج أحدث 20 فاتورة"}</td>
          </tr>)}
          {document.recentPayments.length === 0 ? <tr><td colSpan={4}>لا توجد دفعات حديثة.</td></tr> : null}
        </tbody></table>
      </section>
  );
}

function TopProductsSection({ document }: { document: Customer360PrintDocument }) {
  return (
<section className="customer-360-print-section">
        <h2>المنتجات الأكثر شراءً</h2>
        <p className="customer-360-print-note">قيمة مبيعات الصنف أدناه رقمية كما وردت من ملخص الخادم؛ لم يرد حقل عملة مستقل لهذا التجميع.</p>
        <table><thead><tr><th>رمز الصنف</th><th>الصنف</th><th>الكمية</th><th>قيمة المبيعات الرقمية</th><th>آخر شراء</th></tr></thead><tbody>
          {document.topProducts.map((row, index) => <tr key={row.itemCode + "-" + index}>
            <td>{row.itemCode || "—"}</td><td>{row.productName}</td><td>{decimal(row.quantity)}</td>
            <td>{decimal(row.sales)}</td><td>{date(row.lastPurchasedAt)}</td>
          </tr>)}
          {document.topProducts.length === 0 ? <tr><td colSpan={5}>لا توجد أصناف قابلة للترتيب.</td></tr> : null}
        </tbody></table>
      </section>
  );
}

const interactionTypeLabels: Record<string, string> = {
  call: "اتصال هاتفي",
  visit: "زيارة",
  whatsapp: "واتساب",
  email: "بريد إلكتروني",
  meeting: "اجتماع",
  note: "ملاحظة داخلية",
  other: "أخرى",
};

function CustomerInteractionsSection({ document }: { document: Customer360PrintDocument }) {
  return (
    <section className="customer-360-print-section">
      <h2>سجل التواصل والمتابعة ({formatNumber(document.interactions.length)} معروض من حد أحدث 50)</h2>
      <p className="customer-360-print-note">سجل تشغيلي مؤرخ لا يمثل قيدًا ماليًا أو فاتورة أو دفعة. قد ينشئ موعد المتابعة مهمة مبيعات في مركز العمليات.</p>
      {document.interactions.length === 0 ? (
        <p>لا يوجد سجل تواصل ضمن البيانات المعروضة.</p>
      ) : (
        <table>
          <thead><tr><th>التاريخ</th><th>النوع</th><th>الموضوع</th><th>الملخص والنتيجة</th><th>المتابعة القادمة</th><th>سُجل بواسطة</th></tr></thead>
          <tbody>
            {document.interactions.map((row, index) => (
              <tr key={row.subject + "-" + row.interactionAt + "-" + index}>
                <td>{date(row.interactionAt)}</td>
                <td>{interactionTypeLabels[row.interactionType] ?? row.interactionType}</td>
                <td>{row.subject}</td>
                <td>{row.details}</td>
                <td>{date(row.nextFollowUpAt)}</td>
                <td>{row.recordedByName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RecommendationsSection({ document }: { document: Customer360PrintDocument }) {
  return (
<section className="customer-360-print-section">
        <h2>إشارات المتابعة التشغيلية</h2>
        {document.recommendations.length === 0 ? <p>لا توجد توصيات ضمن قواعد التنبيه الحالية.</p> : <table>
          <thead><tr><th>الأولوية</th><th>التوصية</th><th>الدليل</th><th>الإجراء</th></tr></thead>
          <tbody>{document.recommendations.map((row, index) => <tr key={row.title + "-" + index}>
            <td>{row.priority === "high" ? "عالية" : row.priority === "medium" ? "متوسطة" : "منخفضة"}</td>
            <td><strong>{row.title}</strong><p>{row.description}</p></td>
            <td>{row.currency && row.overdueOutstanding !== null ? money(row.overdueOutstanding, row.currency) : "—"}
              {row.overdueInvoiceCount !== null ? " · فواتير: " + formatNumber(row.overdueInvoiceCount) : ""}
              {row.pendingOrderCount !== null ? " · معلقة: " + formatNumber(row.pendingOrderCount) : ""}
              {row.daysSinceLastOrder !== null ? " · منذ آخر طلب: " + formatNumber(row.daysSinceLastOrder) : ""}
            </td>
            <td>{row.action}</td>
          </tr>)}</tbody>
        </table>}
      </section>
  );
}

export function Customer360PrintSheet({ document }: { document: Customer360PrintDocument }) {
  const generatedAt = new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(document.generatedAt));
  return (
    <article className="customer-360-print-sheet" data-testid="customer-360-print-document" dir="rtl" lang="ar">
      <header className="customer-360-print-header">
        <div>
          <h1>متجر الأغبري | Aghbari Commerce</h1>
          <p>ملف العميل 360 — تقرير موظفين</p>
          <strong>{document.customer.businessName}</strong>
          <p>رمز العميل: {document.customer.customerCode} · الشريحة: {tierLabels[document.customer.tier] ?? document.customer.tier} · الحالة: {statusLabels[document.customer.status] ?? document.customer.status}</p>
        </div>
        <div className="customer-360-print-generated">
          <strong>وقت استخراج التقرير</strong>
          <span>{generatedAt}</span>
        </div>
      </header>

            <OrderSummarySection document={document} />

            <FinanceByCurrencySection document={document} />

      <RecentOrdersSection document={document} />

            <RecentInvoicesSection document={document} />

            <RecentPaymentsSection document={document} />

            <TopProductsSection document={document} />

            <CustomerInteractionsSection document={document} />

            <RecommendationsSection document={document} />

      <footer className="customer-360-print-footer">
        المصدر: ملخص Customer 360 الخادمي للمؤسسة الحالية. مجاميع الطلبات والدفتر المالي كاملة؛ صفوف تفاصيل الطلبات والفواتير والدفعات محدودة بأحدث 20 سجلًا، وسجل التواصل بأحدث 50 إدخالًا. لا يتضمن هذا المخرج معرّفات داخلية أو بيانات اتصال العميل.
      </footer>
    </article>
  );
}
