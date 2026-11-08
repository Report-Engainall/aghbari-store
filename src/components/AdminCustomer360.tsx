import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarClock, CreditCard, Download, MessageSquare, Printer, RefreshCw, ShoppingBag, Wallet } from 'lucide-react';
import { Button, Empty, ErrorBox, Loading, Modal, TableWrap } from '@/components/AdminPages';
import { fetchCustomerInteractions, fetchStaffCustomer360Summary, manageCustomerInteractionFollowUp, recordCustomerInteraction } from '@/lib/api';
import { formatCurrency, formatDateShort, formatNumber } from '@/lib/format';
import type { Customer, CustomerInteraction, CustomerInteractionType } from '@/lib/types';
import { getCurrentTenantScope, supabase } from '@/lib/supabase';
import { formatCustomer360Money } from '@/lib/customer-360';
import { downloadStaffCustomer360WorkbookXlsx } from '@/lib/customer-360-xlsx';
import { projectStaffCustomer360PrintDocument } from '@/lib/customer-360-print';
import { Customer360PrintSheet } from '@/components/Customer360PrintSheet';
import type { StaffCustomer360Summary } from '@/lib/customer-360-summary';
import { fetchCustomerRetentionReport } from '@/lib/customer-retention-client';
import type { CustomerRetentionReport } from '@/lib/intelligence/customer-retention';
import { CustomerServiceCases } from '@/components/CustomerServiceCases';

const CUSTOMER_SCOPE_BLOCKED_MESSAGE = 'العميل غير موجود في المؤسسة الحالية؛ تم إيقاف عرض ملفه.';
const CUSTOMER360_LOAD_ERROR_MESSAGE = 'تعذر تحميل ملف العميل. تحقق من الاتصال والصلاحية ثم أعد المحاولة.';

const invoiceStatusLabel: Record<string, string> = {
  issued: 'صادرة',
  partially_paid: 'مدفوعة جزئيًا',
  paid: 'مدفوعة',
  void: 'ملغاة',
};

type Customer360HeaderProps = {
  summary: StaffCustomer360Summary | null;
  loading: boolean;
  exportError: string;
  printError: string;
  printDisabled: boolean;
  onReload: () => void;
  onExport: () => void;
  onPrint: () => void;
};

function Customer360Header({
  summary, loading, exportError, printError, printDisabled, onReload, onExport, onPrint,
}: Customer360HeaderProps) {
  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>{summary ? summary.customer.business_name : 'ملف العميل 360'}</h2>
          {summary && <>
            <p>{summary.customer.customer_code} · {summary.customer.contact_name || 'جهة الاتصال غير محددة'}</p>
            <p>{summary.customer.phone || 'لا يوجد هاتف'} · {summary.customer.email || 'لا يوجد بريد'}</p>
          </>}
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 6 }}>
          <Button variant="secondary" onClick={onReload} disabled={loading}><RefreshCw size={15} /> تحديث</Button>
          <Button variant="outline" onClick={onExport} disabled={loading || !summary || printDisabled}><Download size={15} /> تصدير Excel</Button>
          <Button variant="outline" onClick={onPrint} disabled={loading || printDisabled}><Printer size={15} /> طباعة / PDF</Button>
        </div>
      </div>
      {exportError && <p className="form-error" role="alert">{exportError}</p>}
      {printError && <p className="form-error" role="alert">{printError}</p>}
      <p className="report-note">الرصيد والحد الائتماني أدناه هما القيم المسجلة في بطاقة العميل. إجماليات الطلبات والفوترة والتحصيل أدناه مجاميع خادمية كاملة؛ الجداول التفصيلية تعرض أحدث الحركات فقط، ولا تُنشأ فواتير أو دفعات تاريخية افتراضية.</p>
    </section>
  );
}


function Customer360InitialMetrics({ summary }: { summary: StaffCustomer360Summary }) {
  return (
    <>
      <section className="report-grid">
        <article className="report-metric"><ShoppingBag size={20} /><span>إجمالي الطلبات</span><strong>{formatNumber(summary.order_summary.order_count)}</strong></article>
        <article className="report-metric"><CalendarClock size={20} /><span>طلبات قيد المعالجة</span><strong>{formatNumber(summary.order_summary.pending_order_count)}</strong></article>
        <article className="report-metric"><Wallet size={20} /><span>الرصيد المسجل بالبطاقة</span><strong>{formatCustomer360Money(summary.customer.current_balance, 'YER')}</strong></article>
        <article className="report-metric"><CreditCard size={20} /><span>الحد الائتماني المسجل</span><strong>{formatCustomer360Money(summary.customer.credit_limit, 'YER')}</strong></article>
      </section>
      <p className="report-note" role="status">
        تفاصيل الجداول أدناه تقتصر على أحدث 20 حركة لهذا العميل؛ إجماليات الفوترة والتحصيل والمتأخرات محسوبة خادميًا من دفتر العميل الكامل.
      </p>
    </>
  );
}

function Customer360OrderOverview({
  summary,
  overdueInvoiceCount,
}: {
  summary: StaffCustomer360Summary;
  overdueInvoiceCount: number;
}) {
  const amount = summary.order_summary.non_cancelled_order_value;
  return (
    <section className="panel">
      <h3>ملخص الحركات المعروضة</h3>
      <p>
        قيمة الطلبات غير الملغاة من سجل العميل الكامل:{" "}
        <strong>{amount === null ? 'غير متاحة بسبب مبلغ غير صالح أو تجاوز دقة الحساب' : formatCurrency(amount)}</strong>
      </p>
      <p>
        طلبات منفذة: {formatNumber(summary.order_summary.fulfilled_order_count)} ·
        ملغاة: {formatNumber(summary.order_summary.cancelled_order_count)} ·
        فواتير متأخرة من الدفتر الكامل: {formatNumber(overdueInvoiceCount)}
      </p>
      {summary.order_summary.invalid_order_amount_count > 0 ? (
        <p className="form-error">
          بعض مبالغ الطلبات غير صالحة؛ تم تعطيل جمع إجمالي قيمة الطلبات بدل اعتبار القيم غير المعروفة أصفارًا.
        </p>
      ) : null}
    </section>
  );
}

function Customer360FullOrderMetrics({ summary }: { summary: StaffCustomer360Summary }) {
  const order = summary.order_summary;
  return (
    <div className="report-grid">
      <article className="report-metric"><ShoppingBag size={20} /><span>إجمالي الطلبات</span><strong>{formatNumber(order.order_count)}</strong><small>من سجل العميل الكامل</small></article>
      <article className="report-metric"><Wallet size={20} /><span>قيمة الطلبات غير الملغاة</span><strong>{order.non_cancelled_order_value === null ? 'غير متاح' : formatCurrency(order.non_cancelled_order_value)}</strong><small>المبالغ غير الصالحة: {formatNumber(order.invalid_order_amount_count)}</small></article>
      <article className="report-metric"><CalendarClock size={20} /><span>متوسط قيمة الطلب</span><strong>{order.average_order_value === null ? 'غير متاح' : formatCurrency(order.average_order_value)}</strong><small>بحسب الطلبات غير الملغاة</small></article>
      <article className="report-metric"><ShoppingBag size={20} /><span>آخر طلب</span><strong>{order.last_order_at ? formatDateShort(order.last_order_at) : 'لا يوجد'}</strong><small>{order.days_since_last_order === null ? 'الفترة غير متاحة' : 'منذ ' + formatNumber(order.days_since_last_order) + ' يومًا'}</small></article>
      <article className="report-metric"><CalendarClock size={20} /><span>متوسط المدة بين الطلبات</span><strong>{order.average_days_between_orders === null ? 'غير متاح' : formatNumber(order.average_days_between_orders) + ' يوم'}</strong><small>يحسب من تواريخ الطلبات المسجلة</small></article>
      <article className="report-metric"><CreditCard size={20} /><span>طلبات معلقة / منفذة</span><strong>{formatNumber(order.pending_order_count)} / {formatNumber(order.fulfilled_order_count)}</strong><small>الملغاة أو المرفوضة: {formatNumber(order.cancelled_order_count)}</small></article>
    </div>
  );
}

function Customer360FinanceByCurrency({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.finance_by_currency.length === 0) {
    return <Empty text="لا توجد فواتير مسجلة لهذا العميل." />;
  }
  return (
    <TableWrap>
      <table>
        <thead>
          <tr>
            <th>العملة</th><th>الفواتير</th><th>إجمالي الفواتير</th><th>المسدّد</th>
            <th>الإشعارات الدائنة المرحلة</th><th>المتبقي</th><th>فواتير متأخرة</th><th>متأخرات</th>
          </tr>
        </thead>
        <tbody>
          {summary.finance_by_currency.map((row) => (
            <tr key={row.currency}>
              <td>{row.currency}</td><td>{formatNumber(row.invoice_count)}</td>
              <td>{formatCustomer360Money(row.invoiced_total, row.currency)}</td>
              <td>{formatCustomer360Money(row.paid_total, row.currency)}</td>
              <td>{formatCustomer360Money(row.credit_memo_total, row.currency)}</td>
              <td>{formatCustomer360Money(row.outstanding_total, row.currency)}</td>
              <td>{formatNumber(row.overdue_invoice_count)}</td>
              <td>{formatCustomer360Money(row.overdue_outstanding, row.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Customer360TopProducts({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.top_products.length === 0) {
    return <Empty text="لا توجد بنود طلبات قابلة للترتيب لهذا العميل." />;
  }
  return (
    <TableWrap>
      <table>
        <thead><tr><th>الصنف</th><th>الكمية</th><th>قيمة البنود</th><th>آخر شراء</th></tr></thead>
        <tbody>
          {summary.top_products.map((product) => (
            <tr key={product.item_code + ':' + product.product_name}>
              <td><strong>{product.product_name}</strong><small style={{ display: 'block' }}>{product.item_code || 'دون رمز صنف'}</small></td>
              <td>{formatNumber(product.quantity)}</td>
              <td>{formatCustomer360Money(product.sales, 'YER')}</td>
              <td>{product.last_purchased_at ? formatDateShort(product.last_purchased_at) : 'غير متاح'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Customer360RecommendationCard({
  recommendation,
}: {
  recommendation: StaffCustomer360Summary["recommendations"][number];
}) {
  const priority = recommendation.priority === 'high'
    ? 'أولوية عالية'
    : recommendation.priority === 'medium' ? 'أولوية متوسطة' : 'أولوية منخفضة';

  return (
    <article style={{ border: '1px solid var(--border, #d7e1e0)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <strong>{recommendation.title}</strong>
        <span className="badge">{priority}</span>
      </div>
      <p>{recommendation.description}</p>
      {recommendation.currency && recommendation.overdue_outstanding !== undefined ? (
        <p>
          <strong>المبلغ المتأخر: {formatCustomer360Money(recommendation.overdue_outstanding, recommendation.currency)}</strong>
          {" · "}فواتير: {recommendation.overdue_invoice_count === undefined ? 'غير متاح' : formatNumber(recommendation.overdue_invoice_count)}
        </p>
      ) : null}
      {recommendation.pending_order_count !== undefined ? <p>الطلبات المعلقة: {formatNumber(recommendation.pending_order_count)}</p> : null}
      {recommendation.days_since_last_order !== undefined ? <p>الأيام منذ آخر طلب: {formatNumber(recommendation.days_since_last_order)}</p> : null}
      <small>{recommendation.action}</small>
    </article>
  );
}

function Customer360Recommendations({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.recommendations.length === 0) {
    return (
      <p className="report-note">
        لا توجد توصية ضمن قواعد التنبيه الحالية (متأخرات مسجلة، طلبات معلقة، أو انقطاع طلبات 30 يومًا). لا يعني ذلك غياب جميع المخاطر.
      </p>
    );
  }
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {summary.recommendations.map((recommendation, index) => (
        <Customer360RecommendationCard key={recommendation.type + ':' + index} recommendation={recommendation} />
      ))}
    </div>
  );
}

function Customer360FullAnalysis({ summary }: { summary: StaffCustomer360Summary }) {
  return (
    <section className="panel">
      <h3>التحليل الكامل لملف العميل</h3>
      <p className="report-note">
        المؤشرات أدناه محسوبة في قاعدة البيانات من سجل المؤسسة كاملًا. تفاصيل الجداول الأخرى محدودة بآخر 20 حركة؛ القيم غير الصالحة تبقى «غير متاحة».
      </p>
      <Customer360FullOrderMetrics summary={summary} />
      <h3 style={{ marginTop: 18 }}>ملخص الفواتير والتحصيل الكامل حسب العملة</h3>
      <Customer360FinanceByCurrency summary={summary} />
      <h3 style={{ marginTop: 18 }}>المنتجات الأكثر شراءً من العميل</h3>
      <Customer360TopProducts summary={summary} />
      <h3 style={{ marginTop: 18 }}>إشارات المتابعة المبنية على السجل</h3>
      <Customer360Recommendations summary={summary} />
      <p className="report-note" style={{ marginTop: 12 }}>
        آخر احتساب: {formatDateShort(summary.generated_at)}. هذه إشارات تشغيلية حتمية وليست توصيات مولدة بالذكاء الاصطناعي.
      </p>
    </section>
  );
}

function Customer360RecentOrders({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.recent_orders.length === 0) return <Empty text="لا توجد طلبات لهذا العميل." />;
  return (
    <TableWrap>
      <table>
        <thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>الحالة</th><th>الأصناف</th><th>الإجمالي</th></tr></thead>
        <tbody>
          {summary.recent_orders.map((order) => (
            <tr key={order.id}>
              <td>{order.order_number}</td><td>{formatDateShort(order.created_at)}</td><td>{order.status}</td>
              <td>{order.total_items === null ? '—' : formatNumber(order.total_items)}</td>
              <td>{order.total_amount === null ? 'غير متاح' : formatCurrency(order.total_amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Customer360RecentInvoices({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.recent_invoices.length === 0) return <Empty text="لا توجد فواتير مسجلة لهذا العميل." />;
  return (
    <TableWrap>
      <table>
        <thead><tr><th>الفاتورة</th><th>الإصدار</th><th>الاستحقاق</th><th>الحالة</th><th>الإجمالي</th><th>المسدّد</th><th>الإشعار الدائن المرحّل</th><th>المتبقي</th></tr></thead>
        <tbody>
          {summary.recent_invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>{invoice.invoice_number}</td>
              <td>{invoice.issued_at ? formatDateShort(invoice.issued_at) : 'غير محدد'}</td>
              <td>{invoice.due_at ? formatDateShort(invoice.due_at) : 'غير محدد'}</td>
              <td>{invoiceStatusLabel[invoice.status] ?? invoice.status}</td>
              <td>{formatCustomer360Money(invoice.total_amount, invoice.currency)}</td>
              <td>{formatCustomer360Money(invoice.paid_amount, invoice.currency)}</td>
              <td>{formatCustomer360Money(invoice.credit_memo_amount, invoice.currency)}</td>
              <td>{formatCustomer360Money(invoice.outstanding_amount, invoice.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Customer360RecentPayments({ summary }: { summary: StaffCustomer360Summary }) {
  if (summary.recent_payments.length === 0) return <Empty text="لا توجد دفعات مسجلة لهذا العميل." />;
  return (
    <TableWrap>
      <table>
        <thead><tr><th>التاريخ</th><th>الفاتورة</th><th>طريقة الدفع</th><th>المبلغ</th></tr></thead>
        <tbody>
          {summary.recent_payments.map((payment) => {
            const relatedInvoice = summary.recent_invoices.find((invoice) => invoice.id === payment.invoice_id);
            return (
              <tr key={payment.id}>
                <td>{formatDateShort(payment.paid_at)}</td>
                <td>{relatedInvoice?.invoice_number ?? 'خارج أحدث 20 فاتورة'}</td>
                <td>{payment.payment_method ?? 'غير محددة'}</td>
                <td>{relatedInvoice ? formatCustomer360Money(payment.amount, relatedInvoice.currency) : 'غير متاح — عملة الفاتورة خارج أحدث 20 فاتورة'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
}

function Customer360RecentActivity({ summary }: { summary: StaffCustomer360Summary }) {
  return (
    <>
      <section className="panel">
        <h3>آخر الطلبات ({formatNumber(summary.recent_orders.length)} معروضة من {formatNumber(summary.order_summary.order_count)} طلب)</h3>
        <Customer360RecentOrders summary={summary} />
      </section>
      <section className="panel">
        <h3>آخر الفواتير ({formatNumber(summary.recent_invoices.length)} معروضة)</h3>
        <Customer360RecentInvoices summary={summary} />
      </section>
      <section className="panel">
        <h3>آخر الدفعات ({formatNumber(summary.recent_payments.length)} معروضة)</h3>
        <Customer360RecentPayments summary={summary} />
      </section>
    </>
  );
}


const retentionActivityLabels = {
  ACTIVE: 'نشط',
  COOLING: 'بدأ يتراجع',
  AT_RISK: 'معرض للانقطاع',
  INACTIVE: 'غير نشط',
  NO_ORDER_DATE: 'لا توجد طلبات مسجلة',
  UNKNOWN: 'غير محدد',
} as const;

function retentionPercent(value: number | null): string {
  return value === null ? 'غير متاح' : new Intl.NumberFormat('ar-YE', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(value) + '٪';
}

function Customer360RetentionReportBody({
  report,
  customerId,
}: {
  report: CustomerRetentionReport;
  customerId: string;
}) {
  if (report.status !== 'VERIFIED') {
    return (
      <div className="customer-360-retention-state" role="status">
        <strong>التصنيف محجوب لحين اكتمال الأدلة</strong>
        <p>لم يثبت اكتمال مجتمع العملاء أو سلامة جميع سجلات الطلبات للفترة المختارة. لن يعرض التطبيق معدل احتفاظ أو تصنيف نشاط مبنيًا على عينة ناقصة.</p>
        <small>حالة الدليل: {report.status} · التحذيرات: {report.warnings.join('، ') || 'لم يقدم المصدر سببًا تفصيليًا.'}</small>
      </div>
    );
  }

  const customer = report.customers.find(item => item.customerRef === customerId) ?? null;
  const activity = customer?.activity ?? 'UNKNOWN';
  const followUpGuidance: Record<keyof typeof retentionActivityLabels, string> = {
    ACTIVE: 'العميل نشط ضمن فترة القياس. استمر في المتابعة حسب سجل التواصل واحتياج العميل.',
    COOLING: 'تراجع النشاط مقارنة بآخر طلب. راجع سجل التواصل وحدد خطوة متابعة مناسبة.',
    AT_RISK: 'لم يسجل العميل طلبًا منذ 61 إلى 90 يومًا. أعطِ التواصل أولوية وتحقق من احتياجه قبل أي استنتاج.',
    INACTIVE: 'لم يسجل العميل طلبًا منذ أكثر من 90 يومًا. راجع سجل التعامل والتواصل قبل اقتراح إعادة التنشيط.',
    NO_ORDER_DATE: 'لا توجد طلبات مسجلة لهذا العميل في الفترتين؛ لا يستنتج المحرك سببًا لذلك.',
    UNKNOWN: 'لا تسمح الأدلة الحالية بتحديد فئة نشاط موثوقة.',
  };

  return (
    <>
      <div className="customer-360-retention-kpis">
        <article><span>معدل الاحتفاظ بالمجموعة السابقة</span><strong>{retentionPercent(report.retentionRate)}</strong></article>
        <article><span>معدل تكرار الشراء</span><strong>{retentionPercent(report.repeatPurchaseRate)}</strong></article>
        <article><span>العملاء ضمن المجتمع</span><strong>{formatNumber(report.population.total ?? 0)}</strong></article>
        <article><span>عملاء نشطون في الفترة</span><strong>{formatNumber(report.population.activeCurrentPeriod ?? 0)}</strong></article>
      </div>
      <div className="customer-360-retention-activity">
        <div className="customer-360-retention-customer">
          <div>
            <span className="report-note">تصنيف هذا العميل</span>
            <strong>{customer ? retentionActivityLabels[activity] : 'تعذر مطابقة العميل'}</strong>
          </div>
          <span className="customer-360-retention-verified">الدليل مكتمل</span>
        </div>
        {customer ? (
          <>
            <p>{followUpGuidance[activity]}</p>
            <div className="customer-360-retention-facts">
              <span>طلبات الفترة الحالية: {formatNumber(customer.orderCountCurrent ?? 0)}</span>
              <span>طلبات الفترة السابقة: {formatNumber(customer.orderCountPrevious ?? 0)}</span>
              <span>آخر طلب: {customer.lastOrderAt ? customerInteractionDate(customer.lastOrderAt) : 'لا يوجد'}</span>
              <span>منذ آخر طلب: {customer.daysSinceLastOrder === null ? 'غير متاح' : formatNumber(customer.daysSinceLastOrder) + ' يومًا'}</span>
            </div>
            {(activity === 'COOLING' || activity === 'AT_RISK' || activity === 'INACTIVE') && (
              <p className="customer-360-retention-action">الخطوة العملية: سجّل اتصالًا أو زيارة من سجل التواصل أدناه، وحدد موعد المتابعة عند الاتفاق مع العميل.</p>
            )}
          </>
        ) : (
          <p>لم يتم العثور على سجل مطابق في نتيجة التحليل؛ لا يتم استبدال المعرف أو التخمين.</p>
        )}
      </div>
      <p className="report-note">الفترة الحالية: {report.period.from} — {report.period.to} · المقارنة السابقة: {report.previousPeriod.from} — {report.previousPeriod.to} · وقت القياس: {customerInteractionDate(report.asOf)}</p>
    </>
  );
}

function Customer360RetentionInsights({ customerId }: { customerId: string }) {
  const [periodDays, setPeriodDays] = useState<30 | 60 | 90 | 180 | 365>(90);
  const [report, setReport] = useState<CustomerRetentionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    setReport(null);
    try {
      const result = await fetchCustomerRetentionReport(periodDays);
      setReport(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حساب مؤشرات الاحتفاظ بالعملاء.');
    } finally {
      setLoading(false);
    }
  }, [periodDays]);

  useEffect(() => { void reload(); }, [reload]);

  return (
    <section className="panel customer-360-retention">
      <div className="customer-360-retention-heading">
        <div>
          <h3>ذكاء الاحتفاظ بالعملاء</h3>
          <p className="report-note">تحليل حتمي من سجل الطلبات داخل المؤسسة، دون أسعار أو أرصدة أو ملفات مالية. يستخدم مقارنة فترتين متساويتين وتصنيف النشاط بحسب آخر طلب موثق.</p>
        </div>
        <label className="customer-360-retention-period">
          <span>فترة القياس</span>
          <select value={periodDays} disabled={loading} onChange={event => setPeriodDays(Number(event.target.value) as 30 | 60 | 90 | 180 | 365)}>
            <option value={30}>آخر 30 يومًا</option>
            <option value={60}>آخر 60 يومًا</option>
            <option value={90}>آخر 90 يومًا</option>
            <option value={180}>آخر 180 يومًا</option>
            <option value={365}>آخر 365 يومًا</option>
          </select>
        </label>
      </div>
      {loading ? <Loading /> : error ? (
        <div className="customer-360-retention-state">
          <ErrorBox message={error} />
          <Button variant="secondary" onClick={() => { void reload(); }}>إعادة تحميل التحليل</Button>
        </div>
      ) : report ? (
        <Customer360RetentionReportBody report={report} customerId={customerId} />
      ) : null}
    </section>
  );
}

function Customer360LoadedView({
  summary,
  overdueInvoiceCount,
}: {
  summary: StaffCustomer360Summary;
  overdueInvoiceCount: number;
}) {
  return (
    <>
      <Customer360InitialMetrics summary={summary} />
      <Customer360OrderOverview summary={summary} overdueInvoiceCount={overdueInvoiceCount} />
      <Customer360FullAnalysis summary={summary} />
      <Customer360RecentActivity summary={summary} />
    </>
  );
}

function createCustomerInteractionIdempotencyKey(): string {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replace(/-/g, '')
    : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return 'customer360_' + randomPart;
}

const interactionTypeLabels: Record<CustomerInteractionType, string> = {
  call: 'اتصال هاتفي',
  visit: 'زيارة',
  whatsapp: 'واتساب',
  email: 'بريد إلكتروني',
  meeting: 'اجتماع',
  note: 'ملاحظة داخلية',
  other: 'أخرى',
};

function customerInteractionDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('ar-YE', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'تاريخ غير صالح في السجل';
}


function customerFollowUpDateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function Customer360FollowUpControls({
  item,
  onUpdated,
}: {
  item: CustomerInteraction;
  onUpdated: () => Promise<void>;
}) {
  const [dueAt, setDueAt] = useState(() => customerFollowUpDateTimeInput(item.follow_up_due_at || item.next_follow_up_at));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => createCustomerInteractionIdempotencyKey());

  useEffect(() => {
    setDueAt(customerFollowUpDateTimeInput(item.follow_up_due_at || item.next_follow_up_at));
    setReason('');
  }, [item.id, item.follow_up_due_at, item.next_follow_up_at]);

  if (!item.next_follow_up_at) return null;

  const statusLabels = {
    pending: 'مفتوحة',
    in_progress: 'قيد التنفيذ',
    completed: 'مكتملة',
    cancelled: 'ملغاة',
  } as const;
  const isOpen = item.follow_up_status === 'pending' || item.follow_up_status === 'in_progress';
  const currentDueInput = customerFollowUpDateTimeInput(item.follow_up_due_at || item.next_follow_up_at);

  async function submit(action: 'reschedule' | 'cancel') {
    if (action === 'reschedule' && !dueAt) return;
    if (action === 'cancel' && !reason.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await manageCustomerInteractionFollowUp({
        interactionId: item.id,
        action,
        idempotencyKey,
        newDueAt: action === 'reschedule' ? new Date(dueAt).toISOString() : null,
        reason: reason.trim() || null,
      });
      setNotice(action === 'reschedule' ? 'تم تحديث موعد المهمة مع الاحتفاظ بتاريخ التواصل الأصلي.' : 'أُلغيت مهمة المتابعة وحُفظ السبب في سجل التدقيق.');
      setReason('');
      setIdempotencyKey(createCustomerInteractionIdempotencyKey());
      await onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر تحديث مهمة المتابعة.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="customer-360-follow-up-controls">
      <div className="customer-360-follow-up-summary">
        <span>الموعد المسجل: {customerInteractionDate(item.next_follow_up_at)}</span>
        <span>الموعد الحالي: {item.follow_up_due_at ? customerInteractionDate(item.follow_up_due_at) : 'غير متاح'}</span>
        <strong>{item.follow_up_status ? statusLabels[item.follow_up_status] : 'مهمة المتابعة غير مرتبطة'}</strong>
      </div>
      {item.follow_up_status === 'cancelled' && item.follow_up_cancellation_reason && (
        <p className="report-note">سبب الإلغاء: {item.follow_up_cancellation_reason}</p>
      )}
      {isOpen && item.follow_up_task_id && (
        <div className="customer-360-follow-up-form">
          <label>
            <span>إعادة جدولة المهمة</span>
            <input
              type="datetime-local"
              required
              value={dueAt}
              min={customerFollowUpDateTimeInput(new Date().toISOString())}
              disabled={busy}
              onChange={(event) => {
                setDueAt(event.target.value);
                setIdempotencyKey(createCustomerInteractionIdempotencyKey());
              }}
            />
          </label>
          <label>
            <span>سبب التغيير أو الإلغاء</span>
            <input
              type="text"
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(event) => {
                setReason(event.target.value);
                setIdempotencyKey(createCustomerInteractionIdempotencyKey());
              }}
              placeholder="سبب الإلغاء إلزامي؛ وملاحظة تغيير الموعد اختيارية"
            />
          </label>
          <div className="customer-360-follow-up-actions">
            <Button
              variant="secondary"
              disabled={busy || !dueAt || dueAt === currentDueInput}
              onClick={() => { void submit('reschedule'); }}
            >
              {busy ? 'جارٍ الحفظ…' : 'حفظ الموعد الجديد'}
            </Button>
            <Button
              variant="outline"
              disabled={busy || !reason.trim()}
              onClick={() => { void submit('cancel'); }}
            >
              إلغاء المتابعة
            </Button>
          </div>
        </div>
      )}
      {notice && <p className="customer-360-interaction-notice" role="status">{notice}</p>}
      {error && <ErrorBox message={error} />}
      {item.follow_up_updated_at && <small className="customer-360-follow-up-updated">آخر تحديث للمهمة: {customerInteractionDate(item.follow_up_updated_at)}</small>}
    </div>
  );
}

function Customer360Interactions({
  customerId,
  onHistoryState,
}: {
  customerId: string;
  onHistoryState: (items: CustomerInteraction[], loading: boolean, error: string) => void;
}) {
  const [items, setItems] = useState<CustomerInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [interactionType, setInteractionType] = useState<CustomerInteractionType>('call');
  const [subject, setSubject] = useState('');
  const [details, setDetails] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => createCustomerInteractionIdempotencyKey());

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    onHistoryState([], true, '');
    try {
      const rows = await fetchCustomerInteractions(customerId, 50);
      setItems(rows);
      onHistoryState(rows, false, '');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'تعذر تحميل سجل تواصل العميل.';
      setError(message);
      setItems([]);
      onHistoryState([], false, message);
    } finally {
      setLoading(false);
    }
  }, [customerId, onHistoryState]);

  useEffect(() => { void reload(); }, [reload]);

  async function submitInteraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subject.trim() || !details.trim()) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await recordCustomerInteraction({
        customerId,
        idempotencyKey,
        interactionType,
        subject,
        details,
        nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
      });
      setSubject('');
      setDetails('');
      setNextFollowUpAt('');
      setIdempotencyKey(createCustomerInteractionIdempotencyKey());
      setNotice('حُفظ التواصل في سجل العميل مع هوية الموظف وسجل التدقيق، وأُنشئت مهمة المتابعة في مركز العمليات عند تحديد موعد.');
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر حفظ تواصل العميل.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel customer-360-interactions">
      <div className="customer-360-interactions-heading">
        <div>
          <h3><MessageSquare size={18} /> سجل التواصل والمتابعة</h3>
          <p className="report-note">سجل تشغيلي مؤرخ؛ عند تحديد موعد متابعة، يضيف النظام مهمة مؤرخة إلى قائمة مهام المبيعات في مركز العمليات. لا ينشئ ذلك طلبًا أو فاتورة أو دفعة ولا يغيّر رصيد العميل.</p>
        </div>
        <Button variant="secondary" onClick={() => { void reload(); }} disabled={loading || saving}>
          <RefreshCw size={15} /> تحديث السجل
        </Button>
      </div>

      <form className="customer-360-interaction-form" onSubmit={(event) => { void submitInteraction(event); }}>
        <label>
          <span>نوع التواصل</span>
          <select value={interactionType} disabled={saving} onChange={(event) => { setInteractionType(event.target.value as CustomerInteractionType); setIdempotencyKey(createCustomerInteractionIdempotencyKey()); }}>
            {Object.entries(interactionTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>موضوع المتابعة</span>
          <input value={subject} maxLength={200} required disabled={saving} onChange={(event) => { setSubject(event.target.value); setIdempotencyKey(createCustomerInteractionIdempotencyKey()); }} placeholder="مثال: متابعة عرض السعر أو موعد التسليم" />
        </label>
        <label className="customer-360-interaction-details">
          <span>ملخص التواصل والنتيجة</span>
          <textarea value={details} maxLength={4000} rows={3} required disabled={saving} onChange={(event) => { setDetails(event.target.value); setIdempotencyKey(createCustomerInteractionIdempotencyKey()); }} placeholder="اكتب ما تم التواصل بشأنه والاتفاق أو الإجراء التالي" />
        </label>
        <label>
          <span>موعد المتابعة القادمة (اختياري)</span>
          <input type="datetime-local" value={nextFollowUpAt} disabled={saving} onChange={(event) => { setNextFollowUpAt(event.target.value); setIdempotencyKey(createCustomerInteractionIdempotencyKey()); }} />
        </label>
        <div className="customer-360-interaction-submit">
          <Button disabled={saving || !subject.trim() || !details.trim()}>
            {saving ? 'جارٍ حفظ التواصل…' : 'حفظ في سجل العميل'}
          </Button>
        </div>
      </form>

      {notice && <p className="customer-360-interaction-notice" role="status">{notice}</p>}
      {error && <ErrorBox message={error} />}
      {loading ? <Loading /> : items.length === 0 ? (
        <Empty text="لا يوجد سجل تواصل مسجل لهذا العميل؛ أضف أول متابعة من النموذج أعلاه." />
      ) : (
        <div className="customer-360-interaction-list">
          {items.map((item) => (
            <article className="customer-360-interaction-item" key={item.id}>
              <div className="customer-360-interaction-meta">
                <strong>{item.subject}</strong>
                <span>{interactionTypeLabels[item.interaction_type]}</span>
                <time>{customerInteractionDate(item.interaction_at)}</time>
              </div>
              <p>{item.details}</p>
              <div className="customer-360-interaction-footer">
                <small>سُجل بواسطة: {item.recorded_by_name} · {formatDateShort(item.created_at)}</small>
              </div>
              <Customer360FollowUpControls item={item} onUpdated={reload} />
            </article>
          ))}
        </div>
      )}
      <p className="report-note">يعرض السجل أحدث {formatNumber(items.length)} إدخالًا من حد العرض الحالي (حتى 50 سجلًا)؛ تبقى بقية الإدخالات محفوظة في قاعدة البيانات ولا تُحذف من هذه الشاشة.</p>
    </section>
  );
}

export function AdminCustomer360({ customer, onClose }: { customer: Pick<Customer, "id">; onClose: () => void }) {
  const [summary, setSummary] = useState<StaffCustomer360Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportError, setExportError] = useState('');
  const [printError, setPrintError] = useState('');
  const [interactionHistory, setInteractionHistory] = useState<CustomerInteraction[]>([]);
  const [interactionHistoryLoading, setInteractionHistoryLoading] = useState(true);
  const [interactionHistoryError, setInteractionHistoryError] = useState('');
  const handleInteractionHistoryState = useCallback((items: CustomerInteraction[], isLoading: boolean, historyError: string) => {
    setInteractionHistory(items);
    setInteractionHistoryLoading(isLoading);
    setInteractionHistoryError(historyError);
  }, []);

  const loadCustomer360 = useCallback(async () => {
    setSummary(null);
    setInteractionHistory([]);
    setInteractionHistoryLoading(true);
    setInteractionHistoryError('');
    setLoading(true);
    setError('');
    setExportError('');
    try {
      const scope = await getCurrentTenantScope();
      const { data: scopedCustomer, error: scopedCustomerError } = await supabase
        .from('customers')
        .select('id')
        .eq('organization_id', scope.organizationId)
        .eq('id', customer.id)
        .maybeSingle();
      if (scopedCustomerError) throw scopedCustomerError;
      if (!scopedCustomer || scopedCustomer.id !== customer.id) {
        throw new Error(CUSTOMER_SCOPE_BLOCKED_MESSAGE);
      }
      const customerSummary = await fetchStaffCustomer360Summary(customer.id);
      setSummary(customerSummary);
    } catch (cause) {
      setSummary(null);
      setError(cause instanceof Error && cause.message === CUSTOMER_SCOPE_BLOCKED_MESSAGE ? CUSTOMER_SCOPE_BLOCKED_MESSAGE : CUSTOMER360_LOAD_ERROR_MESSAGE);
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => { void loadCustomer360(); }, [loadCustomer360]);

  async function reload() {
    await loadCustomer360();
  }

  const overdueInvoiceCount = summary?.finance_by_currency.reduce((total, row) => total + row.overdue_invoice_count, 0) ?? 0;
  const printDocument = useMemo(() => {
    if (!summary || interactionHistoryLoading || interactionHistoryError) return null;
    try {
      return projectStaffCustomer360PrintDocument(summary, interactionHistory);
    } catch {
      return null;
    }
  }, [summary, interactionHistory, interactionHistoryLoading, interactionHistoryError]);

  function exportCustomer360() {
    if (!summary) return;
    setExportError('');
    if (interactionHistoryLoading || interactionHistoryError) {
      setExportError('تعذر تضمين سجل التواصل الحالي؛ حدّث السجل قبل تصدير ملف العميل.');
      return;
    }
    try {
      downloadStaffCustomer360WorkbookXlsx(summary, interactionHistory);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'تعذر إنشاء ملف العميل 360.');
    }
  }

  function printCustomer360() {
    if (!printDocument || typeof window === 'undefined' || typeof document === 'undefined' || typeof window.print !== 'function') {
      setPrintError('تعذر تجهيز نسخة الطباعة من بيانات العميل الحالية.');
      return;
    }
    setPrintError('');
    const body = document.body;
    const previousMode = body.getAttribute('data-print-mode');
    body.setAttribute('data-print-mode', 'customer-360');
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
  return <Modal title={summary ? 'ملف العميل 360 — ' + summary.customer.business_name : 'ملف العميل 360'} onClose={onClose}>
    <div style={{ display: 'grid', gap: 14, maxHeight: '75vh', overflowY: 'auto', padding: 2 }}>
      <Customer360Header
        summary={summary}
        loading={loading}
        exportError={exportError}
        printError={printError}
        printDisabled={!printDocument}
        onReload={() => { void reload(); }}
        onExport={exportCustomer360}
        onPrint={printCustomer360}
      />
      {loading ? <Loading /> : error ? <ErrorBox message={error} /> : summary ? (
        <>
          <Customer360LoadedView
            summary={summary}
            overdueInvoiceCount={overdueInvoiceCount}
          />
          <Customer360RetentionInsights customerId={summary.customer.id} />
          <CustomerServiceCases customerId={summary.customer.id} />
          <Customer360Interactions customerId={summary.customer.id} onHistoryState={handleInteractionHistoryState} />
        </>
      ) : null}   </div>
    {printDocument && typeof document !== 'undefined' ? createPortal(<Customer360PrintSheet document={printDocument} />, document.body) : null}
  </Modal>;
}
