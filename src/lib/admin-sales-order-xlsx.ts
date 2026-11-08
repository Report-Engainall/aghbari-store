import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import type { AdminSalesOrderPrintDocument } from "@/lib/admin-sales-order-print";

type Sheet = { name: string; rows: CellValue[][] };

function safeNumber(value: number | null, field: string): CellValue {
  if (value === null) return "";
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("تعذر تصدير أمر البيع: قيمة " + field + " غير صالحة.");
  }
  return value;
}

function buildSheets(document: AdminSalesOrderPrintDocument, generatedAt: string): Sheet[] {
  if (!document.orderNumber.trim() || !Array.isArray(document.items) || document.items.length > 1000) {
    throw new Error("تعذر تصدير أمر البيع: بيانات المستند غير مكتملة أو تجاوزت الحد المسموح.");
  }
  const summary: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم المستند", BUSINESS_BRAND_NAME + " — أمر بيع داخلي"],
    ["رقم أمر البيع", document.orderNumber],
    ["تاريخ الطلب", document.createdAt],
    ["الحالة المحفوظة", document.statusLabel],
    ["رمز العميل", document.customerCode],
    ["اسم العميل", document.customerName],
    ["عدد البنود", safeNumber(document.totalItems, "عدد البنود")],
    ["إجمالي الطلب المحفوظ", safeNumber(document.totalAmount, "الإجمالي")],
    ["وقت استخراج الملف", generatedAt],
    ["نطاق الملف", "لقطة البيانات المحفوظة التي أعادها مصدر الطلب؛ لا تشمل مسودات المراجعة الحالية غير المعتمدة."],
    ["الخصوصية", "لا يحتوي الملف على معرفات UUID أو المؤسسة أو المستخدم أو بيانات المصدر الخام أو التكاليف أو الهوامش."],
    ["حماية الصيغ", "كل النصوص خلايا نصية صريحة؛ لا تُنفّذ صيغ Excel من بيانات الطلب."],
  ];
  const items: CellValue[][] = [
    ["رمز الصنف", "اسم الصنف", "الوحدة", "الكمية المحفوظة", "سعر الوحدة المحفوظ", "قيمة البند المحفوظة"],
    ...document.items.map((item) => [
      item.itemCode ?? "",
      item.productName,
      item.unit ?? "",
      safeNumber(item.quantity, "الكمية"),
      safeNumber(item.unitPrice, "سعر الوحدة"),
      safeNumber(item.lineTotal, "قيمة البند"),
    ]),
  ];
  const address = document.deliveryAddress;
  const delivery: CellValue[][] = [
    ["بيانات التوصيل المحفوظة", "القيمة"],
    ["المستلم", address?.recipientName ?? ""],
    ["الهاتف", address?.phone ?? ""],
    ["العنوان", address?.addressLine1 ?? ""],
    ["تفاصيل العنوان", address?.addressLine2 ?? ""],
    ["المدينة", address?.city ?? ""],
    ["المنطقة", address?.region ?? ""],
    ["الرمز البريدي", address?.postalCode ?? ""],
    ["الدولة", address?.country ?? ""],
    ["نطاق العنوان", address ? "لقطة عنوان التوصيل المحفوظة مع الطلب" : "لا يوجد عنوان محفوظ في المستند"],
  ];
  return [
    { name: "بيانات أمر البيع", rows: summary },
    { name: "تفاصيل الأصناف", rows: items },
    { name: "التوصيل", rows: delivery },
  ];
}

function workbookFiles(document: AdminSalesOrderPrintDocument): { name: string; content: string }[] {
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
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — أمر بيع داخلي") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator>" +
    "<dc:subject>Staff-visible saved sales order projection</dc:subject>" +
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

export function buildAdminSalesOrderWorkbookXlsx(document: AdminSalesOrderPrintDocument): Uint8Array {
  return zipStore(workbookFiles(document));
}

export function downloadAdminSalesOrderWorkbookXlsx(document: AdminSalesOrderPrintDocument): void {
  if (typeof globalThis.document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل Excel غير متاح في هذه البيئة.");
  }
  const bytes = buildAdminSalesOrderWorkbookXlsx(document);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const safeOrderNumber = document.orderNumber.replace(/[^a-zA-Z0-9\u0600-\u06FF_-]+/g, "-").replace(/^-+|-+$/g, "");
  const dateSuffix = Number.isFinite(Date.parse(document.createdAt))
    ? new Date(document.createdAt).toISOString().slice(0, 10)
    : "order";
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-sales-order-" + (safeOrderNumber || "document") + "-" + dateSuffix + ".xlsx";
  anchor.hidden = true;
  globalThis.document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
