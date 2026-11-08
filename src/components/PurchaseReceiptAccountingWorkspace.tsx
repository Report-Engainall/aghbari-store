import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import { supabase } from "@/lib/supabase";

type AccountOption = { id: string; code: string; name: string; account_type: "asset" | "liability"; is_active: boolean };
type ReceiptOption = {
  receipt_id: string; receipt_number: string; purchase_order_id: string; purchase_order_number: string;
  supplier_name: string; warehouse_name: string; received_at: string; received_cost: number | null;
  currency: string | null; costs_complete: boolean; journal_entry_id: string | null;
  journal_entry_number: string | null; journal_status: "draft" | "posted" | "void" | null;
  inventory_account_id: string | null; payable_account_id: string | null;
};
type Queue = { accounts: AccountOption[]; receipts: ReceiptOption[] };
type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw { return typeof value === "object" && value !== null && !Array.isArray(value); }
function requiredText(row: Raw, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new Error("بيانات إيصال الاستلام غير مكتملة: " + key);
  return value;
}
function nullableText(value: unknown): string | null { return typeof value === "string" && value.trim() ? value : null; }
function nullableAmount(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const amount = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
function parseQueue(value: unknown): Queue {
  if (!isRecord(value) || !Array.isArray(value.accounts) || !Array.isArray(value.receipts)) {
    throw new Error("أعاد الخادم قائمة محاسبة إيصالات غير صالحة.");
  }
  const accounts: AccountOption[] = value.accounts.map((item) => {
    if (!isRecord(item) || (item.account_type !== "asset" && item.account_type !== "liability")) {
      throw new Error("أعاد الخادم حسابًا محاسبيًا غير صالح.");
    }
    return { id: requiredText(item, "id"), code: requiredText(item, "code"), name: requiredText(item, "name"), account_type: item.account_type, is_active: item.is_active === true };
  });
  const receipts: ReceiptOption[] = value.receipts.map((item) => {
    if (!isRecord(item)) throw new Error("أعاد الخادم إيصال استلام غير صالح.");
    const journalStatus = item.journal_status === "draft" || item.journal_status === "posted" || item.journal_status === "void" ? item.journal_status : null;
    return {
      receipt_id: requiredText(item, "receipt_id"), receipt_number: requiredText(item, "receipt_number"),
      purchase_order_id: requiredText(item, "purchase_order_id"), purchase_order_number: requiredText(item, "purchase_order_number"),
      supplier_name: requiredText(item, "supplier_name"), warehouse_name: requiredText(item, "warehouse_name"),
      received_at: requiredText(item, "received_at"), received_cost: nullableAmount(item.received_cost),
      currency: nullableText(item.currency), costs_complete: item.costs_complete === true,
      journal_entry_id: nullableText(item.journal_entry_id), journal_entry_number: nullableText(item.journal_entry_number),
      journal_status: journalStatus, inventory_account_id: nullableText(item.inventory_account_id), payable_account_id: nullableText(item.payable_account_id),
    };
  });
  return { accounts, receipts };
}
function money(amount: number | null, currency: string | null): string {
  if (amount === null) return "التكلفة غير مكتملة";
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(amount) + " " + (currency === "YER" ? "ر.ي" : currency || "عملة غير مسجلة");
}
function dateText(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "تاريخ غير صالح" : date.toLocaleString("ar-YE");
}


function PurchaseReceiptJournalState({ receipt }: { receipt: ReceiptOption }) {
  if (receipt.journal_entry_id) {
    return (
      <p role="status" style={{ margin: 0 }}>
        <ShieldCheck size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />
        قيد {receipt.journal_entry_number || receipt.journal_entry_id} — الحالة: {receipt.journal_status === "posted" ? "مرحل" : receipt.journal_status === "draft" ? "مسودة" : "ملغى"}.
        {receipt.journal_status === "draft" ? " افتح دفتر الأستاذ لمراجعته وترحيله بصلاحية محاسبية." : " لن يُنشأ قيد ثانٍ لهذا الإيصال تلقائيًا."}
      </p>
    );
  }
  if (!receipt.costs_complete || receipt.received_cost === null || receipt.received_cost <= 0 || receipt.currency !== "YER") {
    return (
      <p role="alert" style={{ margin: 0, color: "#92400e" }}>
        <AlertTriangle size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />
        لا يمكن إنشاء القيد: التكاليف المصدرية ناقصة أو لا تتطابق، أو العملة ليست الريال اليمني، أو المبلغ غير موجب. أصلح المصدر أولًا.
      </p>
    );
  }
  return null;
}

function renderPurchaseReceiptAccountOptions(accounts: AccountOption[]) {
  return accounts.map((account) => (
    <option key={account.id} value={account.id}>{account.code} — {account.name}</option>
  ));
}

function PurchaseReceiptAccountSelectors({ receipt, assetAccounts, payableAccounts, inventoryAccountId, payableAccountId, disabled, onInventoryChange, onPayableChange }: {
  receipt: ReceiptOption; assetAccounts: AccountOption[]; payableAccounts: AccountOption[];
  inventoryAccountId: string; payableAccountId: string; disabled: boolean;
  onInventoryChange: (accountId: string) => void; onPayableChange: (accountId: string) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>
      <label style={{ display: "grid", gap: 5 }}>حساب المخزون (مدين)
        <select aria-label={"حساب المخزون " + receipt.receipt_number} value={inventoryAccountId} onChange={(event) => onInventoryChange(event.target.value)} disabled={disabled}>
          <option value="">اختر حساب أصل</option>{renderPurchaseReceiptAccountOptions(assetAccounts)}
        </select>
      </label>
      <label style={{ display: "grid", gap: 5 }}>حساب المورد (دائن)
        <select aria-label={"حساب المورد " + receipt.receipt_number} value={payableAccountId} onChange={(event) => onPayableChange(event.target.value)} disabled={disabled}>
          <option value="">اختر حساب التزام</option>{renderPurchaseReceiptAccountOptions(payableAccounts)}
        </select>
      </label>
    </div>
  );
}

function PurchaseReceiptAccountingCard({ receipt, assetAccounts, payableAccounts, inventoryAccountId, payableAccountId, busyReceiptId, onInventoryChange, onPayableChange, onPrepare }: {
  receipt: ReceiptOption; assetAccounts: AccountOption[]; payableAccounts: AccountOption[];
  inventoryAccountId: string; payableAccountId: string; busyReceiptId: string | null;
  onInventoryChange: (accountId: string) => void; onPayableChange: (accountId: string) => void;
  onPrepare: (receipt: ReceiptOption) => void;
}) {
  const hasJournal = Boolean(receipt.journal_entry_id);
  const sourceReady = receipt.costs_complete && receipt.received_cost !== null && receipt.received_cost > 0 && receipt.currency === "YER";
  const busy = busyReceiptId === receipt.receipt_id;
  return (
    <article style={{ border: "1px solid var(--border, #e2e8f0)", borderRadius: 10, padding: 12, display: "grid", gap: 10 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <strong>{receipt.receipt_number}</strong>
          <div style={{ fontSize: 12, color: "var(--muted-foreground, #64748b)" }}>{receipt.supplier_name} · {receipt.warehouse_name}</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground, #64748b)" }}>{dateText(receipt.received_at)} · {receipt.purchase_order_number}</div>
        </div>
        <div style={{ fontWeight: 800 }}>{money(receipt.received_cost, receipt.currency)}</div>
      </header>
      <PurchaseReceiptJournalState receipt={receipt} />
      {!hasJournal && sourceReady && (
        <>
          <PurchaseReceiptAccountSelectors
            receipt={receipt}
            assetAccounts={assetAccounts}
            payableAccounts={payableAccounts}
            inventoryAccountId={inventoryAccountId}
            payableAccountId={payableAccountId}
            disabled={busy}
            onInventoryChange={onInventoryChange}
            onPayableChange={onPayableChange}
          />
          <button className="btn primary" type="button" onClick={() => onPrepare(receipt)} disabled={busyReceiptId !== null || !assetAccounts.length || !payableAccounts.length}>
            {busy ? "جار إنشاء المسودة…" : "إعداد مسودة القيد"}
          </button>
          {(!assetAccounts.length || !payableAccounts.length) && <p role="alert" style={{ margin: 0 }}>يلزم إنشاء حساب أصل وحساب التزام نشطين في دليل المؤسسة أولًا.</p>}
        </>
      )}
    </article>
  );
}

function PurchaseReceiptAccountingQueue({ receipts, assetAccounts, payableAccounts, inventoryAccountsByReceipt, payableAccountsByReceipt, busyReceiptId, onInventoryChange, onPayableChange, onPrepare }: {
  receipts: ReceiptOption[]; assetAccounts: AccountOption[]; payableAccounts: AccountOption[];
  inventoryAccountsByReceipt: Record<string, string>; payableAccountsByReceipt: Record<string, string>; busyReceiptId: string | null;
  onInventoryChange: (receiptId: string, accountId: string) => void;
  onPayableChange: (receiptId: string, accountId: string) => void;
  onPrepare: (receipt: ReceiptOption) => void;
}) {
  if (receipts.length === 0) return <p>لا توجد إيصالات مسجلة لهذا الأمر بعد.</p>;
  return (
    <div className="purchase-receipt-accounting-list" style={{ display: "grid", gap: 10 }}>
      {receipts.map((receipt) => (
        <PurchaseReceiptAccountingCard
          key={receipt.receipt_id}
          receipt={receipt}
          assetAccounts={assetAccounts}
          payableAccounts={payableAccounts}
          inventoryAccountId={inventoryAccountsByReceipt[receipt.receipt_id] || ""}
          payableAccountId={payableAccountsByReceipt[receipt.receipt_id] || ""}
          busyReceiptId={busyReceiptId}
          onInventoryChange={(accountId) => onInventoryChange(receipt.receipt_id, accountId)}
          onPayableChange={(accountId) => onPayableChange(receipt.receipt_id, accountId)}
          onPrepare={onPrepare}
        />
      ))}
    </div>
  );
}

export function PurchaseReceiptAccountingWorkspace({ purchaseOrderId }: { purchaseOrderId: string }) {
  const [queue, setQueue] = useState<Queue>({ accounts: [], receipts: [] });
  const [inventoryAccountsByReceipt, setInventoryAccountsByReceipt] = useState<Record<string, string>>({});
  const [payableAccountsByReceipt, setPayableAccountsByReceipt] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyReceiptId, setBusyReceiptId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data, error: rpcError } = await supabase.rpc("fetch_purchase_receipt_accounting_queue", { p_purchase_order_id: purchaseOrderId, p_limit: 50 });
      if (rpcError) throw new Error(rpcError.message || "تعذر تحميل إيصالات الاستلام المحاسبية.");
      const next = parseQueue(data);
      setQueue(next);
      const assetDefault = next.accounts.find((account) => account.account_type === "asset")?.id ?? "";
      const payableDefault = next.accounts.find((account) => account.account_type === "liability")?.id ?? "";
      setInventoryAccountsByReceipt((current) => Object.fromEntries(next.receipts.map((receipt) => [
        receipt.receipt_id, receipt.inventory_account_id && next.accounts.some((a) => a.id === receipt.inventory_account_id && a.account_type === "asset")
          ? receipt.inventory_account_id : current[receipt.receipt_id] || assetDefault,
      ])));
      setPayableAccountsByReceipt((current) => Object.fromEntries(next.receipts.map((receipt) => [
        receipt.receipt_id, receipt.payable_account_id && next.accounts.some((a) => a.id === receipt.payable_account_id && a.account_type === "liability")
          ? receipt.payable_account_id : current[receipt.receipt_id] || payableDefault,
      ])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل إيصالات الاستلام المحاسبية.");
    } finally { setLoading(false); }
  }, [purchaseOrderId]);

  useEffect(() => { void load(); }, [load]);

  async function prepare(receipt: ReceiptOption) {
    const inventoryAccountId = inventoryAccountsByReceipt[receipt.receipt_id] || "";
    const payableAccountId = payableAccountsByReceipt[receipt.receipt_id] || "";
    if (!receipt.costs_complete || receipt.received_cost === null || receipt.received_cost <= 0) {
      setError("لم يُنشأ القيد: التكاليف المصدرية ناقصة أو غير مطابقة أو ليست مبلغًا موجبًا."); return;
    }
    if (receipt.currency !== "YER") {
      setError("لم يُنشأ القيد: لا توجد سياسة دفتر أستاذ معتمدة لهذه العملة؛ لم يُطبق تحويل عملة."); return;
    }
    if (!inventoryAccountId || !payableAccountId || inventoryAccountId === payableAccountId) {
      setError("اختر حساب أصل للمخزون وحساب التزام للمورد، ويجب أن يكونا حسابين مختلفين."); return;
    }
    if (typeof window.crypto?.randomUUID !== "function") {
      setError("تعذر إنشاء مفتاح عملية آمن لهذا المتصفح؛ لم يُرسل طلب إنشاء القيد."); return;
    }
    setBusyReceiptId(receipt.receipt_id); setError(""); setNotice("");
    try {
      const { data, error: rpcError } = await supabase.rpc("prepare_purchase_receipt_accounting_draft", {
        p_receipt_id: receipt.receipt_id, p_inventory_account_id: inventoryAccountId,
        p_payable_account_id: payableAccountId, p_idempotency_key: window.crypto.randomUUID(),
      });
      if (rpcError) throw new Error(rpcError.message || "تعذر إنشاء مسودة القيد.");
      if (!isRecord(data) || !["draft", "posted", "void"].includes(String(data.status))
          || typeof data.journal_entry_id !== "string" || typeof data.journal_entry_number !== "string" || data.receipt_id !== receipt.receipt_id) {
        throw new Error("لم يؤكد الخادم هوية القيد المرتبط بإيصال الاستلام.");
      }
      setNotice((data.replayed === true ? "استُعيد القيد المرتبط مسبقًا " : "أُنشئت مسودة القيد ") +
        data.journal_entry_number + " لإيصال " + receipt.receipt_number +
        ". لم يُرحّل القيد ولم يُسدد المورد ولم تتكرر حركة المخزون.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إنشاء مسودة القيد."); }
    finally { setBusyReceiptId(null); }
  }

  const assetAccounts = queue.accounts.filter((account) => account.is_active && account.account_type === "asset");
  const payableAccounts = queue.accounts.filter((account) => account.is_active && account.account_type === "liability");
  return (
    <section aria-label="قيود إيصالات الشراء" style={{ marginTop: 18, border: "1px solid var(--border, #d9e1e5)", borderRadius: 12, padding: 14, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap", alignItems: "center" }}>
        <div><h3 style={{ margin: 0 }}>القيد المحاسبي لإيصالات الاستلام</h3>
          <p style={{ margin: "5px 0 0", color: "var(--muted-foreground, #64748b)", fontSize: 12 }}>ينشئ قيدًا متوازنًا من تكلفة الاستلام المثبتة: مدين المخزون، ودائن التزام المورد. الترحيل والسداد منفصلان.</p></div>
        <button className="btn outline" type="button" onClick={() => void load()} disabled={loading || busyReceiptId !== null}><RefreshCw size={15} /> تحديث الإيصالات</button>
      </div>
      {error && <p role="alert" style={{ margin: 0, padding: 10, borderRadius: 8, background: "#fef2f2", color: "#991b1b" }}>{error}</p>}
      {notice && <p role="status" style={{ margin: 0, padding: 10, borderRadius: 8, background: "#ecfdf5", color: "#166534" }}><CheckCircle2 size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />{notice}</p>}
      {loading ? <p role="status">جار تحميل إيصالات الاستلام…</p> : (
        <PurchaseReceiptAccountingQueue
          receipts={queue.receipts}
          assetAccounts={assetAccounts}
          payableAccounts={payableAccounts}
          inventoryAccountsByReceipt={inventoryAccountsByReceipt}
          payableAccountsByReceipt={payableAccountsByReceipt}
          busyReceiptId={busyReceiptId}
          onInventoryChange={(receiptId, accountId) => setInventoryAccountsByReceipt((current) => ({ ...current, [receiptId]: accountId }))}
          onPayableChange={(receiptId, accountId) => setPayableAccountsByReceipt((current) => ({ ...current, [receiptId]: accountId }))}
          onPrepare={(receipt) => void prepare(receipt)}
        />
      )}
    </section>
  );
}
