import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { formatLedgerBalance, formatLedgerMoney, parseLedgerMoneyCents, type LedgerAccountType } from "@/lib/general-ledger";

type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  account_type: LedgerAccountType;
  is_active: boolean;
  debit_total: string;
  credit_total: string;
};

type ReceivablesCurrency = {
  currency: string;
  open_invoice_count: number;
  overdue_invoice_count: number;
  unknown_due_date_count: number;
  total_outstanding_amount: string;
};

type Snapshot = {
  assetAccounts: LedgerAccount[];
  receivables: ReceivablesCurrency[];
  openInvoiceCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMoneyText(value: unknown): string | null {
  if (typeof value === "string") {
    return parseLedgerMoneyCents(value) === null ? null : value;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) return null;
  return Math.floor(cents / 100).toString() + "." + String(cents % 100).padStart(2, "0");
}

function parseSafeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function parseSnapshot(ledgerValue: unknown, receivablesValue: unknown): Snapshot {
  if (!isRecord(ledgerValue) || !Array.isArray(ledgerValue.accounts) ||
      !isRecord(receivablesValue) || !Array.isArray(receivablesValue.summary)) {
    throw new Error("استجابة الملخص المالي غير مكتملة.");
  }

  const accounts = ledgerValue.accounts.map((value): LedgerAccount => {
    if (!isRecord(value) || typeof value.id !== "string" || typeof value.code !== "string" ||
        typeof value.name !== "string" || !["asset", "liability", "equity", "revenue", "expense"].includes(String(value.account_type)) ||
        typeof value.is_active !== "boolean" || typeof value.debit_total !== "string" ||
        typeof value.credit_total !== "string" || parseLedgerMoneyCents(value.debit_total) === null ||
        parseLedgerMoneyCents(value.credit_total) === null) {
      throw new Error("تعذر التحقق من أرصدة دليل الحسابات.");
    }
    return value as unknown as LedgerAccount;
  });

  const receivables = receivablesValue.summary.map((value): ReceivablesCurrency => {
    if (!isRecord(value) || typeof value.currency !== "string" || !/^[A-Z0-9_-]{3,12}$/.test(value.currency)) {
      throw new Error("تعذر التحقق من عملة الذمم المدينة.");
    }
    const open = parseSafeCount(value.open_invoice_count);
    const overdue = parseSafeCount(value.overdue_invoice_count);
    const unknownDue = parseSafeCount(value.unknown_due_date_count);
    const outstanding = parseMoneyText(value.total_outstanding_amount);
    if (open === null || overdue === null || unknownDue === null || outstanding === null) {
      throw new Error("تعذر التحقق من أرقام الذمم المدينة.");
    }
    return {
      currency: value.currency,
      open_invoice_count: open,
      overdue_invoice_count: overdue,
      unknown_due_date_count: unknownDue,
      total_outstanding_amount: outstanding,
    };
  });

  const openInvoiceCount = parseSafeCount(receivablesValue.total_open_invoices);
  if (openInvoiceCount === null) throw new Error("تعذر التحقق من عدد الفواتير المفتوحة.");

  return {
    assetAccounts: accounts.filter((account) => account.account_type === "asset" && account.is_active),
    receivables,
    openInvoiceCount,
  };
}

function currencyLabel(currency: string): string {
  return currency === "YER" ? "ر.ي" : currency;
}

function ReceivablesCurrencySection({ rows }: { rows: ReceivablesCurrency[] }) {
  return (
            <section>
              <h3>الذمم المدينة حسب العملة</h3>
              {rows.length === 0 ? <p className="report-note">لا توجد فواتير ذات رصيد مستحق.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>العملة</th><th>الرصيد المستحق</th><th>فواتير متأخرة</th></tr></thead>
                    <tbody>{rows.map((item) => (
                      <tr key={item.currency}>
                        <td>{item.currency}</td>
                        <td>{formatLedgerMoney(item.total_outstanding_amount, currencyLabel(item.currency))}</td>
                        <td>{item.overdue_invoice_count.toLocaleString("en-US")}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
  );
}

function AssetAccountRow({ account }: { account: LedgerAccount }) {
  return (
    <tr>
      <td><strong>{account.name}</strong><small style={{ display: "block" }}>{account.code}</small></td>
      <td>{formatLedgerMoney(account.debit_total)}</td>
      <td>{formatLedgerMoney(account.credit_total)}</td>
      <td>{formatLedgerBalance(account.debit_total, account.credit_total)}</td>
    </tr>
  );
}

function AssetAccountsSection({ accounts }: { accounts: LedgerAccount[] }) {
  return (
            <section>
              <h3>أرصدة الأصول — دفتر الأستاذ</h3>
              {accounts.length === 0 ? <p className="report-note">لا توجد حسابات أصول نشطة في دليل الحسابات.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th><th>الرصيد الطبيعي</th></tr></thead>
                    <tbody>{accounts.map((account) => <AssetAccountRow key={account.id} account={account} />)}</tbody>
                  </table>
                </div>
              )}
            </section>
  );
}

export function FinanceParitySnapshot() {
  const { user, ready } = useAuth();
  const canManageFinance = Boolean(user?.roles.some((role) => ["admin", "manager", "accountant"].includes(role)));
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(async () => {
    if (!ready || !canManageFinance) return;
    setLoading(true);
    setError("");
    try {
      const [ledgerResult, receivablesResult] = await Promise.all([
        supabase.rpc("fetch_general_ledger", {
          p_from: null,
          p_to: null,
          p_account_id: null,
          p_limit: 1,
          p_offset: 0,
        }),
        supabase.rpc("fetch_staff_receivables_aging", { p_limit: 1, p_offset: 0 }),
      ]);
      if (ledgerResult.error || receivablesResult.error) {
        throw new Error("تعذر تحميل ملخص المحاسبة. تحقق من صلاحية المحاسبة وترحيلات قاعدة البيانات.");
      }
      setSnapshot(parseSnapshot(ledgerResult.data, receivablesResult.data));
    } catch (cause) {
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : "تعذر تحميل ملخص المحاسبة.");
    } finally {
      setLoading(false);
    }
  }, [ready, canManageFinance]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  if (!ready || !canManageFinance) return null;

  return (
    <section className="panel" aria-label="ملخص المحاسبة والتحصيل" style={{ marginTop: 16 }}>
      <div className="panel-head">
        <div>
          <h2>ملخص المحاسبة والتحصيل</h2>
          <p>الذمم من سجل الفواتير والمدفوعات، وأرصدة الأصول من القيود المرحلة فقط.</p>
        </div>
        <button className="btn secondary" type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
          <RefreshCw size={16} /> {loading ? "جارٍ التحديث..." : "تحديث الملخص"}
        </button>
      </div>

      {loading && !snapshot ? <p role="status">جارٍ تحميل الملخص المالي...</p> : null}
      {error ? <p role="alert" className="report-note">{error}</p> : null}
      {snapshot && !error ? (
        <>
          <div className="report-grid">
            <article className="report-metric">
              <span>الفواتير ذات الرصيد المستحق</span>
              <strong>{snapshot.openInvoiceCount.toLocaleString("en-US")}</strong>
              <small>العدد من سجل الذمم المعتمد</small>
            </article>
            <article className="report-metric">
              <span>حسابات الأصول النشطة</span>
              <strong>{snapshot.assetAccounts.length.toLocaleString("en-US")}</strong>
              <small>من دليل الحسابات</small>
            </article>
            <article className="report-metric">
              <span>عملات بها ذمم مفتوحة</span>
              <strong>{snapshot.receivables.length.toLocaleString("en-US")}</strong>
              <small>كل عملة معروضة منفصلة دون جمع غير متجانس</small>
            </article>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))", gap: 16, marginTop: 16 }}>
            <ReceivablesCurrencySection rows={snapshot.receivables} />
            <AssetAccountsSection accounts={snapshot.assetAccounts} />
          </div>
          <p className="report-note" style={{ marginTop: 12 }}>
            لا يوجد رصيد نقدي منفصل أو مجمع تقديري؛ رصيد كل حساب محسوب من قيوده المرحلة، والذمم مستخرجة من الفواتير والمدفوعات المسجلة. لا تُجمع مبالغ عملات مختلفة.
          </p>
        </>
      ) : null}
    </section>
  );
}
