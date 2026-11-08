import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import { PRODUCT_ACTIVITY_STATUS_LABELS, type StoreProductActivityReport, type StoreProductActivityRow } from "@/lib/product-activity-report";

const HEADERS = [
  "كود الصنف", "اسم الصنف", "الوحدة", "حالة الكتالوج", "تصنيف الحركة",
  "كمية مباعة آخر 30 يومًا", "كمية مباعة آخر 90 يومًا", "آخر بيع",
  "أيام منذ آخر بيع", "المخزون المتاح", "تاريخ التقرير", "نافذة النشاط بالأيام", "حد الركود بالأيام",
] as const;

function detailRow(row: StoreProductActivityRow, report: StoreProductActivityReport): CellValue[] {
  return [
    row.item_code,
    row.product_name,
    row.unit,
    row.catalog_status === "active" ? "نشط" : row.catalog_status === "inactive" ? "موقوف" : row.catalog_status,
    PRODUCT_ACTIVITY_STATUS_LABELS[row.activity_status],
    row.sold_quantity_last_30_days,
    row.sold_quantity_last_90_days,
    row.last_sold_at,
    row.days_since_last_sale,
    row.available_quantity,
    report.generated_at,
    report.recent_days,
    report.slow_days,
  ];
}

function workbookFiles(report: StoreProductActivityReport): {name:string;content:string}[] {
  const details: CellValue[][] = [[...HEADERS], ...report.products.map(row => detailRow(row, report))];
  const summary: CellValue[][] = [
    ["المؤشر", "القيمة"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — تحليل حركة الأصناف"],
    ["وقت إنشاء التقرير", report.generated_at],
    ["نافذة النشاط الحديث (أيام)", report.recent_days],
    ["حد الركود (أيام)", report.slow_days],
    ["إجمالي أصناف المؤسسة", report.total_products],
    ["عدد الصفوف في الملف", report.returned_products],
    ["التقرير مكتمل", report.truncated ? "لا — تجاوز حد الصفوف" : "نعم"],
    ["نشط خلال آخر 30 يومًا", report.summary.active_last_30_days],
    ["بطيء الحركة خلال 31–90 يومًا", report.summary.slow_moving_90_days],
    ["راكد لأكثر من 90 يومًا", report.summary.stagnant_over_90_days],
    ["لم يُبع سابقًا", report.summary.never_sold],
    ["رصيد المخزون غير متاح", report.summary.stock_unknown_count],
    ["قاعدة الحركة", "الطلبات غير الملغاة المرتبطة بمعرّف الصنف product_id."],
    ["تنبيه الرصيد", "الخانة الفارغة تعني أن الرصيد غير متاح؛ لم يُحوّل المجهول إلى صفر."],
    ["تنبيه البيانات التاريخية", "بنود الطلبات بلا product_id لا تُنسب تخمينيًا إلى صنف."],
    ["الحقول المالية", "لا يحتوي الملف أسعار البيع أو التكلفة أو الهوامش."],
  ];
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="حركة الأصناف" sheetId="1" r:id="rId1"/><sheet name="ملخص التقرير" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029"/></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '</Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(BUSINESS_BRAND_NAME + " — تحليل حركة الأصناف") + '</dc:title><dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) + '</dc:creator>' +
    '<dc:subject>Tenant-scoped product movement report</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">' +
    xmlEscape(report.generated_at) + '</dcterms:created></cp:coreProperties>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>' + xmlEscape(BUSINESS_BRAND_NAME) + '</Application><TitlesOfParts><vt:vector size="2" baseType="lpstr">' +
    '<vt:lpstr>حركة الأصناف</vt:lpstr><vt:lpstr>ملخص التقرير</vt:lpstr></vt:vector></TitlesOfParts></Properties>';
  return [
    {name:"[Content_Types].xml",content:contentTypes},
    {name:"_rels/.rels",content:rels},
    {name:"docProps/core.xml",content:core},
    {name:"docProps/app.xml",content:app},
    {name:"xl/workbook.xml",content:workbook},
    {name:"xl/_rels/workbook.xml.rels",content:workbookRels},
    {name:"xl/worksheets/sheet1.xml",content:worksheetXml(details,true)},
    {name:"xl/worksheets/sheet2.xml",content:worksheetXml(summary,true)},
  ];
}

export function buildProductActivityWorkbookXlsx(report: StoreProductActivityReport): Uint8Array {
  if (report.truncated) throw new Error("التقرير يتجاوز 5000 صنف؛ لن يتم إنشاء ملف Excel جزئي على أنه كامل.");
  if (report.products.length !== report.total_products) throw new Error("إجمالي الأصناف لا يطابق الصفوف؛ أوقف التصدير.");
  return zipStore(workbookFiles(report));
}

export function downloadProductActivityWorkbookXlsx(report: StoreProductActivityReport): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const bytes = buildProductActivityWorkbookXlsx(report);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-product-activity-" + report.generated_at.slice(0,10) + ".xlsx";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
