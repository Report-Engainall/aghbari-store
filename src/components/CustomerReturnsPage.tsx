import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw, RotateCcw, Search } from "lucide-react";
import { Login } from "@/components/Login";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatDate, formatNumber } from "@/lib/format";
import {
  readCustomerReturnHistoryPage,
  type CustomerReturnHistoryCursor,
  type CustomerReturnHistoryRecord,
} from "@/lib/customer-returns";

const PAGE_SIZE = 50;

function normalizeReturnSearch(value: string): string {
  return value.trim()
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[%_]/g, "")
    .slice(0, 120);
}

const orderStatusLabels: Record<string, string> = {
  pending: "بانتظار المراجعة",
  draft: "مسودة",
  confirmed: "مؤكد",
  processing: "قيد التجهيز",
  prepared: "جاهز للشحن",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  returned: "معاد للمراجعة",
  needs_customer_amendment: "بانتظار تعديل العميل",
  returned_for_adjustment: "أُعيد للتعديل",
  cancelled: "ملغى",
  rejected: "مرفوض",
};

const statusLabels: Record<string, string> = {
  submitted: "مرسل للمراجعة",
  under_review: "قيد المراجعة",
  approved: "مقبول — بانتظار الاستلام والفحص",
  rejected: "مرفوض",
  received: "تم استلام المرتجع",
  closed: "مغلق",
  cancelled: "ملغى",
};
const reasonLabels: Record<string, string> = {
  damaged: "الصنف تالف",
  wrong_item: "صنف أو مقاس غير صحيح",
  missing_item: "كمية ناقصة",
  quality: "مشكلة جودة",
  other: "سبب آخر",
};

export function CustomerReturnsPage() {
  const { user, ready } = useAuth();
  const [records, setRecords] = useState<CustomerReturnHistoryRecord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [queryDraft, setQueryDraft] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [statusDraft, setStatusDraft] = useState("");
  const [appliedStatus, setAppliedStatus] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [printRecord, setPrintRecord] = useState<{ order: { id: string; order_number: string; status: string; created_at: string }; request: CustomerReturnHistoryRecord["request"]; customerName: string } | null>(null);
  const requestGeneration = useRef(0);
  const cursorStack = useRef<Array<CustomerReturnHistoryCursor | null>>([null]);

  useEffect(() => {
    if (!printRecord || typeof window === "undefined" || typeof document === "undefined" ||
        typeof window.print !== "function") return;
    const body = document.body;
    const previousMode = body.getAttribute("data-print-mode");
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      if (previousMode === null) body.removeAttribute("data-print-mode");
      else body.setAttribute("data-print-mode", previousMode);
      window.removeEventListener("afterprint", restore);
      setPrintRecord(null);
    };
    body.setAttribute("data-print-mode", "customer-return-request");
    window.addEventListener("afterprint", restore, { once: true });
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        setError("تعذر فتح نافذة طباعة طلب الإرجاع.");
        restore();
      }
    }, 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", restore);
      if (!restored && body.getAttribute("data-print-mode") === "customer-return-request") {
        if (previousMode === null) body.removeAttribute("data-print-mode");
        else body.setAttribute("data-print-mode", previousMode);
      }
    };
  }, [printRecord]);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    const cursor = cursorStack.current[page] ?? null;
    if (page > 0 && !cursor) {
      setError("مؤشر صفحة المرتجعات غير متاح. أعد إلى الصفحة الأولى.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("list_my_customer_return_history", {
        p_after_created_at: cursor?.created_at ?? null,
        p_after_id: cursor?.id ?? null,
        p_limit: PAGE_SIZE,
        p_search: appliedQuery || null,
        p_status: appliedStatus || null,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر تحميل سجل المرتجعات من حسابك.");
      const result = readCustomerReturnHistoryPage(data);
      if (generation !== requestGeneration.current) return;

      setRecords(result.requests);
      setTotalCount(result.total_count);
      setHasMore(result.has_more);

      cursorStack.current = cursorStack.current.slice(0, page + 1);
      if (result.has_more && result.next_cursor) {
        cursorStack.current[page + 1] = result.next_cursor;
      }
    } catch (cause) {
      if (generation !== requestGeneration.current) return;
      setRecords([]);
      setTotalCount(0);
      setHasMore(false);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل المرتجعات.");
    } finally {
      if (generation === requestGeneration.current) setLoading(false);
    }
  }, [page, appliedQuery, appliedStatus]);

  useEffect(() => {
    if (!ready || !user || user.isStaff) return;
    void load();
    return () => { requestGeneration.current += 1; };
  }, [ready, user, load]);

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  if (!ready) return <main className="storefront" dir="rtl" role="status">جار التحقق من الحساب...</main>;
  if (!user) return <Login />;
  if (user.isStaff) return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10" dir="rtl">
      <section className="rounded-2xl border bg-card p-6">
        <h1 className="text-xl font-bold">مرتجعات العملاء</h1>
        <p className="mt-2 text-sm text-muted-foreground">هذه الصفحة مخصصة لحساب العميل. استخدم طابور مراجعة المرتجعات في مساحة الإدارة.</p>
        <Link to="/admin/orders" className="mt-4 inline-flex items-center gap-2 text-primary">فتح إدارة المرتجعات <ArrowLeft size={15}/></Link>
      </section>
    </main>
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8" dir="rtl">
      <header className="mb-6 rounded-2xl border bg-card p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/orders" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><ArrowLeft size={16}/> طلباتي</Link>
            <h1 className="mt-3 text-2xl font-bold">مرتجعاتي</h1>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              سجل طلبات الإرجاع الخاص بحسابك، مع حالة المراجعة والقرار وأسباب السحب. البحث والصفحات يعملان مباشرة على سجل المرتجعات الخادمي.
            </p>
          </div>
          <button type="button" className="btn secondary" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={16}/>{loading ? "جار التحديث..." : "تحديث السجل"}
          </button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-xl border p-3">
            <span className="text-xs text-muted-foreground">طلبات الإرجاع في الصفحة</span>
            <strong className="mt-1 block text-xl tabular-nums">{records.length.toLocaleString("ar-YE")}</strong>
          </article>
          <article className="rounded-xl border p-3">
            <span className="text-xs text-muted-foreground">إجمالي النتائج المطابقة</span>
            <strong className="mt-1 block text-xl tabular-nums">{totalCount.toLocaleString("ar-YE")}</strong>
          </article>
          <article className="rounded-xl border p-3">
            <span className="text-xs text-muted-foreground">حجم الصفحة</span>
            <strong className="mt-1 block text-xl tabular-nums">{PAGE_SIZE.toLocaleString("ar-YE")}</strong>
          </article>
        </div>
      </header>

      {error ? (
        <section className="mb-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800" role="alert">
          <p>{error}</p>
          <button type="button" className="mt-2 underline" onClick={() => void load()}>إعادة المحاولة</button>
        </section>
      ) : null}

      <form
        className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"
        aria-label="البحث في سجل المرتجعات"
        onSubmit={(event) => {
          event.preventDefault();
          const normalized = normalizeReturnSearch(queryDraft);
          cursorStack.current = [null];
          setPage(0);
          setRecords([]);
          setTotalCount(0);
          setAppliedQuery(normalized);
          setAppliedStatus(statusDraft);
        }}
      >
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border bg-background px-3 py-2">
          <Search size={17} className="text-muted-foreground"/>
          <input
            value={queryDraft}
            onChange={event => setQueryDraft(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            placeholder="رقم الطلب أو المرتجع أو الصنف أو السبب أو الملاحظة"
            maxLength={120}
            aria-label="ابحث في سجل المرتجعات"
          />
        </label>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            الحالة
            <select
              value={statusDraft}
              onChange={event => setStatusDraft(event.target.value)}
              disabled={loading}
              className="rounded-lg border bg-background px-2 py-2 text-sm text-foreground"
              aria-label="تصفية المرتجعات حسب الحالة"
            >
              <option value="">كل الحالات</option>
              {Object.entries(statusLabels).map(([status,label]) => <option key={status} value={status}>{label}</option>)}
            </select>
          </label>
          <button type="submit" className="btn secondary" disabled={loading}>تطبيق</button>
          {queryDraft || appliedQuery || statusDraft || appliedStatus ? (
            <button
              type="button"
              className="btn secondary"
              disabled={loading}
              onClick={() => {
                cursorStack.current = [null];
                setPage(0);
                setRecords([]);
                setTotalCount(0);
                setQueryDraft("");
                setAppliedQuery("");
                setStatusDraft("");
                setAppliedStatus("");
              }}
            >مسح</button>
          ) : null}
        </div>
        <span className="w-full text-xs text-muted-foreground">
          {totalCount.toLocaleString("ar-YE")} نتيجة في سجل حسابك{appliedQuery ? " مطابقة للبحث" : ""}{appliedStatus ? " بالحالة: " + (statusLabels[appliedStatus] ?? appliedStatus) : ""} · التصفية والبحث يشملان السجل كله لا الصفحة الظاهرة فقط.
        </span>
      </form>

      {loading ? (
        <p role="status" className="rounded-xl border bg-card p-6 text-sm">جار تحميل طلباتك وسجل المرتجعات...</p>
      ) : error ? null : records.length === 0 ? (
        <section className="rounded-xl border bg-card p-8 text-center" role="status">
          <RotateCcw size={30} className="mx-auto text-muted-foreground"/>
          <h2 className="mt-3 font-semibold">{appliedQuery || appliedStatus ? "لا توجد نتائج مطابقة للبحث والحالة" : "لا توجد طلبات إرجاع مسجلة على حسابك"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">يمكن تقديم طلب إرجاع من تفاصيل الطلب بعد تأكيد تسليمه.</p>
          <Link to="/orders" className="mt-4 inline-flex items-center gap-2 text-primary">عرض طلباتي <ArrowLeft size={15}/></Link>
        </section>
      ) : (
        <div className="space-y-4">
          {records.map(({ order_id, order_number, order_status, order_created_at, request }) => (
            (() => {
              const order = { id: order_id, order_number, status: order_status, created_at: order_created_at };
              return (
            <article key={request.id} className="rounded-xl border bg-card p-4 sm:p-5">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
                <div>
                  <p className="text-xs text-muted-foreground">طلب الإرجاع</p>
                  <strong className="text-lg">{request.request_number}</strong>
                  <p className="mt-1 text-xs text-muted-foreground">
                    الطلب {order.order_number} · {formatDate(request.created_at)}
                  </p>
                </div>
                <span className="rounded-lg border px-3 py-1.5 text-xs font-semibold">{statusLabels[request.status] ?? request.status}</span>
              </header>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><span className="text-xs text-muted-foreground">سبب الإرجاع</span><p className="mt-1 text-sm font-medium">{reasonLabels[request.reason] ?? request.reason}</p></div>
                <div><span className="text-xs text-muted-foreground">حالة الطلب الأصلي</span><p className="mt-1 text-sm font-medium">{orderStatusLabels[order.status] ?? "الحالة غير متاحة"}</p></div>
              </div>
              {request.notes ? <p className="mt-3 text-sm leading-6"><strong>ملاحظتك: </strong>{request.notes}</p> : null}
              {request.review_note ? <p className="mt-3 rounded-lg border bg-muted/30 p-3 text-sm leading-6"><strong>رد المراجعة: </strong>{request.review_note}</p> : null}
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead><tr className="border-b text-right text-xs text-muted-foreground"><th className="p-2">الصنف</th><th>الرمز</th><th>الكمية</th><th>الوحدة</th></tr></thead>
                  <tbody>{request.items.map((item,index) => (
                    <tr key={item.order_item_id+"-"+index} className="border-b last:border-0">
                      <td className="p-2">{item.product_name}</td><td>{item.item_code ?? "—"}</td>
                      <td>{formatNumber(item.requested_quantity)}</td><td>{item.unit ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <footer className="mt-3 flex flex-wrap items-center justify-between gap-3">
                {request.customer_cancelled_at ? (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    سُحب الطلب في {formatDate(request.customer_cancelled_at)}
                    {request.customer_cancellation_reason ? " — السبب: " + request.customer_cancellation_reason : ""}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="btn secondary"
                  disabled={printRecord !== null}
                  onClick={() => setPrintRecord({ order, request, customerName: user.name })}
                >
                  طباعة / حفظ PDF
                </button>
                <a href={"/orders/"+order.id} className="inline-flex items-center gap-2 text-sm text-primary hover:underline">فتح الطلب الأصلي <ArrowLeft size={15}/></a>
              </footer>
            </article>
              );
            })()
          ))}
        </div>
      )}

      {(page > 0 || hasMore) ? (
        <nav className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4" aria-label="ترقيم صفحات سجل المرتجعات">
          <span className="text-xs text-muted-foreground">
            صفحة {page+1} من {pageCount} · {records.length.toLocaleString("ar-YE")} طلب إرجاع في هذه الصفحة · المؤشر يحمّل 50 طلبًا في كل مرة.
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn secondary" disabled={page===0||loading} onClick={()=>setPage(value=>Math.max(0,value-1))}>السابق</button>
            <button type="button" className="btn secondary" disabled={!hasMore||loading} onClick={()=>setPage(value=>value+1)}>التالي</button>
          </div>
        </nav>
      ) : null}
      <p className="mt-4 text-xs leading-6 text-muted-foreground">
        يعرض المصدر سجل المرتجعات نفسه على صفحات متتابعة من 50 طلبًا. البحث خادمي ويشمل كل النتائج المطابقة، ويظل ترتيب التاريخ/المعرّف ثابتًا عند وصول طلبات أحدث.
      </p>
      {printRecord && typeof document !== "undefined" ? createPortal(
        <div className="customer-return-print-root" dir="rtl">
          <style>{`@media print {
            @page { size: A4; margin: 12mm; }
            body * { visibility: hidden !important; }
            .customer-return-print-area, .customer-return-print-area * { visibility: visible !important; }
            .customer-return-print-area {
              position: absolute !important; top: 0 !important; right: 0 !important;
              left: 0 !important; width: auto !important; max-width: none !important;
              margin: 0 !important; padding: 0 !important; border: 0 !important;
              box-shadow: none !important; background: #fff !important;
            }
          }`}</style>
          <article className="customer-return-print-area mx-auto w-full max-w-4xl bg-white p-6 text-slate-900" dir="rtl">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-teal-700 pb-4">
              <div><h1 className="text-2xl font-bold text-teal-800">الأغبري</h1><p className="mt-1 text-xs text-slate-600">شركة الأغبري للمواد الغذائية — صنعاء، اليمن</p></div>
              <div className="text-left"><strong>طلب إرجاع عميل</strong><p className="mt-1 text-sm">{printRecord.request.request_number}</p><p className="text-xs">{formatDate(printRecord.request.created_at)}</p></div>
            </header>
            <section className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
              <p><span className="text-slate-500">العميل: </span><strong>{printRecord.customerName || "حساب العميل"}</strong></p>
              <p><span className="text-slate-500">الطلب الأصلي: </span><strong>{printRecord.order.order_number}</strong></p>
              <p><span className="text-slate-500">حالة طلب الإرجاع: </span><strong>{statusLabels[printRecord.request.status] ?? printRecord.request.status}</strong></p>
              <p><span className="text-slate-500">سبب الإرجاع: </span><strong>{reasonLabels[printRecord.request.reason] ?? printRecord.request.reason}</strong></p>
            </section>
            <section className="mt-5">
              <h2 className="mb-2 font-bold">الأصناف المطلوب إرجاعها</h2>
              <table className="w-full border-collapse text-sm">
                <thead><tr className="border-y bg-slate-50 text-right"><th className="p-2">الصنف</th><th className="p-2">الرمز</th><th className="p-2">الكمية</th><th className="p-2">الوحدة</th></tr></thead>
                <tbody>{printRecord.request.items.map((item,index) => (
                  <tr key={item.order_item_id+"-"+index} className="border-b">
                    <td className="p-2">{item.product_name}</td><td className="p-2">{item.item_code ?? "—"}</td>
                    <td className="p-2">{formatNumber(item.requested_quantity)}</td><td className="p-2">{item.unit ?? "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </section>
            {printRecord.request.notes ? <section className="mt-4"><h2 className="font-bold">ملاحظة العميل</h2><p className="mt-1 whitespace-pre-wrap text-sm">{printRecord.request.notes}</p></section> : null}
            {printRecord.request.review_note ? <section className="mt-4 rounded-lg border p-3"><h2 className="font-bold">رد المراجعة المحفوظ</h2><p className="mt-1 whitespace-pre-wrap text-sm">{printRecord.request.review_note}</p></section> : null}
            {printRecord.request.customer_cancelled_at ? (
              <section className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <h2 className="font-bold">سحب العميل لطلب الإرجاع</h2>
                <p className="mt-1">التاريخ: {formatDate(printRecord.request.customer_cancelled_at)}</p>
                {printRecord.request.customer_cancellation_reason ? <p className="mt-1">السبب: {printRecord.request.customer_cancellation_reason}</p> : null}
              </section>
            ) : null}
            <footer className="mt-8 border-t pt-3 text-xs leading-6 text-slate-600">
              هذا المستند يثبت بيانات طلب الإرجاع المسجلة في النظام فقط. لا يثبت استلام الأصناف أو قبولها نهائياً، ولا يمثل إشعاراً دائناً أو عملية رد مبلغ.
            </footer>
          </article>
        </div>,
        document.body,
      ) : null}
    </main>
  );
}
