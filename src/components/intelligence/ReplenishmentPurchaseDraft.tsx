import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle, ShoppingCart } from "lucide-react";
import {
  createPurchaseOrder,
  fetchActiveInventoryWarehouses,
  fetchProducts,
  fetchSuppliers,
  type PurchaseOrderLineCommand,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { ProductWithInventory, Supplier } from "@/lib/types";
import type { ReplenishmentRecommendation } from "@/lib/intelligence/replenishment";
import type { PurchaseOrder } from "@/lib/purchase-orders";

type WarehouseOption = { id: string; name: string; code: string | null };
type DraftLine = {
  productId: string;
  productName: string;
  itemCode: string;
  unit: string;
  recommendedQuantity: number;
  quantity: string;
};
const formatQty = (value: number) => new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(value);

export function ReplenishmentPurchaseDraft({
  recommendations,
  onClose,
}: {
  recommendations: ReplenishmentRecommendation[];
  onClose: () => void;
}) {
  const { user } = useAuth();
  const canManage = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [blocked, setBlocked] = useState<string[]>([]);
  const [createdOrder, setCreatedOrder] = useState<PurchaseOrder | null>(null);

  const load = useCallback(async () => {
    if (!canManage) { setLoading(false); setError("تتطلب هذه العملية صلاحية المدير أو مدير المؤسسة."); return; }
    setLoading(true); setError("");
    try {
      const [nextSuppliers, nextWarehouses, nextProducts] = await Promise.all([
        fetchSuppliers(),
        fetchActiveInventoryWarehouses(),
        fetchProducts(),
      ]);
      const activeSuppliers = nextSuppliers.filter((item) => (item.status ?? "active") === "active" || item.is_active === true);
      const activeProducts = nextProducts.filter((item) => item.status === "active");
      const productByReference = new Map<string, ProductWithInventory>();
      for (const product of activeProducts) {
        const code = typeof product.item_code === "string" ? product.item_code.trim() : "";
        if (code && !productByReference.has(code)) productByReference.set(code, product);
        productByReference.set(product.id, product);
      }
      const nextLines: DraftLine[] = [];
      const nextBlocked: string[] = [];
      const seen = new Set<string>();
      for (const recommendation of recommendations) {
        if (recommendation.status !== "VERIFIED" || recommendation.action !== "RECOMMEND" ||
            recommendation.recommendedQuantity === null || recommendation.recommendedQuantity <= 0 ||
            !recommendation.quantityUnit?.trim()) {
          nextBlocked.push(recommendation.productRef + ": التوصية لم تعد مؤهلة للإنشاء.");
          continue;
        }
        const product = productByReference.get(recommendation.productRef);
        if (!product) {
          nextBlocked.push(recommendation.productRef + ": الصنف غير موجود أو غير نشط في الكتالوج الحالي.");
          continue;
        }
        if (!product.unit || product.unit.trim() !== recommendation.quantityUnit.trim()) {
          nextBlocked.push(recommendation.productRef + ": وحدة الصنف الحالية لا تطابق وحدة التوصية؛ تم حجب السطر.");
          continue;
        }
        if (seen.has(product.id)) {
          nextBlocked.push(recommendation.productRef + ": الصنف مكرر في المصدر؛ تم حجب النسخة المكررة.");
          continue;
        }
        const quantity = Math.ceil(recommendation.recommendedQuantity * 1000) / 1000;
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999999.999) {
          nextBlocked.push(recommendation.productRef + ": الكمية خارج الدقة أو السعة المدعومة لأمر الشراء.");
          continue;
        }
        seen.add(product.id);
        nextLines.push({
          productId: product.id,
          productName: product.name,
          itemCode: product.item_code,
          unit: product.unit,
          recommendedQuantity: recommendation.recommendedQuantity,
          quantity: String(quantity),
        });
      }
      setSuppliers(activeSuppliers);
      setWarehouses(nextWarehouses);
      setLines(nextLines);
      setBlocked(nextBlocked);
      setSupplierId("");
      setWarehouseId("");
      if (!nextLines.length) setError("لم يبقَ أي صنف صالح للتحويل بعد مطابقة التوصيات مع الكتالوج ووحدات القياس الحالية.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر تحميل مراجع الموردين والمخازن والكتالوج.");
    } finally {
      setLoading(false);
    }
  }, [canManage, recommendations]);

  useEffect(() => { void load(); }, [load]);

  async function createDraft() {
    if (busy || loading || createdOrder) return;
    if (!supplierId || !warehouseId) { setError("اختر المورد والمخزن صراحةً قبل إنشاء المسودة."); return; }
    if (!lines.length || lines.length > 100) { setError("لا توجد بنود صالحة لإنشاء أمر الشراء."); return; }
    const seen = new Set<string>();
    const purchaseLines: PurchaseOrderLineCommand[] = [];
    for (const line of lines) {
      const quantity = Number(line.quantity);
      if (seen.has(line.productId) || !Number.isFinite(quantity) || quantity <= 0 ||
          quantity > 999999999999.999 || Math.round(quantity * 1000) !== quantity * 1000) {
        setError("تحقق من الكميات: يجب أن تكون موجبة وبحد أقصى ثلاث منازل عشرية، دون تكرار صنف.");
        return;
      }
      seen.add(line.productId);
      purchaseLines.push({ product_id: line.productId, quantity, unit_cost: null });
    }
    const summary = lines.map((line) => line.productName + ": " + formatQty(Number(line.quantity)) + " " + line.unit).join("\n");
    if (!window.confirm(
      "سيُنشأ أمر شراء مسودة بهذه البنود:\n" + summary +
      "\n\nالمورد والمخزن المحددان سيحفظان في الأمر. التكلفة ستبقى غير مسجلة حتى ورود عرض/فاتورة موثقة. لن يُعتمد الأمر ولن يتغير المخزون. متابعة؟"
    )) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await createPurchaseOrder({
        supplierId,
        warehouseId,
        lines: purchaseLines,
        notes: [
          "مسودة من توصيات إعادة التوريد المثبتة.",
          "مصدر الكمية: المحرك الحتمي inventory.replenishment-target@1.0.0.",
          notes.trim(),
        ].filter(Boolean).join("\n").slice(0, 2000),
        idempotencyKey: "replenishment-" + globalThis.crypto.randomUUID().replace(/-/g, ""),
      });
      setCreatedOrder(result.purchase_order);
      setNotice(result.idempotent_replay
        ? "استُعيد أمر الشراء نفسه بمفتاح منع التكرار؛ لم يُنشأ أمر مكرر."
        : "تم إنشاء مسودة أمر الشراء من الكميات التي راجعتها. لم يُرسل للمورد ولم يُرحّل المخزون.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء مسودة أمر الشراء.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="replenishment-purchase-title" dir="rtl"
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-3">
      <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border bg-background p-4 shadow-xl">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 id="replenishment-purchase-title" className="font-semibold"><ShoppingCart size={17} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} /> إنشاء مسودة من توصيات إعادة التوريد</h3>
            <p className="mt-1 text-xs text-muted-foreground">الكميات من محرك الأدلة؛ تُقرب صعودًا إلى 0.001 من وحدة الصنف المدعومة. الأسعار غير مفترضة، واختيار المورد والمخزن ومراجعة المسودة قرار يدوي.</p>
          </div>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>إغلاق</button>
        </header>

        {error && <p role="alert" className="mt-3 rounded-lg border border-destructive/40 p-3 text-sm"><AlertTriangle size={14} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} />{error}</p>}
        {notice && <p role="status" className="mt-3 rounded-lg border p-3 text-sm"><CheckCircle2 size={14} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} />{notice}</p>}
        {blocked.length > 0 && <div className="mt-3 rounded-lg border border-amber-500/40 p-3 text-sm">
          <strong>أسطر مستبعدة حفاظًا على تطابق البيانات؛ يمكن المتابعة بالبنود الصالحة فقط</strong>
          <ul className="mt-2 list-disc space-y-1 ps-5">{blocked.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>}

        {loading ? <p role="status" className="py-8 text-sm text-muted-foreground"><LoaderCircle className="me-2 inline animate-spin" size={15} />جار مطابقة التوصيات مع الموردين والمخازن والكتالوج...</p> : createdOrder ? (
          <div className="mt-4 rounded-lg border p-4">
            <p className="font-semibold">مسودة أمر الشراء: {createdOrder.purchase_order_number}</p>
            <p className="mt-1 text-sm text-muted-foreground">الحالة: مسودة. لم يتم إرسالها أو استلام أي كمية.</p>
            <a className="btn primary mt-3 inline-flex" href="/admin/purchase-orders">فتح سجل أوامر الشراء ومراجعة المسودة</a>
          </div>
        ) : (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr><th className="p-2 text-right">الصنف</th><th className="p-2 text-right">الكمية الموصى بها</th><th className="p-2 text-right">الكمية في المسودة</th><th className="p-2 text-right">التكلفة</th></tr></thead>
                <tbody>
                  {lines.map((line) => <tr key={line.productId} className="border-t">
                    <td className="p-2">{line.productName}<small className="block text-muted-foreground">{line.itemCode} · {line.unit}</small></td>
                    <td className="p-2">{formatQty(line.recommendedQuantity)}</td>
                    <td className="p-2"><input aria-label={"كمية " + line.productName} type="number" min="0.001" step="0.001" value={line.quantity} disabled={busy} className="w-28 rounded border bg-background p-2" onChange={(event) => setLines((old) => old.map((item) => item.productId === line.productId ? { ...item, quantity: event.target.value } : item))} /></td>
                    <td className="p-2 text-muted-foreground">غير مسجلة</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">المورد
                <select className="rounded border bg-background p-2" value={supplierId} onChange={(event) => setSupplierId(event.target.value)} disabled={busy}>
                  <option value="">اختر المورد</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.supplier_code ? " · " + supplier.supplier_code : ""}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium">المخزن المستلم
                <select className="rounded border bg-background p-2" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} disabled={busy}>
                  <option value="">اختر المخزن</option>
                  {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}{warehouse.code ? " · " + warehouse.code : ""}</option>)}
                </select>
              </label>
            </div>
            <label className="mt-3 grid gap-1 text-sm font-medium">ملاحظات المسودة (اختياري)
              <textarea className="rounded border bg-background p-2" maxLength={1500} rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} disabled={busy} />
            </label>
            {suppliers.length === 0 || warehouses.length === 0 ? <p className="mt-3 text-sm text-amber-700">يلزم مورد نشط ومخزن نشط لإنشاء المسودة.</p> : null}
            <footer className="mt-4 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>إلغاء</button>
              <button type="button" className="btn primary" onClick={() => void createDraft()} disabled={busy || !lines.length || !suppliers.length || !warehouses.length}>
                {busy ? "جار حفظ المسودة..." : "تأكيد وإنشاء مسودة أمر الشراء"}
              </button>
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
