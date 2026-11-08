import { useState } from "react";
import { FileSpreadsheet, Printer } from "lucide-react";
import type { SupplierReturnCreditNoteRecord } from "@/lib/supplier-credit-notes";
import { downloadSupplierCreditNoteWorkbookXlsx } from "@/lib/supplier-credit-note-xlsx";
import { projectSupplierCreditNoteDocument } from "@/lib/supplier-credit-note-document";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}
function dateText(value: string): string {
  return new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function moneyText(value: number | null, currency: string): string {
  return value === null ? "غير متاح" :
    new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) + " " + currency;
}

export function renderSupplierCreditNotePrintHtml(source: SupplierReturnCreditNoteRecord): string {
  const record = projectSupplierCreditNoteDocument(source);
  const variance = record.varianceConsistent
    ? moneyText(record.varianceAmount, record.currency)
    : "محجوب — الفرق المصدر لا يتطابق مع المبلغين";
  const eventRows = record.events.length ? record.events.map((event) => `
    <tr><td>${escapeHtml(event.documentNumber)}</td><td>${escapeHtml(event.actionLabel)}</td>
      <td>${escapeHtml(event.reason ?? "—")}</td><td>${escapeHtml(dateText(event.createdAt))}</td></tr>`).join("")
    : '<tr><td colspan="4">لا توجد أحداث مراجعة مسجلة.</td></tr>';
  const journalNotice = record.journalEntryNumber
    ? "قيد إشعار المورد " + record.journalEntryNumber + ": " + record.journalStatusLabel + "."
    : "لم يُنشأ قيد لإشعار المورد.";
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>مطابقة إشعار مورد — ${escapeHtml(record.returnNumber)}</title>
<style>
@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}
body{margin:0;color:#17242a;background:#fff;font:10.5pt Arial,sans-serif;direction:rtl}
main{width:100%}h1{font-size:18pt;margin:0 0 3mm}.brand{color:#526268;margin:0 0 7mm;font-size:9pt}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:3mm 8mm;margin-bottom:7mm}
.meta div{padding:2mm 0;border-bottom:1px solid #d5dcdf}.meta strong{display:inline-block;min-width:32mm}
.section{margin-top:6mm;font-weight:700}.metrics{display:grid;grid-template-columns:1fr 1fr;gap:4mm;margin-top:4mm}
.metric{padding:3mm;border:1px solid #d5dcdf;border-radius:2mm}.metric small{display:block;color:#526268;margin-bottom:1mm}
table{width:100%;border-collapse:collapse;margin-top:3mm}thead{display:table-header-group}tr{break-inside:avoid}
th,td{border:1px solid #879398;padding:2mm;text-align:right;vertical-align:top}th{background:#edf1f2}
.notice{margin-top:6mm;padding:3mm;background:#f3f5f6;color:#34454b;font-size:9pt}
.signatures{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8mm;margin-top:15mm}
.signatures div{border-top:1px solid #65757a;padding-top:2mm;text-align:center}
@media screen{body{padding:15mm}main{max-width:190mm;margin:auto}}
</style></head>
<body><main>
<h1>مستند مطابقة إشعار المورد — ${escapeHtml(record.returnNumber)}</h1>
<p class="brand">متجر الأغبري | Aghbari Commerce — تقرير مالي مستخرج من سجل المطابقة المحفوظ</p>
<section class="meta">
<div><strong>المورد:</strong> ${escapeHtml(record.supplierName)}</div>
<div><strong>رقم المرتجع:</strong> ${escapeHtml(record.returnNumber)}</div>
<div><strong>إيصال المصدر:</strong> ${escapeHtml(record.sourceReceiptNumber)}</div>
<div><strong>أمر الشراء:</strong> ${escapeHtml(record.purchaseOrderNumber)}</div>
<div><strong>ترحيل المرتجع:</strong> ${escapeHtml(dateText(record.postedAt))}</div>
<div><strong>إشعار المورد:</strong> ${escapeHtml(record.creditNoteNumber ?? "لم يسجل")}</div>
<div><strong>تاريخ الإشعار:</strong> ${escapeHtml(record.creditNoteIssuedOn ?? "—")}</div>
<div><strong>حالة المطابقة:</strong> ${escapeHtml(record.creditNoteStatusLabel)}</div>
</section>
<div class="section">ملخص المبالغ — ${escapeHtml(record.currency)}</div>
<div class="metrics">
<div class="metric"><small>تكلفة المرتجع المصدرية</small><strong>${escapeHtml(moneyText(record.sourceAmount, record.currency))}</strong></div>
<div class="metric"><small>المبلغ الفعلي في إشعار المورد</small><strong>${escapeHtml(moneyText(record.actualAmount, record.currency))}</strong></div>
<div class="metric"><small>الفرق (فعلي − مصدر)</small><strong>${escapeHtml(variance)}</strong></div>
<div class="metric"><small>حساب حالة القيد</small><strong>${escapeHtml(record.journalStatusLabel)}</strong></div>
</div>
<div class="section">المصدر المحاسبي</div>
<p>قيد إيصال المصدر: ${escapeHtml(record.sourceJournalEntryNumber ?? "غير مربوط")} — ${escapeHtml(record.sourceJournalStatusLabel)}</p>
<p>${escapeHtml(journalNotice)}</p>
<div class="section">سجل المراجعة والاعتماد</div>
<table><thead><tr><th>رقم إشعار المورد</th><th>الحدث</th><th>سبب القرار</th><th>التاريخ</th></tr></thead>
<tbody>${eventRows}</tbody></table>
<div class="notice">هذا المستند يعرض بيانات المطابقة كما وردت من الخادم. لا ينشئ إشعارًا أو قيدًا. حالة "مسودة" تعني أن القيد غير مرحّل؛ ولا تُعامل الموافقة على فرق المبلغ كترحيل محاسبي. ${record.varianceReviewReason ? "سبب مراجعة الفرق: " + escapeHtml(record.varianceReviewReason) : ""}</div>
<section class="signatures"><div>المحاسب المراجع</div><div>مدير المؤسسة</div><div>الاعتماد النهائي</div></section>
<p class="brand">وقت إعداد المستند: ${escapeHtml(dateText(record.generatedAt))}</p>
</main></body></html>`;
}

export function SupplierCreditNoteDocumentActions({
  supplierCreditNote,
}: { supplierCreditNote: SupplierReturnCreditNoteRecord }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function exportWorkbook() {
    setError(""); setNotice("");
    try {
      if (!downloadSupplierCreditNoteWorkbookXlsx(supplierCreditNote)) {
        throw new Error("المتصفح لا يدعم تنزيل ملف Excel في هذه الجلسة.");
      }
      setNotice("تم تجهيز ملف مطابقة إشعار المورد وسجل المراجعة.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إنشاء ملف المطابقة.");
    }
  }

  function printDocument() {
    if (busy) return;
    const popup = window.open("", "_blank", "width=980,height=820");
    if (!popup) {
      setError("حُظر فتح نافذة الطباعة؛ اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.");
      return;
    }
    popup.opener = null;
    setBusy(true); setError(""); setNotice("");
    try {
      popup.document.open();
      popup.document.write(renderSupplierCreditNotePrintHtml(supplierCreditNote));
      popup.document.close();
      popup.focus();
      window.setTimeout(() => { if (!popup.closed) popup.print(); }, 250);
      setNotice("تم تجهيز مستند المطابقة المحفوظ للطباعة.");
    } catch (cause) {
      popup.close();
      setError(cause instanceof Error ? cause.message : "تعذر تجهيز مستند المطابقة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }} aria-label="إخراج مستند مطابقة إشعار المورد">
      <button type="button" className="btn secondary" onClick={printDocument} disabled={busy}>
        <Printer size={14} /> طباعة / PDF
      </button>
      <button type="button" className="btn secondary" onClick={exportWorkbook}>
        <FileSpreadsheet size={14} /> تصدير Excel
      </button>
      {error && <p role="alert" style={{ color: "#991b1b", fontSize: 12 }}>{error}</p>}
      {notice && <p role="status" style={{ color: "#166534", fontSize: 12 }}>{notice}</p>}
    </div>
  );
}
