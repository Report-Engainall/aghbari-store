import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import type { CustomerOrderPrintDocument } from "@/lib/customer-order-print";

type Sheet = { name: string; rows: CellValue[][] };

function nullableQuantity(value: number | null): CellValue {
  if (value === null) return "";
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("تعذر تصدير الطلب: توجد كمية غير صالحة في المستند.");
  }
  return value;
}

function buildSheets(document: CustomerOrderPrintDocument): Sheet[] {
  const generatedAt = new Date().toISOString();
  const orderNumber = document.orderNumber.trim();
  if (!orderNumber || !Array.isArray(document.items) || !Array.isArray(document.history)) {
    throw new Error("تعذر تصدير الطلب: بيانات المستند غير مكتملة.");
  }

  const summary: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم المستند", BUSINESS_BRAND_NAME + " — كشف طلب العميل"],
    ["رقم الطلب", orderNumber],
    ["تاريخ الطلب", document.createdAt],
    ["الحالة الحالية", document.statusLabel],
    ["رمز العميل", document.customer.code],
    ["اسم العميل", document.customer.name],
    ["وقت استخراج الملف", generatedAt],
    ["مراجعة الكميات", document.quantityReviewRequired ? "توجد مراجعة أو تعديلات على الكميات" : "لا توجد مراجعة كميات معلنة"],
    ["ملاحظة تعديل الكمية", document.adjustmentNote ?? ""],
    ["طلب السداد", document.paymentRequested ? "طلبت الإدارة متابعة السداد؛ هذا ليس إثبات استلام دفعة" : "لا يوجد طلب سداد مسجل في لقطة الطلب"],
    ["ملاحظات العميل", document.customerNotes ?? ""],
    ["نطاق الملف", "نسخة من لقطة الطلب الحالية المحملة لحساب العميل؛ سجل الحالة يعكس السجلات التي أعادها المصدر."],
    ["الخصوصية", "لا يحتوي الملف على الأسعار أو الإجماليات أو التكاليف أو الهوامش أو معرفات UUID أو مفاتيح المؤسسة والمستخدم."],
    ["حماية النصوص", "تُخزن نصوص المستند كخلايا نصية؛ لا تُنفذ صيغ Excel من بيانات الطلب."],
  ];

  const items: CellValue[][] = [
    ["الصنف", "رمز الصنف", "الوحدة", "الكمية المطلوبة", "الكمية المعتمدة", "حالة الكمية"],
    ...document.items.map((item) => [
      item.productName,
      item.itemCode ?? "",
      item.unit ?? "",
      nullableQuantity(item.requestedQuantity),
      nullableQuantity(item.approvedQuantity),
      item.adjusted ? "عُدّلت الكمية عن الطلب الأصلي" : "كما طُلب",
    ]),
  ];

  const address = document.deliveryAddress;
  const delivery: CellValue[][] = [
    ["بيانات التوصيل", "القيمة"],
    ["اسم العنوان", address?.label ?? ""],
    ["المستلم", address?.recipientName ?? ""],
    ["الهاتف", address?.phone ?? ""],
    ["العنوان", address?.addressLine1 ?? ""],
    ["تفاصيل العنوان", address?.addressLine2 ?? ""],
    ["المدينة", address?.city ?? ""],
    ["المنطقة", address?.region ?? ""],
    ["الرمز البريدي", address?.postalCode ?? ""],
    ["الدولة", address?.country ?? ""],
    ["تعليمات التوصيل", address?.deliveryInstructions ?? ""],
    ["نطاق البيانات", address ? "لقطة عنوان التوصيل المحفوظة مع الطلب" : "لا يوجد عنوان توصيل محفوظ في لقطة الطلب"],
  ];

  const history: CellValue[][] = [
    ["الحالة", "تاريخ التسجيل"],
    ...(document.history.length > 0
      ? document.history.map((entry) => [entry.statusLabel, entry.createdAt] as CellValue[])
      : [["لا توجد حركات حالة مسجلة", ""]]),
  ];

  return [
    { name: "بيانات الطلب", rows: summary },
    { name: "الأصناف والكميات", rows: items },
    { name: "عنوان التوصيل", rows: delivery },
    { name: "سجل الحالة", rows: history },
  ];
}

function workbookFiles(document: CustomerOrderPrintDocument): { name: string; content: string }[] {
  const sheets = buildSheets(document);
  const overrides = sheets.map((_sheet, index) =>
    '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  ).join("");
  const sheetEntries = sheets.map((sheet, index) =>
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
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    "</Relationships>";
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    "<sheets>" + sheetEntries + "</sheets><calcPr calcId=\"191029\"/></workbook>";
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relationships + "</Relationships>";
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — كشف طلب العميل") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator>" +
    "<dc:subject>Customer-owned order snapshot; no financial or internal identifiers</dc:subject>" +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + xmlEscape(new Date().toISOString()) + "</dcterms:created></cp:coreProperties>";
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

export function buildCustomerOrderWorkbookXlsx(document: CustomerOrderPrintDocument): Uint8Array {
  return zipStore(workbookFiles(document));
}

export function downloadCustomerOrderWorkbookXlsx(document: CustomerOrderPrintDocument): void {
  if (typeof globalThis.document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل Excel غير متاح في هذه البيئة.");
  }
  const bytes = buildCustomerOrderWorkbookXlsx(document);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  const safeOrderNumber = document.orderNumber.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "-").replace(/^-+|-+$/g, "");
  const dateSuffix = Number.isFinite(Date.parse(document.createdAt))
    ? new Date(document.createdAt).toISOString().slice(0, 10)
    : "order";
  anchor.href = url;
  anchor.download = "aghbari-customer-order-" + (safeOrderNumber || "document") + "-" + dateSuffix + ".xlsx";
  anchor.hidden = true;
  globalThis.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
