import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, PackageMinus, RefreshCw, Send } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SupplierReturnDocumentActions } from "@/components/SupplierReturnDocumentActions";
import {
  createSupplierReturn,
  fetchSupplierReturns,
  postSupplierReturn,
  type SupplierReturn,
  type SupplierReturnableReceipt,
  type SupplierReturnWorkspaceData,
} from "@/lib/supplier-returns";

type ReturnLineDrafts = Record<string, string>;
const qtyText = (value: number) => new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(value);
const costText = (value: number | null, currency: string) =>
  value === null ? "غير مثبتة في المصدر" : new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(value) + " " + currency;
const dateText = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-YE");
};

export function SupplierReturnWorkspace() {
  const { user } = useAuth();
  const canManage = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  const [data, setData] = useState<SupplierReturnWorkspaceData>({ receipts: [], returns: [] });
  const [receiptId, setReceiptId] = useState("");
  const [lineDrafts, setLineDrafts] = useState<ReturnLineDrafts>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const [submissionKey, setSubmissionKey] = useState<{ fingerprint: string; key: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const result = await fetchSupplierReturns();
      setData(result);
      setReceiptId((current) => current && result.receipts.some((receipt) => receipt.id === current)
        ? current : result.receipts[0]?.id ?? "");
      setSelectedReturnId((current) => current && result.returns.some((item) => item.id === current)
        ? current : result.returns[0]?.id ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل إيصالات الشراء ومرتجعات الموردين.");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => { void load(); }, [load]);

  const selectedReceipt = useMemo<SupplierReturnableReceipt | null>(
    () => data.receipts.find((receipt) => receipt.id === receiptId) ?? null,
    [data.receipts, receiptId],
  );
  const selectedReturn = useMemo<SupplierReturn | null>(
    () => data.returns.find((item) => item.id === selectedReturnId) ?? null,
    [data.returns, selectedReturnId],
  );
  const returnableLines = selectedReceipt?.items.filter((item) => item.remainingQuantity > 0) ?? [];
  const draftTotal = selectedReceipt?.items.reduce((sum, item) => {
    const raw = lineDrafts[item.receiptItemId];
    if (raw === undefined || raw.trim() === "" || item.unitCost === null) return sum;
    const quantity = Number(raw);
    return Number.isFinite(quantity) && quantity > 0 && quantity <= item.remainingQuantity
      ? sum + quantity * item.unitCost : sum;
  }, 0) ?? 0;
  const hasUnknownCost = returnableLines.some((item) =>
    (lineDrafts[item.receiptItemId] ?? "").trim() !== "" && item.unitCost === null
  );

  async function saveDraft() {
    if (!selectedReceipt || busy) return;
    const lines: Array<{ receipt_item_id: string; quantity: number }> = [];
    for (const item of returnableLines) {
      const raw = lineDrafts[item.receiptItemId];
      if (raw === undefined || raw.trim() === "") continue;
      const quantity = Number(raw);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > item.remainingQuantity ||
          Math.round(quantity * 1000) !== quantity * 1000) {
        setError("كمية مرتجع " + item.productName + " يجب أن تكون موجبة ولا تتجاوز القابل للإرجاع (" + qtyText(item.remainingQuantity) + ").");
        return;
      }
      lines.push({ receipt_item_id: item.receiptItemId, quantity });
    }
    if (!lines.length) { setError("أدخل كمية مرتجع لبند واحد على الأقل."); return; }
    if (reason.trim().length < 3) { setError("سبب المرتجع مطلوب ويجب ألا يقل عن 3 أحرف."); return; }
    const payloadFingerprint = JSON.stringify({
      receiptId: selectedReceipt.id,
      lines,
      reason: reason.trim(),
      notes: notes.trim(),
    });
    const idempotencyKey = submissionKey?.fingerprint === payloadFingerprint
      ? submissionKey.key
      : "supplier-return-" + globalThis.crypto.randomUUID().replace(/-/g, "");
    setSubmissionKey({ fingerprint: payloadFingerprint, key: idempotencyKey });
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await createSupplierReturn({
        receiptId: selectedReceipt.id,
        lines,
        reason,
        notes,
        idempotencyKey,
      });
      await load();
      setSelectedReturnId(result.supplierReturn.id);
      setSubmissionKey(null);
      setLineDrafts({});
      setReason("");
      setNotes("");
      setNotice(result.idempotentReplay
        ? "تم استرجاع مسودة مرتجع المورد نفسها؛ لم يُنشأ مستند مكرر."
        : "تم حفظ مسودة المرتجع " + result.supplierReturn.returnNumber + ". لم يتغير المخزون حتى الآن.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر حفظ مسودة مرتجع المورد.");
    } finally {
      setBusy(false);
    }
  }

  async function postDraft(item: SupplierReturn) {
    if (busy || item.status !== "draft") return;
    const costNotice = item.totalCost === null
      ? "\nتكلفة المصدر غير مكتملة؛ ستُفتح مهمة استكمال تكلفة، ولن يُنشأ إشعار دائن مالي آليًا."
      : "\nستُفتح مهمة محاسبية لمطابقة إشعار المورد الدائن مع تكلفة المصدر. لن يُرحّل قيد تلقائي.";
    const confirmed = window.confirm(
      "سيُرحّل مرتجع المورد " + item.returnNumber + " إلى المخزون بخصم الكميات من المتاح فقط، مع حماية المحجوز." +
      "\nالمورد: " + item.supplierName +
      "\nالإيصال: " + item.sourceReceiptNumber +
      "\nعدد البنود: " + item.items.length +
      costNotice +
      "\n\nتأكد من فحص البضاعة وتجهيزها فعليًا للإرجاع إلى المورد قبل المتابعة."
    );
    if (!confirmed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await postSupplierReturn(item.id);
      await load();
      setSelectedReturnId(result.supplierReturn.id);
      setNotice(
        "تم ترحيل المرتجع " + result.supplierReturn.returnNumber +
        ". سُجلت حركات خفض المخزون. " +
        (result.supplierReturn.totalCost === null
          ? "أُنشئت مهمة استكمال تكلفة المصدر."
          : "أُنشئت مهمة للمحاسب لمطابقة إشعار المورد الدائن؛ لا يوجد قيد مالي مرحّل تلقائيًا.")
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر ترحيل مرتجع المورد. راجع المتاح الفعلي والمحجوز.");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return <section className="panel" dir="rtl"><h2>صلاحية إدارة المشتريات مطلوبة</h2><p className="po-muted">مرتجعات الموردين متاحة لمدير المؤسسة أو المدير فقط، ويطبق الخادم الصلاحية نفسها.</p></section>;
  }

  return (
    <section className="panel" dir="rtl" style={{ display: "grid", gap: 14 }}>
      <header className="panel-head">
        <div>
          <h2><PackageMinus size={18} style={{ verticalAlign: "middle", marginInlineEnd: 7 }} /> مرتجعات الموردين</h2>
          <p className="po-muted">كل مرتجع مرتبط بإيصال استلام أصلي. لا يتجاوز الكمية المتبقية القابلة للإرجاع، ويُخصم من المتاح دون المساس بالمحجوز.</p>
        </div>
        <button className="btn secondary" type="button" onClick={() => void load()} disabled={loading || busy}>
          <RefreshCw size={15} /> تحديث البيانات
        </button>
      </header>

      {error && <p className="po-error" role="alert"><AlertTriangle size={15} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} />{error}</p>}
      {notice && <p className="po-notice" role="status"><CheckCircle2 size={15} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} />{notice}</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="po-card">
          <div><h3 className="font-semibold">إنشاء مسودة مرتجع من إيصال</h3><p className="po-muted">اختر إيصالًا فعليًا ثم حدد الكميات المراد إرجاعها. لا تختَر كميات غير موجودة في سجل الاستلام.</p></div>
          {loading ? <p role="status" className="po-muted">جار تحميل إيصالات الاستلام...</p> : (
            <>
              <label className="po-field">إيصال الاستلام المصدر
                <select value={receiptId} onChange={(event) => { setReceiptId(event.target.value); setLineDrafts({}); }} disabled={busy || !data.receipts.length}>
                  <option value="">اختر إيصالًا له كمية قابلة للإرجاع</option>
                  {data.receipts.map((receipt) => <option key={receipt.id} value={receipt.id}>
                    {receipt.receiptNumber} · {receipt.supplierName} · {receipt.purchaseOrderNumber} · {dateText(receipt.receivedAt)}
                  </option>)}
                </select>
              </label>
              {selectedReceipt ? <>
                <p className="po-muted">المورد: <strong>{selectedReceipt.supplierName}</strong> · أمر الشراء: {selectedReceipt.purchaseOrderNumber} · المخزن: {selectedReceipt.warehouseName} · العملة المصدرية: {selectedReceipt.currency}</p>
                <p className="po-muted">المتبقي محسوب بعد المرتجعات المُرحّلة فقط؛ مسودة المرتجع لا تحجز الكمية، ويعيد الخادم التحقق من الكمية المتاحة تحت قفل الإيصال عند الترحيل.</p>
                {returnableLines.length ? <div className="po-table-wrap">
                  <table>
                    <thead><tr><th>الصنف</th><th>المستلم</th><th>مرتجع سابق</th><th>المتبقي</th><th>تكلفة الوحدة</th><th>كمية المرتجع</th></tr></thead>
                    <tbody>{returnableLines.map((item) => <tr key={item.receiptItemId}>
                      <td>{item.productName}<small style={{ display: "block", color: "var(--muted-foreground)" }}>{item.itemCode} · {item.unit || "وحدة غير مسجلة"}</small></td>
                      <td>{qtyText(item.quantityReceived)}</td>
                      <td>{qtyText(item.alreadyReturned)}</td>
                      <td><strong>{qtyText(item.remainingQuantity)}</strong></td>
                      <td>{costText(item.unitCost, selectedReceipt.currency)}</td>
                      <td><input aria-label={"كمية مرتجع " + item.productName} type="number" min="0.001" max={item.remainingQuantity} step="0.001"
                        className="w-28 rounded border bg-background p-2" value={lineDrafts[item.receiptItemId] ?? ""}
                        onChange={(event) => setLineDrafts((old) => ({ ...old, [item.receiptItemId]: event.target.value }))} disabled={busy} /></td>
                    </tr>)}</tbody>
                  </table>
                </div> : <p className="po-muted">لا توجد كمية قابلة للإرجاع من هذا الإيصال؛ تمت إعادة الكميات المقبولة سابقًا بالكامل.</p>}
                <p className="po-muted">إجمالي التكلفة المصدرية التقديرية للبنود المدخلة: {costText(hasUnknownCost ? null : draftTotal, selectedReceipt.currency)}. المسودة لا تنشئ قيدًا أو إشعارًا دائنًا.</p>
                <label className="po-field">سبب إرجاع المورد
                  <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={2} disabled={busy} placeholder="مثال: تلف مثبت عند الفحص أو اختلاف مواصفات التوريد" />
                </label>
                <label className="po-field">ملاحظات داخلية (اختياري)
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={2} disabled={busy} />
                </label>
                <div className="po-actions">
                  <button type="button" className="btn primary" onClick={() => void saveDraft()} disabled={busy || !returnableLines.length}>
                    <ClipboardList size={15} /> حفظ مسودة المرتجع
                  </button>
                </div>
              </> : <p className="po-muted">لا توجد إيصالات ذات كميات قابلة للإرجاع، أو لم يتم اختيار إيصال.</p>}
            </>
          )}
        </section>

        <section className="po-card">
          <div><h3 className="font-semibold">سجل مرتجعات الموردين</h3><p className="po-muted">المسودة لا تحرك المخزون. الترحيل يسجل حركة سالبة ويرفض إذا كانت الكمية محجوزة أو غير متاحة.</p></div>
          {loading ? <p role="status" className="po-muted">جار تحميل المرتجعات...</p> :
            data.returns.length ? data.returns.map((item) => (
              <article key={item.id} className="rounded-lg border p-3" aria-current={selectedReturnId === item.id ? "true" : undefined}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><strong>{item.returnNumber}</strong><p className="po-muted">{item.supplierName} · إيصال {item.sourceReceiptNumber} · {item.items.length} بند</p></div>
                  <span className={"po-status " + (item.status === "posted" ? "success" : "warning")}>{item.status === "posted" ? "مُرحّل للمخزون" : "مسودة"}</span>
                </div>
                <p className="po-muted">الكمية المرتجعة: {item.items.reduce((sum, line) => sum + line.quantityReturned, 0).toLocaleString("ar-YE")} · تكلفة المصدر: {costText(item.totalCost, item.currency)}</p>
                <p className="po-muted">السبب: {item.reason} · تاريخ الإنشاء: {dateText(item.createdAt)}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <SupplierReturnDocumentActions supplierReturn={item} />
                  {item.status === "draft" ? (
                    <button type="button" className="btn primary btn-sm" onClick={() => void postDraft(item)} disabled={busy}>
                      <Send size={14} /> ترحيل المرتجع وخصم المتاح
                    </button>
                  ) : (
                    <p className="po-muted">تاريخ الترحيل: {item.postedAt ? dateText(item.postedAt) : "غير مسجل"}. تتم مطابقة الإشعار الدائن من خلال مهمة المحاسبة المنفصلة.</p>
                  )}
                </div>
              </article>
            )) : <p className="po-muted">لا توجد مرتجعات موردين مسجلة.</p>
          }
        </section>
      </div>
    </section>
  );
}
