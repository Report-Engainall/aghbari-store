import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import type { SupplierReturnCreditNoteRecord } from "@/lib/supplier-credit-notes";
import { projectSupplierCreditNoteDocument } from "@/lib/supplier-credit-note-document";

function xlsxFiles(
  summaryRows: readonly (readonly CellValue[])[],
  historyRows: readonly (readonly CellValue[])[],
  generatedAt: string,
): { name: string; content: string }[] {
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>';
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '</Relationships>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="ملخص المطابقة" sheetId="1" r:id="rId1"/><sheet name="سجل المراجعة" sheetId="2" r:id="rId2"/></sheets>' +
    '<calcPr calcId="191029"/></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '</Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(BUSINESS_BRAND_NAME + " — مطابقة إشعار مورد") + '</dc:title>' +
    '<dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) + '</dc:creator>' +
    '<dc:subject>Supplier credit note reconciliation evidence</dc:subject>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + xmlEscape(generatedAt) + '</dcterms:created></cp:coreProperties>';
  return [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "docProps/core.xml", content: core },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/worksheets/sheet1.xml", content: worksheetXml(summaryRows) },
    { name: "xl/worksheets/sheet2.xml", content: worksheetXml(historyRows, true) },
  ];
}

/** Exports one finance-scoped supplier credit note reconciliation record with its review trail. */
export function buildSupplierCreditNoteWorkbookXlsx(
  source: SupplierReturnCreditNoteRecord,
): Uint8Array {
  const record = projectSupplierCreditNoteDocument(source);
  const summary: CellValue[][] = [
    ["الحقل", "القيمة"],
    ["المنتج", BUSINESS_BRAND_NAME],
    ["المورد", record.supplierName],
    ["رقم مرتجع المورد", record.returnNumber],
    ["إيصال الاستلام المصدر", record.sourceReceiptNumber],
    ["أمر الشراء", record.purchaseOrderNumber],
    ["تاريخ ترحيل المرتجع", record.postedAt],
    ["رقم إشعار المورد", record.creditNoteNumber],
    ["تاريخ إشعار المورد", record.creditNoteIssuedOn],
    ["عملة التسوية", record.currency],
    ["تكلفة المرتجع المصدرية", record.sourceAmount],
    ["المبلغ الفعلي في إشعار المورد", record.actualAmount],
    ["فرق المبلغ (فعلي − مصدر)", record.varianceConsistent ? record.varianceAmount : null],
    ["حالة المطابقة", record.creditNoteStatusLabel],
    ["اتساق الفرق المحسوب", record.varianceConsistent ? "متطابق" : "غير متطابق أو بيانات ناقصة؛ تم حجب الفرق"],
    ["قيد إيصال المصدر", record.sourceJournalEntryNumber],
    ["حالة قيد إيصال المصدر", record.sourceJournalStatusLabel],
    ["رقم قيد إشعار المورد", record.journalEntryNumber],
    ["حالة قيد إشعار المورد", record.journalStatusLabel],
    ["سبب مراجعة الفرق", record.varianceReviewReason],
    ["نطاق الملف", "مطابقة مرتجع واحد محفوظ وسجل قراراته؛ لا يتضمن معرّفات داخلية أو معرفات الحسابات أو المستخدمين."],
    ["حدود المحاسبة", "مسودة القيد ليست قيدًا مرحّلًا. حالة إشعار المورد لا تتجاوز الحالة المعروضة في مصدر الخادم."],
    ["وقت التصدير", record.generatedAt],
  ];
  const history: CellValue[][] = [
    ["رقم إشعار المورد", "الحدث", "سبب القرار", "تاريخ الحدث"],
    ...record.events.map((event) => [
      event.documentNumber, event.actionLabel, event.reason, event.createdAt,
    ]),
  ];
  return zipStore(xlsxFiles(summary, history, record.generatedAt));
}

export function downloadSupplierCreditNoteWorkbookXlsx(
  source: SupplierReturnCreditNoteRecord,
): boolean {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const bytes = buildSupplierCreditNoteWorkbookXlsx(source);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const safeNumber = (source.supplierCreditNoteNumber ?? source.returnNumber)
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "credit-note";
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "Aghbari-Supplier-Credit-Note-" + safeNumber + ".xlsx";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  return true;
}
