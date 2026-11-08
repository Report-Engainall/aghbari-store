import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";

const PAGE_LIMIT = 200;
const BUCKETS = ["current", "days_1_30", "days_31_60", "days_61_90", "over_90", "unknown_due_date"] as const;
type Bucket = typeof BUCKETS[number];

const bucketLabels: Record<Bucket, string> = {
  current: "غير متأخر / مستحق حاليًا",
  days_1_30: "1–30 يومًا",
  days_31_60: "31–60 يومًا",
  days_61_90: "61–90 يومًا",
  over_90: "أكثر من 90 يومًا",
  unknown_due_date: "تاريخ استحقاق غير محدد",
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 &&
    value.length <= 80 && Number.isFinite(Date.parse(value));
}

function parseMinor(value: unknown, label: string): bigint {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 40 || !/^\\d+(?:\\.\\d{1,2})?$/.test(raw)) {
    throw new Error("تعذر تصدير أعمار الذمم: مبلغ " + label + " غير صالح.");
  }
  const [whole, fraction = ""] = raw.split(".");
  let minor: bigint;
  try {
    minor = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  } catch {
    throw new Error("تعذر تصدير أعمار الذمم: مبلغ " + label + " خارج حدود الدقة.");
  }
  if (minor < 0n) throw new Error("تعذر تصدير أعمار الذمم: مبلغ " + label + " سالب.");
  return minor;
}

function moneyText(minor: bigint): string {
  return (minor / 100n).toString() + "." + (minor % 100n).toString().padStart(2, "0");
}

function safeText(value: unknown, label: string, maxLength = 500): string {
  if (typeof value !== "string" || value.length > maxLength) {
    throw new Error("تعذر تصدير أعمار الذمم: حقل " + label + " غير صالح.");
  }
  return value;
}

function validateReport(value: unknown) {
  const report = record(value);
  if (!report || !validTimestamp(report.as_of_utc) ||
      report.limit !== PAGE_LIMIT ||
      typeof report.offset !== "number" || !Number.isSafeInteger(report.offset) || report.offset < 0 ||
      typeof report.total_open_invoices !== "number" || !Number.isSafeInteger(report.total_open_invoices) || report.total_open_invoices < 0 ||
      typeof report.has_more !== "boolean" ||
      !Array.isArray(report.summary) || !Array.isArray(report.items) ||
      report.items.length > PAGE_LIMIT ||
      report.offset + report.items.length > report.total_open_invoices ||
      report.has_more !== (report.offset + report.items.length < report.total_open_invoices)) {
    throw new Error("تعذر تصدير أعمار الذمم: نطاق الصفحة أو لقطة الخادم غير مكتملة.");
  }

  const summarySeen = new Set<string>();
  let summaryOpenCount = 0;
  const summaryRows = report.summary.map((value) => {
    const row = record(value);
    if (!row || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) ||
        summarySeen.has(row.currency) ||
        !Number.isSafeInteger(row.open_invoice_count) || Number(row.open_invoice_count) < 0 ||
        !Number.isSafeInteger(row.overdue_invoice_count) || Number(row.overdue_invoice_count) < 0 ||
        !Number.isSafeInteger(row.unknown_due_date_count) || Number(row.unknown_due_date_count) < 0 ||
        Number(row.overdue_invoice_count) + Number(row.unknown_due_date_count) > Number(row.open_invoice_count)) {
      throw new Error("تعذر تصدير أعمار الذمم: ملخص عملة غير صالح أو مكرر.");
    }
    const amountByBucket = {
      current: parseMinor(row.current_amount, "غير المتأخر"),
      days_1_30: parseMinor(row.days_1_30_amount, "1–30 يومًا"),
      days_31_60: parseMinor(row.days_31_60_amount, "31–60 يومًا"),
      days_61_90: parseMinor(row.days_61_90_amount, "61–90 يومًا"),
      over_90: parseMinor(row.over_90_amount, "أكثر من 90 يومًا"),
      unknown_due_date: parseMinor(row.unknown_due_date_amount, "استحقاق غير محدد"),
    };
    const sum = BUCKETS.reduce((total, bucket) => total + amountByBucket[bucket], 0n);
    const total = parseMinor(row.total_outstanding_amount, "إجمالي المتبقي");
    if (sum !== total) {
      throw new Error("تعذر تصدير أعمار الذمم: مجموع شرائح العملة " + row.currency + " لا يطابق إجماليها.");
    }
    summarySeen.add(row.currency);
    summaryOpenCount += Number(row.open_invoice_count);
    return {
      currency: row.currency,
      openCount: Number(row.open_invoice_count),
      overdueCount: Number(row.overdue_invoice_count),
      unknownDueCount: Number(row.unknown_due_date_count),
      amountByBucket,
      total,
    };
  });
  if (summaryOpenCount !== report.total_open_invoices) {
    throw new Error("تعذر تصدير أعمار الذمم: مجموع الفواتير حسب العملة لا يطابق إجمالي الفواتير المفتوحة.");
  }

  const itemIds = new Set<string>();
  const invoiceNumbers = new Set<string>();
  const items = report.items.map((value) => {
    const row = record(value);
    if (!row || typeof row.id !== "string" || !row.id.trim() || itemIds.has(row.id) ||
        typeof row.invoice_number !== "string" || !row.invoice_number.trim() || row.invoice_number.length > 100 ||
        invoiceNumbers.has(row.invoice_number) ||
        typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) ||
        !validTimestamp(row.issued_at) ||
        !(row.due_at === null || row.due_at === undefined || validTimestamp(row.due_at)) ||
        !(row.days_overdue === null || (typeof row.days_overdue === "number" && Number.isSafeInteger(row.days_overdue) && row.days_overdue >= 0)) ||
        typeof row.aging_bucket !== "string" || !BUCKETS.includes(row.aging_bucket as Bucket) ||
        !summarySeen.has(row.currency)) {
      throw new Error("تعذر تصدير أعمار الذمم: سجل فاتورة غير مكتمل أو مكرر.");
    }
    const bucket = row.aging_bucket as Bucket;
    if ((bucket === "unknown_due_date" && (row.due_at != null || row.days_overdue !== null)) ||
        (bucket !== "unknown_due_date" && row.due_at == null) ||
        (bucket === "days_1_30" && !(Number(row.days_overdue) >= 1 && Number(row.days_overdue) <= 30)) ||
        (bucket === "days_31_60" && !(Number(row.days_overdue) >= 31 && Number(row.days_overdue) <= 60)) ||
        (bucket === "days_61_90" && !(Number(row.days_overdue) >= 61 && Number(row.days_overdue) <= 90)) ||
        (bucket === "over_90" && !(Number(row.days_overdue) > 90))) {
      throw new Error("تعذر تصدير أعمار الذمم: تصنيف عمر الفاتورة لا يطابق تاريخ استحقاقها.");
    }
    const total = parseMinor(row.total_amount, "إجمالي الفاتورة");
    const paid = parseMinor(row.paid_amount, "المدفوع");
    const credit = parseMinor(row.credit_memo_amount, "الإشعارات الدائنة");
    const outstanding = parseMinor(row.outstanding_amount, "المتبقي");
    if (paid + credit + outstanding !== total && outstanding !== 0n) {
      throw new Error("تعذر تصدير أعمار الذمم: إجمالي الفاتورة لا يتصالح مع المدفوع والإشعارات الدائنة والمتبقي.");
    }
    itemIds.add(row.id);
    invoiceNumbers.add(row.invoice_number);
    return {
      invoiceNumber: row.invoice_number,
      customerName: safeText(row.customer_name ?? "", "اسم العميل", 240),
      issuedAt: row.issued_at,
      dueAt: row.due_at == null ? null : row.due_at,
      currency: row.currency,
      daysOverdue: row.days_overdue as number | null,
      bucket,
      total,
      paid,
      credit,
      outstanding,
    };
  });

  return {
    asOf: report.as_of_utc,
    limit: report.limit,
    offset: report.offset,
    totalOpen: report.total_open_invoices,
    hasMore: report.has_more,
    summary: summaryRows,
    items,
  };
}

function workbookSheets(value: unknown, generatedAt: string): { name: string; rows: CellValue[][] }[] {
  if (!validTimestamp(generatedAt)) throw new Error("وقت إنشاء ملف أعمار الذمم غير صالح.");
  const report = validateReport(value);
  const pageNumber = Math.floor(report.offset / PAGE_LIMIT) + 1;
  const scope: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — أعمار الذمم المدينة"],
    ["وقت إعداد الملف", generatedAt],
    ["لقطة الخادم UTC", report.asOf],
    ["إجمالي الفواتير المفتوحة في الخادم", report.totalOpen],
    ["حد الصفحة", report.limit],
    ["رقم الصفحة", pageNumber],
    ["إزاحة الصفحة", report.offset],
    ["عدد الفواتير في هذه الصفحة", report.items.length],
    ["توجد صفحات أخرى", report.hasMore ? "نعم" : "لا"],
    ["نطاق ملخص العملات", "ملخص كامل لكل الفواتير المفتوحة حسب العملة من الخادم."],
    ["نطاق التفاصيل", "ورقة التفاصيل تحتوي الصفحة الحالية فقط؛ لا تمثل كامل دفتر الذمم عند تعدد الصفحات."],
    ["منهجية التصنيف", "شرائح العمر وتاريخ الاستحقاق كما أعادها الخادم؛ المبالغ المجهولة تبقى في بند مستقل."],
    ["فصل العملات", "لا تُجمع العملات المختلفة ولا تُستخدم أسعار صرف مفترضة."],
    ["الخصوصية", "لا يتضمن الملف معرّفات الفواتير أو العملاء أو المؤسسات أو المستخدمين الداخلية."],
    ["التكاليف والهوامش", "لا يتضمن الملف تكاليف الشراء أو هوامش الربح."],
    ["الخلايا النصية", "يُحفظ النص التجاري كنص حرفي، ولا تُنفذ صيغ قادمة من أسماء العملاء أو المستندات."],
  ];

  const summary: CellValue[][] = [
    ["العملة", "عدد الفواتير المفتوحة", "عدد الفواتير المتأخرة", "عدد تواريخ الاستحقاق غير المحددة", "غير متأخر", "1–30 يومًا", "31–60 يومًا", "61–90 يومًا", "أكثر من 90 يومًا", "استحقاق غير محدد", "إجمالي المتبقي"],
    ...report.summary.map((row) => [
      row.currency,
      row.openCount,
      row.overdueCount,
      row.unknownDueCount,
      moneyText(row.amountByBucket.current),
      moneyText(row.amountByBucket.days_1_30),
      moneyText(row.amountByBucket.days_31_60),
      moneyText(row.amountByBucket.days_61_90),
      moneyText(row.amountByBucket.over_90),
      moneyText(row.amountByBucket.unknown_due_date),
      moneyText(row.total),
    ]),
  ];

  const details: CellValue[][] = [
    ["رقم الفاتورة", "العميل", "تاريخ الإصدار", "تاريخ الاستحقاق", "أيام التأخر", "شريحة العمر", "العملة", "إجمالي الفاتورة", "المدفوع", "الإشعارات الدائنة", "المتبقي"],
    ...report.items.map((row) => [
      row.invoiceNumber,
      row.customerName,
      row.issuedAt,
      row.dueAt,
      row.daysOverdue,
      bucketLabels[row.bucket],
      row.currency,
      moneyText(row.total),
      moneyText(row.paid),
      moneyText(row.credit),
      moneyText(row.outstanding),
    ]),
  ];

  return [
    { name: "نطاق التقرير", rows: scope },
    { name: "ملخص حسب العملة", rows: summary },
    { name: "تفاصيل الصفحة", rows: details },
  ];
}

function workbookFiles(value: unknown, generatedAt: string): { name: string; content: string }[] {
  const sheets = workbookSheets(value, generatedAt);
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets.map((_sheet, index) => '<Override PartName="/xl/worksheets/sheet' + (index + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
  const rootRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets>' + sheets.map((sheet, index) => '<sheet name="' + xmlEscape(sheet.name) + '" sheetId="' + (index + 1) + '" r:id="rId' + (index + 1) + '"/>').join("") + '</sheets>' +
    '<calcPr calcId="191029"/></workbook>';
  const workbookRelationships = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    sheets.map((_sheet, index) => '<Relationship Id="rId' + (index + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (index + 1) + '.xml"/>').join("") +
    '</Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(BUSINESS_BRAND_NAME + " — أعمار الذمم المدينة") + '</dc:title><dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) + '</dc:creator>' +
    '<dc:subject>Tenant-scoped receivables aging report with full-currency summary and bounded page details</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">' +
    xmlEscape(generatedAt) + '</dcterms:created></cp:coreProperties>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>' + xmlEscape(BUSINESS_BRAND_NAME) + '</Application><TitlesOfParts><vt:vector size="' + sheets.length + '" baseType="lpstr">' +
    sheets.map((sheet) => '<vt:lpstr>' + xmlEscape(sheet.name) + '</vt:lpstr>').join("") +
    '</vt:vector></TitlesOfParts></Properties>';
  return [
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRelationships },
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

export function buildReceivablesAgingWorkbookXlsx(value: unknown, generatedAt = new Date().toISOString()): Uint8Array {
  return zipStore(workbookFiles(value, generatedAt));
}

export function downloadReceivablesAgingWorkbookXlsx(value: unknown, generatedAt = new Date().toISOString()): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل ملفات Excel غير متاح في هذا المتصفح.");
  }
  const bytes = buildReceivablesAgingWorkbookXlsx(value, generatedAt);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-receivables-aging-" + generatedAt.slice(0, 10) + ".xlsx";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
