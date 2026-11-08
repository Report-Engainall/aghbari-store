import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";

export type InventoryTransferExportRow = {
  created_at: string;
  item_code: string | null;
  product_name: string | null;
  unit: string | null;
  source_warehouse_name: string | null;
  destination_warehouse_name: string | null;
  quantity: number | null;
  batch_id: string | null;
  batch_line_count: number | null;
  reason: string | null;
};

export type InventoryTransferExportFilters = {
  generated_at: string;
  search: string;
  warehouse: string;
  date_from: string;
  date_to: string;
  source_limit: number;
};

function workbookFiles(rows: ReadonlyArray<InventoryTransferExportRow>, filters: InventoryTransferExportFilters) {
  if (!Number.isFinite(Date.parse(filters.generated_at))) throw new Error("وقت إنشاء ملف التحويلات غير صالح.");
  if (!Number.isSafeInteger(filters.source_limit) || filters.source_limit < rows.length || filters.source_limit < 0) {
    throw new Error("عدد صفوف التحويلات خارج الحدود.");
  }
  const details: CellValue[][] = [
    ["التاريخ", "كود الصنف", "اسم الصنف", "الوحدة", "مستودع المصدر", "مستودع الوجهة", "الكمية", "نوع التحويل", "عدد أصناف الدفعة", "السبب"],
    ...rows.map((row) => {
      if (!Number.isFinite(Date.parse(row.created_at))) throw new Error("تاريخ حركة المخزون غير صالح.");
      if (row.quantity !== null && (typeof row.quantity !== "number" || !Number.isFinite(row.quantity) || row.quantity < 0)) {
        throw new Error("كمية حركة المخزون غير صالحة.");
      }
      if (row.batch_line_count !== null && row.batch_line_count !== undefined &&
          (!Number.isSafeInteger(row.batch_line_count) || row.batch_line_count < 1)) {
        throw new Error("عدد أصناف دفعة التحويل غير صالح.");
      }
      return [
        row.created_at,
        row.item_code ?? "",
        row.product_name ?? "صنف غير متاح",
        row.unit ?? "",
        row.source_warehouse_name ?? "مستودع غير متاح",
        row.destination_warehouse_name ?? "مستودع غير متاح",
        row.quantity,
        row.batch_id ? "دفعة متعددة" : "تحويل مفرد",
        row.batch_id ? (row.batch_line_count ?? 1) : "",
        row.reason ?? "",
      ];
    }),
  ];
  const summary: CellValue[][] = [
    ["المؤشر", "القيمة"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — سجل تحويلات المخزون"],
    ["وقت إنشاء الملف", filters.generated_at],
    ["عدد الحركات المصدرة", rows.length],
    ["حد المصدر", filters.source_limit],
    ["المستودع", filters.warehouse || "كل المستودعات"],
    ["من تاريخ", filters.date_from || "غير محدد"],
    ["إلى تاريخ", filters.date_to || "غير محدد"],
    ["نص البحث", filters.search || "دون بحث نصي"],
    ["نطاق البيانات", "الحركات الموجودة ضمن نافذة المصدر الحالية قبل التصفية؛ لا يدّعي الملف شمول تاريخ أقدم من حد الخدمة."],
    ["الخصوصية", "لا يحتوي الملف معرّفات الحركات أو الدفعات أو المستودعات أو المستخدمين الداخلية."],
    ["الحقول المالية", "لا يتضمن الملف أسعارًا أو تكاليف أو هوامش ربح."],
    ["الأرصدة", "هذا سجل حركات؛ لا يُحوّل الرصيد غير المعروف إلى صفر."],
  ];
  const sheets = [
    {name:"سجل التحويلات",rows:details},
    {name:"ملخص التصدير",rows:summary},
  ];
  const overrides = sheets.map((_, index) =>
    '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  ).join("");
  const sheetList = sheets.map((sheet, index) =>
    '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>'
  ).join("");
  const sheetRels = sheets.map((_, index) =>
    '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>'
  ).join("");
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    overrides +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' + sheetList + '</sheets><calcPr calcId="191029"/></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheetRels + '</Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(BUSINESS_BRAND_NAME + " — سجل تحويلات المخزون") + '</dc:title><dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) + '</dc:creator>' +
    '<dc:subject>Tenant-scoped inventory transfer history</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">' +
    xmlEscape(filters.generated_at) + '</dcterms:created></cp:coreProperties>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>' + xmlEscape(BUSINESS_BRAND_NAME) + '</Application><TitlesOfParts><vt:vector size="2" baseType="lpstr">' +
    '<vt:lpstr>سجل التحويلات</vt:lpstr><vt:lpstr>ملخص التصدير</vt:lpstr></vt:vector></TitlesOfParts></Properties>';
  return [
    {name:"[Content_Types].xml",content:contentTypes},
    {name:"_rels/.rels",content:rootRels},
    {name:"docProps/core.xml",content:core},
    {name:"docProps/app.xml",content:app},
    {name:"xl/workbook.xml",content:workbook},
    {name:"xl/_rels/workbook.xml.rels",content:workbookRels},
    {name:"xl/worksheets/sheet1.xml",content:worksheetXml(details,true)},
    {name:"xl/worksheets/sheet2.xml",content:worksheetXml(summary,true)},
  ];
}

export function buildInventoryTransferHistoryWorkbookXlsx(
  rows: ReadonlyArray<InventoryTransferExportRow>,
  filters: InventoryTransferExportFilters,
): Uint8Array {
  return zipStore(workbookFiles(rows, filters));
}

export function downloadInventoryTransferHistoryWorkbookXlsx(
  rows: ReadonlyArray<InventoryTransferExportRow>,
  filters: InventoryTransferExportFilters,
): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const bytes = buildInventoryTransferHistoryWorkbookXlsx(rows, filters);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-inventory-transfers-" + filters.generated_at.slice(0,10) + ".xlsx";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
