import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Send, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import type { LedgerAccountType } from "@/lib/general-ledger";

type LedgerAccountOption = {
  id: string;
  code: string;
  name: string;
  account_type: LedgerAccountType;
  is_active: boolean;
  debit_total: string;
  credit_total: string;
};
type JournalStatus = "draft" | "posted" | "void" | null;
type InboxFilter = "unposted" | "draft" | "posted" | "void" | "source_void" | "all";
type CashExpenseItem = {
  id: string;
  expense_number: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  payment_method: string;
  reference: string | null;
  expense_date: string;
  source_status: "posted" | "void";
  journal_entry_id: string | null;
  journal_status: JournalStatus;
  journal_entry_number: string | null;
  expense_account_id: string | null;
  settlement_account_id: string | null;
  reversal_status: JournalStatus;
  reversal_entry_number: string | null;
};
type InboxResult = { items: CashExpenseItem[]; total_count: number; has_more: boolean; limit: number; offset: number };
type Props = { accounts: readonly LedgerAccountOption[]; onRefresh: () => Promise<void> };

const panel: React.CSSProperties = { border: "1px solid var(--border, #d6dfe4)", borderRadius: 12, padding: 16, background: "var(--card, #fff)", display: "grid", gap: 12 };
const muted: React.CSSProperties = { color: "var(--muted-foreground, #66757b)", margin: 0, lineHeight: 1.7 };
const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "9px 10px", border: "1px solid var(--border, #d6dfe4)", borderRadius: 8, background: "var(--card, #fff)", color: "var(--foreground, #17242a)", font: "inherit" };
const button: React.CSSProperties = { border: "1px solid var(--border, #d6dfe4)", borderRadius: 8, padding: "8px 11px", cursor: "pointer", font: "inherit", background: "var(--card, #fff)", color: "var(--foreground, #17242a)", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 };
const primary: React.CSSProperties = { ...button, background: "var(--primary, #155e4a)", color: "#fff", borderColor: "transparent", fontWeight: 700 };
const filters: {value: InboxFilter; label: string}[] = [
  {value:"unposted",label:"غير مرحّل"},
  {value:"draft",label:"مسودات القيود"},
  {value:"posted",label:"قيود مرحلة"},
  {value:"void",label:"قيود ملغاة"},
  {value:"source_void",label:"مصروفات ملغاة/معكوسة"},
  {value:"all",label:"الكل"},
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseInbox(value: unknown): InboxResult {
  if (!isRecord(value) || !Array.isArray(value.items) || typeof value.total_count !== "number" ||
      typeof value.has_more !== "boolean" || typeof value.limit !== "number" || typeof value.offset !== "number") {
    throw new Error("استجابة مصروفات الترحيل غير صالحة.");
  }
  const items = value.items.map((raw): CashExpenseItem => {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.expense_number !== "string" ||
        typeof raw.category !== "string" || typeof raw.description !== "string" || typeof raw.amount !== "string" ||
        typeof raw.currency !== "string" || typeof raw.payment_method !== "string" ||
        typeof raw.expense_date !== "string" || (raw.source_status !== "posted" && raw.source_status !== "void") ||
        (raw.journal_status !== null && raw.journal_status !== "draft" && raw.journal_status !== "posted" && raw.journal_status !== "void") ||
        (raw.reversal_status !== null && raw.reversal_status !== "draft" && raw.reversal_status !== "posted" && raw.reversal_status !== "void")) {
      throw new Error("تعذر التحقق من أحد سجلات المصروف المصدر.");
    }
    return {
      id:raw.id,expense_number:raw.expense_number,category:raw.category,description:raw.description,amount:raw.amount,
      currency:raw.currency,payment_method:raw.payment_method,reference:typeof raw.reference==="string"?raw.reference:null,
      expense_date:raw.expense_date,source_status:raw.source_status,
      journal_entry_id:typeof raw.journal_entry_id==="string"?raw.journal_entry_id:null,
      journal_status:raw.journal_status,journal_entry_number:typeof raw.journal_entry_number==="string"?raw.journal_entry_number:null,
      expense_account_id:typeof raw.expense_account_id==="string"?raw.expense_account_id:null,
      settlement_account_id:typeof raw.settlement_account_id==="string"?raw.settlement_account_id:null,
      reversal_status:raw.reversal_status,reversal_entry_number:typeof raw.reversal_entry_number==="string"?raw.reversal_entry_number:null,
    };
  });
  return {items,total_count:value.total_count,has_more:value.has_more,limit:value.limit,offset:value.offset};
}
function journalStatusLabel(item: CashExpenseItem): string {
  if (item.source_status==="void") {
    return item.reversal_status==="posted"
      ? "مصروف ملغى؛ عكسه القيد رقم "+item.reversal_entry_number
      : "مصروف ملغى مع الاحتفاظ بالسجل";
  }
  if (item.journal_status==="posted") return "قيد مرحّل رقم "+item.journal_entry_number;
  if (item.journal_status==="draft") return "مسودة قيد رقم "+item.journal_entry_number;
  if (item.journal_status==="void") return "آخر مسودة ملغاة — يمكن إنشاء مسودة جديدة";
  return "غير مربوط بقيد";
}


function CashExpenseJournalFeedback({ error, notice }: { error: string; notice: string }) {
  return (
    <>
      {error ? <p role="alert" style={{ ...muted, color: "#9b2828" }}>{error}</p> : null}
      {notice ? <p role="status" style={{ ...muted, color: "#17684d" }}>{notice}</p> : null}
    </>
  );
}

function CashExpenseJournalFilter({
  status,
  totalCount,
  onStatusChange,
}: {
  status: InboxFilter;
  totalCount: number;
  onStatusChange: (status: InboxFilter) => void;
}) {
  return (
    <div className="no-print" style={{ display: "grid", gridTemplateColumns: "minmax(180px,1fr) auto", gap: 10, alignItems: "end" }}>
      <label>
        حالة المصدر/القيد
        <select
          aria-label="حالة مصدر المصروف"
          style={{ ...field, display: "block", marginTop: 5 }}
          value={status}
          onChange={(event) => onStatusChange(event.target.value as InboxFilter)}
        >
          {filters.map((filter) => (
            <option key={filter.value} value={filter.value}>{filter.label}</option>
          ))}
        </select>
      </label>
      <span style={muted}>عدد النتائج: {totalCount}</span>
    </div>
  );
}

function CashExpenseJournalSourceWarnings({ item }: { item: CashExpenseItem }) {
  if (item.currency !== "YER" && item.source_status === "posted") {
    return (
      <p style={{ ...muted, color: "#8b5a18" }}>
        المبلغ بعملة أجنبية؛ الترحيل موقوف حتى تعريف سياسة صرف موثقة. لم يُحوّل المبلغ أو يُعامل كريال يمني.
      </p>
    );
  }

  if (item.source_status === "void" && item.reversal_status === "posted") {
    return <p style={muted}>قيد العكس المرحّل: #{item.reversal_entry_number}. تم حفظ حركة العكس بدل حذف القيد الأصلي.</p>;
  }

  return null;
}

function CashExpenseJournalDraftActions({
  item,
  canVoidDraft,
  busy,
  onPost,
  onVoid,
}: {
  item: CashExpenseItem;
  canVoidDraft: boolean;
  busy: boolean;
  onPost: (item: CashExpenseItem) => void;
  onVoid: (item: CashExpenseItem) => void;
}) {
  if (item.source_status !== "posted" || item.journal_status !== "draft" || !item.journal_entry_id) {
    return null;
  }

  return (
    <div className="no-print" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button type="button" style={primary} disabled={busy} onClick={() => onPost(item)}>
        <Send size={14} /> ترحيل قيد المصروف رقم {item.expense_number}
      </button>
      {canVoidDraft ? (
        <button type="button" style={button} disabled={busy} onClick={() => onVoid(item)}>
          <X size={14} /> إلغاء المسودة
        </button>
      ) : null}
    </div>
  );
}

function CashExpenseJournalAccountSelectors({
  item,
  expenseAccountId,
  settlementAccountId,
  expenseAccounts,
  settlementAccounts,
  busy,
  onExpenseChange,
  onSettlementChange,
  onCreate,
}: {
  item: CashExpenseItem;
  expenseAccountId: string;
  settlementAccountId: string;
  expenseAccounts: LedgerAccountOption[];
  settlementAccounts: LedgerAccountOption[];
  busy: boolean;
  onExpenseChange: (value: string) => void;
  onSettlementChange: (value: string) => void;
  onCreate: (item: CashExpenseItem) => void;
}) {
  const canCreate =
    item.source_status === "posted" &&
    item.journal_status !== "draft" &&
    item.journal_status !== "posted" &&
    item.currency === "YER";

  if (!canCreate) return null;

  const hasAccounts = expenseAccounts.length > 0 && settlementAccounts.length > 0;

  return (
    <>
      <div className="no-print" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, alignItems: "end" }}>
        <label>
          حساب المصروف
          <select
            aria-label={"حساب المصروف للمصروف " + item.expense_number}
            required
            style={{ ...field, display: "block", marginTop: 5 }}
            value={expenseAccountId}
            onChange={(event) => onExpenseChange(event.target.value)}
          >
            <option value="">اختر حساب المصروف</option>
            <CashExpenseAccountOptions accounts={expenseAccounts} />
          </select>
        </label>
        <label>
          حساب التسوية (نقدية/بنك)
          <select
            aria-label={"حساب التسوية للمصروف " + item.expense_number}
            required
            style={{ ...field, display: "block", marginTop: 5 }}
            value={settlementAccountId}
            onChange={(event) => onSettlementChange(event.target.value)}
          >
            <option value="">اختر حساب النقدية/البنك</option>
            <CashExpenseAccountOptions accounts={settlementAccounts} />
          </select>
        </label>
        <button
          type="button"
          style={primary}
          disabled={busy || !hasAccounts}
          onClick={() => onCreate(item)}
        >
          إنشاء مسودة قيد للمصروف {item.expense_number}
        </button>
      </div>
      {!hasAccounts ? (
        <p role="alert" style={{ ...muted, color: "#8b5a18" }}>
          أضف حساب مصروف واحدًا وحساب أصل للنقدية/البنك إلى دليل الحسابات قبل الترحيل.
        </p>
      ) : null}
    </>
  );
}

function CashExpenseJournalItemCard({
  item,
  expenseAccountId,
  settlementAccountId,
  expenseAccounts,
  settlementAccounts,
  canVoidDraft,
  busy,
  onExpenseChange,
  onSettlementChange,
  onCreate,
  onPost,
  onVoid,
}: {
  item: CashExpenseItem;
  expenseAccountId: string;
  settlementAccountId: string;
  expenseAccounts: LedgerAccountOption[];
  settlementAccounts: LedgerAccountOption[];
  canVoidDraft: boolean;
  busy: boolean;
  onExpenseChange: (value: string) => void;
  onSettlementChange: (value: string) => void;
  onCreate: (item: CashExpenseItem) => void;
  onPost: (item: CashExpenseItem) => void;
  onVoid: (item: CashExpenseItem) => void;
}) {
  return (
    <article style={{ border: "1px solid var(--border, #e3e9ec)", borderRadius: 10, padding: 12, display: "grid", gap: 10, breakInside: "avoid" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <strong>مصروف رقم {item.expense_number} · {item.category}</strong>
          <p style={muted}>{item.expense_date} · {item.description}</p>
          <p style={muted}>طريقة الدفع: {item.payment_method}{item.reference ? " · المرجع: " + item.reference : ""}</p>
        </div>
        <div>
          <strong>{item.amount} {item.currency}</strong>
          <p style={muted}>{journalStatusLabel(item)}</p>
        </div>
      </header>
      <CashExpenseJournalSourceWarnings item={item} />
      <CashExpenseJournalDraftActions
        item={item}
        canVoidDraft={canVoidDraft}
        busy={busy}
        onPost={onPost}
        onVoid={onVoid}
      />
      <CashExpenseJournalAccountSelectors
        item={item}
        expenseAccountId={expenseAccountId}
        settlementAccountId={settlementAccountId}
        expenseAccounts={expenseAccounts}
        settlementAccounts={settlementAccounts}
        busy={busy}
        onExpenseChange={onExpenseChange}
        onSettlementChange={onSettlementChange}
        onCreate={onCreate}
      />
    </article>
  );
}

function CashExpenseJournalInbox({
  items,
  loading,
  busy,
  expenseSelections,
  settlementSelections,
  expenseAccounts,
  settlementAccounts,
  canVoidDraft,
  onExpenseChange,
  onSettlementChange,
  onCreate,
  onPost,
  onVoid,
}: {
  items: CashExpenseItem[];
  loading: boolean;
  busy: boolean;
  expenseSelections: Record<string, string>;
  settlementSelections: Record<string, string>;
  expenseAccounts: LedgerAccountOption[];
  settlementAccounts: LedgerAccountOption[];
  canVoidDraft: boolean;
  onExpenseChange: (itemId: string, value: string) => void;
  onSettlementChange: (itemId: string, value: string) => void;
  onCreate: (item: CashExpenseItem) => void;
  onPost: (item: CashExpenseItem) => void;
  onVoid: (item: CashExpenseItem) => void;
}) {
  if (loading) return <p role="status" style={muted}>جارٍ تحميل المصروفات...</p>;
  if (items.length === 0) return <p style={muted}>لا توجد مصروفات في هذه الحالة. لم يُنشأ قيد إلا من مستند مصدر حقيقي.</p>;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((item) => (
        <CashExpenseJournalItemCard
          key={item.id}
          item={item}
          expenseAccountId={expenseSelections[item.id] || item.expense_account_id || ""}
          settlementAccountId={settlementSelections[item.id] || item.settlement_account_id || ""}
          expenseAccounts={expenseAccounts}
          settlementAccounts={settlementAccounts}
          canVoidDraft={canVoidDraft}
          busy={busy}
          onExpenseChange={(value) => onExpenseChange(item.id, value)}
          onSettlementChange={(value) => onSettlementChange(item.id, value)}
          onCreate={onCreate}
          onPost={onPost}
          onVoid={onVoid}
        />
      ))}
    </div>
  );
}

function CashExpenseJournalPagination({
  page,
  hasMore,
  loading,
  busy,
  onPrevious,
  onNext,
}: {
  page: number;
  hasMore: boolean;
  loading: boolean;
  busy: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <footer className="no-print" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <button type="button" style={button} disabled={page === 0 || loading || busy} onClick={onPrevious}>السابق</button>
      <span style={muted}>صفحة {page + 1} · يعرض 50 مصروفًا في الصفحة</span>
      <button type="button" style={button} disabled={!hasMore || loading || busy} onClick={onNext}>التالي</button>
    </footer>
  );
}

function CashExpenseAccountOptions({ accounts }: { accounts: LedgerAccountOption[] }) {
  return (
    <>
      {accounts.map((account) => (
        <option key={account.id} value={account.id}>{account.code} — {account.name}</option>
      ))}
    </>
  );
}

export function CashExpenseJournalLinker({accounts,onRefresh}:Props) {
  const {user,ready}=useAuth();
  const canUseFinance=Boolean(user?.roles.some((role)=>["admin","manager","accountant"].includes(role)));
  const canVoidDraft=Boolean(user?.roles.some((role)=>role==="admin"||role==="manager"));
  const [status,setStatus]=useState<InboxFilter>("unposted");
  const [page,setPage]=useState(0);
  const [items,setItems]=useState<CashExpenseItem[]>([]);
  const [totalCount,setTotalCount]=useState(0);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(false);
  const [busyId,setBusyId]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [expenseSelections,setExpenseSelections]=useState<Record<string,string>>({});
  const [settlementSelections,setSettlementSelections]=useState<Record<string,string>>({});
  const expenseAccounts=useMemo(()=>accounts.filter(a=>a.is_active&&a.account_type==="expense"),[accounts]);
  const settlementAccounts=useMemo(()=>accounts.filter(a=>a.is_active&&a.account_type==="asset"),[accounts]);

  const refreshInbox=useCallback(async()=>{
    if(!ready||!canUseFinance) return;
    setLoading(true);setError("");
    try{
      const result=await supabase.rpc("fetch_cash_expense_accounting_inbox",{p_limit:50,p_offset:page*50,p_status:status});
      if(result.error) throw new Error("تعذر تحميل المصروفات للمطابقة المحاسبية.");
      const parsed=parseInbox(result.data);
      setItems(parsed.items);setTotalCount(parsed.total_count);setHasMore(parsed.has_more);
    }catch(cause){
      setItems([]);setTotalCount(0);setHasMore(false);
      setError(cause instanceof Error?cause.message:"تعذر تحميل قائمة المصروفات.");
    }finally{setLoading(false);}
  },[ready,canUseFinance,page,status]);
  useEffect(()=>{void refreshInbox();},[refreshInbox]);

  async function createDraft(item:CashExpenseItem){
    const expenseAccountId=expenseSelections[item.id]||item.expense_account_id||"";
    const settlementAccountId=settlementSelections[item.id]||item.settlement_account_id||"";
    if(!expenseAccountId||!settlementAccountId){
      setError("اختر حساب مصروف وحساب نقدية/بنك لكل مصدر قبل إنشاء مسودة القيد.");return;
    }
    if(item.currency!=="YER"){
      setError("لم يُرحّل المصروف: لا توجد سياسة تحويل عملة معتمدة لهذا الرصيد.");return;
    }
    const expenseAccount=expenseAccounts.find(a=>a.id===expenseAccountId);
    const settlementAccount=settlementAccounts.find(a=>a.id===settlementAccountId);
    if(!expenseAccount||!settlementAccount||expenseAccountId===settlementAccountId){
      setError("الحساب المختار غير صالح أو غير نشط. اختر حساب مصروف وحساب أصل من دليل المؤسسة.");return;
    }
    if(!window.crypto?.randomUUID){setError("المتصفح لا يدعم مفتاح منع التكرار الآمن؛ لم يتم إرسال القيد.");return;}
    setBusyId(item.id);setError("");setNotice("");
    try{
      const result=await supabase.rpc("create_cash_expense_journal_draft",{
        p_expense_id:item.id,p_expense_account_id:expenseAccountId,
        p_settlement_account_id:settlementAccountId,p_idempotency_key:window.crypto.randomUUID(),
      });
      if(result.error) throw new Error("تعذر إنشاء مسودة القيد من المصدر. قد يكون المصروف تغير أو سبق ربطه بحسابات مختلفة.");
      setNotice("تم إنشاء مسودة قيد للمصروف رقم "+item.expense_number+". راجع القيد ثم رحّله صراحةً؛ لن يدخل الميزان قبل الترحيل.");
      await refreshInbox();await onRefresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"تعذر إنشاء مسودة القيد.");}
    finally{setBusyId("");}
  }

  async function postDraft(item:CashExpenseItem){
    if(!item.journal_entry_id) return;
    setBusyId(item.id);setError("");setNotice("");
    try{
      const result=await supabase.rpc("post_general_journal_entry",{p_entry_id:item.journal_entry_id});
      if(result.error) throw new Error("رفض الخادم ترحيل القيد لأن المصدر أو الحسابات لم تعد مطابقة.");
      setNotice("تم ترحيل قيد المصروف رقم "+item.expense_number+".");
      await refreshInbox();await onRefresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"تعذر ترحيل قيد المصروف.");}
    finally{setBusyId("");}
  }

  async function voidDraft(item:CashExpenseItem){
    if(!canVoidDraft||!item.journal_entry_id)return;
    const reason=window.prompt("سبب إلغاء مسودة قيد المصروف (5 أحرف على الأقل):");
    if(!reason)return;
    if(reason.trim().length<5){setError("سبب الإلغاء يجب أن يتكون من 5 أحرف على الأقل.");return;}
    setBusyId(item.id);setError("");setNotice("");
    try{
      const result=await supabase.rpc("void_general_journal_draft",{p_entry_id:item.journal_entry_id,p_reason:reason.trim()});
      if(result.error)throw new Error("تعذر إلغاء مسودة القيد. لم يُحذف أي سجل.");
      setNotice("أُلغيت مسودة القيد مع حفظ السبب وسجل التدقيق.");
      await refreshInbox();await onRefresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"تعذر إلغاء المسودة.");}
    finally{setBusyId("");}
  }

  if (!ready) {
    return <section style={panel}><p role="status" style={muted}>جارٍ التحقق من صلاحية المصروفات...</p></section>;
  }

  if (!canUseFinance) {
    return (
      <section style={panel}>
        <h3 style={{ margin: 0 }}>ترحيل المصروفات النقدية</h3>
        <p style={muted}>هذه الوظيفة متاحة للمحاسب والمسؤول والمدير المخوّلين فقط.</p>
      </section>
    );
  }

  const setExpenseSelection = (itemId: string, value: string) => {
    setExpenseSelections((current) => ({ ...current, [itemId]: value }));
  };
  const setSettlementSelection = (itemId: string, value: string) => {
    setSettlementSelections((current) => ({ ...current, [itemId]: value }));
  };

  return (
    <section style={panel} aria-label="ترحيل المصروفات النقدية">
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ margin: 0 }}>ترحيل المصروفات النقدية إلى الأستاذ العام</h3>
          <p style={muted}>المصدر يحدد المبلغ والتاريخ؛ يختار المحاسب الحسابين. الإنشاء ينتج مسودة، والترحيل خطوة منفصلة.</p>
        </div>
        <button type="button" style={button} onClick={() => void refreshInbox()} disabled={loading || Boolean(busyId)}>
          <RefreshCw size={14} /> تحديث
        </button>
      </header>
      <CashExpenseJournalFilter
        status={status}
        totalCount={totalCount}
        onStatusChange={(nextStatus) => {
          setPage(0);
          setStatus(nextStatus);
        }}
      />
      <CashExpenseJournalFeedback error={error} notice={notice} />
      <CashExpenseJournalInbox
        items={items}
        loading={loading}
        busy={Boolean(busyId)}
        expenseSelections={expenseSelections}
        settlementSelections={settlementSelections}
        expenseAccounts={expenseAccounts}
        settlementAccounts={settlementAccounts}
        canVoidDraft={canVoidDraft}
        onExpenseChange={setExpenseSelection}
        onSettlementChange={setSettlementSelection}
        onCreate={(item) => void createDraft(item)}
        onPost={(item) => void postDraft(item)}
        onVoid={(item) => void voidDraft(item)}
      />
      <CashExpenseJournalPagination
        page={page}
        hasMore={hasMore}
        loading={loading}
        busy={Boolean(busyId)}
        onPrevious={() => setPage((current) => Math.max(0, current - 1))}
        onNext={() => setPage((current) => current + 1)}
      />
      <p style={{ ...muted, fontSize: 12 }}>
        القيد لا يُنشأ للمصروف الأجنبي لغياب سياسة صرف مؤكدة. إلغاء مصروف مرتبط بمسودة يُبطل المسودة مع حفظ التدقيق، وإلغاء مصروف له قيد مرحّل ينشئ قيد عكس متوازنًا في نفس المعاملة قبل حفظ إلغاء المصدر.
      </p>
    </section>
  );
}
