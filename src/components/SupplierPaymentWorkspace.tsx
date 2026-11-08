import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Banknote, CheckCircle2, FileText, Landmark, Plus, Printer, RefreshCw, Send, ShieldCheck, Wallet, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchSupplierAccountActivity } from "@/lib/supplier-account-activity";
import { projectSupplierPaymentVoucherPrintDocument, type SupplierPaymentVoucherPrintDocument } from "@/lib/supplier-payment-voucher-print";
import { SupplierPaymentVoucherPrintSheet } from "@/components/SupplierPaymentVoucherPrintSheet";
import {
  fetchSupplierPaymentWorkspace,
  prepareSupplierPaymentJournalDraft,
  reconcileSupplierPayment,
  recordSupplierPayment,
  registerSupplierSettlementAccount,
  voidSupplierPayment,
  type SupplierPaymentEvidenceType,
  type SupplierPaymentHistory,
  type SupplierPaymentMethod,
  type SupplierPaymentOpenReceipt,
  type SupplierPaymentReconciliationAction,
  type SupplierPaymentSettlementKind,
  type SupplierPaymentWorkspace,
} from "@/lib/supplier-payments";

type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
};
type Props = {
  accounts: LedgerAccount[];
  onRefresh: () => Promise<void>;
};
type ReconciliationDraft = {
  action: SupplierPaymentReconciliationAction;
  reference: string;
  amount: string;
  currency: string;
  reason: string;
};
type PaymentFingerprint = { fingerprint: string; key: string };

const panel: React.CSSProperties = {
  display: "grid", gap: 11, padding: 14, minWidth: 0,
  border: "1px solid var(--border, #d6dfe4)", borderRadius: 12,
  background: "var(--card, #fff)",
};
const field: React.CSSProperties = {
  width: "100%", minWidth: 0, boxSizing: "border-box", padding: "9px 10px",
  border: "1px solid var(--border, #d6dfe4)", borderRadius: 8,
  background: "var(--card, #fff)", color: "var(--foreground, #17242a)", font: "inherit",
};
const muted: React.CSSProperties = {
  color: "var(--muted-foreground, #64748b)", margin: 0, fontSize: 12, lineHeight: 1.7,
};
const button: React.CSSProperties = {
  display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 7,
  padding: "8px 11px", border: "1px solid var(--border, #d6dfe4)", borderRadius: 8,
  background: "var(--card, #fff)", color: "var(--foreground, #17242a)",
  cursor: "pointer", font: "inherit",
};
const primary: React.CSSProperties = {
  ...button, background: "var(--primary, #155e4a)", borderColor: "transparent",
  color: "#fff", fontWeight: 700,
};
const th: React.CSSProperties = { padding: 9, textAlign: "right", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: 9, verticalAlign: "top", borderTop: "1px solid var(--border, #e5eaed)" };
const paymentMethods: Array<{ value: SupplierPaymentMethod; label: string }> = [
  { value: "cash", label: "نقدًا" },
  { value: "bank_transfer", label: "تحويل بنكي" },
  { value: "cheque", label: "شيك" },
];

function today(): string {
  const date = new Date();
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}
function cents(value: string): bigint | null {
  const text = value.trim();
  if (!/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  try { return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2)); }
  catch { return null; }
}
function centsText(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return (negative ? "-" : "") + (absolute / 100n).toString() + "." + (absolute % 100n).toString().padStart(2, "0");
}
function money(value: string, currency: string): string {
  const parsed = value.trim();
  const negative = parsed.startsWith("-");
  const unsigned = negative ? parsed.slice(1) : parsed;
  const [whole, fraction = ""] = unsigned.split(".");
  let formatted = whole;
  try { formatted = new Intl.NumberFormat("ar-YE").format(BigInt(whole)); } catch { /* keep exact source text */ }
  return (negative ? "−" : "") + formatted + "." + (fraction + "00").slice(0, 2) + " " + currency;
}
function methodLabel(method: SupplierPaymentMethod): string {
  return paymentMethods.find((item) => item.value === method)?.label ?? method;
}
function evidenceType(method: SupplierPaymentMethod): SupplierPaymentEvidenceType {
  if (method === "cash") return "cash_voucher";
  if (method === "bank_transfer") return "bank_statement_line";
  return "cheque_clearance";
}
function evidenceLabel(method: SupplierPaymentMethod): string {
  if (method === "cash") return "سند قبض / صرف الخزينة";
  if (method === "bank_transfer") return "سطر كشف حساب البنك";
  return "إثبات صرف الشيك";
}
function journalLabel(payment: SupplierPaymentHistory): string {
  if (payment.journalStatus === "posted") return "قيد مرحّل #" + (payment.journalEntryNumber ?? "");
  if (payment.journalStatus === "draft") return "مسودة قيد #" + (payment.journalEntryNumber ?? "");
  if (payment.journalStatus === "void") return "مسودة القيد ملغاة";
  return "لم يُنشأ قيد بعد";
}
function explainUnavailable(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/PGRST202|PGRST204|schema cache|could not find the function|does not exist|not find.*function/i.test(message)) {
    return "وظيفة سداد الموردين غير متاحة في قاعدة البيانات الحالية. المكوّن البرمجي موجود على main؛ يلزم مزامنة ترحيل قاعدة البيانات عبر Bolt New قبل التشغيل.";
  }
  return message || "تعذر تحميل مساحة سداد الموردين.";
}

export function SupplierPaymentWorkspace({ accounts, onRefresh }: Props) {
  const { user, ready } = useAuth();
  const canManageFinance = Boolean(user?.roles.some((role) =>
    role === "admin" || role === "manager" || role === "accountant"
  ));
  const canVoid = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));

  const [payload, setPayload] = useState<SupplierPaymentWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [receiptPage, setReceiptPage] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<SupplierPaymentMethod>("cash");
  const [settlementAccountMappingId, setSettlementAccountMappingId] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentReference, setPaymentReference] = useState("");
  const [allocationValues, setAllocationValues] = useState<Record<string, string>>({});
  const [payableAccountId, setPayableAccountId] = useState("");
  const [showAccountSetup, setShowAccountSetup] = useState(false);
  const [setupAccountId, setSetupAccountId] = useState("");
  const [setupKind, setSetupKind] = useState<SupplierPaymentSettlementKind>("cash");
  const [setupCurrency, setSetupCurrency] = useState("YER");
  const [setupName, setSetupName] = useState("");
  const [evidenceDrafts, setEvidenceDrafts] = useState<Record<string, ReconciliationDraft>>({});
  const [voidReasons, setVoidReasons] = useState<Record<string, string>>({});
  const [showVoids, setShowVoids] = useState(false);
  const [printDocument, setPrintDocument] = useState<SupplierPaymentVoucherPrintDocument | null>(null);

  const pendingPayment = useRef<PaymentFingerprint | null>(null);
  const pendingEvidence = useRef<Record<string, PaymentFingerprint>>({});
  const pendingJournal = useRef<Record<string, string>>({});

  const readWorkspace = useCallback(async (overrides?: {
    supplierId?: string | null;
    currency?: string | null;
    offset?: number;
  }): Promise<SupplierPaymentWorkspace> => {
    const querySupplier = overrides && Object.prototype.hasOwnProperty.call(overrides, "supplierId")
      ? overrides.supplierId : supplierId || null;
    const queryCurrency = overrides && Object.prototype.hasOwnProperty.call(overrides, "currency")
      ? overrides.currency : currencyCode || null;
    const queryOffset = overrides?.offset ?? receiptPage * 100;
    return fetchSupplierPaymentWorkspace({
      supplierId: querySupplier,
      currency: queryCurrency,
      limit: 100,
      offset: queryOffset,
    });
  }, [supplierId, currencyCode, receiptPage]);

  const reload = useCallback(async (overrides?: {
    supplierId?: string | null;
    currency?: string | null;
    offset?: number;
  }): Promise<SupplierPaymentWorkspace> => {
    setLoading(true);
    setError("");
    try {
      const result = await readWorkspace(overrides);
      setPayload(result);
      return result;
    } catch (cause) {
      const message = explainUnavailable(cause);
      setError(message);
      throw new Error(message);
    } finally {
      setLoading(false);
    }
  }, [readWorkspace]);

  useEffect(() => {
    if (!ready) return;
    if (!canManageFinance) { setLoading(false); return; }
    void reload().catch(() => undefined);
  }, [ready, canManageFinance, reload]);

  useEffect(() => {
    if (!printDocument || typeof window === "undefined" ||
        typeof document === "undefined" || typeof window.print !== "function") return;
    const body = document.body;
    const previousMode = body.getAttribute("data-print-mode");
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      if (previousMode === null) body.removeAttribute("data-print-mode");
      else body.setAttribute("data-print-mode", previousMode);
      window.removeEventListener("afterprint", restore);
      setPrintDocument(null);
    };
    body.setAttribute("data-print-mode", "supplier-payment-voucher");
    window.addEventListener("afterprint", restore, { once: true });
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        setError("تعذر فتح نافذة طباعة سند المورد.");
        restore();
      }
    }, 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", restore);
      if (!restored && body.getAttribute("data-print-mode") === "supplier-payment-voucher") {
        if (previousMode === null) body.removeAttribute("data-print-mode");
        else body.setAttribute("data-print-mode", previousMode);
      }
    };
  }, [printDocument]);

  const activeAssetAccounts = useMemo(() =>
    accounts.filter((account) => account.is_active && account.account_type === "asset"),
  [accounts]);

  const currencyOptions = useMemo(() => {
    const values = new Set<string>();
    (payload?.settlementAccounts ?? []).forEach((account) => values.add(account.currency));
    (payload?.openReceipts ?? []).forEach((receipt) => receipt.supplierId === supplierId || !supplierId ? values.add(receipt.currency) : undefined);
    return Array.from(values).sort();
  }, [payload, supplierId]);

  const settlementKind = paymentMethod === "cash" ? "cash" : "bank";
  const settlementAccounts = useMemo(() =>
    (payload?.settlementAccounts ?? []).filter((account) =>
      account.kind === settlementKind && account.currency === currencyCode
    ), [payload, settlementKind, currencyCode]);
  const selectedSettlement = settlementAccounts.find((account) => account.id === settlementAccountMappingId)
    ?? settlementAccounts[0]
    ?? null;

  const supplierReceipts = useMemo(() =>
    (payload?.openReceipts ?? []).filter((receipt) =>
      receipt.supplierId === supplierId && receipt.currency === currencyCode
    ), [payload, supplierId, currencyCode]);

  const payableAccounts = useMemo(() => {
    const unique = new Map<string, { id: string; code: string; name: string }>();
    supplierReceipts.forEach((receipt) => unique.set(receipt.payableAccountId, {
      id: receipt.payableAccountId, code: receipt.payableAccountCode, name: receipt.payableAccountName,
    }));
    return Array.from(unique.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [supplierReceipts]);

  const selectedPayableAccount = payableAccounts.find((account) => account.id === payableAccountId)
    ?? payableAccounts[0]
    ?? null;
  const allocatableReceipts = supplierReceipts.filter((receipt) =>
    selectedPayableAccount && receipt.payableAccountId === selectedPayableAccount.id
  );

  const allocationRows = useMemo(() => {
    return allocatableReceipts.flatMap((receipt) => {
      const raw = (allocationValues[receipt.receiptId] ?? "").trim();
      if (!raw) return [];
      const amountCents = cents(raw);
      return [{ receipt, raw, amountCents }];
    });
  }, [allocatableReceipts, allocationValues]);

  const allocationTotal = allocationRows.reduce((total, item) =>
    item.amountCents === null ? total : total + item.amountCents, 0n);
  const allocationError = allocationRows.some((item) => {
    const amount = item.amountCents;
    const available = cents(item.receipt.availableToAllocate);
    return amount === null || amount <= 0n || available === null || amount > available;
  });
  const paymentTotalText = centsText(allocationTotal);

  useEffect(() => {
    if (settlementAccounts.length === 0) {
      if (settlementAccountMappingId) setSettlementAccountMappingId("");
      return;
    }
    if (!settlementAccounts.some((account) => account.id === settlementAccountMappingId)) {
      setSettlementAccountMappingId(settlementAccounts[0].id);
    }
  }, [settlementAccounts, settlementAccountMappingId]);

  useEffect(() => {
    if (!payableAccounts.length) {
      if (payableAccountId) setPayableAccountId("");
      return;
    }
    if (!payableAccounts.some((account) => account.id === payableAccountId)) {
      setPayableAccountId(payableAccounts[0].id);
      setAllocationValues({});
    }
  }, [payableAccounts, payableAccountId]);

  useEffect(() => {
    if (!currencyCode && currencyOptions.length) setCurrencyCode(currencyOptions[0]);
  }, [currencyCode, currencyOptions]);

  useEffect(() => {
    if (!setupAccountId && activeAssetAccounts.length) setSetupAccountId(activeAssetAccounts[0].id);
  }, [setupAccountId, activeAssetAccounts]);

  async function readBackAfterMutation(overrides?: { supplierId?: string | null; currency?: string | null; offset?: number }) {
    await reload(overrides);
    await fetchSupplierAccountActivity({ from: "", to: "", limit: 50, offset: 0 });
    await onRefresh();
  }

  async function saveSettlementAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageFinance) return;
    if (!setupAccountId || !/^[A-Za-z]{3}$/.test(setupCurrency.trim()) || setupName.trim().length < 2) {
      setError("اختر حساب أصل نشطًا وحدد العملة واسم حساب التسوية.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await registerSupplierSettlementAccount({
        accountingAccountId: setupAccountId,
        kind: setupKind,
        currency: setupCurrency.trim().toUpperCase(),
        displayName: setupName.trim(),
      });
      setCurrencyCode(result.currency);
      setPaymentMethod(result.kind === "cash" ? "cash" : "bank_transfer");
      setShowAccountSetup(false);
      setSetupName("");
      await readBackAfterMutation({ supplierId: supplierId || null, currency: result.currency, offset: 0 });
      setReceiptPage(0);
      setNotice("تم ربط حساب التسوية " + result.displayName + " بحساب الأصل " + activeAssetAccounts.find((account) => account.id === result.accountingAccountId)?.code
        + ". هذا تعريف محاسبي فقط ولا يمثل رصيدًا افتتاحيًا أو اتصالًا بالبنك.");
    } catch (cause) {
      if (!error) setError(cause instanceof Error ? cause.message : "تعذر تعريف حساب التسوية.");
    } finally { setSaving(false); }
  }

  async function savePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageFinance || !supplierId || !currencyCode || !selectedSettlement || !selectedPayableAccount) {
      setError("اختر المورد والعملة وحساب تسوية نشطًا وحساب الالتزام الصحيح.");
      return;
    }
    if (allocationRows.length < 1 || allocationError || allocationTotal <= 0n) {
      setError("أدخل تخصيصات موجبة لا تتجاوز المتاح لكل إيصال، وبحساب التزام واحد.");
      return;
    }
    if (paymentTotalText === "0.00" || paymentReference.trim().length < 3) {
      setError("أدخل مرجع أداة السداد ومبلغًا موزعًا على الإيصالات.");
      return;
    }
    if (!paymentDate || paymentDate > today()) {
      setError("تاريخ السداد مطلوب ولا يمكن أن يكون في المستقبل.");
      return;
    }
    if (allocationRows.some((item) => item.receipt.currency !== currencyCode)) {
      setError("لا يجوز جمع تخصيصات بعملات مختلفة.");
      return;
    }
    const request = {
      supplierId,
      paymentDate,
      amount: paymentTotalText,
      currency: currencyCode,
      method: paymentMethod,
      settlementAccountMappingId: selectedSettlement.id,
      paymentReference: paymentReference.trim(),
      allocations: allocationRows.map((item) => ({
        receiptId: item.receipt.receiptId,
        amount: item.raw,
      })),
    };
    const fingerprint = JSON.stringify(request);
    if (!pendingPayment.current || pendingPayment.current.fingerprint !== fingerprint) {
      if (!window.crypto?.randomUUID) {
        setError("المتصفح لا يدعم مفتاح منع التكرار الآمن؛ لم يتم إرسال السند.");
        return;
      }
      pendingPayment.current = { fingerprint, key: window.crypto.randomUUID() };
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await recordSupplierPayment({
        ...request,
        idempotencyKey: pendingPayment.current.key,
      });
      await readBackAfterMutation({ supplierId, currency: currencyCode, offset: 0 });
      pendingPayment.current = null;
      setReceiptPage(0);
      setAllocationValues({});
      setPaymentReference("");
      setNotice("تم حفظ سند سداد المورد رقم " + result.paymentNumber + " بمبلغ "
        + money(result.amount, result.currency) + ". حُجزت التخصيصات، ولم ينخفض المستحق النهائي بعد؛ يلزم إثبات مستقل ثم قيد مرحّل.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ سند السداد. أعد المحاولة بنفس البيانات.");
    } finally { setSaving(false); }
  }

  function evidenceDraft(payment: SupplierPaymentHistory): ReconciliationDraft {
    return evidenceDrafts[payment.paymentId] ?? {
      action: "matched",
      reference: payment.paymentReference,
      amount: payment.amount,
      currency: payment.currency,
      reason: "",
    };
  }

  function updateEvidenceDraft(paymentId: string, patch: Partial<ReconciliationDraft>) {
    setEvidenceDrafts((current) => ({
      ...current,
      [paymentId]: {
        ...(current[paymentId] ?? { action: "matched", reference: "", amount: "", currency: "", reason: "" }),
        ...patch,
      },
    }));
  }

  async function saveEvidence(payment: SupplierPaymentHistory, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const draft = evidenceDraft(payment);
    const reference = draft.reference.trim();
    const observed = cents(draft.amount);
    const reason = draft.reason.trim();
    if (reference.length < 3 || reference.length > 200 || observed === null ||
        (draft.action === "exception" && (reason.length < 3 || reason.length > 500)) ||
        (draft.action === "matched" && (observed !== cents(payment.amount) || draft.currency.trim().toUpperCase() !== payment.currency))) {
      setError(draft.action === "matched"
        ? "المطابقة تتطلب مرجعًا ومبلغًا وعملة مطابقين تمامًا لسند السداد."
        : "تسجيل الاستثناء يتطلب المرجع والمبلغ المرصود وسببًا من 3 إلى 500 حرف.");
      return;
    }
    const request = {
      paymentId: payment.paymentId,
      action: draft.action,
      evidenceType: evidenceType(payment.paymentMethod),
      evidenceReference: reference,
      observedAmount: draft.amount.trim(),
      currency: draft.currency.trim().toUpperCase(),
      reason: draft.action === "exception" ? reason : null,
    };
    const fingerprint = JSON.stringify(request);
    const pending = pendingEvidence.current[payment.paymentId];
    if (!pending || pending.fingerprint !== fingerprint) {
      if (!window.crypto?.randomUUID) {
        setError("المتصفح لا يدعم مفتاح منع التكرار الآمن؛ لم تحفظ المطابقة.");
        return;
      }
      pendingEvidence.current[payment.paymentId] = { fingerprint, key: window.crypto.randomUUID() };
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await reconcileSupplierPayment({
        ...request,
        idempotencyKey: pendingEvidence.current[payment.paymentId].key,
      });
      await readBackAfterMutation({ supplierId: supplierId || null, currency: currencyCode || null, offset: receiptPage * 100 });
      delete pendingEvidence.current[payment.paymentId];
      setNotice(result.action === "matched"
        ? "تم حفظ دليل المطابقة للسند رقم " + payment.paymentNumber + " بالمرجع " + result.evidenceReference + ". يستطيع المحاسب إنشاء مسودة القيد بعد إعادة القراءة."
        : "سُجل استثناء مطابقة للسند رقم " + payment.paymentNumber + ". سيظل إنشاء القيد محظورًا حتى تسجل مطابقة لاحقة صحيحة.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل دليل المطابقة. تأكد أن المنفذ مختلف عن منشئ السند.");
    } finally { setSaving(false); }
  }

  async function handoffJournal(payment: SupplierPaymentHistory) {
    if (payment.reconciliationStatus !== "matched" || payment.status !== "recorded") {
      setError("لا يُسمح بإنشاء القيد إلا بعد آخر دليل مطابقة ناجح لسند مسجل.");
      return;
    }
    if (!pendingJournal.current[payment.paymentId]) {
      if (!window.crypto?.randomUUID) {
        setError("المتصفح لا يدعم مفتاح منع التكرار الآمن؛ لم تُنشأ المسودة.");
        return;
      }
      pendingJournal.current[payment.paymentId] = window.crypto.randomUUID();
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const result = await prepareSupplierPaymentJournalDraft({
        paymentId: payment.paymentId,
        idempotencyKey: pendingJournal.current[payment.paymentId],
      });
      await readBackAfterMutation({ supplierId: supplierId || null, currency: currencyCode || null, offset: receiptPage * 100 });
      delete pendingJournal.current[payment.paymentId];
      setNotice("أُنشئت مسودة القيد #" + result.journalEntryNumber + " للسند رقم " + payment.paymentNumber
        + ". الحالة التي أعادها الخادم: " + result.journalStatus + ". راجعها ورحّلها صراحةً من قائمة قيود الأستاذ.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسليم السند إلى دفتر الأستاذ. تحقق من آخر حدث مطابقة وصلاحية المراجع.");
    } finally { setSaving(false); }
  }

  async function cancelPayment(payment: SupplierPaymentHistory, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canVoid) return;
    const reason = (voidReasons[payment.paymentId] ?? "").trim();
    if (reason.length < 5 || reason.length > 500) {
      setError("إلغاء سند الدفع يتطلب سببًا من 5 إلى 500 حرف.");
      return;
    }
    if (payment.journalEntryId && payment.journalStatus !== "void") {
      setError("ألغِ مسودة القيد أولًا من دفتر الأستاذ؛ لن يُلغى سند السداد قبل إلغاء قيده.");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      await voidSupplierPayment({ paymentId: payment.paymentId, reason });
      await readBackAfterMutation({ supplierId: supplierId || null, currency: currencyCode || null, offset: receiptPage * 100 });
      setVoidReasons((current) => ({ ...current, [payment.paymentId]: "" }));
      setNotice("تم إلغاء سند السداد رقم " + payment.paymentNumber + " مع الاحتفاظ بسجل المصدر والتخصيصات.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إلغاء سند السداد. تأكد من إلغاء مسودة القيد أولًا.");
    } finally { setSaving(false); }
  }

  if (!ready) {
    return <section dir="rtl" style={panel}><p role="status" style={muted}>جار التحقق من جلسة المستخدم...</p></section>;
  }
  if (!canManageFinance) {
    return <section dir="rtl" style={panel}><p style={muted}>سداد الموردين متاح للمحاسب والمدير والمسؤول المخوّلين فقط.</p></section>;
  }

  const history = payload?.payments ?? [];
  const visiblePayments = showVoids ? history : history.filter((payment) => payment.status !== "void");
  const selectedSupplierName = payload?.suppliers.find((supplier) => supplier.id === supplierId)?.name ?? "";

  function printPaymentVoucher(payment: SupplierPaymentHistory) {
    setError("");
    if (!payload) {
      setError("لا توجد لقطة مصدرية محفوظة لطباعة سند المورد.");
      return;
    }
    try {
      setPrintDocument(projectSupplierPaymentVoucherPrintDocument(payload, payment));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز سند طباعة المورد.");
    }
  }
  const canSavePayment = !loading && !saving && Boolean(selectedSettlement && selectedPayableAccount && supplierId)
    && allocationRows.length > 0 && !allocationError && allocationTotal > 0n
    && paymentReference.trim().length >= 3 && paymentDate <= today();

  return (
    <>
    <section dir="rtl" aria-label="دورة سداد وتسوية الموردين" style={{ display: "grid", gap: 13, marginBlock: 18, minWidth: 0 }}>
      <header style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 9 }}>
          <div>
            <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: 7 }}><Wallet size={18} /> دورة سداد وتسوية الموردين</h3>
            <p style={muted}>إيصالات مرحلة ← سند سداد محجوز ← مطابقة مستقلة ← مسودة قيد ← ترحيل من دفتر الأستاذ.</p>
          </div>
          <button type="button" style={button} onClick={() => void reload().catch(() => undefined)} disabled={loading || saving}>
            <RefreshCw size={14} /> تحديث بيانات السداد
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          <span style={muted}>السند المحفوظ يحجز التخصيص فقط ولا يخفض المستحق.</span>
          <span style={muted}>المطابقة تتطلب مراجعًا مختلفًا عن منشئ السند.</span>
          <span style={muted}>القيد مسودة؛ لا ترحيل تلقائي.</span>
        </div>
      </header>

      {error ? <div role="alert" style={{ ...panel, color: "#9b2828" }}><AlertTriangle size={15} /> {error}</div> : null}
      {notice ? <div role="status" style={panel}>{notice}</div> : null}
      {loading && <p role="status" style={muted}>جار تحميل حسابات التسوية وإيصالات الموردين وسجل السداد...</p>}

      <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div>
            <strong><Landmark size={16} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} /> حسابات الخزينة والبنوك</strong>
            <p style={muted}>اربط حساب أصل محاسبي قائمًا بوسيلة نقدية أو بنكية وعملة محددة. لا ينشأ رصيد افتتاحي ولا اتصال مباشر بالبنك.</p>
          </div>
          <button type="button" style={button} onClick={() => setShowAccountSetup((value) => !value)} disabled={saving}>
            <Plus size={14} /> تعريف حساب تسوية
          </button>
        </div>
        {payload?.settlementAccounts.length ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 8 }}>
            {payload.settlementAccounts.map((account) => (
              <article key={account.id} style={{ border: "1px solid var(--border, #e0e7ea)", borderRadius: 9, padding: 10 }}>
                <strong>{account.displayName}</strong>
                <p style={muted}>{account.kind === "cash" ? "خزينة نقدية" : "حساب بنكي"} · {account.currency}</p>
                <p style={muted}>{account.accountCode} — {account.accountName}</p>
              </article>
            ))}
          </div>
        ) : <p style={muted}>لم يُعرّف حساب خزينة/بنك بعد. اربط حساب أصل موجودًا قبل تسجيل أي سداد.</p>}
        {showAccountSetup && (
          <form onSubmit={(event) => void saveSettlementAccount(event)} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 9, alignItems: "end" }}>
            <label>حساب الأصل في دفتر الأستاذ
              <select required style={field} value={setupAccountId} onChange={(event) => setSetupAccountId(event.target.value)}>
                <option value="">اختر حساب أصل نشطًا</option>
                {activeAssetAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
              </select>
            </label>
            <label>نوع التسوية
              <select style={field} value={setupKind} onChange={(event) => setSetupKind(event.target.value as SupplierPaymentSettlementKind)}>
                <option value="cash">خزينة نقدية</option><option value="bank">بنك</option>
              </select>
            </label>
            <label>العملة
              <input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" style={field} value={setupCurrency} onChange={(event) => setSetupCurrency(event.target.value.toUpperCase())} />
            </label>
            <label>اسم العرض
              <input required minLength={2} maxLength={120} style={field} value={setupName} onChange={(event) => setSetupName(event.target.value)} placeholder="خزينة الفرع الرئيسي" />
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
              <button type="submit" style={primary} disabled={saving || !setupAccountId || !setupName.trim()}>حفظ الربط</button>
              <button type="button" style={button} disabled={saving} onClick={() => setShowAccountSetup(false)}>إلغاء</button>
            </div>
          </form>
        )}
      </section>

      <section style={panel}>
        <div>
          <strong>تحديد المورد والعملة ومصدر السداد</strong>
          <p style={muted}>يفصل النظام كل عملة وحساب التزام؛ لا يمكن جمع عملات أو حسابات دائنة مختلفة في سند واحد.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(185px,1fr))", gap: 9 }}>
          <label>المورد
            <select style={field} value={supplierId} onChange={(event) => {
              setSupplierId(event.target.value); setReceiptPage(0); setAllocationValues({}); setPayableAccountId("");
            }}>
              <option value="">اختر المورد</option>
              {(payload?.suppliers ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
          <label>العملة
            <select style={field} value={currencyCode} onChange={(event) => {
              setCurrencyCode(event.target.value); setReceiptPage(0); setAllocationValues({});
            }}>
              <option value="">اختر العملة</option>
              {currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
            </select>
          </label>
          <label>وسيلة السداد
            <select style={field} value={paymentMethod} onChange={(event) => {
              setPaymentMethod(event.target.value as SupplierPaymentMethod); setSettlementAccountMappingId("");
            }}>
              {paymentMethods.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>حساب الصرف
            <select style={field} value={selectedSettlement?.id ?? ""} onChange={(event) => setSettlementAccountMappingId(event.target.value)}>
              <option value="">اختر حسابًا متوافقًا</option>
              {settlementAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName} · {account.currency} · {account.accountCode}</option>)}
            </select>
          </label>
          <label>تاريخ السداد
            <input required type="date" max={today()} style={field} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          </label>
          <label>مرجع أداة السداد
            <input required minLength={3} maxLength={200} style={field} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="رقم إيصال أو تحويل أو شيك" />
          </label>
        </div>
        {!selectedSettlement ? <p role="alert" style={{ ...muted, color: "#9b2828" }}>لا يوجد حساب تسوية نشط يطابق نوع وسيلة الدفع والعملة. عرّف الحساب أولًا.</p> : null}
        {!supplierId || !currencyCode ? <p style={muted}>اختر المورد والعملة لعرض إيصالات الاستلام القابلة للتخصيص.</p> : null}
      </section>

      {supplierId && currencyCode && (
        <form onSubmit={(event) => void savePayment(event)} style={panel}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
            <div>
              <strong>تخصيص السداد على إيصالات الاستلام</strong>
              <p style={muted}>{selectedSupplierName} · {currencyCode} · حساب الالتزام المحدد من مصدر الاستلام.</p>
            </div>
            <span style={muted}>إجمالي الإيصالات المصدرية: {payload?.receiptCount ?? 0}</span>
          </div>
          {payableAccounts.length > 1 && (
            <label>حساب الالتزام لهذا السند
              <select style={field} value={selectedPayableAccount?.id ?? ""} onChange={(event) => {
                setPayableAccountId(event.target.value); setAllocationValues({});
              }}>
                {payableAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
              </select>
              <span style={muted}>أنشئ سندًا مستقلاً لكل حساب التزام حتى يبقى قيد اليومية مطابقًا للمصدر.</span>
            </label>
          )}
          {!supplierReceipts.length ? <p style={muted}>لا توجد إيصالات مصدرية مفتوحة لهذا المورد والعملة في الصفحة الحالية.</p> : (
            <div style={{ overflowX: "auto", border: "1px solid var(--border, #dfe6e9)", borderRadius: 9 }}>
              <table style={{ width: "100%", minWidth: 1120, borderCollapse: "collapse", textAlign: "right", fontSize: 12 }}>
                <thead><tr style={{ background: "var(--muted, #f4f7f8)" }}>
                  <th style={th}>الإيصال / أمر الشراء</th><th style={th}>قيد المصدر</th><th style={th}>قيمة الاستلام</th>
                  <th style={th}>إشعارات دائنة مرحلة</th><th style={th}>دفعات محجوزة</th><th style={th}>دفعات مرحلة</th>
                  <th style={th}>المستحق قبل الحجز</th><th style={th}>المتاح للتخصيص</th><th style={th}>تخصيص جديد</th>
                </tr></thead>
                <tbody>{allocatableReceipts.map((receipt: SupplierPaymentOpenReceipt) => {
                  const raw = allocationValues[receipt.receiptId] ?? "";
                  const entered = raw.trim() ? cents(raw) : null;
                  const available = cents(receipt.availableToAllocate) ?? 0n;
                  const invalid = raw.trim() !== "" && (entered === null || entered <= 0n || entered > available);
                  return (
                    <tr key={receipt.receiptId}>
                      <td style={td}><strong>{receipt.receiptNumber}</strong><div style={muted}>أمر {receipt.purchaseOrderNumber} · {receipt.receiptDate}</div></td>
                      <td style={td}>#{receipt.sourceJournalEntryNumber}<div style={muted}>{receipt.payableAccountCode}</div></td>
                      <td style={td}>{money(receipt.sourceAmount, receipt.currency)}</td>
                      <td style={td}>{money(receipt.creditNoteTotal, receipt.currency)}</td>
                      <td style={td}>{money(receipt.reservedPaymentTotal, receipt.currency)}</td>
                      <td style={td}>{money(receipt.postedPaymentTotal, receipt.currency)}</td>
                      <td style={td}><strong>{money(receipt.outstandingPayable, receipt.currency)}</strong></td>
                      <td style={td}><strong>{money(receipt.availableToAllocate, receipt.currency)}</strong></td>
                      <td style={td}>
                        <input
                          aria-label={"تخصيص الإيصال " + receipt.receiptNumber}
                          inputMode="decimal" placeholder="0.00" style={{ ...field, minWidth: 115 }}
                          value={raw}
                          disabled={saving || available <= 0n}
                          onChange={(event) => setAllocationValues((current) => ({ ...current, [receipt.receiptId]: event.target.value }))}
                        />
                        {invalid ? <span style={{ color: "#9b2828", fontSize: 11 }}>تجاوز المتاح أو تنسيق غير صالح</span> : null}
                      </td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
          {payload?.hasMore && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <span style={muted}>الإيصالات المعروضة {payload.offset + 1}–{Math.min(payload.offset + payload.openReceipts.length, payload.receiptCount)} من {payload.receiptCount}</span>
              <button type="button" style={button} disabled={loading || saving} onClick={() => {
                setReceiptPage((current) => current + 1);
                setAllocationValues({});
              }}>إيصالات إضافية <Plus size={14} /></button>
            </div>
          )}
          {payload && payload.offset > 0 && (
            <button type="button" style={button} disabled={loading || saving} onClick={() => {
              setReceiptPage((current) => Math.max(0, current - 1));
              setAllocationValues({});
            }}>العودة إلى الإيصالات السابقة</button>
          )}
          {allocationError ? <p role="alert" style={{ ...muted, color: "#9b2828" }}>هناك تخصيص غير صالح أو يتجاوز الرصيد المتاح. صحح المبالغ قبل الحفظ.</p> : null}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span>عدد التخصيصات: <strong>{allocationRows.length}</strong></span>
            <span>قيمة سند السداد المستنتجة من التخصيصات: <strong>{money(paymentTotalText, currencyCode)}</strong></span>
          </div>
          <button type="submit" style={primary} disabled={!canSavePayment}>
            <Banknote size={15} /> حفظ سند السداد والتخصيصات
          </button>
          <p style={muted}>قيمة الاستلام − الإشعارات الدائنة المرحلة − الدفعات المرحلة = المستحق قبل الحجز. المستحق − الدفعات المحجوزة = المتاح للتخصيص. حجز السند لا يُسجل سدادًا نهائيًا.</p>
        </form>
      )}

      <section style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div><strong>سجل سندات سداد الموردين</strong><p style={muted}>تتضمن القائمة حالة الحجز والمطابقة والقيد دون دمج أي عملات.</p></div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
            <input type="checkbox" checked={showVoids} onChange={(event) => setShowVoids(event.target.checked)} /> إظهار السندات الملغاة
          </label>
        </div>
        {!visiblePayments.length ? <p style={muted}>لا توجد سندات ضمن المرشح المحدد.</p> : (
          <div style={{ display: "grid", gap: 9 }}>
            {visiblePayments.map((payment) => {
              const draft = evidenceDraft(payment);
              const isVoided = payment.status === "void";
              const hasDraft = payment.journalStatus === "draft" || payment.journalStatus === "posted";
              const canPrepare = !isVoided && payment.status === "recorded" && payment.reconciliationStatus === "matched" && !hasDraft && payment.journalStatus !== "void";
              const evidenceAlreadyMatched = payment.reconciliationStatus === "matched";
              return (
                <article key={payment.paymentId} style={{ border: "1px solid var(--border, #dfe6e9)", borderRadius: 10, padding: 11, display: "grid", gap: 9 }}>
                  <header style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", alignItems: "flex-start", gap: 10 }}>
                    <div>
                      <strong>سند #{payment.paymentNumber} — {payload?.suppliers.find((item) => item.id === payment.supplierId)?.name ?? "المورد"}</strong>
                      <p style={muted}>{payment.paymentDate} · {methodLabel(payment.paymentMethod)} · {payment.paymentReference}</p>
                      <p style={muted}>{payment.settlementAccountName} · حساب الالتزام {payment.payableAccountCode} · {payment.currency}</p>
                      <p style={muted}>حالة السند: {isVoided ? "ملغى" : payment.status === "journal_draft_created" ? "تم تسليمه للأستاذ" : "مسجل / التخصيص محجوز"}</p>
                    </div>
                    <div>
                      <strong>{money(payment.amount, payment.currency)}</strong>
                      <p style={muted}>{journalLabel(payment)}</p>
                      <p style={{ ...muted, color: payment.reconciliationStatus === "matched" ? "#17684d" : payment.reconciliationStatus === "exception" ? "#9b2828" : undefined }}>
                        {payment.reconciliationStatus === "matched" ? "مطابقة ناجحة: " + (payment.reconciliationReference ?? "")
                          : payment.reconciliationStatus === "exception" ? "استثناء مطابقة: " + (payment.reconciliationReference ?? "")
                          : "بانتظار دليل مستقل"}
                      </p>
                    </div>
                  </header>

                  {!isVoided && payment.status === "recorded" && !hasDraft && (
                    <details style={{ borderTop: "1px solid var(--border, #e5eaed)", paddingTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                        <ShieldCheck size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />
                        تسجيل دليل مستقل للمطابقة
                      </summary>
                      <p style={muted}>يجب أن ينفذها مستخدم مالي آخر غير منشئ سند السداد. نوع الدليل المطلوب: {evidenceLabel(payment.paymentMethod)}.</p>
                      <form onSubmit={(event) => void saveEvidence(payment, event)} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}>
                        <label>نتيجة المراجعة
                          <select style={field} value={draft.action} onChange={(event) => updateEvidenceDraft(payment.paymentId, { action: event.target.value as SupplierPaymentReconciliationAction })}>
                            <option value="matched">مطابقة ناجحة</option><option value="exception">تسجيل استثناء</option>
                          </select>
                        </label>
                        <label>مرجع الكشف / الإيصال
                          <input required minLength={3} maxLength={200} style={field} value={draft.reference} onChange={(event) => updateEvidenceDraft(payment.paymentId, { reference: event.target.value })} />
                        </label>
                        <label>المبلغ المرصود
                          <input required inputMode="decimal" style={field} value={draft.amount} onChange={(event) => updateEvidenceDraft(payment.paymentId, { amount: event.target.value })} />
                        </label>
                        <label>عملة الدليل
                          <input required minLength={3} maxLength={3} pattern="[A-Za-z]{3}" style={field} value={draft.currency} onChange={(event) => updateEvidenceDraft(payment.paymentId, { currency: event.target.value.toUpperCase() })} />
                        </label>
                        {draft.action === "exception" && (
                          <label>سبب الاستثناء
                            <input required minLength={3} maxLength={500} style={field} value={draft.reason} onChange={(event) => updateEvidenceDraft(payment.paymentId, { reason: event.target.value })} />
                          </label>
                        )}
                        <div style={{ display: "flex", alignItems: "end" }}>
                          <button type="submit" style={draft.action === "exception" ? button : primary} disabled={saving}>
                            {draft.action === "exception" ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                            {draft.action === "exception" ? "حفظ الاستثناء" : "تأكيد المطابقة"}
                          </button>
                        </div>
                      </form>
                      {evidenceAlreadyMatched ? <p style={muted}>تسجيل حدث جديد يغير نتيجة آخر مراجعة؛ آخر استثناء يمنع إنشاء القيد حتى تتم مطابقة لاحقة مستقلة.</p> : null}
                    </details>
                  )}

                  {canPrepare && (
                    <button type="button" style={primary} onClick={() => void handoffJournal(payment)} disabled={saving}>
                      <FileText size={14} /> إنشاء مسودة القيد في دفتر الأستاذ
                    </button>
                  )}
                  {payment.journalStatus === "draft" && (
                    <div style={{ display: "grid", gap: 5 }}>
                      <p style={muted}>تم إنشاء مسودة القيد في دفتر الأستاذ العام. راجع توازنها ومستندها ثم رحّلها صراحةً من جدول القيود؛ لن يرحّلها هذا المكوّن.</p>
                      <a href="#general-ledger-journal-queue" style={{ color: "var(--primary, #155e4a)", fontSize: 13, fontWeight: 700, width: "fit-content" }}>الانتقال إلى قائمة قيود الأستاذ لمراجعة المسودة ←</a>
                    </div>
                  )}
                  {payment.journalStatus === "posted" && (
                    <p role="status" style={{ ...muted, color: "#17684d" }}>القيد مرحّل في دفتر الأستاذ. هذا هو الحد الذي تُحتسب عنده الدفعة ضمن المسدد من المستحق.</p>
                  )}
                  <button type="button" style={button} onClick={() => printPaymentVoucher(payment)} disabled={loading || saving || !payload}>
                    <Printer size={14} /> طباعة سند الصرف
                  </button>

                  {canVoid && !isVoided && (
                    <details style={{ borderTop: "1px solid var(--border, #e5eaed)", paddingTop: 8 }}>
                      <summary style={{ cursor: "pointer" }}>إلغاء سند السداد (المدير / المسؤول)</summary>
                      {payment.journalEntryId && payment.journalStatus !== "void"
                        ? <p style={muted}>يجب إلغاء مسودة القيد من دفتر الأستاذ أولًا ثم العودة لإلغاء السند.</p>
                        : null}
                      <form onSubmit={(event) => void cancelPayment(payment, event)} style={{ display: "grid", gridTemplateColumns: "minmax(200px,1fr) auto", gap: 8, marginTop: 8 }}>
                        <input required minLength={5} maxLength={500} style={field} value={voidReasons[payment.paymentId] ?? ""} onChange={(event) => setVoidReasons((current) => ({ ...current, [payment.paymentId]: event.target.value }))} placeholder="سبب الإلغاء الموثق" />
                        <button type="submit" style={button} disabled={saving || Boolean(payment.journalEntryId && payment.journalStatus !== "void")}>إلغاء السند</button>
                      </form>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span style={muted}>عرض الإيصالات {payload?.offset ?? 0}–{(payload?.offset ?? 0) + (payload?.openReceipts.length ?? 0)} من {payload?.receiptCount ?? 0} · تحديث المصدر {payload?.asOfDate ?? "—"}</span>
          {payload?.hasMore ? <button type="button" style={button} disabled={loading || saving} onClick={() => setReceiptPage((current) => current + 1)}>تحميل الإيصالات التالية</button> : null}
        </div>
      </section>
    </section>
    {printDocument && typeof document !== "undefined"
      ? createPortal(<SupplierPaymentVoucherPrintSheet document={printDocument} />, document.body)
      : null}
    </>
  );
}
