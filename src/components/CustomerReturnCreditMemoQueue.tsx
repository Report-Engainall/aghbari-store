import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgeCheck, FileCheck2, FileText, Printer, RefreshCw, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  createCreditMemoIdempotencyKey,
  readReturnCreditMemoMutation,
  readReturnCreditMemoReversalMutation,
  readReturnCreditMemoQueue,
  readPrintableReturnCreditMemo,
  type ReturnCreditAccount,
  type ReturnCreditMemoSummary,
  type ReturnCreditQueue,
  type ReturnCreditRequest,
} from "@/lib/customer-return-credit-memos";

const panel: React.CSSProperties = {
  marginTop: 22, border: "1px solid #dce7e8", borderRadius: 14, padding: 16,
  background: "var(--card, #fff)", display: "grid", gap: 13,
};
const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 11px",
  border: "1px solid #ccdadd", borderRadius: 8, color: "#21383d",
  background: "#fff", font: "inherit",
};
const button: React.CSSProperties = {
  border: "1px solid #ccdadd", borderRadius: 8, padding: "8px 11px",
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  background: "#fff", color: "#24464a", font: "inherit", fontWeight: 750, cursor: "pointer",
};
const primary: React.CSSProperties = { ...button, color: "#fff", background: "#176b55", borderColor: "#176b55" };
const muted: React.CSSProperties = { margin: 0, color: "#64787c", fontSize: 13, lineHeight: 1.7 };
const money = (value: number, currency = "YER") => new Intl.NumberFormat("ar-YE", {
  style: "currency", currency, maximumFractionDigits: 2,
}).format(value);

function selectForType(accounts: ReturnCreditAccount[], type: ReturnCreditAccount["account_type"]): string {
  return accounts.find((account) => account.account_type === type)?.id ?? "";
}

type PrintableReturnCreditMemo = ReturnType<typeof readPrintableReturnCreditMemo>;

type PrintableReturnCreditMemoData = NonNullable<PrintableReturnCreditMemo>;
type PrintableReturnCreditMemoLine = PrintableReturnCreditMemoData["lines"][number];

function buildReturnCreditMemoLineRow(
  doc: Document,
  line: PrintableReturnCreditMemoLine,
  invoiceCurrency: string,
  memoCurrency: string,
  quantity: (value: number) => string,
): HTMLTableRowElement {
  const row = doc.createElement("tr");
  const nameCell = doc.createElement("td");
  const title = doc.createElement("strong");
  title.textContent = line.description;
  nameCell.appendChild(title);
  const detail = doc.createElement("p");
  detail.textContent = (line.item_code ? "الرمز: " + line.item_code : "بدون رمز") +
    (line.unit ? " · الوحدة: " + line.unit : "");
  nameCell.appendChild(detail);
  row.appendChild(nameCell);
  const values = [
    quantity(line.returned_quantity),
    quantity(line.invoice_quantity),
    money(line.invoice_line_total, invoiceCurrency),
    money(line.credited_subtotal, memoCurrency),
  ];
  for (const value of values) {
    const cell = doc.createElement("td");
    cell.textContent = value;
    row.appendChild(cell);
  }
  return row;
}

function appendReturnCreditMemoLineRows(
  doc: Document,
  body: HTMLTableSectionElement,
  payload: PrintableReturnCreditMemoData,
  quantity: (value: number) => string,
): void {
  for (const line of payload.lines) {
    body.appendChild(buildReturnCreditMemoLineRow(
      doc, line, payload.invoice.currency, payload.memo.currency, quantity,
    ));
  }
}

function renderReturnCreditMemoDocument(doc: Document, payload: PrintableReturnCreditMemo): void {
      doc.title = payload.memo.memo_number;
      doc.documentElement.lang = "ar";
      doc.documentElement.dir = "rtl";
      doc.body.replaceChildren();
      const style = doc.createElement("style");
      style.textContent = `
        @page { size:A4; margin:15mm } * { box-sizing:border-box }
        body { margin:0;color:#203b3d;font-family:Tahoma,Arial,sans-serif;direction:rtl }
        main { max-width:900px;margin:auto;padding:24px }
        header { display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #176b55;padding-bottom:14px;margin-bottom:18px }
        h1 { margin:0 0 7px;font-size:23px } h2 { margin:18px 0 8px;font-size:16px }
        p { margin:5px 0;font-size:12px;line-height:1.7 }
        .number { font-size:16px;font-weight:800;color:#176b55 }
        .status { border:1px solid #b9d6ca;background:#eff8f2;color:#176b55;padding:6px 10px;border-radius:18px;font-size:12px;font-weight:800;height:fit-content }
        .draft { border-color:#dfc78f;background:#fff7e8;color:#805413 }
        .meta { display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;padding:12px;border:1px solid #dce7e8;border-radius:9px }
        table { width:100%;border-collapse:collapse;margin-top:9px;font-size:11px }
        th { background:#edf4f2;text-align:right } td,th { border:1px solid #d9e3e1;padding:8px 7px;vertical-align:top }
        .totals { width:min(100%,360px);margin:18px 0 0 auto;border:1px solid #dce7e8;border-radius:9px;padding:12px }
        .grand { font-size:16px;font-weight:900;color:#176b55;border-top:1px solid #dce7e8;padding-top:8px }
        footer { border-top:1px solid #dce7e8;margin-top:22px;padding-top:10px;color:#5e7373;font-size:10px;line-height:1.7 }
        @media print { main { max-width:none;padding:0 } header,.meta,tr { break-inside:avoid } }
      `;
      doc.head.appendChild(style);
      const main=doc.createElement("main");
      const header=doc.createElement("header");
      const titleGroup=doc.createElement("div");
      const title=doc.createElement("h1"); title.textContent="إشعار دائن للمرتجعات"; titleGroup.appendChild(title);
      const number=doc.createElement("p"); number.className="number"; number.textContent=payload.memo.memo_number; titleGroup.appendChild(number);
      const status=doc.createElement("span");
      status.className=payload.memo.status==="draft"?"status draft":"status";
      status.textContent=payload.memo.status==="draft"?"مسودة — غير مُرحّلة":"مُرحّل محاسبيًا";
      header.append(titleGroup,status); main.appendChild(header);
      const meta=doc.createElement("section"); meta.className="meta";
      const metaRows:Array<[string,string]>=[
        ["العميل",payload.customer.name],["الطلب",payload.invoice.order_number],
        ["الفاتورة الأصلية",payload.invoice.invoice_number],["طلب المرتجع",payload.return_request.request_number],
        ["تاريخ الإعداد",new Date(payload.memo.created_at).toLocaleString("ar-YE")],
        ["رقم القيد",payload.journal.entry_number],["حالة القيد",payload.journal.status==="posted"?"مُرحّل":"مسودة"],
        ["تاريخ الفاتورة",new Date(payload.invoice.issued_at).toLocaleDateString("ar-YE")],
      ];
      for(const [label,value] of metaRows){const p=doc.createElement("p");const strong=doc.createElement("strong");strong.textContent=label+": ";p.append(strong,doc.createTextNode(value));meta.appendChild(p);}
      main.appendChild(meta);
      const h2=doc.createElement("h2");h2.textContent="تفاصيل البنود المرتجعة";main.appendChild(h2);
      const table=doc.createElement("table"),thead=doc.createElement("thead"),hr=doc.createElement("tr");
      for(const label of ["الصنف والرمز","الكمية المرتجعة","كمية الفاتورة","قيمة السطر الأصلي","القيمة الدائنة"]){const th=doc.createElement("th");th.textContent=label;hr.appendChild(th);}
      thead.appendChild(hr);table.appendChild(thead);
      const tbody=doc.createElement("tbody");
      const quantity=(n:number)=>new Intl.NumberFormat("ar-YE",{maximumFractionDigits:3}).format(n);
      appendReturnCreditMemoLineRows(doc, tbody, payload, quantity);
      table.appendChild(tbody);main.appendChild(table);
      const totals=doc.createElement("section");totals.className="totals";
      for(const [label,amount] of [["المجموع قبل الضريبة",payload.memo.subtotal_amount],["الضريبة",payload.memo.tax_amount]] as Array<[string,number]>){
        const p=doc.createElement("p"),strong=doc.createElement("strong");strong.textContent=label+": ";p.append(strong,doc.createTextNode(money(amount,payload.memo.currency)));totals.appendChild(p);
      }
      const grand=doc.createElement("p");grand.className="grand";grand.textContent="الإجمالي الدائن: "+money(payload.memo.total_amount,payload.memo.currency);totals.appendChild(grand);main.appendChild(totals);
      const footer=doc.createElement("footer");
      footer.textContent=payload.memo.status==="draft"
        ?"هذه مسودة غير مُرحّلة ولا تغير ذمم العميل أو السجلات المحاسبية. لا يُعد هذا المستند إثبات استرداد نقدي."
        :"تم ترحيل الإشعار والقيد المزدوج المرتبط به. هذا المستند لا يمثل إثبات استرداد نقدي.";
      main.appendChild(footer);doc.body.appendChild(main);
}
export function CustomerReturnCreditMemoQueue({ onNotice }: { onNotice: (message: string) => void }) {
  const [queue, setQueue] = useState<ReturnCreditQueue>({ accounts: [], requests: [] });
  const [receivableAccountId, setReceivableAccountId] = useState("");
  const [revenueAccountId, setRevenueAccountId] = useState("");
  const [taxAccountId, setTaxAccountId] = useState("");
  const [retryKeys, setRetryKeys] = useState<Record<string, string>>({});
  const [voidReason, setVoidReason] = useState<Record<string, string>>({});
  const [reversalReason, setReversalReason] = useState<Record<string, string>>({});
  const [reversalRetryKeys, setReversalRetryKeys] = useState<Record<string, { key: string; reason: string }>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("fetch_customer_return_credit_memo_queue", { p_limit: 50 });
      if (rpcError) throw new Error(rpcError.message || "تعذر تحميل قائمة الإشعارات الدائنة.");
      const next = readReturnCreditMemoQueue(data);
      setQueue(next);
      setReceivableAccountId((current) => current && next.accounts.some((a) => a.id === current && a.account_type === "asset")
        ? current : selectForType(next.accounts, "asset"));
      setRevenueAccountId((current) => current && next.accounts.some((a) => a.id === current && a.account_type === "revenue")
        ? current : selectForType(next.accounts, "revenue"));
      setTaxAccountId((current) => current && next.accounts.some((a) => a.id === current && a.account_type === "liability")
        ? current : selectForType(next.accounts, "liability"));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل قائمة الإشعارات الدائنة.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const hasReceivable = useMemo(() => queue.accounts.some((a) => a.id === receivableAccountId && a.account_type === "asset"), [queue.accounts, receivableAccountId]);
  const hasRevenue = useMemo(() => queue.accounts.some((a) => a.id === revenueAccountId && a.account_type === "revenue"), [queue.accounts, revenueAccountId]);

  async function prepare(request: ReturnCreditRequest) {
    setError("");
    if (!request.mapping_ready || !request.invoice_id || request.invoice_status === "void" || request.currency !== "YER") {
      setError("لا يمكن إعداد إشعار دائن قبل اكتمال الاستلام وربط بنود الفاتورة الأصلية والتحقق من الإجماليات.");
      return;
    }
    if (!hasReceivable || !hasRevenue) {
      setError("اختر حساب ذمم نشطًا وحساب تخفيض إيراد نشطًا من المؤسسة الحالية.");
      return;
    }
    if ((request.invoice_tax_amount ?? 0) > 0 && !queue.accounts.some((a) => a.id === taxAccountId && a.account_type === "liability")) {
      setError("الفاتورة تحتوي ضريبة؛ اختر حساب التزام ضريبي نشطًا قبل الإعداد.");
      return;
    }
    const key = retryKeys[request.request_id] ?? createCreditMemoIdempotencyKey();
    setRetryKeys((current) => ({ ...current, [request.request_id]: key }));
    setBusyId(request.request_id);
    try {
      const { data, error: rpcError } = await supabase.rpc("prepare_customer_return_credit_memo", {
        p_return_request_id: request.request_id,
        p_receivable_account_id: receivableAccountId,
        p_revenue_account_id: revenueAccountId,
        p_tax_account_id: (request.invoice_tax_amount ?? 0) > 0 ? taxAccountId : null,
        p_idempotency_key: key,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر إعداد الإشعار الدائن.");
      const result = readReturnCreditMemoMutation(data);
      onNotice(
        (result.replayed ? "استُعيد الإشعار المسجل " : "أُعد مسودّة الإشعار ") + result.memo_number +
        " بإجمالي " + money(result.total_amount, result.currency) +
        ". لم يُرحّل القيد ولم تتغير الذمم بعد.",
      );
      setRetryKeys((current) => { const next = { ...current }; delete next[request.request_id]; return next; });
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر إعداد الإشعار الدائن.";
      setError(message);
      onNotice(message);
    } finally {
      setBusyId(null);
    }
  }

  async function post(memo: ReturnCreditMemoSummary) {
    setError("");
    setBusyId(memo.id);
    try {
      const { data, error: rpcError } = await supabase.rpc("post_general_journal_entry", {
        p_entry_id: memo.journal_entry_id,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر ترحيل القيد؛ راجع مطابقة الحسابات ومصدر الإشعار.");
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          (data as Record<string, unknown>).status !== "posted") {
        throw new Error("لم يؤكد الخادم ترحيل القيد المحاسبي؛ لم تُعرض العملية كنجاح.");
      }
      onNotice("تم ترحيل القيد " + memo.journal_entry_number + " للإشعار " + memo.memo_number + "؛ تحدّث الذمم من المصدر المحاسبي.");
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر ترحيل القيد المحاسبي.";
      setError(message);
      onNotice(message);
    } finally {
      setBusyId(null);
    }
  }

  async function voidDraft(memo: ReturnCreditMemoSummary) {
    const reason = (voidReason[memo.id] ?? "").trim();
    if (reason.length < 5 || reason.length > 500) {
      setError("أدخل سبب إلغاء من 5 إلى 500 حرف قبل إلغاء المسودة.");
      return;
    }
    setError("");
    setBusyId(memo.id);
    try {
      const { data, error: rpcError } = await supabase.rpc("void_customer_return_credit_memo_draft", {
        p_credit_memo_id: memo.id,
        p_reason: reason,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر إلغاء مسودة الإشعار الدائن.");
      if (!data || typeof data !== "object" || Array.isArray(data) ||
          (data as Record<string, unknown>).status !== "void") {
        throw new Error("لم يؤكد الخادم إلغاء المسودة.");
      }
      onNotice("أُلغيت مسودة الإشعار " + memo.memo_number + " دون ترحيل أثر محاسبي.");
      setVoidReason((current) => { const next = { ...current }; delete next[memo.id]; return next; });
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر إلغاء المسودة.";
      setError(message);
      onNotice(message);
    } finally {
      setBusyId(null);
    }
  }



  async function reversePosted(memo: ReturnCreditMemoSummary) {
    const reason = (reversalReason[memo.id] ?? "").trim();
    if (reason.length < 5 || reason.length > 500) {
      setError("أدخل سبب عكس من 5 إلى 500 حرف قبل ترحيل القيد العكسي.");
      return;
    }
    if (memo.status !== "posted" || memo.journal_status !== "posted") {
      setError("لا يمكن عكس هذا الإشعار؛ يجب أن يكون الإشعار وقيده الأصلي مرحّلين.");
      return;
    }
    const existingKey = reversalRetryKeys[memo.id];
    const key = existingKey?.reason === reason ? existingKey.key : createCreditMemoIdempotencyKey();
    setReversalRetryKeys((current) => ({ ...current, [memo.id]: { key, reason } }));
    setError("");
    setBusyId(memo.id);
    try {
      const { data, error: rpcError } = await supabase.rpc("reverse_customer_return_credit_memo", {
        p_credit_memo_id: memo.id,
        p_reason: reason,
        p_idempotency_key: key,
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر عكس الإشعار الدائن؛ لم تتغير الحالة إلى معكوس.");
      const result = readReturnCreditMemoReversalMutation(data);
      onNotice(
        (result.replayed ? "استُعيد قيد العكس " : "رُحّل قيد العكس ") + result.reversal_journal_entry_number +
        " للإشعار " + result.memo_number +
        ". أُعيد أثر الذمم فقط؛ لا توجد حركة مخزون أو استرداد نقدي.",
      );
      setReversalReason((current) => { const next = { ...current }; delete next[memo.id]; return next; });
      setReversalRetryKeys((current) => { const next = { ...current }; delete next[memo.id]; return next; });
      await load();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "تعذر عكس الإشعار الدائن.";
      setError(message);
      onNotice(message);
    } finally {
      setBusyId(null);
    }
  }

  async function printMemo(memo: ReturnCreditMemoSummary) {
    setError("");
    let printWindow: Window | null = null;
    setBusyId(memo.id);
    try {
      // Open the print window synchronously inside the click gesture; opening it after the RPC
      // awaits can be blocked by browsers even when the caller is authorized.
      const openedWindow = window.open("", "_blank", "width=1000,height=760");
      if (!openedWindow) throw new Error("حُظر فتح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.");
      printWindow = openedWindow;
      openedWindow.opener = null;
      const pendingDoc = openedWindow.document;
      pendingDoc.title = "جارٍ تجهيز إشعار دائن";
      pendingDoc.documentElement.lang = "ar";
      pendingDoc.documentElement.dir = "rtl";
      pendingDoc.body.replaceChildren();
      const pendingMessage = pendingDoc.createElement("p");
      pendingMessage.dir = "rtl";
      pendingMessage.textContent = "جارٍ التحقق من صلاحية المحاسبة وتحميل المستند المعتمد…";
      pendingDoc.body.appendChild(pendingMessage);

      const { data, error: rpcError } = await supabase.rpc("get_customer_return_credit_memo_pdf", { p_credit_memo_id: memo.id });
      if (rpcError) throw new Error(rpcError.message || "تعذر تحميل بيانات الطباعة؛ يلزم دور المحاسبة.");
      const payload = readPrintableReturnCreditMemo(data);
      const doc = openedWindow.document;
      renderReturnCreditMemoDocument(doc, payload);
      openedWindow.focus();openedWindow.onafterprint=()=>openedWindow.close();window.setTimeout(()=>openedWindow.print(),200);
      onNotice("تم تجهيز نسخة الطباعة من المصدر المحاسبي بعد تحقق صلاحية المحاسبة.");
    } catch(cause) {
      printWindow?.close();
      const message=cause instanceof Error?cause.message:"تعذر تجهيز مستند الطباعة.";
      setError(message);onNotice(message);
    } finally { setBusyId(null); }
  }

  function accountSelect(
    label: string, selected: string, type: ReturnCreditAccount["account_type"],
    change: (value: string) => void, required: boolean,
  ) {
    const options = queue.accounts.filter((account) => account.account_type === type);
    return (
      <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
        {label}
        <select value={selected} required={required} onChange={(event) => change(event.target.value)} style={field} disabled={loading || busyId !== null || options.length === 0}>
          <option value="">اختر الحساب…</option>
          {options.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
        </select>
      </label>
    );
  }

  return (
    <section style={panel} dir="rtl" aria-labelledby="return-credit-heading">
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 id="return-credit-heading" style={{ margin: 0, fontSize: 19, display: "flex", alignItems: "center", gap: 8 }}>
            <FileCheck2 size={19} /> الإشعارات الدائنة للمرتجعات
          </h2>
          <p style={{ ...muted, marginTop: 5 }}>
            لا يُصدر الإشعار إلا بعد اكتمال الاستلام وربط كل بند بسطر الفاتورة الأصلية. تُحسب القيمة والضريبة من المصدر، ويظل القيد مسودة حتى يرحّله صاحب صلاحية المحاسبة.
          </p>
        </div>
        <button type="button" style={button} onClick={() => void load()} disabled={loading || busyId !== null}>
          <RefreshCw size={15} /> تحديث
        </button>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
        {accountSelect("حساب ذمم العملاء (أصل)", receivableAccountId, "asset", setReceivableAccountId, true)}
        {accountSelect("حساب تخفيض الإيراد / مرتجعات المبيعات", revenueAccountId, "revenue", setRevenueAccountId, true)}
      </div>

      {loading && <p role="status" style={muted}>جارٍ تحميل المرتجعات المستلمة والفواتير الأصلية…</p>}
      {error && <p role="alert" style={{ ...muted, color: "#a32929", padding: 10, borderRadius: 8, background: "#fff1f1" }}>{error}</p>}
      {!loading && !error && queue.accounts.length === 0 && (
        <p style={muted}>لا توجد حسابات محاسبية نشطة قابلة للاستخدام؛ لا يتم إنشاء حسابات تلقائيًا.</p>
      )}
      {!loading && !error && queue.requests.length === 0 && <p style={muted}>لا توجد مرتجعات مكتملة الاستلام تنتظر المراجعة المالية.</p>}

      {queue.requests.map((request) => {
        const memo = request.credit_memo;
        const needsTax = (request.invoice_tax_amount ?? 0) > 0;
        return (
          <article key={request.request_id} style={{ display: "grid", gap: 12, padding: 14, border: "1px solid #e1e9ea", borderRadius: 11 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>{request.request_number} — الطلب {request.order_number}</h3>
                <p style={muted}>العميل {request.customer_name} · الفاتورة {request.invoice_number ?? "غير مرتبطة"} · العملة {request.currency ?? "غير محددة"}</p>
                <p style={muted}>
                  الإجمالي الأصلي: {request.invoice_total_amount == null ? "غير متاح" : money(request.invoice_total_amount, request.currency ?? "YER")}
                  {" · "}مطابقة البنود: {request.mapping_ready ? "جاهزة" : "تحتاج مراجعة"}
                </p>
              </div>
              <span style={{ background: memo?.status === "posted" ? "#e6f4ec" : memo?.status === "reversed" ? "#eef2ff" : "#fff4df", color: memo?.status === "posted" ? "#176b55" : memo?.status === "reversed" ? "#3730a3" : "#805413", borderRadius: 20, padding: "4px 9px", fontSize: 12, fontWeight: 800 }}>
                {memo?.status === "posted" ? "مرحل" : memo?.status === "reversed" ? "معكوس ماليًا" : memo ? "مسودة محاسبية" : "بانتظار الإعداد المالي"}
              </span>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr>
                  <th style={{ textAlign: "right", padding: 7, borderBottom: "1px solid #e1e9ea" }}>الصنف</th>
                  <th style={{ textAlign: "right", padding: 7, borderBottom: "1px solid #e1e9ea" }}>المستلم</th>
                  <th style={{ textAlign: "right", padding: 7, borderBottom: "1px solid #e1e9ea" }}>كمية الفاتورة</th>
                  <th style={{ textAlign: "right", padding: 7, borderBottom: "1px solid #e1e9ea" }}>المتبقي للرد الدائن</th>
                </tr></thead>
                <tbody>{request.items.map((item) => <tr key={item.request_item_id}>
                  <td style={{ padding: 7, borderBottom: "1px solid #eef2f2" }}><strong>{item.product_name}</strong><br/>{item.item_code ?? "بدون رمز"}{item.unit ? " · "+item.unit : ""}</td>
                  <td style={{ padding: 7, borderBottom: "1px solid #eef2f2" }}>{item.received_quantity.toLocaleString("ar-YE")}</td>
                  <td style={{ padding: 7, borderBottom: "1px solid #eef2f2" }}>{item.invoice_item_quantity.toLocaleString("ar-YE")}</td>
                  <td style={{ padding: 7, borderBottom: "1px solid #eef2f2" }}>{item.remaining_invoice_quantity.toLocaleString("ar-YE")}</td>
                </tr>)}</tbody>
              </table>
            </div>

            {needsTax && accountSelect("حساب الالتزام الضريبي", taxAccountId, "liability", setTaxAccountId, true)}

            {!memo && (
              <button type="button" style={primary} disabled={busyId !== null || loading || !request.mapping_ready || !hasReceivable || !hasRevenue || (needsTax && !taxAccountId)} onClick={() => void prepare(request)}>
                <FileText size={16}/> إعداد الإشعار ومسودة القيد
              </button>
            )}

            {memo && (
              <div style={{ display: "grid", gap: 8, padding: 12, border: "1px solid #e1e9ea", borderRadius: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <BadgeCheck size={17}/>
                  <strong>{memo.memo_number}</strong>
                  <span style={muted}>القيد {memo.journal_entry_number} ({memo.journal_status})</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}><button type="button" style={button} disabled={busyId !== null || loading} onClick={() => void printMemo(memo)}><Printer size={16} /> {memo.status === "reversed" ? "طباعة الإشعار ودليل العكس" : "طباعة الإشعار"}</button></div>
                <p style={{ margin: 0, fontWeight: 800 }}>
                  قبل الضريبة: {money(memo.subtotal_amount,memo.currency)} · الضريبة: {money(memo.tax_amount,memo.currency)} · الإجمالي: {money(memo.total_amount,memo.currency)}
                </p>
                {memo.status === "draft" && memo.journal_status === "draft" && (
                  <>
                    <p style={muted}>لن تتغير الذمم أو السجلات المرحّلة حتى ينجح ترحيل القيد المتوازن على الخادم.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto auto", gap: 8, alignItems: "end" }}>
                      <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
                        سبب إلغاء المسودة عند الحاجة
                        <input value={voidReason[memo.id] ?? ""} maxLength={500} onChange={(event) => setVoidReason((current) => ({ ...current,[memo.id]:event.target.value }))} style={field} disabled={busyId !== null}/>
                      </label>
                      <button type="button" style={primary} disabled={busyId !== null || loading} onClick={() => void post(memo)}>ترحيل القيد</button>
                      <button type="button" style={button} disabled={busyId !== null || loading || (voidReason[memo.id] ?? "").trim().length < 5} onClick={() => void voidDraft(memo)}>إلغاء المسودة</button>
                    </div>
                  </>
                )}
                {memo.status === "posted" && (
                  <>
                    <p style={{ ...muted, color: "#176b55", display: "flex", gap: 6, alignItems: "center" }}><ShieldAlert size={15}/> مرحّل؛ تم تحديث رصيد ذمم العميل بعد تحقق الحارس المحاسبي من المصدر والقيد.</p>
                    <p style={muted}>عكس الإشعار ينشئ قيدًا عكسيًا متوازنًا ويحافظ على القيد الأصلي. لا يُصدر استردادًا نقديًا ولا يعيد حركة المخزون.</p>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 8, alignItems: "end" }}>
                      <label style={{ display: "grid", gap: 5, fontSize: 12, fontWeight: 750 }}>
                        سبب عكس الإشعار المُرحّل
                        <input aria-label={"سبب عكس الإشعار " + memo.memo_number} value={reversalReason[memo.id] ?? ""} maxLength={500} onChange={(event) => setReversalReason((current) => ({ ...current,[memo.id]:event.target.value }))} style={field} disabled={busyId !== null}/>
                      </label>
                      <button type="button" style={button} disabled={busyId !== null || loading || (reversalReason[memo.id] ?? "").trim().length < 5} onClick={() => void reversePosted(memo)}>عكس الإشعار والقيد</button>
                    </div>
                  </>
                )}
                {memo.status === "reversed" && (
                  <div role="status" style={{ display: "grid", gap: 5 }}>
                    <p style={{ ...muted, color: "#3730a3", fontWeight: 800 }}>معكوس ماليًا؛ القيد الأصلي محفوظ والقيد العكسي مرحّل.</p>
                    <p style={muted}>رقم قيد العكس: {memo.reversal_journal_entry_number ?? "غير متاح"} · تاريخ العكس: {memo.reversed_at ?? "غير متاح"}</p>
                    <p style={muted}>السبب: {memo.reversal_reason ?? "غير متاح"}. لم يُنشأ استرداد نقدي أو حركة مخزون.</p>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
