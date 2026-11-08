import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";

type ForecastExport = {
  ready: boolean;
  reason?: string;
  availableDays?: number;
  expectedTotal?: number;
  dailyBaseline?: number;
  lowerScenario?: number;
  upperScenario?: number;
  meanAbsoluteError?: number;
  lastHistoricalDay?: string;
  days?: ReadonlyArray<{ day: string; expectedSales: number }>;
};

export type ExecutiveAnalyticsWorkbookInput = {
  generated_at: string;
  kpis: {
    eligible_sales: number;
    sales_last_30_days: number;
    orders_last_30_days: number;
    customers_last_30_days: number;
    active_products: number;
    pending_orders: number;
    total_orders: number;
  };
  sales_trend: ReadonlyArray<{ day: string; orders: number; sales: number }>;
  top_products: ReadonlyArray<{ item_code: string | null; product_name: string; quantity: number; sales: number }>;
  top_customers: ReadonlyArray<{ customer_name: string; order_count: number; sales: number }>;
  forecast: ForecastExport;
};

function requireFiniteNonNegative(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error("قيمة غير صالحة في ملف التحليل التنفيذي: " + label + ".");
  }
  return value;
}

function workbookSheets(input: ExecutiveAnalyticsWorkbookInput): Array<{name: string; rows: CellValue[][]}> {
  if (!Number.isFinite(Date.parse(input.generated_at))) throw new Error("تاريخ إنشاء التحليل التنفيذي غير صالح.");
  const kpis = input.kpis;
  const summary: CellValue[][] = [
    ["المؤشر", "القيمة", "ملاحظة"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — التحليل التنفيذي"],
    ["وقت إنشاء التقرير", input.generated_at],
    ["المبيعات المؤهلة غير الملغاة", requireFiniteNonNegative(kpis.eligible_sales, "المبيعات المؤهلة")],
    ["مبيعات آخر 30 يومًا", requireFiniteNonNegative(kpis.sales_last_30_days, "مبيعات آخر 30 يومًا")],
    ["طلبات آخر 30 يومًا", requireFiniteNonNegative(kpis.orders_last_30_days, "طلبات آخر 30 يومًا")],
    ["عملاء ذوو طلبات آخر 30 يومًا", requireFiniteNonNegative(kpis.customers_last_30_days, "العملاء ذوو الطلبات الحديثة")],
    ["أصناف نشطة", requireFiniteNonNegative(kpis.active_products, "الأصناف النشطة")],
    ["طلبات قيد المعالجة", requireFiniteNonNegative(kpis.pending_orders, "الطلبات قيد المعالجة")],
    ["إجمالي الطلبات — كل الحالات", requireFiniteNonNegative(kpis.total_orders, "إجمالي الطلبات")],
    ["نطاق المصدر", "سجلات المؤسسة الحالية من واجهة التحليل الخادمية"],
    ["استبعاد المبيعات", "تُستبعد الطلبات الملغاة والمرفوضة من إجماليات المبيعات المؤهلة."],
    ["الحقول الحساسة", "لا يتضمن الملف معرّفات العملاء الداخلية أو تكلفة الأصناف أو الهوامش."],
  ];
  const sales: CellValue[][] = [
    ["التاريخ", "عدد الطلبات المؤهلة", "المبيعات المؤهلة"],
    ...input.sales_trend.map((row) => [
      row.day,
      requireFiniteNonNegative(row.orders, "عدد الطلبات اليومية"),
      requireFiniteNonNegative(row.sales, "المبيعات اليومية"),
    ]),
  ];
  const products: CellValue[][] = [
    ["كود الصنف", "اسم الصنف", "الكمية المباعة", "المبيعات"],
    ...input.top_products.map((row) => [
      row.item_code ?? "",
      row.product_name,
      requireFiniteNonNegative(row.quantity, "كمية الصنف"),
      requireFiniteNonNegative(row.sales, "مبيعات الصنف"),
    ]),
  ];
  const customers: CellValue[][] = [
    ["العميل", "عدد الطلبات", "المبيعات المؤهلة"],
    ...input.top_customers.map((row) => [
      row.customer_name,
      requireFiniteNonNegative(row.order_count, "عدد طلبات العميل"),
      requireFiniteNonNegative(row.sales, "مبيعات العميل"),
    ]),
  ];
  const forecast: CellValue[][] = [["المؤشر", "القيمة"]];
  if (input.forecast.ready) {
    forecast.push(
      ["حالة التقدير", "متاح — خط أساس تخطيطي وليس وعدًا بالإيراد"],
      ["آخر يوم تاريخي", input.forecast.lastHistoricalDay ?? ""],
      ["التقدير الأساسي لسبعة أيام", requireFiniteNonNegative(input.forecast.expectedTotal ?? Number.NaN, "التقدير الأساسي")],
      ["متوسط المبيعات اليومي", requireFiniteNonNegative(input.forecast.dailyBaseline ?? Number.NaN, "متوسط المبيعات اليومي")],
      ["سيناريو تخطيطي أقل", requireFiniteNonNegative(input.forecast.lowerScenario ?? Number.NaN, "السيناريو الأقل")],
      ["سيناريو تخطيطي أعلى", requireFiniteNonNegative(input.forecast.upperScenario ?? Number.NaN, "السيناريو الأعلى")],
      ["متوسط الخطأ المطلق في الاختبار", requireFiniteNonNegative(input.forecast.meanAbsoluteError ?? Number.NaN, "متوسط الخطأ")],
      ["ملاحظة", "النطاق ± متوسط خطأ الاختبار؛ ليس نطاق ثقة إحصائيًا ولا يغير سجلات المتجر."],
    );
    forecast.push(["اليوم المتوقع", "تقدير المبيعات"]);
    for (const day of input.forecast.days ?? []) {
      if (!Number.isFinite(Date.parse(day.day))) throw new Error("تاريخ يوم التقدير غير صالح.");
      forecast.push([day.day, requireFiniteNonNegative(day.expectedSales, "تقدير المبيعات اليومية")]);
    }
  } else {
    forecast.push(
      ["حالة التقدير", "غير متاح؛ لم تُنشأ قيم افتراضية"],
      ["سبب عدم الإتاحة", input.forecast.reason ?? "السلسلة التاريخية لا تسمح بتقدير قابل للاختبار."],
      ["الأيام الصالحة المتاحة", requireFiniteNonNegative(input.forecast.availableDays ?? 0, "الأيام الصالحة المتاحة")],
    );
  }
  return [
    {name: "ملخص تنفيذي", rows: summary},
    {name: "اتجاه المبيعات", rows: sales},
    {name: "أعلى الأصناف", rows: products},
    {name: "أعلى العملاء", rows: customers},
    {name: "تقدير 7 أيام", rows: forecast},
  ];
}

function workbookFiles(input: ExecutiveAnalyticsWorkbookInput): {name:string;content:string}[] {
  const sheets = workbookSheets(input);
  const sheetOverrides = sheets.map((_, index) =>
    '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
  ).join("");
  const sheetEntries = sheets.map((sheet, index) =>
    '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>'
  ).join("");
  const sheetRelationships = sheets.map((_, index) =>
    '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>'
  ).join("");
  const titles = sheets.map((sheet) => '<vt:lpstr>' + xmlEscape(sheet.name) + '</vt:lpstr>').join("");
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheetOverrides +
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
    '<sheets>' + sheetEntries + '</sheets><calcPr calcId="191029"/></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheetRelationships + '</Relationships>';
  const title = BUSINESS_BRAND_NAME + " — التحليل التنفيذي";
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(title) + '</dc:title><dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) + '</dc:creator>' +
    '<dc:subject>Tenant-scoped executive analytics</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">' +
    xmlEscape(input.generated_at) + '</dcterms:created></cp:coreProperties>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>' + xmlEscape(BUSINESS_BRAND_NAME) + '</Application><TitlesOfParts><vt:vector size="' + sheets.length + '" baseType="lpstr">' +
    titles + '</vt:vector></TitlesOfParts></Properties>';
  return [
    {name:"[Content_Types].xml",content:contentTypes},
    {name:"_rels/.rels",content:rootRels},
    {name:"docProps/core.xml",content:core},
    {name:"docProps/app.xml",content:app},
    {name:"xl/workbook.xml",content:workbook},
    {name:"xl/_rels/workbook.xml.rels",content:workbookRels},
    ...sheets.map((sheet, index) => ({name:"xl/worksheets/sheet" + (index + 1) + ".xml",content:worksheetXml(sheet.rows,true)})),
  ];
}

export function buildExecutiveAnalyticsWorkbookXlsx(input: ExecutiveAnalyticsWorkbookInput): Uint8Array {
  return zipStore(workbookFiles(input));
}

export function downloadExecutiveAnalyticsWorkbookXlsx(input: ExecutiveAnalyticsWorkbookInput): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const bytes = buildExecutiveAnalyticsWorkbookXlsx(input);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-executive-analytics-" + input.generated_at.slice(0,10) + ".xlsx";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
