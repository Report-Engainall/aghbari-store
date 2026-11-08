import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileSpreadsheet, FileText, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  fetchSupplierInvoiceWorkspace,
  recordSupplierInvoice,
  reviewSupplierInvoiceVariance,
  fetchSupplierInvoiceAccountingStatus,
  prepareSupplierInvoiceAccountingDraft,
  fetchSupplierInvoiceEvidence,
  fetchSupplierInvoiceDueDates,
  recordSupplierInvoiceDueDate,
  type SupplierInvoiceDueDate,
  type SupplierInvoiceAccountingStatus,
  uploadSupplierInvoiceEvidence,
  createSupplierInvoiceEvidenceSignedUrl,
  type SupplierInvoiceEvidence,
  type SupplierInvoiceRecord,
  type SupplierInvoiceReceivableLine,
  type SupplierInvoiceWorkspace,
} from "@/lib/supplier-invoices";
import { projectSupplierInvoiceAccountingPrintDocument, type SupplierInvoiceAccountingPrintDocument } from "@/lib/supplier-invoice-accounting-print";
import { SupplierInvoiceAccountingPrintSheet } from "@/components/SupplierInvoiceAccountingPrintSheet";
import { downloadSupplierInvoiceAccountingWorkbookXlsx } from "@/lib/supplier-invoice-accounting-xlsx";

type WorkspaceMode = "capture" | "review";
type InvoiceLineDraft = { quantity: string; unitCost: string; lineTotal: string };
type InvoiceKey = { fingerprint: string; key: string };
type AccountingKey = { fingerprint: string; key: string };
type AccountingLedgerAccount = { id: string; code: string; name: string; account_type: string; is_active: boolean };

const emptyLine = (): InvoiceLineDraft => ({ quantity: "", unitCost: "", lineTotal: "" });
const fieldStyle: React.CSSProperties = {
  width: "100%", minWidth: 0, boxSizing: "border-box", padding: "9px 10px",
  border: "1px solid var(--border, #d6dfe4)", borderRadius: 8,
  background: "var(--card, #fff)", color: "var(--foreground, #17242a)", font: "inherit",
};
const cardStyle: React.CSSProperties = {
  border: "1px solid var(--border, #d6dfe4)", borderRadius: 12, padding: 14,
  background: "var(--card, #fff)", display: "grid", gap: 10, minWidth: 0,
};
const mutedStyle: React.CSSProperties = { color: "var(--muted-foreground, #64748b)", fontSize: 12, lineHeight: 1.7, margin: 0 };
const moneyPattern = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const quantityPattern = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/;
function cents(value: string): bigint | null {
  const normalized = value.trim();
  if (!moneyPattern.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}
function moneyText(value: string, currency: string): string {
  const numeric = Number(value);
  return (Number.isFinite(numeric)
    ? new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric)
    : value) + " " + currency;
}
function quantityText(value: string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(numeric)
    : value;
}
function localToday(): string {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
function statusLabel(status: SupplierInvoiceRecord["matchStatus"]): string {
  if (status === "matched") return "مطابقة سعرية";
  if (status === "variance_pending") return "فرق سعر بانتظار مراجعة مستقلة";
  if (status === "variance_approved") return "فرق السعر معتمد";
  return "فرق السعر مرفوض";
}
function statusColor(status: SupplierInvoiceRecord["matchStatus"]): string {
  if (status === "matched" || status === "variance_approved") return "#166534";
  if (status === "variance_pending") return "#854d0e";
  return "#991b1b";
}
function eventLabel(action: string): string {
  if (action === "recorded_matched") return "تسجيل فاتورة مطابقة";
  if (action === "recorded_variance_pending") return "تسجيل فرق سعر";
  if (action === "variance_approved") return "اعتماد فرق السعر";
  if (action === "variance_rejected") return "رفض فرق السعر";
  if (action === "due_date_recorded") return "تسجيل تاريخ استحقاق موثق";
  return action;
}
function unavailableMessage(cause: unknown): string {
  const failure = cause as { code?: string; message?: string };
  if (failure?.code === "PGRST202" || failure?.code === "42883" ||
      /could not find the function|function .* does not exist/i.test(failure?.message ?? "")) {
    return "عقد فواتير الموردين غير متاح في قاعدة البيانات المتصلة بعد. المهاجرة موجودة في main؛ يلزم مزامنتها داخل Bolt New قبل تشغيل هذا المسار.";
  }
  return cause instanceof Error ? cause.message : "تعذر تحميل مساحة فواتير الموردين.";
}

export function SupplierInvoiceWorkspace({ mode, accounts = [], onRefresh }: {
  mode: WorkspaceMode;
  accounts?: AccountingLedgerAccount[];
  onRefresh?: () => Promise<void>;
}) {
  const { user } = useAuth();
  const canUseFinance = Boolean(user?.roles.some((role) =>
    role === "admin" || role === "manager" || role === "accountant"
  ));
  const isCapture = mode === "capture";
  const [workspace, setWorkspace] = useState<SupplierInvoiceWorkspace | null>(null);
  const [orderOptions, setOrderOptions] = useState<SupplierInvoiceWorkspace["purchaseOrders"]>([]);
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [lineDrafts, setLineDrafts] = useState<Record<string, InvoiceLineDraft>>({});
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(localToday());
  const [merchandiseSubtotal, setMerchandiseSubtotal] = useState("");
  const [taxAmount, setTaxAmount] = useState("0.00");
  const [invoiceTotal, setInvoiceTotal] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [reviewDecision, setReviewDecision] = useState<"approve" | "reject">("approve");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const submissionKey = useRef<InvoiceKey | null>(null);
  const accountingKey = useRef<AccountingKey | null>(null);
  const [accountingStatus, setAccountingStatus] = useState<SupplierInvoiceAccountingStatus | null>(null);
  const [accountingLoading, setAccountingLoading] = useState(false);
  const [accountingBusy, setAccountingBusy] = useState(false);
  const [accountingError, setAccountingError] = useState("");
  const [taxAccountId, setTaxAccountId] = useState("");
  const [varianceAccountId, setVarianceAccountId] = useState("");
  const [evidenceRows, setEvidenceRows] = useState<SupplierInvoiceEvidence[]>([]);
  const [dueDateRows, setDueDateRows] = useState<SupplierInvoiceDueDate[]>([]);
  const [dueDateDraft, setDueDateDraft] = useState(localToday());
  const [dueDateEvidenceId, setDueDateEvidenceId] = useState("");
  const [dueDateSourceReference, setDueDateSourceReference] = useState("");
  const [dueDateReason, setDueDateReason] = useState("");
  const [dueDateLoading, setDueDateLoading] = useState(false);
  const [dueDateBusy, setDueDateBusy] = useState(false);
  const [dueDateError, setDueDateError] = useState("");
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceError, setEvidenceError] = useState("");
  const [evidenceLinks, setEvidenceLinks] = useState<Record<string, string>>({});
  const [evidenceLinkBusy, setEvidenceLinkBusy] = useState<string | null>(null);
  const [printDocument, setPrintDocument] = useState<SupplierInvoiceAccountingPrintDocument | null>(null);
  const [printError, setPrintError] = useState("");
  const previousPrintMode = useRef<string | null>(null);

  function restorePreviousPrintMode() {
    if (typeof document === "undefined") return;
    const previousMode = previousPrintMode.current;
    if (previousMode === null) document.body.removeAttribute("data-print-mode");
    else if (previousMode !== undefined) document.body.setAttribute("data-print-mode", previousMode);
    previousPrintMode.current = null;
  }

  const refreshDueDates = useCallback(async () => {
    if (!canUseFinance) {
      setDueDateRows([]);
      setDueDateError("");
      return;
    }
    setDueDateLoading(true);
    setDueDateError("");
    try {
      setDueDateRows(await fetchSupplierInvoiceDueDates());
    } catch (cause) {
      setDueDateError(cause instanceof Error ? cause.message : "تعذر تحميل تواريخ استحقاق الموردين.");
    } finally {
      setDueDateLoading(false);
    }
  }, [canUseFinance]);

  useEffect(() => {
    void refreshDueDates();
  }, [refreshDueDates]);

  const refreshEvidence = useCallback(async (invoiceId: string | null) => {
    if (!canUseFinance || !invoiceId) {
      setEvidenceRows([]);
      setEvidenceError("");
      setDueDateEvidenceId("");
      return;
    }
    setEvidenceRows([]);
    setDueDateEvidenceId("");
    setEvidenceLoading(true);
    setEvidenceError("");
    try {
      setEvidenceRows(await fetchSupplierInvoiceEvidence(invoiceId));
    } catch (cause) {
      setEvidenceError(cause instanceof Error ? cause.message : "تعذر تحميل مرفقات الفاتورة.");
    } finally {
      setEvidenceLoading(false);
    }
  }, [canUseFinance]);
  useEffect(() => {
    setEvidenceLinks({});
    void refreshEvidence(selectedInvoiceId);
  }, [selectedInvoiceId, refreshEvidence]);

  useEffect(() => {
    if (evidenceRows.length > 0 && !evidenceRows.some((item) => item.id === dueDateEvidenceId)) {
      setDueDateEvidenceId(evidenceRows[0].id);
    }
  }, [evidenceRows, dueDateEvidenceId]);

  useEffect(() => {
    if (!printDocument || typeof window === "undefined" || typeof document === "undefined" || typeof window.print !== "function") return;
    const body = document.body;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      restorePreviousPrintMode();
      window.removeEventListener("afterprint", restore);
      setPrintDocument(null);
    };
    window.addEventListener("afterprint", restore, { once: true });
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        setPrintError("تعذر فتح نافذة الطباعة في هذا المتصفح.");
        restore();
      }
    }, 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", restore);
      if (!restored && body.getAttribute("data-print-mode") === "supplier-invoice-accounting") restorePreviousPrintMode();
    };
  }, [printDocument]);

  async function addInvoiceEvidence(file: File) {
  if (!selectedInvoice || evidenceBusy) return;
  setEvidenceBusy(true);
  setEvidenceError("");
  setError("");
  setNotice("");
  try {
    const saved = await uploadSupplierInvoiceEvidence({ invoiceId: selectedInvoice.id, file });
    const refreshed = await fetchSupplierInvoiceEvidence(selectedInvoice.id);
    if (!refreshed.some((item) => item.id === saved.id && item.contentSha256 === saved.contentSha256)) {
      throw new Error("رُفع الملف لكن لم يظهر سجل مرفقه في قراءة الخادم اللاحقة.");
    }
    setEvidenceRows(refreshed);
    setEvidenceLinks({});
    setNotice("حُفظ مستند الدليل في تخزين خاص وربط بالفاتورة مع بصمة SHA-256. سجل المرفق غير قابل للاستبدال أو الحذف من الواجهة.");
  } catch (cause) {
    setEvidenceError(cause instanceof Error ? cause.message : "تعذر رفع مستند الفاتورة.");
  } finally {
    setEvidenceBusy(false);
  }
}

async function saveDueDate() {
  if (!selectedInvoice || dueDateBusy) return;
  if (selectedInvoice.matchStatus !== "matched" || Number(selectedInvoice.taxAmount) !== 0) {
    setDueDateError("لا يُسجل استحقاق التدفق النقدي قبل اكتمال مطابقة الفاتورة وتسوية الضريبة.");
    return;
  }
  if (!evidenceRows.some((item) => item.id === dueDateEvidenceId)) {
    setDueDateError("ارفع مستند فاتورة المورد واختر مرفقًا محفوظًا قبل تسجيل تاريخ الاستحقاق.");
    return;
  }
  if (dueDateDraft < selectedInvoice.invoiceDate) {
    setDueDateError("تاريخ الاستحقاق لا يمكن أن يسبق تاريخ فاتورة المورد.");
    return;
  }
  setDueDateBusy(true);
  setDueDateError("");
  setError("");
  setNotice("");
  try {
    if (!globalThis.crypto?.randomUUID) throw new Error("المتصفح لا يدعم مفتاح منع التكرار الآمن؛ لم يُرسل تاريخ الاستحقاق.");
    const result = await recordSupplierInvoiceDueDate({
      invoiceId: selectedInvoice.id,
      dueDate: dueDateDraft,
      sourceEvidenceId: dueDateEvidenceId,
      sourceReference: dueDateSourceReference.trim() || selectedInvoice.invoiceNumber,
      reason: dueDateReason,
      idempotencyKey: globalThis.crypto.randomUUID(),
    });
    await refreshDueDates();
    setDueDateReason("");
    setNotice(result.replayed
      ? "تاريخ الاستحقاق محفوظ مسبقًا بنفس مستند المصدر."
      : "حُفظ تاريخ الاستحقاق مع ربطه بمرفق الفاتورة وسجل التدقيق؛ لم تُنشأ دفعة أو حركة نقدية.");
  } catch (cause) {
    setDueDateError(cause instanceof Error ? cause.message : "تعذر حفظ تاريخ استحقاق المورد.");
  } finally {
    setDueDateBusy(false);
  }
}

async function prepareEvidenceLink(evidence: SupplierInvoiceEvidence) {
  if (evidenceLinkBusy) return;
  setEvidenceLinkBusy(evidence.id);
  setEvidenceError("");
  try {
    const url = await createSupplierInvoiceEvidenceSignedUrl(evidence.storagePath);
    setEvidenceLinks((current) => ({ ...current, [evidence.id]: url }));
  } catch (cause) {
    setEvidenceError(cause instanceof Error ? cause.message : "تعذر فتح رابط مستند الفاتورة.");
  } finally {
    setEvidenceLinkBusy(null);
  }
}

  const load = useCallback(async (requestedOffset = offset, requestedOrderId?: string | null) => {
  if (!canUseFinance) { setLoading(false); return null; }
    setLoading(true);
    setError("");
    try {
      const filterOrderId = isCapture
        ? (requestedOrderId === undefined ? purchaseOrderId || null : requestedOrderId)
        : null;
      const result = await fetchSupplierInvoiceWorkspace({
        purchaseOrderId: filterOrderId,
        limit: 25,
        offset: requestedOffset,
      });
      setWorkspace(result);
      setOrderOptions((current) => current.length ? current : result.purchaseOrders);
      setSelectedInvoiceId((current) =>
        current && result.invoices.some((invoice) => invoice.id === current)
          ? current
          : result.invoices[0]?.id ?? null
      );
      return result;
    } catch (cause) {
      setError(unavailableMessage(cause));
      return null;
    } finally {
      setLoading(false);
    }
  }, [canUseFinance, isCapture, purchaseOrderId, offset]);

  useEffect(() => { void load(0, isCapture ? null : null); }, [canUseFinance, isCapture]);
  useEffect(() => {
    if (isCapture && purchaseOrderId) void load(0, purchaseOrderId);
  }, [isCapture, purchaseOrderId, load]);

  useEffect(() => {
    let active = true;
    if (mode !== "review" || !canUseFinance || !selectedInvoiceId) {
      setAccountingStatus(null);
      setAccountingError("");
      setAccountingLoading(false);
      return () => { active = false; };
    }
    setAccountingLoading(true);
    setAccountingError("");
    void fetchSupplierInvoiceAccountingStatus(selectedInvoiceId)
      .then((result) => {
        if (!active) return;
        setAccountingStatus(result);
        setTaxAccountId(result.taxAccountId ?? "");
        setVarianceAccountId(result.merchandiseVarianceAccountId ?? "");
        if (result.accountingStatus === "journal_void") accountingKey.current = null;
      })
      .catch((cause) => {
        if (active) setAccountingError(unavailableMessage(cause));
      })
      .finally(() => {
        if (active) setAccountingLoading(false);
      });
    return () => { active = false; };
  }, [mode, canUseFinance, selectedInvoiceId]);

  const selectedOrder = useMemo(
    () => orderOptions.find((order) => order.id === purchaseOrderId) ?? null,
    [orderOptions, purchaseOrderId],
  );
  const receivableLines = useMemo(
    () => (workspace?.receivableLines ?? []).filter((line) =>
      !isCapture || !purchaseOrderId || line.purchaseOrderId === purchaseOrderId
    ),
    [workspace?.receivableLines, isCapture, purchaseOrderId],
  );
  const selectedInvoice = useMemo(
    () => workspace?.invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [workspace?.invoices, selectedInvoiceId],
  );
  const selectedDueDate = selectedInvoice
    ? dueDateRows.find((item) => item.invoiceId === selectedInvoice.id) ?? null
    : null;
  const availableInvoiceLines = receivableLines.filter((line) =>
    Number(line.remainingToInvoice) > 0 && line.sourceCostComplete &&
    line.orderedUnitCost !== null && line.receivedUnitCost !== null
  );
  const previewLineTotal = useMemo(() => {
    let total = 0n;
    let valid = true;
    for (const line of receivableLines) {
      const draft = lineDrafts[line.receiptItemId];
      if (!draft?.quantity.trim()) continue;
      const lineCents = cents(draft.lineTotal);
      if (lineCents === null) { valid = false; continue; }
      total += lineCents;
    }
    return { total, valid };
  }, [receivableLines, lineDrafts]);

  function updateLine(receiptItemId: string, patch: Partial<InvoiceLineDraft>) {
    setLineDrafts((current) => ({
      ...current,
      [receiptItemId]: { ...(current[receiptItemId] ?? emptyLine()), ...patch },
    }));
  }

  async function saveInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isCapture || busy || !selectedOrder) return;
    const lines: Array<{ receiptItemId: string; quantity: string; unitCost: string; lineTotal: string }> = [];
    const seen = new Set<string>();
    let lineSum = 0n;
    for (const source of availableInvoiceLines) {
      const draft = lineDrafts[source.receiptItemId];
      if (!draft || !draft.quantity.trim()) continue;
      if (seen.has(source.receiptItemId) || !quantityPattern.test(draft.quantity.trim()) ||
          !moneyPattern.test(draft.unitCost.trim()) || !moneyPattern.test(draft.lineTotal.trim())) {
        setError("أكمل الكمية وسعر الوحدة وإجمالي كل بند، مع منع تكرار بند الاستلام.");
        return;
      }
      const quantity = Number(draft.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > Number(source.remainingToInvoice) ||
          Math.round(quantity * 1000) !== quantity * 1000) {
        setError("كمية فوترة " + source.productName + " يجب أن تكون موجبة ولا تتجاوز المتبقي غير المفوتر (" + quantityText(source.remainingToInvoice) + ").");
        return;
      }
      seen.add(source.receiptItemId);
      const lineCents = cents(draft.lineTotal);
      if (lineCents === null) { setError("إجمالي أحد البنود غير صالح."); return; }
      lineSum += lineCents;
      lines.push({
        receiptItemId: source.receiptItemId,
        quantity: draft.quantity.trim(),
        unitCost: draft.unitCost.trim(),
        lineTotal: draft.lineTotal.trim(),
      });
    }
    const subtotalCents = cents(merchandiseSubtotal);
    const taxCents = cents(taxAmount);
    const totalCents = cents(invoiceTotal);
    if (!lines.length) { setError("أدخل بند استلام واحدًا على الأقل من أمر الشراء المحدد."); return; }
    if (invoiceNumber.trim().length < 1 || invoiceNumber.trim().length > 80 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) ||
        subtotalCents === null || subtotalCents <= 0n || taxCents === null || totalCents === null ||
        lineSum !== subtotalCents || totalCents !== subtotalCents + taxCents) {
      setError("تحقق من رقم الفاتورة وتاريخها والمبالغ: مجموع البنود = الإجمالي قبل الضريبة، والإجمالي النهائي = البنود + الضريبة الموثقة.");
      return;
    }
    const payload = {
      purchaseOrderId: selectedOrder.id,
      invoiceNumber: invoiceNumber.trim(),
      invoiceDate,
      merchandiseSubtotal: merchandiseSubtotal.trim(),
      taxAmount: taxAmount.trim(),
      invoiceTotalAmount: invoiceTotal.trim(),
      lines,
    };
    const fingerprint = JSON.stringify(payload);
    if (!globalThis.crypto?.randomUUID) {
      setError("المتصفح لا يدعم مفتاح منع التكرار الآمن؛ لم يتم إرسال الفاتورة.");
      return;
    }
    const idempotencyKey = submissionKey.current?.fingerprint === fingerprint
      ? submissionKey.current.key
      : globalThis.crypto.randomUUID();
    submissionKey.current = { fingerprint, key: idempotencyKey };
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await recordSupplierInvoice({ ...payload, idempotencyKey });
      const refreshed = await load(0, selectedOrder.id);
      if (!refreshed?.invoices.some((invoice) => invoice.id === result.invoiceId)) {
        throw new Error("أُرسل طلب الفاتورة لكن لم تظهر في قراءة المصدر اللاحقة؛ لا تعرض نجاحًا حتى تتوفر قراءة مؤكدة.");
      }
      setOffset(0);
      setSelectedInvoiceId(result.invoiceId);
      setLineDrafts({});
      setInvoiceNumber("");
      setInvoiceDate(localToday());
      setMerchandiseSubtotal("");
      setTaxAmount("0.00");
      setInvoiceTotal("");
      submissionKey.current = null;
      setNotice(result.replayed
        ? "أُعيدت نتيجة الفاتورة المسجلة نفسها دون إنشاء مستند مكرر."
        : result.matchStatus === "matched"
          ? "حُفظت فاتورة المورد وربطت ببنود أمر الشراء والاستلام. المطابقة السعرية مكتملة."
          : "حُفظت الفاتورة كفرق سعر بانتظار مراجعة مالية مستقلة؛ لم يُرحّل قيد أو ضريبة.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ فاتورة المورد.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewInvoice(invoice: SupplierInvoiceRecord) {
    if (busy || invoice.matchStatus !== "variance_pending") return;
    if (invoice.createdByProfileId === user?.profileId) {
      setError("لا يمكن لمنشئ الفاتورة اعتماد فرق سعرها أو رفضه. يلزم مستخدم مالي آخر.");
      return;
    }
    if (reviewReason.trim().length < 3 || reviewReason.trim().length > 500) {
      setError("سبب قرار المراجعة مطلوب من 3 إلى 500 حرف.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const expected = reviewDecision === "approve" ? "variance_approved" : "variance_rejected";
      await reviewSupplierInvoiceVariance({
        invoiceId: invoice.id,
        approve: reviewDecision === "approve",
        reason: reviewReason.trim(),
      });
      const refreshed = await load(offset);
      const confirmed = refreshed?.invoices.find((item) => item.id === invoice.id);
      if (!confirmed || confirmed.matchStatus !== expected) {
        throw new Error("لم يظهر قرار المراجعة في سجل الفاتورة بعد إعادة القراءة؛ لم يتم إعلان اكتمال القرار.");
      }
      setReviewReason("");
      setNotice(reviewDecision === "approve"
        ? "سُجل اعتماد فرق السعر بواسطة مراجع مستقل مع حفظ السبب وسجل الحدث."
        : "سُجل رفض فرق السعر مع حفظ السبب وسجل الحدث؛ بقيت الفاتورة موثقة دون حذف.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل قرار مراجعة الفاتورة.");
    } finally {
      setBusy(false);
    }
  }

  function exportAccountingWorkbook() {
    if (!selectedInvoice || !accountingStatus || accountingLoading || accountingError || mode !== "review") return;
    try {
      const projected = projectSupplierInvoiceAccountingPrintDocument({
        invoice: selectedInvoice,
        accounting: accountingStatus,
        accounts,
      });
      downloadSupplierInvoiceAccountingWorkbookXlsx(projected);
      setPrintError("");
    } catch (cause) {
      setPrintError(cause instanceof Error ? cause.message : "تعذر تجهيز ملف Excel لمحضر تسوية فاتورة المورد.");
    }
  }

  function printAccountingDocument() {
    if (!selectedInvoice || !accountingStatus || accountingLoading || accountingError || mode !== "review" || printDocument) return;
    if (typeof window === "undefined" || typeof document === "undefined" || typeof window.print !== "function") {
      setPrintError("ميزة الطباعة غير متاحة في هذا المتصفح؛ لم يتم إنشاء مستند.");
      return;
    }
    try {
      const projected = projectSupplierInvoiceAccountingPrintDocument({
        invoice: selectedInvoice,
        accounting: accountingStatus,
        accounts,
      });
      previousPrintMode.current = document.body.getAttribute("data-print-mode");
      document.body.setAttribute("data-print-mode", "supplier-invoice-accounting");
      setPrintError("");
      setPrintDocument(projected);
    } catch (cause) {
      setPrintError(cause instanceof Error ? cause.message : "تعذر تجهيز محضر مطابقة فاتورة المورد للطباعة.");
    }
  }

  async function prepareAccountingHandoff() {
    if (!selectedInvoice || !accountingStatus || accountingBusy || mode !== "review") return;
    if (selectedInvoice.createdByProfileId === user?.profileId) {
      setAccountingError("منشئ الفاتورة لا ينفذ تسويتها المحاسبية؛ يلزم مستخدم مالي مستقل.");
      return;
    }
    if (selectedInvoice.matchStatus !== "matched" && selectedInvoice.matchStatus !== "variance_approved") {
      setAccountingError("يجب اكتمال المطابقة أو اعتماد فرق السعر من مراجع مستقل أولاً.");
      return;
    }
    if (accountingStatus.currency !== "YER") {
      setAccountingError("تسوية فواتير الموردين المحاسبية متاحة حاليًا للريال اليمني فقط؛ لا توجد سياسة تحويل عملات معتمدة لهذا المسار.");
      return;
    }
    const hasTax = Number(accountingStatus.taxAmount) > 0;
    const hasVariance = Number(accountingStatus.merchandiseVarianceAmount) !== 0;
    if (hasTax && !taxAccountId) {
      setAccountingError("اختر حساب الضريبة صراحةً وفق سياسة المؤسسة قبل إنشاء قيد التسوية.");
      return;
    }
    if (hasVariance && !varianceAccountId) {
      setAccountingError("اختر حساب المصروف المخصص لفرق تكلفة الفاتورة عن تكلفة الاستلام.");
      return;
    }
    if (!globalThis.crypto?.randomUUID) {
      setAccountingError("المتصفح لا يدعم مفتاح منع التكرار الآمن؛ لم يتم إرسال التسوية.");
      return;
    }
    const payload = {
      invoiceId: selectedInvoice.id,
      taxAccountId: hasTax ? taxAccountId : null,
      merchandiseVarianceAccountId: hasVariance ? varianceAccountId : null,
    };
    const fingerprint = JSON.stringify(payload);
    const idempotencyKey = accountingKey.current?.fingerprint === fingerprint
      ? accountingKey.current.key
      : globalThis.crypto.randomUUID();
    accountingKey.current = { fingerprint, key: idempotencyKey };
    setAccountingBusy(true);
    setAccountingError("");
    setError("");
    setNotice("");
    try {
      const result = await prepareSupplierInvoiceAccountingDraft({ ...payload, idempotencyKey });
      const refreshed = await fetchSupplierInvoiceAccountingStatus(selectedInvoice.id);
      if (refreshed.invoiceId !== selectedInvoice.id ||
          (result.accountingStatus === "no_adjustment_required" && refreshed.accountingStatus !== "no_adjustment_required") ||
          (result.journalEntryId !== null && refreshed.journalEntryId !== result.journalEntryId)) {
        throw new Error("لم تتطابق قراءة التسوية اللاحقة مع نتيجة الخادم؛ لا يتم إعلان اكتمال العملية.");
      }
      setAccountingStatus(refreshed);
      if (refreshed.accountingStatus === "journal_void") accountingKey.current = null;
      try { await onRefresh?.(); } catch { /* The persisted handoff is already confirmed by its dedicated readback. */ }
      setNotice(refreshed.accountingStatus === "no_adjustment_required"
        ? "تطابقت الفاتورة مع تكلفة الاستلام المسجلة؛ لم تكن هناك حاجة لقيد إضافي أو التزام مكرر."
        : refreshed.journalEntryNumber
          ? "أُنشئت مسودة قيد التسوية رقم " + refreshed.journalEntryNumber + " في دفتر الأستاذ. لم يُرحّل القيد ولم يُسدد المورد."
          : "حُفظت تسوية فاتورة المورد؛ راجع حالة القيد من دفتر الأستاذ قبل أي ترحيل.");
    } catch (cause) {
      setAccountingError(cause instanceof Error ? cause.message : "تعذر إنشاء مسودة تسوية فاتورة المورد.");
    } finally {
      setAccountingBusy(false);
    }
  }

  if (!canUseFinance) {
    return <section dir="rtl" style={cardStyle}><h3 style={{ margin: 0 }}>صلاحية مالية مطلوبة</h3><p style={mutedStyle}>تتطلب مطابقة فواتير الموردين دور مدير أو مسؤول أو محاسب؛ يفرض الخادم الصلاحية نفسها.</p></section>;
  }

  const invoiceRows = workspace?.invoices ?? [];
  const activeTaxAccounts = accounts.filter((account) =>
    account.is_active && (account.account_type === "asset" || account.account_type === "expense")
  );
  const activeVarianceAccounts = accounts.filter((account) =>
    account.is_active && account.account_type === "expense"
  );
  const accountingNeedsTax = Boolean(accountingStatus && Number(accountingStatus.taxAmount) > 0);
  const accountingNeedsVariance = Boolean(accountingStatus && Number(accountingStatus.merchandiseVarianceAmount) !== 0);
  const canStartAccountingHandoff = Boolean(
    mode === "review" && selectedInvoice && accountingStatus &&
    (accountingStatus.accountingStatus === "not_prepared" || accountingStatus.accountingStatus === "journal_void") &&
    (selectedInvoice.matchStatus === "matched" || selectedInvoice.matchStatus === "variance_approved") &&
    selectedInvoice.createdByProfileId !== user?.profileId &&
    accountingStatus.currency === "YER" &&
    (!accountingNeedsTax || Boolean(taxAccountId && activeTaxAccounts.some((account) => account.id === taxAccountId))) &&
    (!accountingNeedsVariance || Boolean(varianceAccountId && activeVarianceAccounts.some((account) => account.id === varianceAccountId)))
  );
  const canReviewSelected = Boolean(
    mode === "review" && selectedInvoice?.matchStatus === "variance_pending" &&
    selectedInvoice.createdByProfileId !== user?.profileId
  );

  return (
    <section dir="rtl" aria-label={isCapture ? "إدخال فواتير الموردين ومطابقتها" : "مراجعة فروقات فواتير الموردين"} style={{ display: "grid", gap: 14, minWidth: 0, marginBlock: 16 }}>
      <header style={{ ...cardStyle, gridTemplateColumns: "minmax(0,1fr) auto", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, display: "flex", gap: 8, alignItems: "center", fontSize: 18 }}>
            {mode === "capture" ? <FileText size={19} /> : <ShieldCheck size={19} />}
            {mode === "capture" ? "فواتير الموردين — المطابقة الثلاثية" : "مراجعة فواتير الموردين وفروقات الأسعار"}
          </h2>
          <p style={mutedStyle}>
            {mode === "capture"
              ? "اربط مستند المورد بأمر الشراء وإيصال الاستلام الفعلي. الفاتورة دليل تجاري وليست قيدًا أو التزامًا ماليًا ثانيًا."
              : "مراجعة مستقلة لفرق السعر. لا يستطيع منشئ المستند اعتماد فرق فاتورته، ولا يُرحّل قيد أو ضريبة من هذه الشاشة."}
          </p>
        </div>
        <button type="button" style={fieldStyle} onClick={() => void load(0)} disabled={loading || busy}>
          <RefreshCw size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} /> تحديث
        </button>
      </header>

      {error && <div role="alert" style={{ ...cardStyle, color: "#991b1b", background: "#fff7f7" }}><AlertTriangle size={16} />{error}</div>}
      {notice && <div role="status" style={{ ...cardStyle, color: "#166534", background: "#f0fdf4" }}><CheckCircle2 size={16} />{notice}</div>}

      {isCapture && (
        <section style={cardStyle}>
          <h3 style={{ margin: 0 }}>اختيار أمر شراء له استلام فعلي</h3>
          <label style={{ display: "grid", gap: 5 }}>
            أمر الشراء
            <select style={fieldStyle} value={purchaseOrderId} onChange={(event) => { setPurchaseOrderId(event.target.value); setOffset(0); setLineDrafts({}); setError(""); }} disabled={loading || busy}>
              <option value="">اختر أمر شراء مستلمًا</option>
              {orderOptions.map((order) => <option key={order.id} value={order.id}>{order.number} · {order.supplierName} · {order.currency}</option>)}
            </select>
          </label>
          {selectedOrder && <p style={mutedStyle}>المورد: <strong>{selectedOrder.supplierName}</strong> · عملة المؤسسة: <strong>{selectedOrder.currency}</strong> · حالة الأمر: {selectedOrder.status}</p>}
        </section>
      )}

      {isCapture && selectedOrder && (
        <form onSubmit={(event) => void saveInvoice(event)} style={cardStyle}>
          <div>
            <h3 style={{ margin: 0 }}>تسجيل المستند الفعلي</h3>
            <p style={mutedStyle}>أدخل أرقام وتواريخ ومبالغ فاتورة المورد كما وردت في المستند. لا يستنتج النظام الضريبة أو الشحن أو الخصم أو العملة.</p>
          </div>
          {loading ? <p role="status" style={mutedStyle}>جار تحميل إيصالات الاستلام...</p> : availableInvoiceLines.length === 0 ? (
            <p style={mutedStyle}>لا توجد بنود استلام ذات تكلفة مصدرية مكتملة وكمية متبقية للفوترة في أمر الشراء المحدد.</p>
          ) : (
            <div style={{ overflowX: "auto", maxWidth: "100%" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead><tr style={{ textAlign: "right", background: "var(--muted, #f3f6f8)" }}>
                  <th style={{ padding: 8 }}>الإيصال / الصنف</th><th>المستلم</th><th>مفوتر سابقًا</th><th>متبقٍ للفوترة</th><th>سعر أمر الشراء</th><th>سعر الاستلام</th><th>كمية الفاتورة</th><th>سعر فاتورة المورد</th><th>إجمالي البند</th>
                </tr></thead>
                <tbody>{availableInvoiceLines.map((line: SupplierInvoiceReceivableLine) => {
                  const draft = lineDrafts[line.receiptItemId] ?? emptyLine();
                  return <tr key={line.receiptItemId} style={{ borderTop: "1px solid var(--border, #e2e8f0)" }}>
                    <td style={{ padding: 8 }}><strong>{line.productName}</strong><p style={mutedStyle}>{line.itemCode} · {line.receiptNumber}</p></td>
                    <td>{quantityText(line.sourceReceivedQuantity)}</td>
                    <td>{quantityText(line.invoicedQuantity)}</td>
                    <td>{quantityText(line.remainingToInvoice)}</td>
                    <td>{moneyText(line.orderedUnitCost ?? "—", selectedOrder.currency)}</td>
                    <td>{moneyText(line.receivedUnitCost ?? "—", selectedOrder.currency)}</td>
                    <td><input aria-label={"كمية الفاتورة " + line.productName} type="number" min="0.001" max={line.remainingToInvoice} step="0.001" value={draft.quantity} onChange={(event) => updateLine(line.receiptItemId, { quantity: event.target.value })} style={{ ...fieldStyle, width: 105 }} disabled={busy} /></td>
                    <td><input aria-label={"سعر الوحدة " + line.productName} type="number" min="0" step="0.01" value={draft.unitCost} onChange={(event) => updateLine(line.receiptItemId, { unitCost: event.target.value })} style={{ ...fieldStyle, width: 120 }} disabled={busy} /></td>
                    <td><input aria-label={"إجمالي البند " + line.productName} type="number" min="0" step="0.01" value={draft.lineTotal} onChange={(event) => updateLine(line.receiptItemId, { lineTotal: event.target.value })} style={{ ...fieldStyle, width: 120 }} disabled={busy} /></td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>
            <label>رقم فاتورة المورد<input required maxLength={80} style={fieldStyle} value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} disabled={busy} /></label>
            <label>تاريخ الفاتورة<input required type="date" max={localToday()} style={fieldStyle} value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} disabled={busy} /></label>
            <label>الإجمالي قبل الضريبة<input required type="number" min="0.01" step="0.01" style={fieldStyle} value={merchandiseSubtotal} onChange={(event) => setMerchandiseSubtotal(event.target.value)} disabled={busy} /></label>
            <label>الضريبة المثبتة في المستند<input required type="number" min="0" step="0.01" style={fieldStyle} value={taxAmount} onChange={(event) => setTaxAmount(event.target.value)} disabled={busy} /></label>
            <label>إجمالي الفاتورة<input required type="number" min="0.01" step="0.01" style={fieldStyle} value={invoiceTotal} onChange={(event) => setInvoiceTotal(event.target.value)} disabled={busy} /></label>
          </div>
          <p style={mutedStyle}>إجمالي البنود المدخل: {previewLineTotal.valid ? moneyText((Number(previewLineTotal.total) / 100).toFixed(2), selectedOrder.currency) : "توجد قيمة بند غير مكتملة"} · الضريبة غير الصفرية تبقى بانتظار المعالجة المحاسبية ولا تُرحّل هنا.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <button type="submit" className="btn primary" disabled={busy || loading || !selectedOrder || !availableInvoiceLines.length}>
              <ClipboardCheck size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />{busy ? "جار حفظ الدليل..." : "حفظ الفاتورة ومطابقة المستندات"}
            </button>
            <button type="button" className="btn secondary" disabled={busy} onClick={() => { setLineDrafts({}); setInvoiceNumber(""); setMerchandiseSubtotal(""); setTaxAmount("0.00"); setInvoiceTotal(""); submissionKey.current = null; }}>مسح نموذج الفاتورة</button>
          </div>
        </form>
      )}

      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div><h3 style={{ margin: 0 }}>سجل فواتير الموردين</h3><p style={mutedStyle}>تظهر المستندات المسجلة فقط، مع سجل القرار وحالة معالجة الضريبة.</p></div>
          <span style={{ ...mutedStyle, whiteSpace: "nowrap" }}>{workspace?.invoiceCount ?? 0} مستند</span>
        </div>
        {loading ? <p role="status" style={mutedStyle}>جار تحميل سجل الفواتير...</p> : invoiceRows.length === 0 ? (
          <p style={mutedStyle}>لا توجد فواتير موردين مسجلة ضمن نطاق العرض الحالي.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {invoiceRows.map((invoice) => <button key={invoice.id} type="button" onClick={() => setSelectedInvoiceId(invoice.id)}
              aria-pressed={selectedInvoiceId === invoice.id}
              style={{ textAlign: "right", width: "100%", minWidth: 0, border: "1px solid var(--border, #d6dfe4)", borderRadius: 10, padding: 12, background: selectedInvoiceId === invoice.id ? "var(--muted, #f3f6f8)" : "var(--card, #fff)", color: "inherit", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <strong>{invoice.invoiceNumber} · {invoice.supplierName}</strong>
                <span style={{ color: statusColor(invoice.matchStatus), fontWeight: 700 }}>{statusLabel(invoice.matchStatus)}</span>
              </div>
              <p style={mutedStyle}>أمر {invoice.purchaseOrderNumber} · {invoice.invoiceDate} · {moneyText(invoice.invoiceTotalAmount, invoice.currency)}</p>
              <p style={mutedStyle}>استحقاق المصدر: {dueDateRows.find((item) => item.invoiceId === invoice.id)?.dueDate ?? "غير مسجل — لا يُفترض من تاريخ الفاتورة"}</p>
            </button>)}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" className="btn secondary" disabled={loading || offset <= 0} onClick={() => { const next = Math.max(0, offset - 25); setOffset(next); void load(next); }}>السابق</button>
          <span style={mutedStyle}>عرض {workspace ? workspace.offset + 1 : 0}–{workspace ? workspace.offset + invoiceRows.length : 0}</span>
          <button type="button" className="btn secondary" disabled={loading || !workspace?.hasMore} onClick={() => { const next = offset + 25; setOffset(next); void load(next); }}>التالي</button>
        </div>
      </section>

      {selectedInvoice && (
        <section style={cardStyle}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div><h3 style={{ margin: 0 }}>تفاصيل الفاتورة {selectedInvoice.invoiceNumber}</h3><p style={mutedStyle}>{selectedInvoice.supplierName} · أمر {selectedInvoice.purchaseOrderNumber} · {selectedInvoice.invoiceDate}</p></div>
            <strong style={{ color: statusColor(selectedInvoice.matchStatus) }}>{statusLabel(selectedInvoice.matchStatus)}</strong>
          </div>
          <section style={{ ...cardStyle, background: "var(--muted, #f8fafb)" }} aria-label="تاريخ استحقاق فاتورة المورد">
            <div>
              <h4 style={{ margin: 0 }}>استحقاق المورد من المستند الأصلي</h4>
              <p style={mutedStyle}>لا تُستخدم شروط ائتمان افتراضية. التاريخ يُسجل مرة واحدة بعد رفع مرفق الفاتورة، ويغذي التدفقات الخارجة فقط عندما تكون المطابقة والكمية المستلمة والدفعات المرحلة متحققة.</p>
            </div>
            {dueDateLoading ? <p role="status" style={mutedStyle}>جار تحميل أدلة الاستحقاق...</p> : null}
            {selectedDueDate ? (
              <div role="status" style={{ display: "grid", gap: 4 }}>
                <strong>تاريخ الاستحقاق: {selectedDueDate.dueDate}</strong>
                <p style={mutedStyle}>مرجع المصدر: {selectedDueDate.sourceReference} · سجل في {selectedDueDate.recordedAt}</p>
                <p style={mutedStyle}>سبب التسجيل: {selectedDueDate.reason} · مرفق الإثبات: {selectedDueDate.sourceEvidenceId}</p>
                <p style={mutedStyle}>السجل غير قابل للاستبدال. لتصحيح مصدر خاطئ، يجب إنشاء مستند تصحيحي مستقل لاحقًا؛ لا يُمحى التاريخ التاريخي.</p>
              </div>
            ) : selectedInvoice.matchStatus !== "matched" || Number(selectedInvoice.taxAmount) !== 0 ? (
              <p role="status" style={{ ...mutedStyle, color: "#854d0e" }}>مؤجل: لا تُقبل جدولة الالتزام قبل مطابقة السعر بالكامل وإزالة حالة الضريبة المعلقة.</p>
            ) : evidenceRows.length === 0 ? (
              <p role="status" style={mutedStyle}>ارفع أولًا نسخة الفاتورة أو مستند الاستحقاق في قسم مستندات الإثبات أدناه؛ لن يقبل الخادم تاريخًا بلا مرفق محفوظ.</p>
            ) : (
              <form onSubmit={(event) => { event.preventDefault(); void saveDueDate(); }} style={{ display: "grid", gap: 9 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
                  <label style={{ display: "grid", gap: 5 }}>تاريخ الاستحقاق كما ورد في المستند
                    <input required type="date" min={selectedInvoice.invoiceDate} value={dueDateDraft} onChange={(event) => setDueDateDraft(event.target.value)} disabled={dueDateBusy} style={fieldStyle} />
                  </label>
                  <label style={{ display: "grid", gap: 5 }}>مرفق المستند
                    <select required value={dueDateEvidenceId} onChange={(event) => setDueDateEvidenceId(event.target.value)} disabled={dueDateBusy} style={fieldStyle}>
                      <option value="">اختر مرفق الفاتورة</option>
                      {evidenceRows.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {item.contentSha256.slice(0, 12)}</option>)}
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 5 }}>مرجع الاستحقاق في المستند
                    <input required minLength={3} maxLength={200} value={dueDateSourceReference} onChange={(event) => setDueDateSourceReference(event.target.value)} placeholder={selectedInvoice.invoiceNumber} disabled={dueDateBusy} style={fieldStyle} />
                  </label>
                </div>
                <label style={{ display: "grid", gap: 5 }}>سبب/ملاحظة استخراج تاريخ الاستحقاق
                  <textarea required minLength={3} maxLength={500} rows={2} value={dueDateReason} onChange={(event) => setDueDateReason(event.target.value)} disabled={dueDateBusy} style={fieldStyle} placeholder="مثال: التاريخ مطبوع في خانة موعد السداد بفاتورة المورد." />
                </label>
                <button className="btn primary" type="submit" disabled={dueDateBusy || dueDateLoading || !dueDateEvidenceId || !dueDateReason.trim()}>
                  {dueDateBusy ? "جار حفظ دليل الاستحقاق..." : "حفظ تاريخ الاستحقاق من المستند"}
                </button>
              </form>
            )}
            {dueDateError && <p role="alert" style={{ ...mutedStyle, color: "#991b1b" }}>{dueDateError}</p>}
          </section>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
            <div><p style={mutedStyle}>إجمالي البنود</p><strong>{moneyText(selectedInvoice.merchandiseSubtotal, selectedInvoice.currency)}</strong></div>
            <div><p style={mutedStyle}>الضريبة الموثقة</p><strong>{moneyText(selectedInvoice.taxAmount, selectedInvoice.currency)}</strong></div>
            <div><p style={mutedStyle}>إجمالي الفاتورة</p><strong>{moneyText(selectedInvoice.invoiceTotalAmount, selectedInvoice.currency)}</strong></div>
            <div><p style={mutedStyle}>فرق المطابقة</p><strong>{moneyText(selectedInvoice.merchandiseVarianceAmount, selectedInvoice.currency)}</strong></div>
          </div>
          {selectedInvoice.taxAccountingStatus === "pending" && Number(selectedInvoice.taxAmount) > 0 &&
            (!accountingStatus || accountingStatus.accountingStatus === "not_prepared" ||
              accountingStatus.accountingStatus === "journal_void" || accountingStatus.accountingStatus === "journal_reversed") &&
            <p role="status" style={{ ...mutedStyle, color: "#854d0e" }}>الضريبة موثقة في الفاتورة لكنها لم تُعالج بقيد محاسبي حالي صالح؛ اختر حسابها صراحةً في قسم التسوية أدناه.</p>}
          {selectedInvoice.taxAccountingStatus === "pending" && Number(selectedInvoice.taxAmount) > 0 &&
            accountingStatus?.accountingStatus === "journal_draft_created" &&
            <p role="status" style={{ ...mutedStyle, color: "#854d0e" }}>أُدرجت الضريبة في مسودة قيد التسوية #{accountingStatus.journalEntryNumber ?? "—"}؛ تبقى غير مرحلة حتى اعتماد القيد صراحةً في دفتر الأستاذ.</p>}
          {selectedInvoice.taxAccountingStatus === "pending" && Number(selectedInvoice.taxAmount) > 0 &&
            accountingStatus?.accountingStatus === "journal_posted" &&
            <p role="status" style={{ ...mutedStyle, color: "#166534" }}>أُدرجت الضريبة في قيد التسوية المرحّل #{accountingStatus.journalEntryNumber ?? "—"}.</p>}
          {mode === "review" && (
            <section style={cardStyle} aria-label="تسوية فاتورة المورد المحاسبية">
              <div>
                <h4 style={{ margin: 0 }}>التسوية المحاسبية مع التزام إيصال الاستلام</h4>
                <p style={mutedStyle}>يقارن الخادم قيمة البنود الفعلية بتكلفة الكميات المفوترة في إيصالات الاستلام المرحلة. يستخدم حساب الدائن الأصلي نفسه؛ لا ينشئ التزامًا ثانيًا ولا يرحّل أو يسدد تلقائيًا.</p>
              </div>
              <div className="no-print" style={{ display: "flex", justifyContent: "flex-start", flexWrap: "wrap", gap: 8 }}>
                <button type="button" className="btn secondary" onClick={printAccountingDocument}
                  disabled={accountingLoading || !accountingStatus || Boolean(accountingError) || Boolean(printDocument)}>
                  <Printer size={15} /> طباعة محضر المطابقة والتسوية
                </button>
                <button type="button" className="btn secondary" onClick={exportAccountingWorkbook}
                  disabled={accountingLoading || !accountingStatus || Boolean(accountingError) || Boolean(printDocument)}>
                  <FileSpreadsheet size={15} /> تنزيل محضر التسوية Excel
                </button>
              </div>
              {printError && <p role="alert" style={{ ...mutedStyle, color: "#991b1b" }}>{printError}</p>}
              {accountingLoading ? <p role="status" style={mutedStyle}>جار قراءة حالة التسوية المحاسبية من المصدر...</p> :
                accountingError ? <p role="alert" style={{ ...mutedStyle, color: "#991b1b" }}>{accountingError}</p> :
                !accountingStatus ? <p style={mutedStyle}>لا توجد حالة تسوية محمّلة لهذه الفاتورة.</p> : (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
                      <div><p style={mutedStyle}>تكلفة الاستلام للكمية المفوترة</p><strong>{moneyText(accountingStatus.sourceMerchandiseAmount, accountingStatus.currency)}</strong></div>
                      <div><p style={mutedStyle}>قيمة البنود في الفاتورة</p><strong>{moneyText(selectedInvoice.merchandiseSubtotal, selectedInvoice.currency)}</strong></div>
                      <div><p style={mutedStyle}>فرق الفاتورة عن الاستلام</p><strong>{moneyText(accountingStatus.merchandiseVarianceAmount, accountingStatus.currency)}</strong></div>
                      <div><p style={mutedStyle}>الضريبة الموثقة</p><strong>{moneyText(accountingStatus.taxAmount, accountingStatus.currency)}</strong></div>
                    </div>
                    {accountingStatus.accountingStatus === "no_adjustment_required" && (
                      <p role="status" style={{ ...mutedStyle, color: "#166534" }}>تطابقت فاتورة المورد مع تكلفة الاستلام المسجلة ولا توجد ضريبة أو فروق؛ لم يُنشأ قيد إضافي ولم يتكرر التزام المورد.</p>
                    )}
                    {accountingStatus.accountingStatus === "journal_draft_created" && (
                      <div role="status" style={{ ...cardStyle, background: "var(--muted, #f8fafb)" }}>
                        <strong>مسودة قيد التسوية #{accountingStatus.journalEntryNumber ?? "—"}</strong>
                        <p style={mutedStyle}>القيد متوازن ومحفوظ في دفتر الأستاذ بحالة مسودة. لا يدخل في الأرصدة المرحلة حتى يرحّله محاسب مخوّل صراحةً.</p>
                        <a href="#general-ledger-journal-queue">فتح قائمة قيود اليومية</a>
                      </div>
                    )}
                    {accountingStatus.accountingStatus === "journal_posted" && (
                      <p role="status" style={{ ...mutedStyle, color: "#166534" }}>قيد تسوية الفاتورة #{accountingStatus.journalEntryNumber ?? "—"} مرحّل في دفتر الأستاذ. هذا يثبت المعالجة المحاسبية فقط ولا يثبت سداد المورد.</p>
                    )}
                    {accountingStatus.accountingStatus === "journal_void" && (
                      <p role="alert" style={{ ...mutedStyle, color: "#854d0e" }}>أُلغيت مسودة التسوية السابقة. يمكن إنشاء تسلسل جديد بعد مراجعة الحسابات؛ سيبقى سجل المسودة الملغاة محفوظًا.</p>
                    )}
                    {accountingStatus.accountingStatus === "journal_reversed" && (
                      <p role="alert" style={{ ...mutedStyle, color: "#991b1b" }}>قيد التسوية السابق له قيد عكس؛ أوقف إنشاء قيد آلي آخر وراجع سلسلة القيود في دفتر الأستاذ.</p>
                    )}
                    {(accountingStatus.accountingStatus === "not_prepared" || accountingStatus.accountingStatus === "journal_void") && (
                      <>
                        {(selectedInvoice.matchStatus === "variance_pending" || selectedInvoice.matchStatus === "variance_rejected") && (
                          <p role="alert" style={{ ...mutedStyle, color: "#854d0e" }}>لا يمكن إنشاء التسوية قبل اعتماد المطابقة الثلاثية. {selectedInvoice.matchStatus === "variance_pending" ? "تنتظر الفاتورة قرار المراجع المالي المستقل." : "رفض المراجع فرق السعر؛ لا يجوز تمرير التسوية."}</p>
                        )}
                        {selectedInvoice.createdByProfileId === user?.profileId && (
                          <p role="alert" style={{ ...mutedStyle, color: "#991b1b" }}>منشئ الفاتورة لا يستطيع إعداد تسويتها المحاسبية؛ استخدم مستخدمًا ماليًا مستقلًا.</p>
                        )}
                        {accountingStatus.currency !== "YER" && (
                          <p role="alert" style={{ ...mutedStyle, color: "#854d0e" }}>لا تتوفر سياسة تحويل عملات لهذا المسار؛ التسوية متاحة للريال اليمني فقط دون تخمين سعر صرف.</p>
                        )}
                        <form onSubmit={(event) => { event.preventDefault(); void prepareAccountingHandoff(); }} style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border, #d6dfe4)", paddingTop: 12 }}>
                          {accountingNeedsTax ? (
                            <label style={{ display: "grid", gap: 5 }}>
                              حساب الضريبة الموثقة — اختر أصلًا ضريبيًا قابلًا للاسترداد أو مصروفًا غير مسترد وفق سياسة المؤسسة
                              <select style={fieldStyle} value={taxAccountId} onChange={(event) => setTaxAccountId(event.target.value)} disabled={accountingBusy}>
                                <option value="">اختر حساب الضريبة</option>
                                {activeTaxAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name} ({account.account_type === "asset" ? "أصل" : "مصروف"})</option>)}
                              </select>
                              {!activeTaxAccounts.length && <p style={mutedStyle}>لا يوجد حساب أصل أو مصروف نشط متاح؛ أضف أو فعّل الحساب الصحيح في دليل الحسابات.</p>}
                            </label>
                          ) : <p style={mutedStyle}>لا توجد ضريبة في الفاتورة؛ لن يُنشأ سطر ضريبة.</p>}
                          {accountingNeedsVariance ? (
                            <label style={{ display: "grid", gap: 5 }}>
                              حساب مصروف فرق تكلفة فاتورة المورد عن تكلفة الاستلام الفعلية
                              <select style={fieldStyle} value={varianceAccountId} onChange={(event) => setVarianceAccountId(event.target.value)} disabled={accountingBusy}>
                                <option value="">اختر حساب فرق التكلفة</option>
                                {activeVarianceAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
                              </select>
                              {!activeVarianceAccounts.length && <p style={mutedStyle}>لا يوجد حساب مصروف نشط لفرق التكلفة؛ لا يتم إنشاء حساب أو تصنيف تلقائي.</p>}
                            </label>
                          ) : <p style={mutedStyle}>لا يوجد فرق بين قيمة البنود وتكلفة الاستلام للكمية المفوترة؛ لن يُنشأ سطر فرق تكلفة.</p>}
                          <p style={mutedStyle}>التسوية تُسجل الزيادة أو التخفيض على حساب الدائن الأصلي المرتبط بإيصال الاستلام. لا تُغيّر حركة المخزون ولا تُنشئ دفعة نقدية.</p>
                          <button type="submit" className="btn primary" disabled={accountingBusy || !canStartAccountingHandoff}>
                            {accountingBusy ? "جار إعداد مسودة التسوية..." : accountingStatus.accountingStatus === "journal_void" ? "إنشاء تسلسل تسوية جديد" : "إعداد تسوية الفاتورة في دفتر الأستاذ"}
                          </button>
                        </form>
                      </>
                    )}
                  </>
                )}
            </section>
          )}
          <section style={{ ...cardStyle, background: "var(--muted, #f8fafb)" }}>
            <div>
              <h4 style={{ margin: 0 }}>مستندات الإثبات المرفقة</h4>
              <p style={mutedStyle}>ملفات خاصة بالمؤسسة والفاتورة، مع بصمة SHA-256 وسجل رافع المرفق. PDF أو JPG أو PNG أو WEBP حتى 10 ميغابايت للملف، بحد 25 مرفقًا. لا توجد روابط عامة ولا استبدال للمرفق بعد حفظه.</p>
            </div>
            <label style={{ display: "grid", gap: 5, maxWidth: 520 }}>
              إضافة صورة أو نسخة PDF من فاتورة المورد أو مستنداتها
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={evidenceBusy}
                onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void addInvoiceEvidence(file); }} />
            </label>
            {evidenceBusy && <p role="status" style={mutedStyle}>جار رفع المستند وربطه بسجل الفاتورة...</p>}
            {evidenceLoading ? <p role="status" style={mutedStyle}>جار تحميل أدلة الفاتورة...</p> :
              evidenceRows.length === 0 ? <p style={mutedStyle}>لا توجد مرفقات مسجلة لهذه الفاتورة.</p> :
                <div style={{ display: "grid", gap: 7 }}>
                  {evidenceRows.map((item) => <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 9, flexWrap: "wrap", borderTop: "1px solid var(--border, #d6dfe4)", paddingTop: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <strong>{item.fileName}</strong>
                      <p style={mutedStyle}>{item.mimeType} · {(item.byteSize / 1024).toFixed(0)} KB · {new Date(item.createdAt).toLocaleString("ar-YE")}</p>
                      <p style={mutedStyle}>SHA-256: {item.contentSha256.slice(0, 20)}… · الرافع: {item.uploadedByProfileId}</p>
                    </div>
                    {evidenceLinks[item.id]
                      ? <a href={evidenceLinks[item.id]} target="_blank" rel="noreferrer">فتح الرابط المؤقت</a>
                      : <button className="btn secondary" type="button" disabled={evidenceLinkBusy !== null} onClick={() => void prepareEvidenceLink(item)}>{evidenceLinkBusy === item.id ? "جار تجهيز الرابط..." : "إنشاء رابط خاص لمدة 5 دقائق"}</button>}
                  </div>)}
                </div>}
            {evidenceError && <p role="alert" style={{ ...mutedStyle, color: "#991b1b" }}>{evidenceError}</p>}
          </section>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead><tr style={{ textAlign: "right" }}><th style={{ padding: 8 }}>الصنف / الإيصال</th><th>كمية الفاتورة</th><th>سعر الأمر</th><th>سعر الاستلام</th><th>سعر الفاتورة</th><th>القيمة المصدرية</th><th>القيمة الفعلية</th><th>مطابقة</th></tr></thead>
              <tbody>{selectedInvoice.lines.map((line) => <tr key={line.id} style={{ borderTop: "1px solid var(--border, #e2e8f0)" }}>
                <td style={{ padding: 8 }}>{line.productName}<p style={mutedStyle}>{line.receiptNumber} · {line.itemCode}</p></td>
                <td>{quantityText(line.invoicedQuantity)}</td><td>{moneyText(line.orderedUnitCost, selectedInvoice.currency)}</td><td>{moneyText(line.receivedUnitCost, selectedInvoice.currency)}</td><td>{moneyText(line.invoicedUnitCost, selectedInvoice.currency)}</td><td>{moneyText(line.expectedLineTotal, selectedInvoice.currency)}</td><td>{moneyText(line.actualLineTotal, selectedInvoice.currency)}</td><td>{line.priceMatch ? "مطابق" : "فرق سعر"}</td>
              </tr>)}</tbody>
            </table>
          </div>
          {selectedInvoice.history.length > 0 && (
            <div style={{ display: "grid", gap: 6 }}>
              <h4 style={{ margin: 0 }}>سجل المراجعة غير القابل للحذف</h4>
              {selectedInvoice.history.map((event, index) => <p key={index} style={mutedStyle}>{eventLabel(event.action)} · {event.createdAt} · المنفذ: {event.actorProfileId}{event.reason ? " · السبب: " + event.reason : ""}</p>)}
            </div>
          )}
          {mode === "review" && selectedInvoice.matchStatus === "variance_pending" && (
            user?.profileId === selectedInvoice.createdByProfileId
              ? <p role="alert" style={{ ...mutedStyle, color: "#991b1b" }}>أنشأت هذه الفاتورة؛ لا يسمح لك النظام بمراجعة فرقها. استخدم حسابًا ماليًا مستقلًا.</p>
              : <form onSubmit={(event) => { event.preventDefault(); void reviewInvoice(selectedInvoice); }} style={{ display: "grid", gap: 9, borderTop: "1px solid var(--border, #e2e8f0)", paddingTop: 12 }}>
                  <h4 style={{ margin: 0 }}>قرار المراجع المالي المستقل</h4>
                  <label style={{ display: "grid", gap: 5 }}>القرار<select style={fieldStyle} value={reviewDecision} onChange={(event) => setReviewDecision(event.target.value as "approve" | "reject")} disabled={busy}><option value="approve">اعتماد فرق السعر</option><option value="reject">رفض فرق السعر</option></select></label>
                  <label style={{ display: "grid", gap: 5 }}>سبب القرار<textarea required minLength={3} maxLength={500} rows={3} style={fieldStyle} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} disabled={busy} /></label>
                  <button type="submit" className="btn primary" disabled={busy || !canReviewSelected}>{busy ? "جار حفظ القرار..." : "تسجيل قرار المراجعة المستقلة"}</button>
                </form>
          )}
        </section>
      )}
      {printDocument && typeof document !== "undefined"
        ? createPortal(<SupplierInvoiceAccountingPrintSheet document={printDocument} />, document.body)
        : null}
    </section>
  );
}
