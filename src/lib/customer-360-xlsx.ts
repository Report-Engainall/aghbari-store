import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";
import type { StaffCustomer360Summary } from "@/lib/customer-360-summary";
import type { CustomerInteraction } from "@/lib/types";

const interactionTypeLabels: Record<string, string> = {
  call: "اتصال هاتفي",
  visit: "زيارة",
  whatsapp: "واتساب",
  email: "بريد إلكتروني",
  meeting: "اجتماع",
  note: "ملاحظة داخلية",
  other: "أخرى",
};


const MAX_RECENT_DETAIL_ROWS = 20;

type WorkbookSheet = { name: string; rows: CellValue[][] };

function validateDetailBounds(summary: StaffCustomer360Summary, interactions: readonly CustomerInteraction[]): void {
  if (
    summary.recent_orders.length > MAX_RECENT_DETAIL_ROWS ||
    summary.recent_invoices.length > MAX_RECENT_DETAIL_ROWS ||
    summary.recent_payments.length > MAX_RECENT_DETAIL_ROWS
  ) {
    throw new Error("تجاوزت تفاصيل العميل حد آخر 20 حركة؛ أوقف التصدير حتى لا يظهر ملف جزئي على أنه كامل.");
  }
  if (interactions.length > 50) {
    throw new Error("تجاوز سجل التواصل حد أحدث 50 إدخالًا؛ أوقف التصدير حتى لا يظهر ملف جزئي على أنه كامل.");
  }
}

function workbookSheets(summary: StaffCustomer360Summary, interactions: readonly CustomerInteraction[] = []): WorkbookSheet[] {
  const customer = summary.customer;
  const orders = summary.order_summary;
  const invoiceById = new Map(summary.recent_invoices.map((invoice) => [invoice.id, invoice]));

  const overview: CellValue[][] = [
    ["المؤشر", "القيمة"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — ملف العميل 360"],
    ["وقت إنشاء الملخص", summary.generated_at],
    ["رمز العميل", customer.customer_code],
    ["اسم العميل / المؤسسة", customer.business_name],
    ["جهة الاتصال", customer.contact_name],
    ["الهاتف", customer.phone],
    ["البريد الإلكتروني", customer.email],
    ["شريحة العميل", customer.tier],
    ["حالة العميل", customer.status],
    ["الرصيد المسجل في بطاقة العميل", customer.current_balance],
    ["الحد الائتماني المسجل في بطاقة العميل", customer.credit_limit],
    ["إجمالي الطلبات من سجل العميل الكامل", orders.order_count],
    ["طلبات قيد المعالجة من السجل الكامل", orders.pending_order_count],
    ["طلبات منفذة من السجل الكامل", orders.fulfilled_order_count],
    ["طلبات ملغاة من السجل الكامل", orders.cancelled_order_count],
    ["قيمة الطلبات غير الملغاة (قيمة المصدر)", orders.non_cancelled_order_value],
    ["متوسط قيمة الطلب (قيمة المصدر)", orders.average_order_value],
    ["عدد مبالغ الطلبات غير الصالحة", orders.invalid_order_amount_count],
    ["آخر طلب", orders.last_order_at],
    ["أيام منذ آخر طلب", orders.days_since_last_order],
    ["متوسط الأيام بين الطلبات", orders.average_days_between_orders],
    ["عدد صفوف الطلبات التفصيلية المصدرة", summary.recent_orders.length],
    ["عدد صفوف الفواتير التفصيلية المصدرة", summary.recent_invoices.length],
    ["عدد صفوف الدفعات التفصيلية المصدرة", summary.recent_payments.length],
    ["عدد سجلات التواصل المصدرة", interactions.length],
    ["نطاق سجل التواصل", "أحدث 50 إدخالًا أو أقل مما أعاده الخادم؛ تبقى الإدخالات الأقدم محفوظة في قاعدة البيانات."],
    ["نطاق التفاصيل", "الجداول التفصيلية تعرض أحدث 20 حركة أو أقل مما أعاده الخادم؛ ليست دفترًا تاريخيًا كاملًا."],
    ["نطاق الملخص المالي", "ورقة «حسب العملة» تحتوي إجماليات الخادم الكاملة لكل عملة؛ لا تجمع عملات مختلفة في إجمالي واحد."],
    ["القيم المجهولة", "القيمة غير المتاحة تبقى خلية فارغة؛ لا تُحوّل إلى صفر."],
    ["روابط الدفعات", "قد يكون رقم فاتورة الدفعة فارغًا إذا كانت الفاتورة خارج قائمة أحدث 20 فاتورة؛ لم يتم تخمين الرقم."],
    ["المنتجات الأكثر شراءً", "هذه قائمة الترتيب التي أعادها الخادم، وليست كشفًا بكل الأصناف التاريخية."],
    ["توافق العملات", "قيم الطلبات ومنتجات العميل كما أعادها مصدرها؛ الملخص المالي المصالح حسب العملة هو المرجع المستقل لكل عملة."],
    ["حقول التكلفة والهامش", "لا يتضمن هذا الملف أسعار التكلفة أو الربح أو الهامش الداخلي."],
  ];

  const finance: CellValue[][] = [
    [
      "العملة", "عدد الفواتير في الدفتر الكامل", "إجمالي الفواتير", "المسدّد",
      "الإشعارات الدائنة المرحلة", "المتبقي", "عدد الفواتير المتأخرة", "المتأخرات",
      "فواتير دون تاريخ استحقاق", "مبالغ دون تاريخ استحقاق", "إجماليات غير صالحة",
    ],
    ...summary.finance_by_currency.map((row) => [
      row.currency, row.invoice_count, row.invoiced_total, row.paid_total, row.credit_memo_total,
      row.outstanding_total, row.overdue_invoice_count, row.overdue_outstanding,
      row.unknown_due_date_invoice_count, row.unknown_due_date_outstanding, row.invalid_total_amount_count,
    ]),
  ];

  const recentOrders: CellValue[][] = [
    ["رقم الطلب", "تاريخ الطلب", "الحالة", "عدد الأصناف", "الإجمالي"],
    ...summary.recent_orders.map((row) => [
      row.order_number, row.created_at, row.status, row.total_items, row.total_amount,
    ]),
  ];

  const recentInvoices: CellValue[][] = [
    ["رقم الفاتورة", "الحالة", "تاريخ الإصدار", "تاريخ الاستحقاق", "العملة", "الإجمالي", "المسدّد", "الإشعارات الدائنة", "المتبقي"],
    ...summary.recent_invoices.map((row) => [
      row.invoice_number, row.status, row.issued_at, row.due_at, row.currency, row.total_amount,
      row.paid_amount, row.credit_memo_amount, row.outstanding_amount,
    ]),
  ];

  const recentPayments: CellValue[][] = [
    ["تاريخ الدفعة", "رقم الفاتورة ضمن أحدث التفاصيل", "طريقة الدفع", "المبلغ"],
    ...summary.recent_payments.map((row) => [
      row.paid_at, invoiceById.get(row.invoice_id)?.invoice_number ?? null, row.payment_method, row.amount,
    ]),
  ];

  const topProducts: CellValue[][] = [
    ["كود الصنف", "اسم الصنف", "الكمية", "قيمة المبيعات من المصدر", "آخر شراء"],
    ...summary.top_products.map((row) => [
      row.item_code, row.product_name, row.quantity, row.sales, row.last_purchased_at,
    ]),
  ];

  const recommendations: CellValue[][] = [
    ["الأولوية", "النوع", "التوصية", "الوصف", "الإجراء", "العملة", "عدد الفواتير المتأخرة", "مبلغ المتأخرات", "الطلبات المعلقة", "أيام منذ آخر طلب", "تاريخ آخر طلب"],
    ...summary.recommendations.map((row) => [
      row.priority, row.type, row.title, row.description, row.action, row.currency ?? null,
      row.overdue_invoice_count ?? null, row.overdue_outstanding ?? null,
      row.pending_order_count ?? null, row.days_since_last_order ?? null, row.last_order_at ?? null,
    ]),
  ];

  const statusDistribution: CellValue[][] = [
    ["حالة الطلب", "عدد الطلبات في سجل العميل الكامل"],
    ...orders.status_distribution.map((row) => [row.status, row.count]),
  ];

  const interactionHistory: CellValue[][] = [
    ["تاريخ التواصل", "نوع التواصل", "الموضوع", "ملخص التواصل والنتيجة", "موعد المتابعة القادم", "سُجل بواسطة", "تاريخ التسجيل"],
    ...interactions.map((row) => [
      row.interaction_at,
      interactionTypeLabels[row.interaction_type] ?? row.interaction_type,
      row.subject,
      row.details,
      row.next_follow_up_at,
      row.recorded_by_name,
      row.created_at,
    ]),
  ];

  return [
    { name: "ملخص العميل", rows: overview },
    { name: "حسب العملة", rows: finance },
    { name: "آخر الطلبات", rows: recentOrders },
    { name: "آخر الفواتير", rows: recentInvoices },
    { name: "آخر الدفعات", rows: recentPayments },
    { name: "أكثر المنتجات", rows: topProducts },
    { name: "إشارات المتابعة", rows: recommendations },
    { name: "توزيع الحالات", rows: statusDistribution },
    { name: "سجل التواصل", rows: interactionHistory },
  ];
}

function workbookFiles(summary: StaffCustomer360Summary, interactions: readonly CustomerInteraction[] = []): { name: string; content: string }[] {
  const sheets = workbookSheets(summary, interactions);
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((_sheet, index) => '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
  const packageRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' + sheets.map((sheet, index) => '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>').join('') +
    '</sheets><calcPr calcId="191029"/></workbook>';
  const workbookRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_sheet, index) => '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>').join('') +
    '</Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(BUSINESS_BRAND_NAME + " — ملف العميل 360") + '</dc:title><dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) + '</dc:creator>' +
    '<dc:subject>Tenant-scoped customer 360 summary with bounded detail and complete per-currency finance</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">' +
    xmlEscape(summary.generated_at) + '</dcterms:created></cp:coreProperties>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>' + xmlEscape(BUSINESS_BRAND_NAME) + '</Application><TitlesOfParts><vt:vector size="' + sheets.length + '" baseType="lpstr">' +
    sheets.map((sheet) => '<vt:lpstr>' + xmlEscape(sheet.name) + '</vt:lpstr>').join('') +
    '</vt:vector></TitlesOfParts></Properties>';
  return [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: packageRelationships },
    { name: "docProps/core.xml", content: core },
    { name: "docProps/app.xml", content: app },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelationships },
    ...sheets.map((sheet, index) => ({
      name: "xl/worksheets/sheet" + (index + 1) + ".xml",
      content: worksheetXml(sheet.rows, true),
    })),
  ];
}

export function buildStaffCustomer360WorkbookXlsx(
  summary: StaffCustomer360Summary,
  interactions: readonly CustomerInteraction[] = [],
): Uint8Array {
  validateDetailBounds(summary, interactions);
  return zipStore(workbookFiles(summary, interactions));
}

export function downloadStaffCustomer360WorkbookXlsx(
  summary: StaffCustomer360Summary,
  interactions: readonly CustomerInteraction[] = [],
): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return;
  const bytes = buildStaffCustomer360WorkbookXlsx(summary, interactions);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeCode = summary.customer.customer_code.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "customer";
  anchor.href = url;
  anchor.download = "aghbari-customer-360-" + safeCode + "-" + summary.generated_at.slice(0, 10) + ".xlsx";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try { anchor.click(); } finally { anchor.remove(); URL.revokeObjectURL(url); }
}
