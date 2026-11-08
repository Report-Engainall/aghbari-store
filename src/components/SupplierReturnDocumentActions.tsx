import { useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import type { SupplierReturn } from "@/lib/supplier-returns";
import { downloadSupplierReturnWorkbookXlsx } from "@/lib/supplier-return-xlsx";
import { projectSupplierReturnDocument } from "@/lib/supplier-return-document";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function dateText(value: string): string {
  return new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function quantityText(value: number): string {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(value);
}

function moneyText(value: number, currency: string): string {
  return new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(value) + " " + currency;
}

export function renderSupplierReturnPrintHtml(source: SupplierReturn): string {
  const record = projectSupplierReturnDocument(source);
  const lines = record.items.map((item) => `
    <tr>
      <td>${escapeHtml(item.itemCode)}</td>
      <td>${escapeHtml(item.productName)}</td>
      <td>${escapeHtml(item.unit ?? "—")}</td>
      <td class="num">${escapeHtml(quantityText(item.sourceReceivedQuantity))}</td>
      <td class="num"><strong>${escapeHtml(quantityText(item.quantityReturned))}</strong></td>
      ${record.costsComplete ? `<td class="num">${escapeHtml(moneyText(item.unitCost!, record.currency))}</td>
      <td class="num">${escapeHtml(moneyText(item.lineTotal!, record.currency))}</td>` : ""}
    </tr>`).join("");

  const costHeaders = record.costsComplete ? "<th>تكلفة الوحدة</th><th>قيمة المرتجع</th>" : "";
  const total = record.costsComplete
    ? `<div class="total">إجمالي تكلفة المصدر: ${escapeHtml(moneyText(record.totalCost!, record.currency))}</div>`
    : '<div class="total">تكلفة المصدر غير مكتملة أو غير متطابقة؛ حُجبت القيم المالية.</div>';
  const stateNotice = record.status === "posted"
    ? "هذا المرتجع مُرحّل إلى المخزون. لا يثبت هذا المستند ترحيل إشعار دائن أو قيد محاسبي."
    : "هذه مسودة غير مُرحّلة؛ لا توجد حركة مخزون أو قيد محاسبي ناتج عن هذا المستند.";
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>مرتجع مورد ${escapeHtml(record.returnNumber)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #17242a; background: #fff; font: 11pt Arial, sans-serif; direction: rtl; }
    main { width: 100%; }
    h1 { margin: 0 0 4mm; font-size: 19pt; }
    .brand { margin: 0 0 7mm; color: #526268; font-size: 10pt; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 8mm; margin-bottom: 7mm; }
    .meta div { border-bottom: 1px solid #d5dcdf; padding: 2mm 0; }
    .meta strong { display: inline-block; min-width: 31mm; }
    .status { display: inline-block; border: 1px solid #879398; padding: 2mm 4mm; margin-bottom: 6mm; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th, td { border: 1px solid #879398; padding: 2.2mm; text-align: right; }
    th { background: #edf1f2; }
    .num { text-align: left; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .total { margin-top: 6mm; padding-top: 3mm; border-top: 2px solid #526268; font-weight: 700; }
    .reason { margin-top: 5mm; padding: 3mm; border: 1px solid #d5dcdf; }
    .notice { margin-top: 6mm; padding: 3mm; background: #f3f5f6; color: #34454b; font-size: 9pt; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 9mm; margin-top: 16mm; }
    .signatures div { border-top: 1px solid #65757a; padding-top: 2mm; text-align: center; }
    @media screen { body { padding: 16mm; } main { max-width: 190mm; margin: 0 auto; } }
  </style>
</head>
<body>
  <main>
    <h1>مستند مرتجع مورد — ${escapeHtml(record.returnNumber)}</h1>
    <p class="brand">متجر الأغبري | Aghbari Commerce — مستند مستخرج من سجل مرتجعات الموردين المحفوظ</p>
    <div class="status">${escapeHtml(record.statusLabel)}</div>
    <section class="meta">
      <div><strong>المورد:</strong> ${escapeHtml(record.supplierName)}</div>
      <div><strong>المخزن:</strong> ${escapeHtml(record.warehouseName)}</div>
      <div><strong>إيصال الاستلام:</strong> ${escapeHtml(record.sourceReceiptNumber)}</div>
      <div><strong>أمر الشراء:</strong> ${escapeHtml(record.purchaseOrderNumber)}</div>
      <div><strong>تاريخ الإنشاء:</strong> ${escapeHtml(dateText(record.createdAt))}</div>
      <div><strong>تاريخ الترحيل:</strong> ${escapeHtml(record.postedAt ? dateText(record.postedAt) : "غير مُرحّل")}</div>
      <div><strong>عدد البنود:</strong> ${record.items.length}</div>
      <div><strong>العملة المصدرية:</strong> ${escapeHtml(record.currency)}</div>
    </section>
    <table>
      <thead><tr><th>كود الصنف</th><th>الصنف</th><th>الوحدة</th><th>المستلم بالمصدر</th><th>الكمية المرتجعة</th>${costHeaders}</tr></thead>
      <tbody>${lines}</tbody>
    </table>
    ${total}
    <div class="reason"><strong>سبب المرتجع:</strong> ${escapeHtml(record.reason)}</div>
    <div class="notice">${escapeHtml(stateNotice)} إعادة الطباعة لا تنشئ مرتجعًا جديدًا ولا تعيد تنفيذ أي حركة.</div>
    <section class="signatures"><div>مسؤول المستودع</div><div>مسؤول المشتريات</div><div>الاعتماد</div></section>
    <p class="brand">وقت إعداد المستند: ${escapeHtml(dateText(record.generatedAt))}</p>
  </main>
</body>
</html>`;
}

export function SupplierReturnDocumentActions({ supplierReturn }: { supplierReturn: SupplierReturn }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function exportWorkbook() {
    setError("");
    setNotice("");
    try {
      if (!downloadSupplierReturnWorkbookXlsx(supplierReturn)) {
        throw new Error("المتصفح لا يدعم تنزيل ملف Excel في هذه الجلسة.");
      }
      setNotice("تم تجهيز ملف Excel للمرتجع المحفوظ دون تغيير حالة المخزون أو الحسابات.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف Excel للمرتجع.");
    }
  }

  function printDocument() {
    if (busy) return;
    const printWindow = window.open("", "_blank", "width=980,height=820");
    if (!printWindow) {
      setError("حُظر فتح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.");
      return;
    }
    printWindow.opener = null;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      printWindow.document.open();
      printWindow.document.write(renderSupplierReturnPrintHtml(supplierReturn));
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => {
        if (!printWindow.closed) printWindow.print();
      }, 250);
      setNotice("تم تجهيز مستند المرتجع المحفوظ للطباعة.");
    } catch (cause) {
      printWindow.close();
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز مستند المرتجع للطباعة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="مستند مرتجع المورد">
      <button type="button" className="btn outline btn-sm" onClick={printDocument} disabled={busy}>
        <Printer size={14} /> طباعة / PDF
      </button>
      <button type="button" className="btn outline btn-sm" onClick={exportWorkbook}>
        <FileSpreadsheet size={14} /> تصدير Excel
      </button>
      {error && <p className="po-error" role="alert">{error}</p>}
      {notice && <p className="po-notice" role="status">{notice}</p>}
    </div>
  );
}
