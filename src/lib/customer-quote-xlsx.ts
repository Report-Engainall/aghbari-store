import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import type { CustomerQuotePrintDocument } from "@/lib/customer-quote-print";

type Sheet = { name: string; rows: CellValue[][] };

function validNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("تعذر تصدير عرض السعر: قيمة " + label + " غير صالحة.");
  }
  return value;
}

function buildSheets(document: CustomerQuotePrintDocument, generatedAt: string): Sheet[] {
  if (!document.quoteNumber.trim() || !Array.isArray(document.items) ||
      document.items.length < 1 || document.items.length > 500) {
    throw new Error("تعذر تصدير عرض السعر: بيانات العرض غير مكتملة أو تجاوزت الحد المسموح.");
  }
  const summary: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم المستند", BUSINESS_BRAND_NAME + " — عرض سعر للعميل"],
    ["رقم العرض", document.quoteNumber],
    ["حالة العرض", document.statusLabel],
    ["تاريخ الطلب", document.createdAt],
    ["تاريخ التسعير", document.quotedAt ?? ""],
    ["صالح حتى", document.validUntil ?? ""],
    ["ملاحظات العميل", document.customerNotes ?? ""],
    ["رد الأغبري", document.responseNote ?? ""],
    ["وقت استخراج الملف", generatedAt],
    ["نطاق الملف", "لقطة عرض السعر المحملة لحساب العميل من المصدر المعتمد."],
    ["الخصوصية", "يتضمن سعر الوحدة المعتمد في العرض فقط؛ لا يتضمن سعر الهدف أو التكلفة أو الهامش أو UUID أو معرفات المؤسسة والمستخدم."],
    ["الحدود المحاسبية", "هذا عرض سعر وليس فاتورة أو أمر بيع أو إثبات سداد. لا ينشئ الملف حركة مالية."],
    ["حماية الصيغ", "جميع النصوص خلايا نصية صريحة؛ لا تُنفذ صيغ Excel من بيانات العرض."],
  ];
  const items: CellValue[][] = [
    ["رمز الصنف", "اسم الصنف", "الوحدة", "الكمية المطلوبة", "سعر الوحدة المعتمد في العرض"],
    ...document.items.map((item, index) => [
      item.itemCode ?? "",
      item.productName,
      item.unit ?? "",
      validNonNegative(item.quantity, "الكمية في البند " + (index + 1)),
      validNonNegative(item.quotedUnitPrice, "سعر البند " + (index + 1)),
    ]),
  ];
  const scope: CellValue[][] = [
    ["حدود المستند", "التوضيح"],
    ["مصدر السعر", "سعر الوحدة المعتمد في العرض كما أعاده مصدر الطلب؛ لا يُعاد احتساب السعر من الكتالوج."],
    ["حالة القبول", "تعكس الحالة المسجلة لحظة القراءة؛ قبول العرض لا ينشئ طلب شراء تلقائياً."],
    ["صلاحية العرض", document.validUntil ?? "لا يوجد تاريخ انتهاء مسجل في المصدر."],
    ["بيانات غير معروضة", "لا توجد أسعار مستهدفة أو عروض بديلة أو تكلفة أو ربح أو خصم غير موجود في إسقاط العميل."],
  ];
  return [
    { name: "بيانات العرض", rows: summary },
    { name: "الأصناف والأسعار", rows: items },
    { name: "نطاق العرض", rows: scope },
  ];
}

function workbookFiles(document: CustomerQuotePrintDocument): { name: string; content: string }[] {
  const generatedAt = new Date().toISOString();
  const sheets = buildSheets(document, generatedAt);
  const overrides = sheets.map((_sheet, index) =>
    '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  ).join("");
  const entries = sheets.map((sheet, index) =>
    '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>'
  ).join("");
  const relationships = sheets.map((_sheet, index) =>
    '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>'
  ).join("");
  const titles = sheets.map((sheet) => "<vt:lpstr>" + xmlEscape(sheet.name) + "</vt:lpstr>").join("");
  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    "</Types>";
  const rootRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" Target="docProps/app.xml"/>' +
    "</Relationships>";
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    "<sheets>" + entries + "</sheets><calcPr calcId=\"191029\"/></workbook>";
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relationships + "</Relationships>";
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — عرض سعر للعميل") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator>" +
    "<dc:subject>Server-approved customer quote projection</dc:subject>" +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + xmlEscape(generatedAt) + "</dcterms:created></cp:coreProperties>";
  const app =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    "<Application>" + xmlEscape(BUSINESS_BRAND_NAME) + "</Application>" +
    '<TitlesOfParts><vt:vector size="' + sheets.length + '" baseType="lpstr">' + titles + "</vt:vector></TitlesOfParts></Properties>";
  return [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "docProps/core.xml", content: core },
    { name: "docProps/app.xml", content: app },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    ...sheets.map((sheet, index) => ({
      name: "xl/worksheets/sheet" + (index + 1) + ".xml",
      content: worksheetXml(sheet.rows, true),
    })),
  ];
}

export function buildCustomerQuoteWorkbookXlsx(document: CustomerQuotePrintDocument): Uint8Array {
  return zipStore(workbookFiles(document));
}

export function downloadCustomerQuoteWorkbookXlsx(document: CustomerQuotePrintDocument): void {
  if (typeof globalThis.document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل Excel غير متاح في هذه البيئة.");
  }
  const bytes = buildCustomerQuoteWorkbookXlsx(document);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const safeQuoteNumber = document.quoteNumber.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "-").replace(/^-+|-+$/g, "");
  const dateSuffix = Number.isFinite(Date.parse(document.createdAt))
    ? new Date(document.createdAt).toISOString().slice(0, 10)
    : "quote";
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-customer-quote-" + (safeQuoteNumber || "document") + "-" + dateSuffix + ".xlsx";
  anchor.hidden = true;
  globalThis.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
