import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, ClipboardList, Download, Plus, Printer, RefreshCw, Trophy } from "lucide-react";
import {
  fetchActiveInventoryWarehouses,
  fetchProducts,
  fetchSuppliers,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ProductWithInventory, Supplier } from "@/lib/types";
import {
  awardSupplierQuote,
  createSupplierQuote,
  fetchSupplierQuotes,
  type SupplierQuote,
  type SupplierQuoteLineInput,
} from "@/lib/supplier-quotes";
import type { PurchaseOrder } from "@/lib/purchase-orders";
import { projectSupplierQuoteComparisonDocument, type SupplierQuoteComparisonDocument } from "@/lib/supplier-quote-comparison-print";
import { downloadSupplierQuoteComparisonWorkbookXlsx } from "@/lib/supplier-quote-comparison-xlsx";
import { SupplierQuoteComparisonPrintSheet } from "@/components/SupplierQuoteComparisonPrintSheet";

type WarehouseOption = { id: string; name: string; code: string | null };
type DraftLine = { productId: string; quantity: string; unitCost: string };
const emptyLine = (): DraftLine => ({ productId: "", quantity: "1", unitCost: "" });
const numberText = (value: number) => new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(value);
const dateText = (value: string | null) => value
  ? new Date(value + "T00:00:00").toLocaleDateString("ar-YE")
  : "غير محدد";
const statusText: Record<string, string> = {
  received: "قابل للمقارنة والاختيار",
  awarded: "تم تحويله إلى أمر شراء",
  expired: "منتهي الصلاحية",
};

export function SupplierQuoteWorkspace({ onAwarded }: {
  onAwarded?: (order: PurchaseOrder) => Promise<void> | void;
}) {
  const { user } = useAuth();
  const canManage = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  const [quotes, setQuotes] = useState<SupplierQuote[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<ProductWithInventory[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [supplierReference, setSupplierReference] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [deliveryDays, setDeliveryDays] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([emptyLine()]);
  const [warehouseId, setWarehouseId] = useState("");
  const [awardNotes, setAwardNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [printDocument, setPrintDocument] = useState<SupplierQuoteComparisonDocument | null>(null);

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    setError("");
    try {
      const [nextQuotes, nextSuppliers, nextProducts, nextWarehouses] = await Promise.all([
        fetchSupplierQuotes(),
        fetchSuppliers(),
        fetchProducts(),
        fetchActiveInventoryWarehouses(),
      ]);
      setQuotes(nextQuotes);
      setSuppliers(nextSuppliers.filter((item) => item.status === "active" || item.is_active === true));
      setProducts(nextProducts.filter((item) => item.status === "active"));
      setWarehouses(nextWarehouses);
      setSupplierId((current) => current || nextSuppliers.find((item) => item.status === "active")?.id || "");
      setWarehouseId((current) => current || nextWarehouses[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل عروض الموردين والمراجع التشغيلية.");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  useEffect(() => { void load(); }, [load]);

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
    body.setAttribute("data-print-mode", "supplier-quote-comparison");
    window.addEventListener("afterprint", restore, { once: true });
    const timer = window.setTimeout(() => {
      try {
        window.print();
      } catch {
        setError("تعذر فتح نافذة طباعة مقارنة عروض الموردين.");
        restore();
      }
    }, 80);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", restore);
      if (!restored && body.getAttribute("data-print-mode") === "supplier-quote-comparison") {
        if (previousMode === null) body.removeAttribute("data-print-mode");
        else body.setAttribute("data-print-mode", previousMode);
      }
    };
  }, [printDocument]);

  const validOffers = useMemo(
    () => quotes.filter((quote) => quote.status === "received"),
    [quotes],
  );
  const lowestPrice = useMemo(() => {
    const result = new Map<string, number>();
    for (const quote of validOffers) {
      for (const line of quote.items) {
        const current = result.get(line.product_id);
        if (current === undefined || line.unit_cost < current) result.set(line.product_id, line.unit_cost);
      }
    }
    return result;
  }, [validOffers]);

  async function saveQuote() {
    if (busy) return;
    const lines: SupplierQuoteLineInput[] = [];
    const seen = new Set<string>();
    for (const [index, line] of draftLines.entries()) {
      if (!line.productId) { setError("اختر الصنف في السطر " + (index + 1) + "."); return; }
      if (seen.has(line.productId)) { setError("لا تكرر الصنف في العرض؛ ادمج الكمية في سطر واحد."); return; }
      seen.add(line.productId);
      const quantity = Number(line.quantity);
      const unitCost = Number(line.unitCost);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999999.999 ||
          Math.round(quantity * 1000) !== quantity * 1000) {
        setError("كمية الصنف في السطر " + (index + 1) + " يجب أن تكون موجبة وبحد أقصى ثلاث منازل عشرية.");
        return;
      }
      if (line.unitCost.trim() === "" || !Number.isFinite(unitCost) || unitCost < 0 ||
          Math.round(unitCost * 100) !== unitCost * 100) {
        setError("تكلفة الوحدة في السطر " + (index + 1) + " مطلوبة وبحد أقصى منزلتين عشريتين.");
        return;
      }
      lines.push({ product_id: line.productId, quantity, unit_cost: unitCost });
    }
    if (!supplierId || !quoteNumber.trim()) { setError("اختر المورد وأدخل رقم العرض الصادر منه."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await createSupplierQuote({
        supplierId,
        quoteNumber,
        supplierReference,
        validUntil,
        deliveryDays: deliveryDays.trim() === "" ? null : Number(deliveryDays),
        paymentTerms,
        notes,
        lines,
        idempotencyKey: "sq-" + globalThis.crypto.randomUUID().replace(/-/g, ""),
      });
      await load();
      setQuoteNumber(""); setSupplierReference(""); setValidUntil(""); setDeliveryDays("");
      setPaymentTerms(""); setNotes(""); setDraftLines([emptyLine()]);
      setNotice(result.idempotent_replay
        ? "تم استرجاع العرض المسجل نفسه؛ لم يُنشأ سجل مكرر."
        : "تم تسجيل عرض المورد. أُضيفت أسعاره للمقارنة ولم يتغير المخزون أو دفتر الأستاذ.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تسجيل عرض المورد.");
    } finally {
      setBusy(false);
    }
  }

  function createComparisonDocument(): SupplierQuoteComparisonDocument {
    return projectSupplierQuoteComparisonDocument(quotes);
  }

  function exportComparison() {
    setError("");
    if (loading || quotes.length === 0) {
      setError("حمّل عروض الموردين المحفوظة قبل استخراج المقارنة.");
      return;
    }
    try {
      downloadSupplierQuoteComparisonWorkbookXlsx(createComparisonDocument());
      setNotice("تم تصدير مقارنة العروض المحفوظة؛ بقيت العملات منفصلة ولم تُصدر ملاحظات العروض الداخلية.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف مقارنة عروض الموردين.");
    }
  }

  function printComparison() {
    setError("");
    if (loading || quotes.length === 0 || typeof window === "undefined" || typeof window.print !== "function") {
      setError("لا تتوفر لقطة عروض صالحة أو وظيفة الطباعة في هذه البيئة.");
      return;
    }
    try {
      setPrintDocument(createComparisonDocument());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز مقارنة عروض الموردين للطباعة.");
    }
  }

  async function award(quote: SupplierQuote) {
    if (busy || quote.status !== "received") return;
    if (!warehouseId) { setError("اختر المخزن الذي سيستقبل أمر الشراء."); return; }
    if (!window.confirm("سيُنشأ أمر شراء مسودة من العرض " + quote.quote_number + " لدى " + quote.supplier_name + ". لن يُرسل للمورد ولن يُرحّل مخزون قبل الاستلام الفعلي. متابعة؟")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await awardSupplierQuote({ quoteId: quote.id, warehouseId, notes: awardNotes });
      await load();
      await onAwarded?.(result.purchase_order);
      setNotice(result.idempotent_replay
        ? "هذا العرض مرتبط مسبقًا بأمر الشراء " + result.purchase_order.purchase_order_number + "؛ لم يُنشأ أمر ثانٍ."
        : "تم اختيار العرض وإنشاء مسودة أمر الشراء " + result.purchase_order.purchase_order_number + ". راجعها ثم اعتمدها من سجل أوامر الشراء.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحويل عرض المورد إلى أمر شراء.");
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) return null;

  return (
    <>
      <section className="panel" dir="rtl" style={{ display: "grid", gap: 14 }}>
      <header className="panel-head">
        <div>
          <h2><ClipboardList size={18} style={{ verticalAlign: "middle", marginInlineEnd: 7 }} /> عروض الموردين ومقارنة الأسعار</h2>
          <p className="po-muted">سجل عروض الموردين الواردة وقارن تكلفة الصنف ومدة التوريد وشروط الدفع قبل إنشاء أمر الشراء. الأسعار بعملة المنشأة الأساسية، ولا يوجد تحويل عملات تقديري.</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          <button className="btn secondary" type="button" onClick={exportComparison} disabled={loading || busy || quotes.length === 0}>
            <Download size={15} /> تصدير مقارنة Excel
          </button>
          <button className="btn secondary" type="button" onClick={printComparison} disabled={loading || busy || quotes.length === 0}>
            <Printer size={15} /> طباعة / PDF
          </button>
          <button className="btn secondary" type="button" onClick={() => void load()} disabled={loading || busy}>
            <RefreshCw size={15} /> تحديث العروض
          </button>
        </div>
      </header>

      {error && <div className="po-error" role="alert"><AlertTriangle size={15} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} />{error}</div>}
      {notice && <div className="po-notice" role="status"><CheckCircle2 size={15} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} />{notice}</div>}

      <details open={quotes.length === 0} className="no-print">
        <summary style={{ cursor: "pointer", fontWeight: 800, paddingBlock: 6 }}>تسجيل عرض مورد جديد</summary>
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <div className="po-create-grid">
            <label className="po-field">المورد
              <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)} disabled={busy || !suppliers.length}>
                <option value="">اختر موردًا نشطًا</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.supplier_code ? " · " + supplier.supplier_code : ""}</option>)}
              </select>
            </label>
            <label className="po-field">رقم العرض لدى المورد
              <input value={quoteNumber} onChange={(event) => setQuoteNumber(event.target.value)} maxLength={80} placeholder="مثال: Q-2026-015" disabled={busy} />
            </label>
            <label className="po-field">مرجع/رقم مستند المورد (اختياري)
              <input value={supplierReference} onChange={(event) => setSupplierReference(event.target.value)} maxLength={120} disabled={busy} />
            </label>
            <label className="po-field">صالح حتى
              <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} disabled={busy} />
            </label>
            <label className="po-field">مدة التوريد (أيام)
              <input type="number" min="0" max="3650" step="1" value={deliveryDays} onChange={(event) => setDeliveryDays(event.target.value)} placeholder="غير محددة" disabled={busy} />
            </label>
            <label className="po-field">شروط الدفع
              <input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} maxLength={1000} placeholder="نقدًا، آجل 30 يومًا..." disabled={busy} />
            </label>
          </div>
          <div className="po-lines">
            {draftLines.map((line, index) => (
              <div className="po-line" key={index}>
                <label className="po-field wide">الصنف
                  <select value={line.productId} onChange={(event) => setDraftLines((old) => old.map((item, current) => current === index ? { ...item, productId: event.target.value } : item))} disabled={busy}>
                    <option value="">اختر الصنف</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.item_code}</option>)}
                  </select>
                </label>
                <label className="po-field">الكمية المعروضة
                  <input type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setDraftLines((old) => old.map((item, current) => current === index ? { ...item, quantity: event.target.value } : item))} disabled={busy} />
                </label>
                <label className="po-field">تكلفة الوحدة
                  <input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => setDraftLines((old) => old.map((item, current) => current === index ? { ...item, unitCost: event.target.value } : item))} disabled={busy} />
                </label>
                <button type="button" className="btn outline" onClick={() => setDraftLines((old) => old.length > 1 ? old.filter((_, current) => current !== index) : old)} disabled={busy || draftLines.length === 1}>حذف</button>
              </div>
            ))}
          </div>
          <div className="po-actions">
            <button type="button" className="btn outline" onClick={() => setDraftLines((old) => old.length < 100 ? [...old, emptyLine()] : old)} disabled={busy || draftLines.length >= 100}><Plus size={15} /> إضافة صنف</button>
            <button type="button" className="btn primary" onClick={() => void saveQuote()} disabled={busy || loading || !suppliers.length || !products.length}><CheckCircle2 size={15} /> حفظ العرض للمقارنة</button>
          </div>
          {(!suppliers.length || !products.length) && <p className="po-muted">يلزم وجود مورد نشط وصنف نشط لتسجيل عرض حقيقي.</p>}
          <label className="po-field">ملاحظات العرض
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} disabled={busy} />
          </label>
        </div>
      </details>

      <div style={{ display: "grid", gap: 9 }}>
        <div className="panel-head"><div><h3>مقارنة عروض الأسعار حسب الصنف</h3><p className="po-muted">تظهر أقل تكلفة وحدة مسجلة بين العروض السارية للصنف نفسه؛ لا تُفاضل المنصة على الجودة أو شروط لم تُسجل.</p></div></div>
        {loading ? <p role="status" className="po-muted">جار تحميل العروض...</p> :
          quotes.length === 0 ? <p className="po-muted">لا توجد عروض مسجلة حتى الآن. أضف بيانات عرض مورد حقيقي للبدء بالمقارنة.</p> :
          <div className="po-table-wrap">
            <table>
              <thead><tr><th>الصنف / الرمز</th><th>المورد</th><th>رقم العرض</th><th>الكمية</th><th>تكلفة الوحدة</th><th>الإجمالي</th><th>التوريد</th><th>الصلاحية</th><th>المقارنة</th></tr></thead>
              <tbody>
                {quotes.flatMap((quote) => quote.items.map((line) => {
                  const min = lowestPrice.get(line.product_id);
                  const isLowest = quote.status === "received" && min !== undefined && line.unit_cost === min;
                  return (
                    <tr key={quote.id + ":" + line.id}>
                      <td>{line.product_name}<small style={{ display: "block", color: "var(--muted-foreground)" }}>{line.item_code}</small></td>
                      <td>{quote.supplier_name}</td>
                      <td>{quote.quote_number}</td>
                      <td>{numberText(line.quantity_quoted)} {line.unit || ""}</td>
                      <td>{numberText(line.unit_cost)} {quote.currency}</td>
                      <td>{numberText(line.line_total)} {quote.currency}</td>
                      <td>{quote.delivery_days === null ? "غير محدد" : quote.delivery_days + " يوم"}</td>
                      <td>{dateText(quote.valid_until)}</td>
                      <td>{isLowest ? <strong style={{ color: "var(--aghbari-brand,var(--primary))" }}><Trophy size={13} style={{ verticalAlign: "middle" }} /> الأقل سعرًا</strong> : quote.status === "awarded" ? "مختار" : quote.status === "expired" ? "منتهي" : "—"}</td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        }
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <div className="panel-head"><div><h3>اختيار العرض وإنشاء أمر الشراء</h3><p className="po-muted">التحويل ينشئ مسودة فقط باستخدام كمية العرض والتكلفة المثبتة؛ الاعتماد والاستلام الفعلي يظلان في تدفق الشراء الحالي.</p></div></div>
        <div className="po-create-grid">
          <label className="po-field">المخزن المستلم
            <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} disabled={busy || !warehouses.length}>
              <option value="">اختر مخزنًا نشطًا</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code ? " · " + warehouse.code : ""}</option>)}
            </select>
          </label>
          <label className="po-field">ملاحظة تضاف إلى أمر الشراء (اختياري)
            <input value={awardNotes} onChange={(event) => setAwardNotes(event.target.value)} maxLength={1900} disabled={busy} />
          </label>
        </div>
        {quotes.map((quote) => {
          const total = quote.items.reduce((sum, item) => sum + item.line_total, 0);
          const canAward = quote.status === "received";
          return (
            <article key={quote.id} className="po-card">
              <div className="po-card-top">
                <div><strong>{quote.supplier_name} · {quote.quote_number}</strong><div className="po-muted">{statusText[quote.status] || quote.status} · {quote.items.length} صنف · {numberText(total)} {quote.currency}</div></div>
                <button type="button" className="btn primary" onClick={() => void award(quote)} disabled={busy || loading || !canAward || !warehouseId}>
                  {quote.status === "awarded" ? "تم إنشاء أمر الشراء" : quote.status === "expired" ? "عرض منتهي" : "اختيار العرض وإنشاء مسودة"}
                </button>
              </div>
              <p className="po-muted">مدة التوريد: {quote.delivery_days === null ? "غير محددة" : quote.delivery_days + " يوم"} · شروط الدفع: {quote.payment_terms || "غير مسجلة"} · صالح حتى: {dateText(quote.valid_until)}</p>
              {quote.purchase_order_id && <p className="po-muted">مرتبط بأمر الشراء: {quote.purchase_order_id}</p>}
              {quote.notes && <p className="po-muted">{quote.notes}</p>}
            </article>
          );
        })}
        {!warehouses.length && <p className="po-muted">لا يوجد مخزن نشط؛ لا يمكن تحويل العرض إلى أمر شراء قبل تهيئة المخزن.</p>}
      </div>
      </section>
      {printDocument && typeof document !== "undefined"
        ? createPortal(<SupplierQuoteComparisonPrintSheet document={printDocument} />, document.body)
        : null}
    </>
  );
}
