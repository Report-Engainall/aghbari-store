import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCheck2, RefreshCw, Scale, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SupplierCreditNoteDocumentActions } from "@/components/SupplierCreditNoteDocumentActions";
import {
  fetchSupplierCreditNoteWorkspace,
  prepareSupplierCreditNoteJournalDraft,
  recordSupplierCreditNote,
  reviewSupplierCreditNoteVariance,
  type SupplierCreditNoteAccount,
  type SupplierCreditNoteWorkspaceData,
  type SupplierReturnCreditNoteRecord,
} from "@/lib/supplier-credit-notes";

type CreditNoteReturnCardProps = {
  item: SupplierReturnCreditNoteRecord;
  accounts: SupplierCreditNoteAccount[];
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onRefresh: () => Promise<void>;
};

const amountText = (value: number | null, currency: string) =>
  value === null ? "غير مثبتة" : new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " " + currency;
const signedAmountText = (value: number | null, currency: string) => {
  if (value === null) return "غير متاح";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return sign + amountText(Math.abs(value), currency);
};
const dateText = (value: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("ar-YE");
};
const localToday = () => {
  const date = new Date();
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
};
const statusLabel = (status: SupplierReturnCreditNoteRecord["creditNoteStatus"]) => {
  switch (status) {
    case "exact_match": return "مطابق للمصدر";
    case "variance_pending": return "فرق بانتظار الاعتماد";
    case "variance_approved": return "فرق معتمد";
    case "variance_rejected": return "مرفوض — يمكن تسجيل مستند مصحح";
    case "journal_draft_created": return "مسودة قيد أُنشئت";
    default: return "لم يسجل إشعار دائن";
  }
};
const journalStatusLabel = (status: SupplierReturnCreditNoteRecord["journalStatus"]) =>
  status === "posted" ? "مرحل" : status === "void" ? "ملغى" : status === "draft" ? "مسودة" : "غير متاح";
const reviewActionLabel = (action: string) => {
  switch (action) {
    case "recorded_exact_match": return "تسجيل مستند مطابق";
    case "recorded_variance_pending": return "تسجيل فرق بانتظار المراجعة";
    case "variance_approved": return "اعتماد فرق المبلغ";
    case "variance_rejected": return "رفض إشعار المورد";
    case "journal_draft_created": return "إنشاء مسودة القيد";
    default: return "حدث مراجعة";
  }
};

function makeIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new Error("هذا المتصفح لا يوفر مفتاح عملية آمنًا؛ لم يتم إرسال الطلب.");
  }
  return globalThis.crypto.randomUUID();
}

function CreditNoteReturnCard({ item, accounts, busy, onBusyChange, onRefresh }: CreditNoteReturnCardProps) {
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuedOn, setIssuedOn] = useState(localToday);
  const [actualAmount, setActualAmount] = useState("");
  const [reviewReason, setReviewReason] = useState("");
  const [varianceAccountId, setVarianceAccountId] = useState("");
  const [recordKey, setRecordKey] = useState<{ fingerprint: string; key: string } | null>(null);
  const [draftKey, setDraftKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const varianceAccountType = (item.varianceAmount ?? 0) > 0 ? "revenue" : "expense";
  const varianceAccounts = useMemo(
    () => accounts.filter((account) => account.isActive && account.accountType === varianceAccountType),
    [accounts, varianceAccountType],
  );
  const hasProvenSourceJournal = Boolean(
    item.sourceJournalEntryId && item.sourceJournalEntryNumber &&
    item.sourceJournalStatus === "posted" && item.inventoryAccountId && item.payableAccountId,
  );
  const canCreateDraft = item.creditNoteId !== null &&
    (item.creditNoteStatus === "exact_match" || item.creditNoteStatus === "variance_approved") &&
    !item.journalEntryId && hasProvenSourceJournal && item.currency === "YER" &&
    ((item.varianceAmount ?? 0) === 0 || Boolean(varianceAccountId));

  async function recordEvidence() {
    if (busy) return;
    const parsedAmount = Number(actualAmount);
    if (!documentNumber.trim() || !issuedOn || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("أدخل رقم إشعار المورد وتاريخه ومبلغًا فعليًا موجبًا.");
      return;
    }
    if (item.sourceAmount === null || item.sourceAmount <= 0) {
      setError("تكلفة المرتجع المصدرية غير مكتملة؛ يجب إكمال مراجعة تكلفة إيصال المصدر أولًا.");
      return;
    }
    const fingerprint = JSON.stringify({
      returnId: item.returnId, documentNumber: documentNumber.trim(),
      issuedOn, actualAmount: actualAmount.trim(), currency: item.currency,
    });
    let key = recordKey?.fingerprint === fingerprint ? recordKey.key : "";
    try {
      if (!key) {
        key = makeIdempotencyKey();
        setRecordKey({ fingerprint, key });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء مفتاح العملية.");
      return;
    }
    onBusyChange(true); setError(""); setNotice("");
    try {
      const result = await recordSupplierCreditNote({
        returnId: item.returnId,
        supplierCreditNoteNumber: documentNumber,
        issuedOn,
        actualAmount,
        currency: item.currency,
        idempotencyKey: key,
      });
      setRecordKey(null);
      setDocumentNumber(""); setActualAmount("");
      setNotice(result.status === "exact_match"
        ? "سُجل إشعار المورد وتطابق مبلغه مع تكلفة المرتجع المصدرية."
        : "سُجل إشعار المورد مع فرق مبلغ " + signedAmountText(result.varianceAmount, item.currency) + "؛ إنشاء القيد متوقف حتى اعتماد الفرق أو رفضه.");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل إشعار المورد.");
    } finally { onBusyChange(false); }
  }

  async function reviewVariance(approve: boolean) {
    if (!item.creditNoteId || busy) return;
    if (reviewReason.trim().length < 3) {
      setError("سبب القرار المحاسبي مطلوب من 3 أحرف على الأقل.");
      return;
    }
    onBusyChange(true); setError(""); setNotice("");
    try {
      await reviewSupplierCreditNoteVariance({
        creditNoteId: item.creditNoteId,
        approve,
        reason: reviewReason,
      });
      setReviewReason("");
      setNotice(approve
        ? "اعتمد المحاسب فرق إشعار المورد. أصبح بالإمكان إعداد مسودة القيد وفق حساب تسوية معتمد."
        : "رُفض إشعار المورد لهذا المرتجع. حُفظ القرار وسجله، ويمكن تسجيل إشعار مصحح مع الإبقاء على سجل الرفض.");
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ قرار مراجعة الفرق.");
    } finally { onBusyChange(false); }
  }

  async function createDraft() {
    if (!item.creditNoteId || busy || !canCreateDraft) return;
    let key = draftKey;
    try {
      if (!key) {
        key = makeIdempotencyKey();
        setDraftKey(key);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء مفتاح المسودة.");
      return;
    }
    onBusyChange(true); setError(""); setNotice("");
    try {
      const result = await prepareSupplierCreditNoteJournalDraft({
        creditNoteId: item.creditNoteId,
        varianceAccountId: (item.varianceAmount ?? 0) === 0 ? null : varianceAccountId,
        idempotencyKey: key,
      });
      setDraftKey(null);
      setNotice(
        (result.replayed ? "استُعيدت مسودة القيد الموجودة " : "أُنشئت مسودة القيد ") +
        (result.journalEntryNumber ?? "") +
        ". لم يُرحّل القيد؛ راجعه في دفتر الأستاذ ثم رحّله صراحةً بصلاحية المحاسب."
      );
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إعداد مسودة القيد المرتبط بإشعار المورد.");
    } finally { onBusyChange(false); }
  }

  const sourceAmount = item.sourceAmount;
  const variance = item.varianceAmount ?? 0;
  return (
    <article style={{ border: "1px solid var(--border, #dce4e8)", borderRadius: 12, padding: 14, display: "grid", gap: 12, minWidth: 0 }}>
      <header style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10, alignItems: "start" }}>
        <div style={{ display: "grid", gap: 4 }}>
          <strong>مرتجع {item.returnNumber} — {item.supplierName}</strong>
          <span style={{ color: "var(--muted-foreground, #64748b)", fontSize: 12 }}>
            إيصال المصدر {item.sourceReceiptNumber} · أمر الشراء {item.purchaseOrderNumber} · تاريخ الترحيل {dateText(item.postedAt)}
          </span>
        </div>
        <div style={{ display: "grid", gap: 7, justifyItems: "end" }}>
          <span style={{ fontSize: 12, fontWeight: 700, border: "1px solid var(--border, #dce4e8)", borderRadius: 99, padding: "4px 9px" }}>
            {statusLabel(item.creditNoteStatus)}
          </span>
          <SupplierCreditNoteDocumentActions supplierCreditNote={item} />
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}>
        <div><small style={{ color: "var(--muted-foreground, #64748b)" }}>تكلفة المرتجع من المصدر</small><div style={{ fontWeight: 750 }}>{amountText(sourceAmount, item.currency)}</div></div>
        <div><small style={{ color: "var(--muted-foreground, #64748b)" }}>رقم إشعار المورد</small><div style={{ fontWeight: 700 }}>{item.supplierCreditNoteNumber ?? "لم يسجل"}</div></div>
        <div><small style={{ color: "var(--muted-foreground, #64748b)" }}>المبلغ الفعلي</small><div style={{ fontWeight: 750 }}>{amountText(item.actualAmount, item.currency)}</div></div>
        <div><small style={{ color: "var(--muted-foreground, #64748b)" }}>فرق المبلغ (فعلي − مصدر)</small><div style={{ fontWeight: 750 }}>{signedAmountText(item.varianceAmount, item.currency)}</div></div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--muted-foreground, #64748b)" }}>
        <span><ShieldCheck size={14} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />قيد إيصال المصدر: {item.sourceJournalEntryNumber ?? "غير مربوط"} ({journalStatusLabel(item.sourceJournalStatus)})</span>
        {item.creditNoteIssuedOn && <span>تاريخ إشعار المورد: {dateText(item.creditNoteIssuedOn)}</span>}
      </div>

      {item.reviewHistory.length > 0 && (
        <section style={{ display: "grid", gap: 7, borderTop: "1px solid var(--border, #e3e9ec)", paddingTop: 12 }}>
          <strong>سجل المطابقة والمراجعة المحاسبية</strong>
          {item.reviewHistory.map((event, index) => (
            <div key={event.createdAt + ":" + event.action + ":" + index} style={{ display: "grid", gap: 3, padding: "7px 9px", borderRadius: 8, background: "var(--muted, #f5f7f8)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                <strong>{reviewActionLabel(event.action)} — {event.supplierCreditNoteNumber}</strong>
                <span style={{ color: "var(--muted-foreground, #64748b)" }}>{dateText(event.createdAt)}</span>
              </div>
              {event.reason && <span style={{ color: "var(--muted-foreground, #64748b)", fontSize: 12 }}>{event.reason}</span>}
            </div>
          ))}
        </section>
      )}

      {item.creditNoteId === null && (
        <section style={{ display: "grid", gap: 9, borderTop: "1px solid var(--border, #e3e9ec)", paddingTop: 12 }}>
          <strong>تسجيل مستند المورد الفعلي</strong>
          {sourceAmount === null || sourceAmount <= 0 ? (
            <p role="alert" style={{ margin: 0, color: "#92400e" }}>لا يمكن المطابقة قبل استكمال تكلفة مصدر المرتجع؛ لا تُنشأ قيمة تكلفة بديلة.</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 9 }}>
                <label style={{ display: "grid", gap: 4 }}>رقم إشعار الدائن
                  <input maxLength={80} style={fieldStyle} value={documentNumber} onChange={(event) => setDocumentNumber(event.target.value)} disabled={busy} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>تاريخ المستند
                  <input type="date" max={localToday()} style={fieldStyle} value={issuedOn} onChange={(event) => setIssuedOn(event.target.value)} disabled={busy} />
                </label>
                <label style={{ display: "grid", gap: 4 }}>المبلغ الفعلي ({item.currency})
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" style={fieldStyle} value={actualAmount} onChange={(event) => setActualAmount(event.target.value)} disabled={busy} />
                </label>
              </div>
              <p style={{ margin: 0, color: "var(--muted-foreground, #64748b)", fontSize: 12 }}>
                المورد والعملة يُشتقان من المرتجع المرحّل. أدخل القيمة كما تظهر في مستند المورد؛ لا يوجد تحويل عملة أو استنتاج للضريبة.
              </p>
              <button className="btn primary" type="button" onClick={() => void recordEvidence()} disabled={busy}>
                <FileCheck2 size={15} /> {busy ? "جار التسجيل…" : "تسجيل إشعار المورد ومطابقته"}
              </button>
            </>
          )}
        </section>
      )}

      {item.creditNoteStatus === "variance_pending" && (
        <section style={{ display: "grid", gap: 9, borderTop: "1px solid var(--border, #e3e9ec)", paddingTop: 12 }}>
          <strong>اعتماد فرق مبلغ إشعار المورد</strong>
          <p role="alert" style={{ margin: 0, color: "#92400e" }}>
            يوجد فرق {signedAmountText(item.varianceAmount, item.currency)} بين المستند والتكلفة المصدرية. لا يُسمح بإعداد القيد حتى يراجع المحاسب الفرق ويوثق القرار.
          </p>
          <label style={{ display: "grid", gap: 4 }}>سبب الاعتماد أو الرفض
            <textarea rows={2} maxLength={500} style={fieldStyle} value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} disabled={busy} />
          </label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn primary" type="button" onClick={() => void reviewVariance(true)} disabled={busy || reviewReason.trim().length < 3}>
              اعتماد الفرق
            </button>
            <button className="btn secondary" type="button" onClick={() => void reviewVariance(false)} disabled={busy || reviewReason.trim().length < 3}>
              رفض الإشعار
            </button>
          </div>
        </section>
      )}

      {item.creditNoteStatus === "variance_rejected" && (
        <p style={{ margin: 0, color: "var(--muted-foreground, #64748b)" }}>
          رُفض المستند السابق مع حفظ سجل القرار؛ يمكن تسجيل رقم إشعار مصحح. لا تُحذف أدلة الرفض السابقة.
        </p>
      )}

      {(item.creditNoteStatus === "exact_match" || item.creditNoteStatus === "variance_approved") && !item.journalEntryId && (
        <section style={{ display: "grid", gap: 9, borderTop: "1px solid var(--border, #e3e9ec)", paddingTop: 12 }}>
          <strong>الربط بالدفتر العام</strong>
          {!hasProvenSourceJournal ? (
            <p role="alert" style={{ margin: 0, color: "#92400e" }}>
              لا يمكن إنشاء المسودة: لا يوجد قيد إيصال مصدر مرحّل مع ربط حسابات مثبت في سجل المحاسبة. أكمل ربط الإيصال الأصلي أولًا.
            </p>
          ) : item.currency !== "YER" ? (
            <p role="alert" style={{ margin: 0, color: "#92400e" }}>الدفتر العام الحالي لا يطبق سياسة تحويل عملة. حفظ المطابقة متاح، أما إنشاء القيد فيتطلب عملة YER.</p>
          ) : (
            <>
              {variance !== 0 && (
                <label style={{ display: "grid", gap: 4 }}>حساب فرق الإشعار — {varianceAccountType === "revenue" ? "إيراد" : "مصروف"}
                  <select style={fieldStyle} value={varianceAccountId} onChange={(event) => setVarianceAccountId(event.target.value)} disabled={busy}>
                    <option value="">اختر حساب تسوية نشطًا</option>
                    {varianceAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} — {account.name}</option>)}
                  </select>
                </label>
              )}
              <p style={{ margin: 0, color: "var(--muted-foreground, #64748b)", fontSize: 12 }}>
                الحسابان الرئيسيان سيُعاد استخدامهما من قيد إيصال الاستلام الأصلي بعد التحقق من أنه مرحّل ومتوازن. القيد الجديد ينشأ مسودة فقط.
              </p>
              {!varianceAccounts.length && variance !== 0 && <p role="alert" style={{ margin: 0, color: "#92400e" }}>لا يوجد حساب {varianceAccountType === "revenue" ? "إيراد" : "مصروف"} نشط لتسجيل الفرق؛ أنشئ الحساب المعتمد أولًا.</p>}
              <button className="btn primary" type="button" onClick={() => void createDraft()} disabled={busy || !canCreateDraft}>
                <Scale size={15} /> {busy ? "جار إعداد المسودة…" : "إنشاء مسودة قيد المورد"}
              </button>
            </>
          )}
        </section>
      )}

      {item.journalEntryId && (
        <p role="status" style={{ margin: 0, color: "var(--muted-foreground, #64748b)" }}>
          <CheckCircle2 size={15} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />
          قيد المورد #{item.journalEntryNumber ?? item.journalEntryId} — {journalStatusLabel(item.journalStatus)}. {item.journalStatus === "draft" ? "افتح قيود اليومية لمراجعته وترحيله يدويًا." : "لا ينشئ النظام قيدًا بديلًا تلقائيًا."}
        </p>
      )}

      {error && <p role="alert" style={{ margin: 0, padding: 9, background: "#fef2f2", color: "#991b1b", borderRadius: 8 }}><AlertTriangle size={14} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />{error}</p>}
      {notice && <p role="status" style={{ margin: 0, padding: 9, background: "#ecfdf5", color: "#166534", borderRadius: 8 }}><CheckCircle2 size={14} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />{notice}</p>}
    </article>
  );
}

const fieldStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 10px",
  border: "1px solid var(--border, #d6dfe4)", borderRadius: 8,
  background: "var(--card, #fff)", color: "var(--foreground, #17242a)", font: "inherit",
};

export function SupplierCreditNoteWorkspace({ onRefresh }: { onRefresh?: () => void | Promise<void> }) {
  const { user } = useAuth();
  const canManageFinance = Boolean(user?.roles.some((role) =>
    role === "admin" || role === "manager" || role === "accountant"
  ));
  const [data, setData] = useState<SupplierCreditNoteWorkspaceData>({ accounts: [], returns: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canManageFinance) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      setData(await fetchSupplierCreditNoteWorkspace());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل مطابقة إشعارات الموردين.");
    } finally { setLoading(false); }
  }, [canManageFinance]);

  useEffect(() => { void load(); }, [load]);

  const refreshAll = useCallback(async () => {
    await load();
    await onRefresh?.();
  }, [load, onRefresh]);

  const returns = useMemo(
    () => [...data.returns].sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt)),
    [data.returns],
  );

  if (!canManageFinance) return null;
  return (
    <section aria-label="مطابقة إشعارات الموردين" dir="rtl" style={{ display: "grid", gap: 12, marginBlock: 18, minWidth: 0 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}><FileCheck2 size={18} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} /> مطابقة إشعارات الموردين الدائنة</h3>
          <p style={{ margin: "5px 0 0", color: "var(--muted-foreground, #64748b)", fontSize: 12 }}>
            تسوية إشعار المورد مع مرتجع المخزون وتكلفة إيصال الشراء. لا يُرحّل قيد المورد تلقائيًا.
          </p>
        </div>
        <button className="btn secondary" type="button" onClick={() => void load()} disabled={loading || busy}>
          <RefreshCw size={15} /> تحديث القائمة
        </button>
      </header>
      {error && <p role="alert" style={{ margin: 0, color: "#991b1b" }}><AlertTriangle size={14} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />{error}</p>}
      {loading ? <p role="status" style={{ color: "var(--muted-foreground, #64748b)" }}>جار تحميل مرتجعات الموردين المرحلة…</p> :
        !returns.length ? <p style={{ color: "var(--muted-foreground, #64748b)" }}>لا توجد مرتجعات موردين مرحلة بانتظار المطابقة المحاسبية.</p> :
        <div style={{ display: "grid", gap: 10 }}>
          {returns.map((item) => (
            <CreditNoteReturnCard
              key={item.returnId}
              item={item}
              accounts={data.accounts}
              busy={busy}
              onBusyChange={setBusy}
              onRefresh={refreshAll}
            />
          ))}
        </div>}
    </section>
  );
}
