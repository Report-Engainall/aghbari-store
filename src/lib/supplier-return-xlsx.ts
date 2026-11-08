import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import type { SupplierReturn } from "@/lib/supplier-returns";
import { projectSupplierReturnDocument } from "@/lib/supplier-return-document";

function packageFiles(
  summaryRows: readonly (readonly CellValue[])[],
  detailRows: readonly (readonly CellValue[])[],
  exportedAt: string,
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
    '<sheets><sheet name="ملخص المرتجع" sheetId="1" r:id="rId1"/><sheet name="بنود المرتجع" sheetId="2" r:id="rId2"/></sheets>' +
    '<calcPr calcId="191029"/></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '</Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(BUSINESS_BRAND_NAME + " — مرتجع مورد") + '</dc:title>' +
    '<dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) + '</dc:creator>' +
    '<dc:subject>Saved supplier return document</dc:subject>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + xmlEscape(exportedAt) + '</dcterms:created></cp:coreProperties>';
  return [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "docProps/core.xml", content: core },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/worksheets/sheet1.xml", content: worksheetXml(summaryRows) },
    { name: "xl/worksheets/sheet2.xml", content: worksheetXml(detailRows, true) },
  ];
}

/** Exports one saved supplier return only; no partial history is represented as a full ledger. */
export function buildSupplierReturnWorkbookXlsx(source: SupplierReturn): Uint8Array {
  const document = projectSupplierReturnDocument(source);
  const summary: CellValue[][] = [
    ["الحقل", "القيمة"],
    ["المنتج", BUSINESS_BRAND_NAME],
    ["رقم مرتجع المورد", document.returnNumber],
    ["الحالة", document.statusLabel],
    ["المورد", document.supplierName],
    ["إيصال الاستلام المصدر", document.sourceReceiptNumber],
    ["أمر الشراء", document.purchaseOrderNumber],
    ["المخزن", document.warehouseName],
    ["تاريخ الإنشاء", document.createdAt],
    ["تاريخ الترحيل", document.postedAt],
    ["سبب المرتجع", document.reason],
    ["عدد البنود", document.items.length],
    ["العملة", document.currency],
    ["إجمالي تكلفة المصدر", document.costsComplete ? document.totalCost : null],
    ["نطاق المستند", "مرتجع واحد محفوظ من السجل؛ لا يتضمن ملاحظات داخلية أو معرّفات المستخدمين والمؤسسة."],
    ["حدود الحالة", document.status === "posted"
      ? "مُرحّل للمخزون فقط؛ لا يثبت ترحيل إشعار دائن أو قيد محاسبي."
      : "مسودة؛ لم تُرحّل حركة مخزون ولم يُنشأ قيد محاسبي."],
    ["اكتمال التكلفة", document.costsComplete ? "مكتملة ومتطابقة مع البنود" : "غير مكتملة أو غير متطابقة؛ القيم المالية محجوبة"],
    ["وقت التصدير", document.generatedAt],
  ];
  const details: CellValue[][] = [
    ["رقم المرتجع", "كود الصنف", "اسم الصنف", "الوحدة", "الكمية المستلمة بالمصدر", "الكمية المرتجعة",
      ...(document.costsComplete ? ["تكلفة الوحدة", "إجمالي البند"] : []), "العملة", "حالة المرتجع"],
    ...document.items.map((item) => [
      document.returnNumber,
      item.itemCode,
      item.productName,
      item.unit,
      item.sourceReceivedQuantity,
      item.quantityReturned,
      ...(document.costsComplete ? [item.unitCost, item.lineTotal] : []),
      document.currency,
      document.statusLabel,
    ]),
  ];
  return zipStore(packageFiles(summary, details, document.generatedAt));
}

export function downloadSupplierReturnWorkbookXlsx(source: SupplierReturn): boolean {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const bytes = buildSupplierReturnWorkbookXlsx(source);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const safeNumber = source.returnNumber.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "return";
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "Aghbari-Supplier-Return-" + safeNumber + ".xlsx";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  return true;
}
