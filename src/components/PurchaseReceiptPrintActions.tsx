import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import {
  fetchPurchaseReceiptPrintDocument,
  fetchPurchaseReceiptPrintHistory,
  type PurchaseReceiptHistoryPage,
  type PurchaseReceiptPrintDocument,
} from "@/lib/purchase-receipt-print";

const PAGE_SIZE = 20;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function SavedReceiptMeta({ receivedAt, itemCount }: { receivedAt: string; itemCount: number }) {
  return (
    <div style={{ color: "var(--muted-foreground)", fontSize: 12 }}>
      {formatDate(receivedAt)} · {itemCount} بنود مستلمة
    </div>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "تاريخ غير صالح";
}

function formatQuantity(value: string): string {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(Number(value));
}

function formatMoney(value: string, currency: string): string {
  return new Intl.NumberFormat("ar-YE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value)) + " " + (currency === "YER" ? "ر.ي" : currency);
}

export function renderPurchaseReceiptPrintHtml(receipt: PurchaseReceiptPrintDocument): string {
  const costs = receipt.costs_complete;
  const itemRows = receipt.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.item_code)}</td>
      <td>${escapeHtml(item.product_name)}</td>
      <td>${escapeHtml(item.unit ?? "—")}</td>
      <td class="number">${escapeHtml(formatQuantity(item.quantity_received))}</td>
      <td>${escapeHtml(item.batch_number ?? "غير مسجل")}</td>
      <td>${escapeHtml(item.expiry_date ?? "غير مسجل")}</td>
      ${costs ? `<td class="number">${escapeHtml(formatMoney(item.unit_cost!, receipt.currency))}</td>
      <td class="number">${escapeHtml(formatMoney(item.line_total!, receipt.currency))}</td>` : ""}
    </tr>`).join("");

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>إيصال استلام ${escapeHtml(receipt.receipt_number)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #17242a; background: #fff; font: 12pt Arial, sans-serif; direction: rtl; }
    main { width: 100%; }
    h1 { margin: 0 0 5mm; font-size: 19pt; }
    .subtitle { color: #526268; margin: 0 0 8mm; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm 8mm; margin-bottom: 8mm; }
    .meta div { border-bottom: 1px solid #d5dcdf; padding: 2mm 0; }
    .meta strong { display: inline-block; min-width: 30mm; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th, td { border: 1px solid #879398; padding: 2.3mm; text-align: right; }
    th { background: #edf1f2; }
    .number { text-align: left; font-variant-numeric: tabular-nums; }
    .total { margin-top: 7mm; padding-top: 4mm; border-top: 2px solid #526268; font-weight: 700; font-size: 13pt; }
    .disclaimer { margin-top: 8mm; color: #526268; font-size: 9pt; }
    @media screen { body { padding: 16mm; } main { max-width: 190mm; margin: 0 auto; } }
  </style>
</head>
<body>
  <main>
    <h1>إيصال استلام مشتريات — ${escapeHtml(receipt.receipt_number)}</h1>
    <p class="subtitle">مستند مستخرج من سجل إيصالات الاستلام المحفوظ</p>
    <section class="meta">
      <div><strong>أمر الشراء:</strong> ${escapeHtml(receipt.purchase_order_number)}</div>
      <div><strong>تاريخ الاستلام:</strong> ${escapeHtml(formatDate(receipt.received_at))}</div>
      <div><strong>المورد:</strong> ${escapeHtml(receipt.supplier_name)}</div>
      <div><strong>المخزن:</strong> ${escapeHtml(receipt.warehouse_name)}</div>
    </section>
    <table>
      <thead><tr>
        <th>رمز الصنف</th><th>الصنف</th><th>الوحدة</th><th>الكمية المستلمة بهذه الدفعة</th><th>رقم الدفعة</th><th>تاريخ الانتهاء</th>
        ${costs ? "<th>تكلفة الوحدة</th><th>إجمالي البند</th>" : ""}
      </tr></thead>
      <tbody>${itemRows}</tbody>
    </table>
    ${costs
      ? `<p class="total">إجمالي تكلفة الإيصال: ${escapeHtml(formatMoney(receipt.received_cost!, receipt.currency))}</p>`
      : '<p class="total">التكاليف المصدرية غير مكتملة؛ لم تُعرض أي قيمة مالية.</p>'}
    <p class="disclaimer">إعادة طباعة لسجل محفوظ. لا تنشئ الطباعة إيصالًا جديدًا أو حركة مخزون أو قيدًا محاسبيًا.</p>
  </main>
</body>
</html>`;
}

export function PurchaseReceiptPrintActions({ purchaseOrderId }: { purchaseOrderId: string }) {
  const [pageOffset, setPageOffset] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [history, setHistory] = useState<PurchaseReceiptHistoryPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyReceiptId, setBusyReceiptId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setHistory(null);
    fetchPurchaseReceiptPrintHistory(purchaseOrderId, { limit: PAGE_SIZE, offset: pageOffset })
      .then((result) => { if (active) setHistory(result); })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل إيصالات الاستلام.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [purchaseOrderId, pageOffset, refreshVersion]);

  async function printSavedReceipt(receiptId: string) {
    if (busyReceiptId) return;
    const printWindow = window.open("", "_blank", "width=980,height=820");
    if (!printWindow) {
      setError("حُظر فتح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.");
      return;
    }
    printWindow.opener = null;
    setBusyReceiptId(receiptId);
    setError("");
    setNotice("");
    try {
      const receipt = await fetchPurchaseReceiptPrintDocument(receiptId);
      if (printWindow.closed) throw new Error("أُغلقت نافذة الطباعة قبل اكتمال تجهيز المستند.");
      printWindow.document.open();
      printWindow.document.write(renderPurchaseReceiptPrintHtml(receipt));
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => { if (!printWindow.closed) printWindow.print(); }, 250);
      setNotice("تم تجهيز الإيصال المحفوظ للطباعة دون تغيير المخزون أو الحسابات.");
    } catch (cause) {
      printWindow.close();
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز إيصال الاستلام المحفوظ.");
    } finally {
      setBusyReceiptId(null);
    }
  }

  return (
    <section className="panel" dir="rtl" aria-label="سجل إيصالات الاستلام">
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div><h3 style={{ margin: 0 }}>سجل إيصالات الاستلام المحفوظة</h3><p style={{ margin: "4px 0 0", color: "var(--muted-foreground)", fontSize: 12 }}>يمكن إعادة طباعة أي إيصال دون إعادة ترحيل الكميات.</p></div>
        <button type="button" className="btn outline" onClick={() => setRefreshVersion((value) => value + 1)} disabled={loading || busyReceiptId !== null}>
          <RefreshCw size={15} /> تحديث السجل
        </button>
      </header>
      {loading && <p role="status">جار تحميل سجل الإيصالات…</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && history?.receipts.length === 0 && <p>لا توجد إيصالات استلام محفوظة لهذا الأمر.</p>}
      {!loading && history?.receipts.map((receipt) => (
        <article key={receipt.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 280px" }}>
            <strong>{receipt.receipt_number}</strong>
            <SavedReceiptMeta receivedAt={receipt.received_at} itemCount={receipt.item_count} />
            {receipt.items.length > 0 ? (
              <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: "pointer", fontSize: 12 }}>عرض دفعات الأصناف وتواريخ الانتهاء</summary>
                <ul style={{ margin: "6px 0", paddingInlineStart: 20, fontSize: 12 }}>
                  {receipt.items.map((item, index) => (
                    <li key={item.item_code + ":" + index}>
                      {item.product_name} — {formatQuantity(item.quantity_received)} {item.unit ?? ""}
                      {" · الدفعة: " + (item.batch_number ?? "غير مسجلة")}
                      {" · الانتهاء: " + (item.expiry_date ?? "غير مسجل")}
                    </li>
                  ))}
                </ul>
              </details>
            ) : <small style={{ display: "block", color: "var(--muted-foreground)" }}>تفاصيل الدفعة غير متاحة في هذا السجل القديم.</small>}
          </div>
          <button type="button" className="btn outline" onClick={() => void printSavedReceipt(receipt.id)} disabled={busyReceiptId !== null}>
            <Printer size={15} /> {busyReceiptId === receipt.id ? "جار تجهيز الإيصال…" : "طباعة الإيصال"}
          </button>
        </article>
      ))}
      {history && history.total_count > PAGE_SIZE && (
        <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 10 }}>
          <span style={{ fontSize: 12 }}>الإيصالات: {history.total_count}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="btn outline" onClick={() => setPageOffset((value) => Math.max(0, value - PAGE_SIZE))} disabled={loading || pageOffset === 0}>السابق</button>
            <button type="button" className="btn outline" onClick={() => setPageOffset((value) => value + PAGE_SIZE)} disabled={loading || !history.has_more}>التالي</button>
          </div>
        </footer>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
