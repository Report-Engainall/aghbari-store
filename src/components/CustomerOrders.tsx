import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Download, FileText, Package, Printer, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useFetch } from '@/lib/useFetch';
import { useAuth } from '@/lib/auth';
import { formatDate, formatNumber } from '@/lib/format';
import { ORDER_STATUS_LABELS, type Order, type OrderItem } from '@/lib/types';
import { projectCustomerOrderPrintDocument } from '@/lib/customer-order-print';
import { downloadCustomerOrderWorkbookXlsx } from '@/lib/customer-order-xlsx';
import { CustomerOrderAmendmentHistory } from '@/components/CustomerOrderAmendmentHistory';

const CUSTOMER_ORDERS_PAGE_SIZE = 25;

function normalizeOrderNumberSearch(value: string): string {
  return value.trim()
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[%_]/g, "")
    .slice(0, 60);
}

type CustomerOrderSummary = Pick<Order, 'id' | 'order_number' | 'status' | 'total_items' | 'created_at'> & {
  quantity_review_required?: boolean;
  customer_adjustment_note?: string | null;
  customer_payment_requested_at?: string | null;
  payment_request_status?: string;
};
type CustomerOrderDocument = Pick<Order, 'id' | 'order_number' | 'customer_id' | 'status' | 'total_items' | 'notes' | 'created_at' | 'delivery_address_snapshot'> & {
  quantity_review_required?: boolean;
  customer_adjustment_note?: string | null;
  customer_payment_requested_at?: string | null;
  customer_confirmed_at?: string | null;
  payment_request_status?: string;
};
type CustomerOrderLine = Pick<OrderItem, 'id' | 'product_id' | 'item_code' | 'product_name_snapshot' | 'unit_snapshot' | 'quantity'> & {
  requested_quantity?: number | null;
  approved_quantity?: number | null;
};
type CustomerOrderAmendmentSummary = {
  status: 'pending_review' | 'approved' | 'rejected';
  note: string | null;
  review_note: string | null;
  created_at: string;
};
type CustomerOrderCancellationSummary = { reason: string; created_at: string };

const CUSTOMER_REORDER_PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildCustomerReorderTemplateLines(items: CustomerOrderLine[]): Array<{ product_id: string; quantity: number }> {
  if (items.length < 1 || items.length > 100) {
    throw new Error('لا يمكن حفظ قالب فارغ أو يحتوي على أكثر من 100 صنف.');
  }
  const lines = items.map((item) => {
    if (typeof item.product_id !== 'string' || !CUSTOMER_REORDER_PRODUCT_ID_PATTERN.test(item.product_id)) {
      throw new Error('لا يمكن حفظ القالب لأن أحد الأصناف لم يعد مرتبطًا بمنتج صالح.');
    }
    const quantity = Number(item.approved_quantity ?? item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) {
      throw new Error('توجد كمية غير صالحة في الطلب؛ لم يُحفظ القالب.');
    }
    return { product_id: item.product_id, quantity };
  });
  const uniqueProductIds = new Set(lines.map((line) => line.product_id.toLowerCase()));
  if (uniqueProductIds.size !== lines.length) {
    throw new Error('يتضمن الطلب صنفًا مكررًا؛ لم يُحفظ القالب لتجنب تكرار الكميات.');
  }
  return lines;
}
import { Login } from '@/components/Login';
import { CustomerReturnRequest } from '@/components/CustomerReturnRequest';

export const STATUS_LABELS: Record<string, string> = {
  ...ORDER_STATUS_LABELS,
  draft: 'مسودة',
  pending: 'بانتظار المراجعة',
  confirmed: 'مؤكد',
  processing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  needs_customer_amendment: 'بانتظار تعديل العميل',
  returned_for_adjustment: 'أُعيد للتعديل',
  awaiting_customer_payment: 'بانتظار إبلاغ السداد',
};

const CUSTOMER_ORDER_PROGRESS_STEPS = [
  { id: 'received', label: 'تم استلام الطلب' },
  { id: 'reviewed', label: 'تمت المراجعة' },
  { id: 'preparing', label: 'قيد التجهيز' },
  { id: 'dispatched', label: 'تم الشحن' },
  { id: 'delivered', label: 'تم التسليم' },
] as const;

const CUSTOMER_ORDER_PROGRESS_STAGE: Record<string, number> = {
  new: 0,
  pending: 0,
  received: 1,
  reviewing: 1,
  returned: 1,
  needs_customer_amendment: 1,
  returned_for_adjustment: 1,
  approved: 1,
  confirmed: 1,
  awaiting_customer_payment: 1,
  preparing: 2,
  processing: 2,
  prepared: 3,
  dispatched: 3,
  shipped: 3,
  delivered: 4,
  invoiced: 4,
};

function customerOrderProgressStage(status: string): number {
  return CUSTOMER_ORDER_PROGRESS_STAGE[status] ?? -1;
}

const wrap: React.CSSProperties = { maxWidth: 1100, margin: '0 auto', padding: '32px 20px 60px' };
const card: React.CSSProperties = { background: 'var(--card, #fff)', border: '1px solid #e0ecee', borderRadius: 16, padding: 20 };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="storefront" dir="rtl" style={{ minHeight: '100vh' }}>
      <header className="sf-header"><div className="sf-header-inner">
        <Link to="/" className="sf-brand" style={{ textDecoration: 'none' }}><div className="sf-brand-icon"><Package size={22} /></div><div><strong>الأغبري</strong><span>حسابي التجاري</span></div></Link>
        <Link to="/" className="sf-admin-btn" style={{ textDecoration: 'none' }}><ArrowRight size={16} /> العودة للمتجر</Link>
      </div></header>
      <main style={wrap}>{children}</main>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  if (!ready) return <Shell><p role="status">جارٍ التحميل...</p></Shell>;
  if (!user) return <Login />;
  return <>{children}</>;
}

export function MyOrders() {
  return <Gate><MyOrdersInner /></Gate>;
}


function MyOrdersStatusFilter({
  status,
  disabled,
  onChange,
}: {
  status: string;
  disabled: boolean;
  onChange: (status: string) => void;
}) {
  return (
    <div className="no-print" style={{ ...card, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <label htmlFor="customer-orders-status-filter" style={{ fontWeight: 700 }}>تصفية حسب الحالة</label>
      <select
        id="customer-orders-status-filter"
        aria-label="تصفية طلباتي حسب الحالة"
        value={status}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        style={{ minWidth: 220, padding: 10, border: '1px solid #cbdad9', borderRadius: 9, background: '#fff' }}
      >
        <option value="all">كل الحالات</option>
        {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </div>
  );
}

function MyOrdersCountNotice({ count, status, searchActive }: { count: number; status: string; searchActive: boolean }) {
  const scope = status === "all" ? "طلب" : "طلب بهذه الحالة";
  return (
    <p role="status" aria-label="إجمالي نتائج الطلبات">
      {"إجمالي النتائج: " + formatNumber(count) + " " + scope + (searchActive ? " مطابقة لرقم الطلب" : "")}
    </p>
  );
}

function MyOrdersSearch({
  value,
  disabled,
  onChange,
  onSubmit,
  onClear,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear: () => void;
}) {
  return (
    <form
      className="no-print"
      onSubmit={(event) => { event.preventDefault(); onSubmit(); }}
      style={{ ...card, marginBottom: 12, display: "grid", gap: 10 }}
      aria-label="البحث في سجل الطلبات"
    >
      <label htmlFor="customer-orders-number-search" style={{ fontWeight: 700 }}>ابحث برقم الطلب</label>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input
          id="customer-orders-number-search"
          aria-label="رقم الطلب للبحث"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={60}
          placeholder="أدخل رقم الطلب أو جزءًا منه"
          disabled={disabled}
          style={{ flex: "1 1 220px", minWidth: 0, padding: 10, border: "1px solid #cbdad9", borderRadius: 9, background: "#fff", font: "inherit" }}
        />
        <button type="submit" className="sf-btn-primary" disabled={disabled}>بحث</button>
        {value ? <button type="button" className="sf-btn-secondary" onClick={onClear} disabled={disabled}>مسح</button> : null}
      </div>
      <p style={{ margin: 0, color: "#71878c", fontSize: 12 }}>يمكن إدخال الأرقام العربية أو الإنجليزية؛ يجري البحث في جميع طلبات الحساب المصرّح بها قبل تطبيق ترقيم الصفحات.</p>
    </form>
  );
}

function MyOrdersErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div style={card} role="alert">
      {error} <button type="button" className="sf-link" onClick={onRetry}>إعادة المحاولة</button>
    </div>
  );
}

function MyOrdersEmptyState({ status, searchActive }: { status: string; searchActive: boolean }) {
  return (
    <div style={{ ...card, textAlign: 'center' }}>
      <FileText size={32} />
      <p>{searchActive ? "لا توجد طلبات تطابق رقم البحث." : status === 'all' ? 'لا توجد طلبات بعد.' : 'لا توجد طلبات بهذه الحالة.'}</p>
      <Link to="/" className="sf-btn-primary" style={{ textDecoration: 'none', display: 'inline-flex', padding: '10px 18px' }}>ابدأ التسوق</Link>
    </div>
  );
}

function CustomerOrderStatusCell({ order }: { order: CustomerOrderSummary }) {
  const needsQuantityReview = order.quantity_review_required === true;
  const paymentRequested = Boolean(order.customer_payment_requested_at) && order.payment_request_status === 'requested';

  return (
    <td>
      <span className="sf-detail-category">{STATUS_LABELS[order.status] ?? order.status}</span>
      {needsQuantityReview ? (
        <strong style={{ display: 'block', color: '#9a5b13', marginTop: 5 }}>تنبيه: الطلب بانتظار اعتماد التعديلات.</strong>
      ) : null}
      {paymentRequested ? (
        <small style={{ display: 'block', color: '#17684d', marginTop: 5 }}>يرجى متابعة تعليمات السداد في تفاصيل الطلب.</small>
      ) : null}
    </td>
  );
}

function CustomerOrderTableRow({ order }: { order: CustomerOrderSummary }) {
  return (
    <tr style={{ borderTop: '1px solid #edf2f3' }}>
      <td style={{ padding: 12, fontWeight: 700 }}>{order.order_number}</td>
      <td>{formatDate(order.created_at)}</td>
      <td>{formatNumber(order.total_items)}</td>
      <CustomerOrderStatusCell order={order} />
      <td>
        <Link to="/orders/$id" params={{ id: order.id }} className="sf-link" aria-label={'تفاصيل الطلب ' + order.order_number}>
          التفاصيل
        </Link>
      </td>
    </tr>
  );
}

function MyOrdersPagination({
  page,
  pageCount,
  totalCount,
  loading,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  totalCount: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="صفحات الطلبات" style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', padding: 12, flexWrap: 'wrap' }}>
      <button type="button" className="sf-link" aria-label="صفحة الطلبات السابقة" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={loading || page <= 1}>السابق</button>
      <span role="status" aria-label="صفحة الطلبات الحالية">{'صفحة ' + page + ' من ' + pageCount + ' — إجمالي النتائج: ' + totalCount}</span>
      <button type="button" className="sf-link" aria-label="صفحة الطلبات التالية" onClick={() => onPageChange(Math.min(pageCount, page + 1))} disabled={loading || page >= pageCount}>التالي</button>
    </nav>
  );
}

function MyOrdersTable({
  orders,
  page,
  pageCount,
  totalCount,
  loading,
  onPageChange,
}: {
  orders: CustomerOrderSummary[];
  page: number;
  pageCount: number;
  totalCount: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}) {
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f4f8f9', textAlign: 'right' }}>
            <th style={{ padding: 12 }}>رقم الطلب</th><th>التاريخ</th><th>الأصناف</th><th>الحالة</th><th />
          </tr>
        </thead>
        <tbody>{orders.map((order) => <CustomerOrderTableRow key={order.id} order={order} />)}</tbody>
      </table>
      <MyOrdersPagination
        page={page}
        pageCount={pageCount}
        totalCount={totalCount}
        loading={loading}
        onPageChange={onPageChange}
      />
    </div>
  );
}

function MyOrdersResults({
  data,
  loading,
  error,
  totalCount,
  statusFilter,
  searchActive,
  page,
  pageCount,
  onRetry,
  onPageChange,
}: {
  data: CustomerOrderSummary[] | null;
  loading: boolean;
  error: string;
  totalCount: number | null;
  statusFilter: string;
  searchActive: boolean;
  page: number;
  pageCount: number;
  onRetry: () => void;
  onPageChange: (page: number) => void;
}) {
  if (loading) return <p role="status">جارٍ تحميل الطلبات...</p>;
  if (error) return <MyOrdersErrorState error={error} onRetry={onRetry} />;

  return (
    <>
      {totalCount !== null ? <MyOrdersCountNotice count={totalCount} status={statusFilter} searchActive={searchActive} /> : null}
      {data && data.length === 0 && totalCount === 0 ? <MyOrdersEmptyState status={statusFilter} searchActive={searchActive} /> : null}
      {data && data.length > 0 ? (
        <MyOrdersTable
          orders={data}
          page={page}
          pageCount={pageCount}
          totalCount={totalCount ?? 0}
          loading={loading}
          onPageChange={onPageChange}
        />
      ) : null}
    </>
  );
}

function MyOrdersInner() {
  const [data, setData] = useState<CustomerOrderSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchDraft, setSearchDraft] = useState('');
  const [orderNumberQuery, setOrderNumberQuery] = useState('');
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let query = supabase
        .from('orders')
        .select('id,order_number,status,total_items,created_at,quantity_review_required,customer_adjustment_note,customer_payment_requested_at,payment_request_status', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false });
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (orderNumberQuery) query = query.ilike('order_number', '%' + orderNumberQuery + '%');
      const { data: rows, error: queryError, count } = await query
        .range((page - 1) * CUSTOMER_ORDERS_PAGE_SIZE, page * CUSTOMER_ORDERS_PAGE_SIZE - 1);
      if (queryError) throw new Error('تعذر تحميل الطلبات');
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
        throw new Error('تعذر تأكيد إجمالي الطلبات. أعد المحاولة قبل الاعتماد على قائمة الطلبات.');
      }
      const nextPageCount = Math.max(1, Math.ceil(count / CUSTOMER_ORDERS_PAGE_SIZE));
      setTotalCount(count);
      if (page > nextPageCount) {
        setData([]);
        setPage(nextPageCount);
        return;
      }
      setData((rows ?? []) as CustomerOrderSummary[]);
    } catch (cause) {
      setData(null);
      setTotalCount(null);
      setError(cause instanceof Error ? cause.message : 'تعذر تحميل الطلبات.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, orderNumberQuery]);

  useEffect(() => { void load(); }, [load]);

  const pageCount = totalCount === null ? 1 : Math.max(1, Math.ceil(totalCount / CUSTOMER_ORDERS_PAGE_SIZE));
  return (
    <Shell>
      <h1 style={{ fontSize: 26, margin: '0 0 6px' }}>طلباتي</h1>
      <p style={{ color: '#7a9398', margin: '0 0 20px' }}>كل الطلبات المرسلة من حسابك وحالتها الحالية</p>
      <MyOrdersSearch
        value={searchDraft}
        disabled={loading}
        onChange={setSearchDraft}
        onSubmit={() => {
          setData(null);
          setTotalCount(null);
          setPage(1);
          setOrderNumberQuery(normalizeOrderNumberSearch(searchDraft));
        }}
        onClear={() => {
          setData(null);
          setTotalCount(null);
          setPage(1);
          setSearchDraft('');
          setOrderNumberQuery('');
        }}
      />
      <MyOrdersStatusFilter
        status={statusFilter}
        disabled={loading}
        onChange={(value) => {
          setData(null);
          setTotalCount(null);
          setPage(1);
          setStatusFilter(value);
        }}
      />
      <MyOrdersResults
        data={data}
        loading={loading}
        error={error}
        totalCount={totalCount}
        statusFilter={statusFilter}
        searchActive={orderNumberQuery.length > 0}
        page={page}
        pageCount={pageCount}
        onRetry={() => void load()}
        onPageChange={(nextPage) => {
          setData(null);
          setPage(nextPage);
        }}
      />
    </Shell>
  );
}

export function OrderInvoice({ id }: { id: string }) {
  return <Gate><OrderInvoiceInner key={id} id={id} /></Gate>;
}

function OrderInvoiceInner({ id }: { id: string }) {
  const { user } = useAuth();
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [amendmentQuantities, setAmendmentQuantities] = useState<Record<string, string>>({});
  const [amendmentNote, setAmendmentNote] = useState('');
  const [amendmentBusy, setAmendmentBusy] = useState(false);
  const [amendmentFeedback, setAmendmentFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const amendmentRequestKey = useRef<string | null>(null);
  const amendmentRequestFingerprint = useRef<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationBusy, setCancellationBusy] = useState(false);
  const [cancellationFeedback, setCancellationFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const cancellationRequestKey = useRef<string | null>(null);
  const [templateFeedback, setTemplateFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const [exportFeedback, setExportFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(null);
  const templateSaveInFlightRef = useRef(false);
  const { data, loading, error, refetch } = useFetch(async () => {
    const [o, i, h] = await Promise.all([
      supabase.from('orders').select('id,order_number,customer_id,status,total_items,notes,created_at,quantity_review_required,customer_adjustment_note,customer_payment_requested_at,customer_confirmed_at,payment_request_status,delivery_address_snapshot').eq('id', id).maybeSingle(),
      supabase.from('order_items').select('id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,requested_quantity,approved_quantity').eq('order_id', id),
      supabase.from('order_status_history').select('id,to_status,created_at,notes').eq('order_id', id).order('created_at'),
    ]);
    if (o.error || i.error || h.error) throw new Error('تعذر تحميل الطلب');
    const amendmentResult = await supabase
      .from('customer_order_amendments')
      .select('status,note,review_note,created_at')
      .eq('order_id', id)
      .order('created_at', { ascending:false })
      .limit(1)
      .maybeSingle();
    const amendment = amendmentResult.error ? null : amendmentResult.data as CustomerOrderAmendmentSummary | null;
    const cancellationResult = await supabase
      .from('customer_order_cancellations')
      .select('reason,created_at')
      .eq('order_id', id)
      .maybeSingle();
    const cancellation = cancellationResult.error ? null : cancellationResult.data as CustomerOrderCancellationSummary | null;
    if (!o.data) return { order: null, items: [] as CustomerOrderLine[], history: [] as { id: string; to_status: string; created_at: string; notes: string | null }[], customer: null as { customer_code: string; business_name: string; contact_name: string | null } | null, amendment: null as CustomerOrderAmendmentSummary | null, cancellation: null as CustomerOrderCancellationSummary | null };
    const customer = await supabase.from('customers').select('customer_code,business_name,contact_name').eq('id', o.data.customer_id).maybeSingle();
    if (customer.error) throw new Error('تعذر تحميل بيانات العميل');
    return {
      order: o.data as CustomerOrderDocument,
      items: (i.data ?? []) as CustomerOrderLine[],
      history: (h.data ?? []) as { id: string; to_status: string; created_at: string; notes: string | null }[],
      customer: customer.data as { customer_code: string; business_name: string; contact_name: string | null } | null,
      amendment,
      cancellation,
    };
  }, [id]);

  useEffect(() => {
    if (!data?.items) return;
    setAmendmentQuantities(Object.fromEntries(
      data.items.map((item) => [item.id, String(item.approved_quantity ?? item.quantity)]),
    ));
  }, [data?.order?.id, data?.items]);

  if (loading) return <Shell><p role="status">جارٍ تحميل الطلب...</p></Shell>;
  if (error) return <Shell><div style={card} role="alert">{error} <button type="button" className="sf-link" aria-label="إعادة تحميل تفاصيل الطلب" onClick={() => void refetch()}>إعادة المحاولة</button></div></Shell>;
  if (!data?.order) return <Shell><div style={card}>الطلب غير موجود أو لا تملك صلاحية عرضه. <Link to="/orders" className="sf-link">طلباتي</Link></div></Shell>;
  const { order, items, history, customer, amendment, cancellation } = data;
  const printOrder = {
    order_number: order.order_number ?? "غير مسجل",
    status: order.status,
    created_at: order.created_at,
    notes: order.notes ?? null,
    delivery_address_snapshot: order.delivery_address_snapshot ?? null,
    quantity_review_required: order.quantity_review_required,
    customer_adjustment_note: order.customer_adjustment_note ?? null,
    customer_payment_requested_at: order.customer_payment_requested_at ?? null,
    payment_request_status: order.payment_request_status,
  };
  const printLines = items.map((item) => ({
    item_code: item.item_code ?? null,
    product_name_snapshot: item.product_name_snapshot ?? "صنف غير مسمى",
    unit_snapshot: item.unit_snapshot ?? null,
    quantity: item.quantity,
    requested_quantity: item.requested_quantity ?? null,
    approved_quantity: item.approved_quantity ?? null,
  }));
  const printHistory = history.map((entry) => ({
    to_status: entry.to_status,
    created_at: entry.created_at,
  }));
  const printCustomer = customer ? {
    customer_code: customer.customer_code,
    business_name: customer.business_name,
    contact_name: customer.contact_name,
  } : null;
  const printDocument = projectCustomerOrderPrintDocument(
    printOrder, printLines, printHistory, printCustomer, user?.name ?? null,
  );

  function exportOrderWorkbook() {
    setExportFeedback(null);
    try {
      downloadCustomerOrderWorkbookXlsx(printDocument);
      setExportFeedback({ kind: 'success', message: 'تم تجهيز كشف الطلب بصيغة Excel للتنزيل. لا يحتوي الملف على أسعار أو تكاليف أو معرفات داخلية.' });
    } catch (cause) {
      setExportFeedback({ kind: 'error', message: cause instanceof Error ? cause.message : 'تعذر إنشاء ملف Excel للطلب.' });
    }
  }


  async function submitCustomerAmendment() {
    if (amendmentBusy || items.length===0 || amendment?.status==='pending_review') return;
    setAmendmentFeedback(null);
    const lines = items.map((item) => ({
      item_id: item.id,
      quantity: Number(amendmentQuantities[item.id] ?? item.approved_quantity ?? item.quantity),
    }));
    if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity<=0 || line.quantity>10000
      || Math.abs(line.quantity*1000-Math.round(line.quantity*1000))>0.000001)) {
      setAmendmentFeedback({ kind:'error', message:'تحقق من أن كل كمية أكبر من صفر ولا تتجاوز 10,000 وبحد أقصى ثلاث منازل عشرية.' });
      return;
    }
    if (!lines.some((line,index) => line.quantity !== Number(items[index].approved_quantity ?? items[index].quantity))) {
      setAmendmentFeedback({ kind:'error', message:'لم تتغير أي كمية؛ عدّل كمية بند واحد على الأقل قبل الإرسال.' });
      return;
    }
    setAmendmentBusy(true);
    try {
      const requestFingerprint = JSON.stringify({
        orderId: order.id,
        note: amendmentNote.trim() || null,
        lines,
      });
      const requestKey = amendmentRequestKey.current !== null
        && amendmentRequestFingerprint.current === requestFingerprint
        ? amendmentRequestKey.current
        : crypto.randomUUID().replace(/-/g,'');
      amendmentRequestKey.current = requestKey;
      amendmentRequestFingerprint.current = requestFingerprint;
      const { data: result, error: rpcError } = await supabase.rpc('submit_customer_order_amendment', {
        p_order_id: order.id,
        p_lines: lines,
        p_note: amendmentNote.trim() || null,
        p_idempotency_key: requestKey,
      });
      if (rpcError) throw rpcError;
      if (!result || typeof result!=='object' || Array.isArray(result)
        || result.order_id!==order.id
        || !['pending_review','approved','rejected'].includes(result.status)) {
        throw new Error('لم يؤكد الخادم استلام تعديل الطلب.');
      }
      amendmentRequestKey.current = null;
      amendmentRequestFingerprint.current = null;
      setAmendmentFeedback({
        kind:'success',
        message:'تم إرسال الكميات المقترحة إلى الإدارة. تبقى غير معتمدة، ولا يتغير السعر أو المخزون أو الفاتورة حتى مراجعة الموظف.',
      });
      await refetch();
    } catch (cause) {
      setAmendmentFeedback({
        kind:'error',
        message:cause instanceof Error ? cause.message : 'تعذر إرسال تعديل الطلب؛ لم يُعتمد أي تغيير.',
      });
    } finally {
      setAmendmentBusy(false);
    }
  }


  async function cancelCustomerOrder() {
    if (cancellationBusy || !['draft','pending'].includes(order.status)) return;
    const reason = cancellationReason.trim();
    if (reason.length<3 || reason.length>500) {
      setCancellationFeedback({ kind:'error', message:'اكتب سبب الإلغاء بطول من 3 إلى 500 حرف.' });
      return;
    }
    setCancellationBusy(true);
    setCancellationFeedback(null);
    try {
      const requestKey = cancellationRequestKey.current ?? crypto.randomUUID().replace(/-/g,'');
      cancellationRequestKey.current = requestKey;
      const { data: result, error: rpcError } = await supabase.rpc('cancel_customer_order', {
        p_order_id: order.id,
        p_reason: reason,
        p_idempotency_key: requestKey,
      });
      if (rpcError) throw rpcError;
      if (!result || typeof result!=='object' || Array.isArray(result)
        || result.order_id!==order.id || result.status!=='cancelled') {
        throw new Error('لم يؤكد الخادم إلغاء الطلب.');
      }
      cancellationRequestKey.current = null;
      setCancellationFeedback({
        kind:'success',
        message:'أُلغي الطلب قبل اعتماده من الإدارة. لم يُحجز مخزون ولم تُصدر فاتورة أو حركة مالية.',
      });
      await refetch();
    } catch (cause) {
      setCancellationFeedback({
        kind:'error',
        message:cause instanceof Error ? cause.message : 'تعذر إلغاء الطلب؛ تحقق من حالته ثم أعد المحاولة.',
      });
    } finally {
      setCancellationBusy(false);
    }
  }

  async function saveAsReorderTemplate() {
    if (templateSaveInFlightRef.current || templateSaving || templateSaved) return;
    templateSaveInFlightRef.current = true;
    setTemplateSaving(true);
    setTemplateFeedback(null);
    try {
      const lines = buildCustomerReorderTemplateLines(items);

      const templateName = ('إعادة طلب ' + String(order.order_number ?? '').trim()).slice(0, 100);
      if (templateName.trim().length < 2) {
        throw new Error('تعذر تحديد اسم صالح لقالب إعادة الطلب.');
      }

      // This existing RPC derives the customer and organization from the session,
      // validates source-order ownership, and rejects products that are no longer active.
      const { data: templateId, error: rpcError } = await supabase.rpc('save_reorder_template', {
        p_name: templateName,
        p_lines: lines,
        p_source_order_id: order.id,
      });
      if (
        rpcError
        || typeof templateId !== 'string'
        || !CUSTOMER_REORDER_PRODUCT_ID_PATTERN.test(templateId)
      ) {
        throw new Error('تعذر حفظ قالب إعادة الطلب. تحقق من صلاحيات الحساب وتوفر أصناف الطلب، ثم حاول مجددًا.');
      }

      setTemplateSaved(true);
      setTemplateFeedback({
        kind: 'success',
        message: 'تم حفظ قالب مرتبط بالطلب ' + String(order.order_number ?? '') + '. عند تطبيقه ستُراجع الأسعار والتوفر الحاليان قبل إرسال طلب جديد.',
      });
    } catch (cause) {
      setTemplateFeedback({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'تعذر حفظ قالب إعادة الطلب. حاول مجددًا.',
      });
    } finally {
      templateSaveInFlightRef.current = false;
      setTemplateSaving(false);
    }
  }

  return (
    <Shell>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .print-area, .print-area * { visibility: visible !important; }
        .print-area {
          position: absolute !important;
          top: 0 !important;
          right: 0 !important;
          left: 0 !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 10mm !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          background: #fff !important;
        }
      }`}</style>
      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <Link to="/orders" className="sf-btn-secondary" style={{ textDecoration: 'none', padding: '10px 16px' }}>كل الطلبات</Link>
        <button type="button" className="sf-btn-secondary" aria-label="تحديث حالة الطلب من الخادم" onClick={() => void refetch()}><RefreshCw size={16} /> تحديث الحالة</button>
        <button
          type="button"
          className="sf-btn-secondary"
          aria-label="حفظ كقالب إعادة الطلب"
          disabled={templateSaving || templateSaved}
          onClick={() => void saveAsReorderTemplate()}
        >
          {templateSaving ? 'جارٍ حفظ قالب إعادة الطلب...' : templateSaved ? 'تم حفظ قالب إعادة الطلب' : 'حفظ كقالب إعادة الطلب'}
        </button>
        <button type="button" className="sf-btn-secondary" aria-label="تنزيل كشف الطلب بصيغة Excel" onClick={exportOrderWorkbook}><Download size={16} /> تنزيل Excel</button>
        <button className="sf-btn-primary" onClick={() => window.print()}><Printer size={16} /> طباعة / حفظ PDF</button>
      </div>
      {exportFeedback && (
        <div className="no-print" role={exportFeedback.kind === 'error' ? 'alert' : 'status'} style={{ ...card, marginBottom: 16, borderColor: exportFeedback.kind === 'error' ? '#dfb5ad' : '#b7d9ce' }}>
          <p style={{ margin: 0 }}>{exportFeedback.message}</p>
        </div>
      )}

      {(
        (['returned','needs_customer_amendment','returned_for_adjustment'].includes(order.status)
          || (order.status==='pending' && (!order.quantity_review_required || amendment?.status==='pending_review')))
        && !user?.isStaff
      ) && (
        <section className="no-print" style={{ ...card, marginBottom:16, borderColor:'#e6c98f' }} aria-labelledby="customer-order-amendment-title">
          <h2 id="customer-order-amendment-title" style={{ margin:'0 0 8px' }}>
            {order.status==='pending' ? 'تعديل الطلب قبل مراجعة الإدارة' : 'تعديل الطلب المعاد من الإدارة'}
          </h2>
          {(['returned','needs_customer_amendment','returned_for_adjustment'].includes(order.status)) && (
            <div style={{ margin:'0 0 12px', padding:12, borderRadius:9, background:'#fff8e9', border:'1px solid #efd8a6' }}>
              <strong>سبب إعادة الطلب للتعديل</strong>
              <p style={{ margin:'5px 0 0', lineHeight:1.8 }}>{order.customer_adjustment_note || 'لم تسجل الإدارة ملاحظة تفصيلية؛ راجع بنود الطلب أو تواصل مع الإدارة قبل إعادة التقديم.'}</p>
            </div>
          )}
          {amendment?.status==='pending_review' ? (
            <div role="status" style={{ padding:12, borderRadius:10, background:'#edf7f2', color:'#17684d' }}>
              أُرسل تعديلك بتاريخ {formatDate(amendment.created_at)} وهو الآن بانتظار مراجعة الإدارة. لا يمكن تعديل الكميات مرة أخرى قبل انتهاء المراجعة.
              {amendment.note && <p style={{ margin:'8px 0 0' }}>ملاحظتك: {amendment.note}</p>}
            </div>
          ) : (
            <>
              {amendment?.status==='rejected' && amendment.review_note && (
                <p role="alert" style={{ color:'#8a4c19', margin:'0 0 10px' }}>ملاحظة الإدارة على التعديل السابق: {amendment.review_note}</p>
              )}
              <p style={{ margin:'0 0 12px', color:'#536b70', lineHeight:1.8 }}>
                {order.status==='pending'
                  ? 'يمكنك تصحيح الكميات قبل أن تبدأ الإدارة المراجعة. بعد الإرسال ستُقفل الكميات حتى قرار الموظف.'
                  : 'عدّل الكميات فقط. يجب إبقاء جميع البنود؛ لا تُرسل هذه الخطوة أسعارًا أو إجماليات، ولا تؤكد الطلب.'}
              </p>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead><tr style={{ textAlign:'right', background:'#f4f8f9' }}>
                    <th style={{ padding:8 }}>الصنف</th><th>الرمز</th><th>الوحدة</th><th>الكمية المعدلة</th>
                  </tr></thead>
                  <tbody>{items.map((item) => (
                    <tr key={item.id} style={{ borderTop:'1px solid #e5eeee' }}>
                      <td style={{ padding:8, fontWeight:700 }}>{item.product_name_snapshot}</td>
                      <td>{item.item_code ?? '—'}</td>
                      <td>{item.unit_snapshot ?? '—'}</td>
                      <td>
                        <input
                          type="number" min="0.001" max="10000" step="0.001"
                          aria-label={'الكمية المعدلة ' + item.product_name_snapshot}
                          value={amendmentQuantities[item.id] ?? String(item.approved_quantity ?? item.quantity)}
                          disabled={amendmentBusy}
                          onChange={(event) => setAmendmentQuantities((previous) => ({ ...previous, [item.id]:event.target.value }))}
                          style={{ width:140, padding:'8px 10px', border:'1px solid #b8d7f3', borderRadius:8, background:'#eef7ff' }}
                        />
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <label style={{ display:'grid', gap:6, marginTop:12 }}>
                <strong>ملاحظة توضيحية للإدارة (اختيارية)</strong>
                <textarea rows={3} maxLength={1000} value={amendmentNote} disabled={amendmentBusy}
                  onChange={(event) => setAmendmentNote(event.target.value)}
                  placeholder="اكتب سبب التعديل أو أي توضيح يساعد الإدارة في المراجعة."
                  style={{ width:'100%', padding:10, border:'1px solid #d9e5eb', borderRadius:8, font:'inherit' }} />
              </label>
              {amendmentFeedback && <p role={amendmentFeedback.kind==='error'?'alert':'status'} style={{ margin:'10px 0 0', color:amendmentFeedback.kind==='error'?'#9b2929':'#17684d' }}>{amendmentFeedback.message}</p>}
              <button type="button" className="sf-btn-primary" disabled={amendmentBusy || !items.length}
                onClick={() => void submitCustomerAmendment()} style={{ marginTop:12 }}>
                {amendmentBusy ? 'جارٍ إرسال التعديل...' : 'إرسال التعديل إلى الإدارة'}
              </button>
            </>
          )}
        </section>
      )}


      { !user?.isStaff && (['returned','needs_customer_amendment','returned_for_adjustment'].includes(order.status) || Boolean(amendment)) ? (
        <CustomerOrderAmendmentHistory
          orderId={order.id}
          refreshKey={[amendment?.created_at ?? '', amendment?.status ?? '', amendment?.review_note ?? ''].join(':')}
        />
      ) : null}
      
      {['draft','pending'].includes(order.status) && !user?.isStaff && !order.quantity_review_required && (
        <section className="no-print" style={{ ...card, marginBottom:16, borderColor:'#e5c4ba' }} aria-labelledby="customer-order-cancel-title">
          <h2 id="customer-order-cancel-title" style={{ margin:'0 0 7px', fontSize:17 }}>إلغاء الطلب قبل اعتماده</h2>
          <p style={{ margin:'0 0 10px', color:'#536b70', lineHeight:1.8 }}>
            يمكنك إلغاء طلبك قبل أن تبدأ الإدارة المراجعة أو اعتماد الطلب. يلزم تسجيل سبب الإلغاء.
          </p>
          <label style={{ display:'grid', gap:6 }}>
            <strong>سبب الإلغاء</strong>
            <textarea rows={2} maxLength={500} value={cancellationReason} disabled={cancellationBusy}
              onChange={(event) => setCancellationReason(event.target.value)}
              placeholder="مثال: إدخال كمية غير صحيحة أو تغيير احتياج الشراء."
              style={{ width:'100%', padding:10, border:'1px solid #d9e5eb', borderRadius:8, font:'inherit' }} />
          </label>
          {cancellationFeedback && <p role={cancellationFeedback.kind==='error'?'alert':'status'} style={{ margin:'9px 0 0', color:cancellationFeedback.kind==='error'?'#9b2929':'#17684d' }}>{cancellationFeedback.message}</p>}
          <button type="button" disabled={cancellationBusy} onClick={() => void cancelCustomerOrder()}
            style={{ marginTop:11, padding:'9px 15px', border:0, borderRadius:8, background:'#963b30', color:'#fff', font:'inherit', fontWeight:800, cursor:'pointer' }}>
            {cancellationBusy ? 'جارٍ إلغاء الطلب...' : 'تأكيد إلغاء الطلب'}
          </button>
        </section>
      )}
      {cancellation && order.status==='cancelled' && (
        <section className="no-print" style={{ ...card, marginBottom:16, borderColor:'#e5c4ba' }} role="status">
          <strong>تم إلغاء الطلب بطلب من حسابك</strong>
          <p style={{ margin:'7px 0 0' }}>التاريخ: {formatDate(cancellation.created_at)}</p>
          <p style={{ margin:'7px 0 0' }}>السبب: {cancellation.reason}</p>
          <small>هذا إثبات إلغاء الطلب قبل اعتماده، وليس إشعار استرداد أو حركة مالية.</small>
        </section>
      )}

      {templateFeedback && (
        <div
          className="no-print"
          role={templateFeedback.kind === 'error' ? 'alert' : 'status'}
          style={{ ...card, marginBottom: 16, borderColor: templateFeedback.kind === 'error' ? '#dfb5ad' : '#b7d9ce' }}
        >
          <p style={{ margin: 0 }}>{templateFeedback.message}</p>
          {templateFeedback.kind === 'success' && (
            <Link to="/reorder" className="sf-link" style={{ display: 'inline-flex', marginTop: 8 }}>فتح مساحة إعادة الطلب</Link>
          )}
        </div>
      )}
      <article style={card} className="print-area" data-testid="customer-order-print-document" dir="rtl">
        <header style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderBottom: '2px solid #0b97a5', paddingBottom: 14 }}>
          <div><h1 style={{ margin: 0, color: '#0b7b89', fontSize: 24 }}>الأغبري</h1><small>شركة الأغبري للمواد الغذائية — صنعاء، اليمن</small></div>
          <div style={{ textAlign: 'left' }}><strong>تأكيد طلب</strong><div>{printDocument.orderNumber}</div><small>{formatDate(printDocument.createdAt)}</small></div>
        </header>
        <p style={{ margin: '14px 0' }}>رقم العميل: <strong>{printDocument.customer.code}</strong> — العميل: <strong>{printDocument.customer.name}</strong> — الحالة: <strong>{printDocument.statusLabel}</strong></p>

        {printDocument.deliveryAddress && <section style={{ marginTop: 16, padding: 14, border: '1px solid #dce9e9', borderRadius: 12 }}>
          <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>عنوان التوصيل المسجل مع الطلب</h2>
          {printDocument.deliveryAddress.label && <strong>{printDocument.deliveryAddress.label}</strong>}
          {printDocument.deliveryAddress.recipientName && <p style={{ margin: '7px 0 3px', fontWeight: 750 }}>{printDocument.deliveryAddress.recipientName}</p>}
          {printDocument.deliveryAddress.phone && <p dir="auto" style={{ margin: '0 0 5px' }}>{printDocument.deliveryAddress.phone}</p>}
          <p style={{ margin: '0 0 5px' }}>{printDocument.deliveryAddress.addressLine1}{printDocument.deliveryAddress.addressLine2 ? '، ' + printDocument.deliveryAddress.addressLine2 : ''}</p>
          <p style={{ margin: '0 0 5px', color: '#536b70' }}>{[printDocument.deliveryAddress.city, printDocument.deliveryAddress.region, printDocument.deliveryAddress.postalCode].filter(Boolean).join('، ')}{printDocument.deliveryAddress.country ? ' — ' + printDocument.deliveryAddress.country : ''}</p>
          {printDocument.deliveryAddress.deliveryInstructions && <p style={{ margin: '7px 0 0', color: '#536b70' }}>تعليمات التوصيل: {printDocument.deliveryAddress.deliveryInstructions}</p>}
        </section>}

        <div style={{ margin: '16px 0', padding: 12, borderRadius: 10, background: '#f4f8f9', color: '#536b70' }}>
          تفاصيل الكميات المطلوبة للمتابعة. لا تُعرض الأسعار أو الإجماليات في مستند العميل.
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr style={{ background: '#f4f8f9', textAlign: 'right' }}><th style={{ padding: 8 }}>الصنف</th><th>الرمز</th><th>الوحدة</th><th>الكمية</th><th>حالة الكمية</th></tr></thead>
          <tbody>{printDocument.items.map((item, index) => (
            <tr key={item.itemCode + '-' + item.productName + '-' + index} style={{ borderTop: '1px solid #edf2f3' }}>
              <td style={{ padding: 8 }}>{item.productName}</td><td>{item.itemCode ?? '—'}</td><td>{item.unit ?? '—'}</td>
              <td>{item.approvedQuantity === null ? 'غير مسجل' : formatNumber(item.approvedQuantity)}</td>
              <td>{item.adjusted && item.requestedQuantity !== null ? <strong style={{ color: '#9a5b13' }}>عُدّلت من {formatNumber(item.requestedQuantity)}</strong> : 'كما طُلب'}</td>
            </tr>
          ))}</tbody>
        </table>
        {printDocument.quantityReviewRequired && <p role="alert" style={{ marginTop: 14, fontWeight: 800, color: '#9a5b13' }}>تنبيه: تم تعديل الأصناف/الكميات بحسب الكميات المتوفرة.</p>}
        {printDocument.adjustmentNote && <p role="status" style={{ marginTop: 8, fontWeight: 700 }}>{printDocument.adjustmentNote}</p>}
        {printDocument.paymentRequested && <p role="status" style={{ marginTop: 14, padding: 12, borderRadius: 10, background: '#edf9f2', color: '#17684d', fontWeight: 800 }}>تم تأكيد الطلب من جهة الإدارة. يرجى إرسال المبلغ وفق تعليمات الشركة؛ هذا ليس إشعارًا باستلام الدفع.</p>}
        {printDocument.customerNotes && <p style={{ marginTop: 14 }}>ملاحظات: {printDocument.customerNotes}</p>}
        <section style={{ marginTop: 18 }}>
          <h3 style={{ fontSize: 15 }}>متابعة الطلب</h3>
          {['returned', 'needs_customer_amendment', 'returned_for_adjustment'].includes(printDocument.status) && (
            <p role="alert" style={{ margin: '10px 0', padding: 10, borderRadius: 9, background: '#fff4df', color: '#80520d', fontWeight: 750 }}>
              الطلب معاد للتعديل. راجع الملاحظة أعلاه وحدّث طلبك وفق توجيه الإدارة.
            </p>
          )}
          {['cancelled', 'rejected'].includes(printDocument.status) && (
            <p role="alert" style={{ margin: '10px 0', padding: 10, borderRadius: 9, background: '#fff0ef', color: '#8a2525', fontWeight: 750 }}>
              انتهى مسار هذا الطلب بحالة: {printDocument.statusLabel}.
            </p>
          )}
          <div aria-label="مسار حالة الطلب" aria-live="polite" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 6, margin: '14px 0' }}>
            {CUSTOMER_ORDER_PROGRESS_STEPS.map((step, index) => {
              const currentStage = customerOrderProgressStage(printDocument.status);
              const complete = currentStage >= index && currentStage >= 0;
              const current = currentStage === index;
              return <div key={step.id} style={{ textAlign: 'center', color: complete ? '#087f8d' : '#9aabad', fontSize: 11 }}>
                <div
                  aria-label={current ? 'الحالة الحالية' : complete ? 'مكتمل' : 'لم يكتمل'}
                  style={{
                    width: 25, height: 25, borderRadius: 999, margin: '0 auto 6px', display: 'grid', placeItems: 'center',
                    background: complete ? '#dff5ed' : '#edf1f2',
                    color: complete ? '#087f8d' : '#84979b',
                    border: current ? '2px solid #087f8d' : '2px solid transparent',
                    fontWeight: 900,
                  }}
                >{complete ? '✓' : index + 1}</div>
                <span>{step.label}</span>
              </div>;
            })}
          </div>
          {printDocument.history.length > 0 && <ol>{printDocument.history.map((entry, index) => <li key={entry.status + '-' + entry.createdAt + '-' + index}>{entry.statusLabel} — {formatDate(entry.createdAt)}</li>)}</ol>}
        </section>
      </article>
      <div className="no-print">
        <CustomerReturnRequest orderId={order.id} orderStatus={order.status} />
      </div>
    </Shell>
  );
}
