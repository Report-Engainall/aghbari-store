import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import type { CustomerServiceDeskPrintDocument } from "@/lib/customer-service-desk-print";

type Sheet = { name: string; rows: CellValue[][] };
function dateText(value: string | null): string { return value ?? ""; }

function sheets(document: CustomerServiceDeskPrintDocument): Sheet[] {
  const summary: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — كشف طابور خدمة العملاء وSLA"],
    ["وقت استخراج التقرير", document.generatedAt],
    ["نطاق الحالة", document.filters.status],
    ["الأولوية", document.filters.priority],
    ["الإسناد", document.filters.assignment],
    ["المتأخرة فقط", document.filters.overdueOnly ? "نعم" : "لا"],
    ["عبارة البحث", document.filters.search],
    ["عدد الحالات المحمّلة", document.loadedCount],
    ["توجد صفحات أخرى غير محمّلة", document.hasMore ? "نعم" : "لا"],
    ["حد تفاصيل التقرير", "يشمل الحالات التي تم تحميل صفحاتها فقط. إذا كانت هناك صفحات أخرى، حمّلها من مكتب الخدمة ثم أعد التصدير."],
    ["نطاق المؤشرات", "مؤشرات الحالات المفتوحة أدناه هي ملخص المؤسسة الكامل كما أعاده الخادم، وليست مجموع صفوف الصفحة الحالية ولا تتقيد بمرشحات تفاصيل القائمة."],
    ["الخصوصية", "لا يتضمن التقرير وصف الحالة التفصيلي أو رسائل المحادثة أو الملاحظات الداخلية أو معرفات UUID أو المؤسسة أو المستخدم أو المهمة."],
    ["طريقة احتساب التأخير", "تأخر الاستجابة: حالة نشطة لم تسجل أول استجابة بعد تجاوز موعدها. تأخر الحل: حالة نشطة تجاوز موعد الحل عند وقت استخراج التقرير."],
  ];
  const metrics: CellValue[][] = [
    ["المؤشر", "القيمة"],
    ["الحالات المفتوحة", document.fullOpenSummary.open_count],
    ["تجاوزت موعد الاستجابة", document.fullOpenSummary.response_overdue_count],
    ["تجاوزت موعد الحل", document.fullOpenSummary.resolution_overdue_count],
    ["غير مسندة", document.fullOpenSummary.unassigned_count],
    ["عاجلة", document.fullOpenSummary.urgent_count],
    ["عالية الأولوية", document.fullOpenSummary.high_count],
  ];
  const cases: CellValue[][] = [
    ["رقم الحالة", "العميل", "كود العميل", "الموضوع", "النوع", "الأولوية", "الحالة",
      "تاريخ الفتح", "آخر تحديث", "موعد الاستجابة", "أول استجابة", "تأخر الاستجابة",
      "موعد الحل", "تأخر الحل", "مستوى التصعيد", "المسؤول", "استحقاق المهمة", "مهمة مرتبطة"],
    ...document.cases.map((row) => [
      row.caseCode, row.customerName, row.customerCode, row.subject, row.caseType,
      row.priority, row.status, row.createdAt, row.updatedAt, row.responseDueAt,
      dateText(row.firstResponseAt), row.responseOverdue ? "متأخر" : "لا",
      row.resolutionDueAt, row.resolutionOverdue ? "متأخر" : "لا",
      row.escalationLevel, row.assignedToName, dateText(row.taskDueAt),
      row.hasLinkedTask ? "نعم" : "لا",
    ]),
  ];
  return [
    { name: "نطاق التقرير", rows: summary },
    { name: "مؤشرات المؤسسة", rows: metrics },
    { name: "حالات الصفحة المحملة", rows: cases },
  ];
}
function packageFiles(document: CustomerServiceDeskPrintDocument): { name: string; content: string }[] {
  const data = sheets(document);
  const overrides = data.map((_sheet, i) =>
    '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  ).join("");
  const entries = data.map((sheet, i) =>
    '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'
  ).join("");
  const relationships = data.map((_sheet, i) =>
    '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'
  ).join("");
  const titles = data.map((sheet) => "<vt:lpstr>" + xmlEscape(sheet.name) + "</vt:lpstr>").join("");
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
    "<sheets>" + entries + "</sheets></workbook>";
  const workbookRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    relationships + "</Relationships>";
  const core =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    "<dc:title>" + xmlEscape(BUSINESS_BRAND_NAME + " — كشف طابور خدمة العملاء وSLA") + "</dc:title>" +
    "<dc:creator>" + xmlEscape(BUSINESS_BRAND_NAME) + "</dc:creator></cp:coreProperties>";
  const app =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    "<Application>" + xmlEscape(BUSINESS_BRAND_NAME) + "</Application>" +
    '<TitlesOfParts><vt:vector size="' + data.length + '" baseType="lpstr">' + titles + "</vt:vector></TitlesOfParts></Properties>";
  return [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "docProps/core.xml", content: core },
    { name: "docProps/app.xml", content: app },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    ...data.map((sheet, i) => ({
      name: "xl/worksheets/sheet" + (i + 1) + ".xml",
      content: worksheetXml(sheet.rows, true),
    })),
  ];
}

export function buildCustomerServiceDeskWorkbookXlsx(document: CustomerServiceDeskPrintDocument): Uint8Array {
  return zipStore(packageFiles(document));
}

export function downloadCustomerServiceDeskWorkbookXlsx(document: CustomerServiceDeskPrintDocument): void {
  if (typeof globalThis.document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل Excel غير متاح في بيئة المتصفح الحالية.");
  }
  const bytes = buildCustomerServiceDeskWorkbookXlsx(document);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = globalThis.document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-customer-service-desk-" + new Date(document.generatedAt).toISOString().slice(0, 10) + ".xlsx";
  anchor.hidden = true;
  globalThis.document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
