import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";

export type CashExpenseXlsxItem = {
  id: string;
  expense_number: string;
  category: string;
  description: string;
  amount: string;
  currency: string;
  payment_method: "cash" | "transfer" | "card" | "other";
  reference: string | null;
  expense_date: string;
  status: "posted" | "void";
  created_by_profile_id: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
};

export type CashExpenseXlsxSummary = {
  currency: string;
  posted_count: number;
  posted_amount: string;
  void_count: number;
};

export type CashExpenseXlsxPayload = {
  items: CashExpenseXlsxItem[];
  total_count: number;
  summary_by_currency: CashExpenseXlsxSummary[];
  as_of_utc: string;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type CashExpenseXlsxFilters = {
  search: string;
  from: string;
  to: string;
  status: "all" | "posted" | "void";
};

export type CashExpenseXlsxInput = {
  payload: CashExpenseXlsxPayload;
  filters: CashExpenseXlsxFilters;
  roles: readonly string[];
  exportedAt?: string;
};

const FINANCE_ROLES = new Set(["admin", "manager", "accountant"]);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;
const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

function requireText(value: unknown, label: string, max = 1000): string {
  if (typeof value !== "string" || value.trim() === "" || value.length > max) {
    throw new Error("حقل " + label + " غير صالح في تصدير المصروفات.");
  }
  return value;
}

function requireDay(value: unknown, label: string): string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) {
    throw new Error("تاريخ " + label + " غير صالح في تصدير المصروفات.");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("تاريخ " + label + " غير صالح في تصدير المصروفات.");
  }
  return value;
}

function requireTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.includes("T") || !Number.isFinite(Date.parse(value))) {
    throw new Error("وقت " + label + " غير صالح في تصدير المصروفات.");
  }
  return value;
}

function moneyCents(value: unknown, label: string, allowZero: boolean): bigint {
  if (typeof value !== "string" || !/^\d{1,20}(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("قيمة " + label + " ليست مبلغًا عشريًا صالحًا بمنزلتين كحد أقصى.");
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if ((!allowZero && cents <= 0n) || (allowZero && cents < 0n) || cents > MAX_SAFE_CENTS) {
    throw new Error("قيمة " + label + " تتجاوز حدود الدقة الآمنة لملف Excel.");
  }
  return cents;
}

function moneyNumber(value: string, label: string, allowZero: boolean): number {
  return Number(moneyCents(value, label, allowZero)) / 100;
}

function safeCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("عدد " + label + " غير صالح في تصدير المصروفات.");
  }
  return value;
}

function validateRoles(roles: readonly string[]): void {
  if (!Array.isArray(roles) || !roles.some((role) => FINANCE_ROLES.has(role))) {
    throw new Error("تصدير سجل المصروفات متاح للمحاسب والمدير والمسؤول المخوّل فقط.");
  }
}

function validateFilters(filters: CashExpenseXlsxFilters): void {
  if (!filters || typeof filters !== "object" ||
      typeof filters.search !== "string" || filters.search.length > 200 ||
      !["all", "posted", "void"].includes(filters.status)) {
    throw new Error("فلاتر سجل المصروفات غير صالحة للتصدير.");
  }
  if (filters.from) requireDay(filters.from, "البداية");
  if (filters.to) requireDay(filters.to, "النهاية");
  if (filters.from && filters.to && filters.from > filters.to) {
    throw new Error("تاريخ بداية التصفية لا يجوز أن يتجاوز تاريخ نهايتها.");
  }
}

function validatePayload(payload: CashExpenseXlsxPayload): {
  totalCount: number;
  limit: number;
  offset: number;
  pageNumber: number;
  items: Array<{ item: CashExpenseXlsxItem; amount: number }>;
  summaries: Array<{ summary: CashExpenseXlsxSummary; amount: number }>;
} {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.items) ||
      !Array.isArray(payload.summary_by_currency)) {
    throw new Error("استجابة سجل المصروفات غير مكتملة؛ أوقف التصدير.");
  }
  const totalCount = safeCount(payload.total_count, "النتائج المطابقة");
  const limit = safeCount(payload.limit, "حجم الصفحة");
  const offset = safeCount(payload.offset, "إزاحة الصفحة");
  if (limit < 1 || limit > 100 || offset > totalCount || offset % limit !== 0) {
    throw new Error("بيانات ترقيم صفحات المصروفات غير متسقة؛ أوقف التصدير.");
  }
  requireTimestamp(payload.as_of_utc, "قراءة الخادم");
  const expectedPageLength = Math.min(limit, totalCount - offset);
  if (payload.items.length !== expectedPageLength ||
      payload.has_more !== (totalCount > offset + limit)) {
    throw new Error("تفاصيل الصفحة لا تطابق عدد النتائج في الخادم؛ أوقف التصدير لمنع ملف جزئي مضلل.");
  }

  const seenIds = new Set<string>();
  const seenNumbers = new Set<string>();
  const items = payload.items.map((item, index) => {
    if (!item || typeof item !== "object") throw new Error("سجل المصروف رقم " + (index + 1) + " غير صالح.");
    const id = requireText(item.id, "مرجع السجل", 80);
    const number = requireText(item.expense_number, "رقم المصروف", 40);
    if (!/^\d+$/.test(number) || BigInt(number) <= 0n || seenIds.has(id) || seenNumbers.has(number)) {
      throw new Error("تكرر رقم مصروف أو مرجع سجل في الصفحة؛ أوقف التصدير.");
    }
    seenIds.add(id);
    seenNumbers.add(number);
    requireText(item.category, "التصنيف", 80);
    requireText(item.description, "الوصف", 600);
    requireDay(item.expense_date, "المصروف");
    requireText(item.currency, "العملة", 3);
    if (!ISO_CURRENCY.test(item.currency)) throw new Error("رمز عملة غير صالح في سجل المصروف.");
    if (!["cash", "transfer", "card", "other"].includes(item.payment_method)) {
      throw new Error("طريقة دفع غير معروفة في سجل المصروف.");
    }
    if (item.reference !== null) requireText(item.reference, "المرجع", 200);
    requireTimestamp(item.created_at, "إنشاء السجل");
    if (item.created_by_profile_id !== null) requireText(item.created_by_profile_id, "المنفذ الداخلي", 80);
    const amount = moneyNumber(item.amount, "المصروف " + number, false);
    if (item.status === "posted") {
      if (item.voided_at !== null || item.void_reason !== null) {
        throw new Error("حالة المصروف المسجل لا تتطابق مع بيانات الإلغاء.");
      }
    } else if (item.status === "void") {
      requireTimestamp(item.voided_at, "إلغاء المصروف");
      const reason = requireText(item.void_reason, "سبب الإلغاء", 500);
      if (reason.trim().length < 5) throw new Error("سبب إلغاء المصروف أقصر من الحد المعتمد.");
    } else {
      throw new Error("حالة مصروف غير معروفة في التصدير.");
    }
    return { item, amount };
  });

  const seenCurrencies = new Set<string>();
  let summaryCount = 0;
  const summaries = payload.summary_by_currency.map((summary) => {
    if (!summary || typeof summary !== "object") throw new Error("ملخص عملة غير صالح.");
    const currency = requireText(summary.currency, "عملة الملخص", 3);
    if (!ISO_CURRENCY.test(currency) || seenCurrencies.has(currency)) {
      throw new Error("عملة مكررة أو غير صالحة في ملخص المصروفات.");
    }
    seenCurrencies.add(currency);
    const postedCount = safeCount(summary.posted_count, "المصروفات المسجلة");
    const voidCount = safeCount(summary.void_count, "المصروفات الملغاة");
    if (postedCount + voidCount === 0) throw new Error("ملخص عملة فارغ لا يطابق نتائج الخادم.");
    summaryCount += postedCount + voidCount;
    const amount = moneyNumber(summary.posted_amount, "إجمالي " + currency, true);
    return { summary, amount };
  });
  if (summaryCount !== totalCount || (totalCount === 0 && summaries.length !== 0) ||
      (totalCount > 0 && summaries.length === 0)) {
    throw new Error("ملخص العملات لا يطابق العدد الكلي للنتائج؛ أوقف التصدير.");
  }
  if (items.some(({ item }) => !seenCurrencies.has(item.currency))) {
    throw new Error("عملة تفاصيل الصفحة غير موجودة في ملخص الخادم.");
  }
  return { totalCount, limit, offset, pageNumber: Math.floor(offset / limit) + 1, items, summaries };
}

function paymentLabel(method: CashExpenseXlsxItem["payment_method"]): string {
  return method === "cash" ? "نقدًا"
    : method === "transfer" ? "تحويل"
    : method === "card" ? "بطاقة"
    : "أخرى";
}

function statusLabel(status: CashExpenseXlsxItem["status"]): string {
  return status === "posted" ? "مسجل" : "ملغى مع حفظ الأثر";
}

function packageWorkbook(
  summaryRows: readonly (readonly CellValue[])[],
  detailRows: readonly (readonly CellValue[])[],
  exportedAt: string,
): Uint8Array {
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
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
  const workbook = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheets><sheet name="ملخص المصروفات" sheetId="1" r:id="rId1"/><sheet name="تفاصيل الصفحة" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029"/></workbook>';
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '</Relationships>';
  const core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + xmlEscape(BUSINESS_BRAND_NAME + " — سجل المصروفات") + '</dc:title><dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) +
    '</dc:creator><dc:subject>Current-page cash expense export</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">' +
    xmlEscape(exportedAt) + '</dcterms:created></cp:coreProperties>';
  const app = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>' + xmlEscape(BUSINESS_BRAND_NAME) + '</Application><TitlesOfParts><vt:vector size="2" baseType="lpstr">' +
    '<vt:lpstr>ملخص المصروفات</vt:lpstr><vt:lpstr>تفاصيل الصفحة</vt:lpstr></vt:vector></TitlesOfParts></Properties>';
  return zipStore([
    { name: "[Content_Types].xml", content: contentTypes },
    { name: "_rels/.rels", content: rootRels },
    { name: "docProps/core.xml", content: core },
    { name: "docProps/app.xml", content: app },
    { name: "xl/workbook.xml", content: workbook },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
    { name: "xl/worksheets/sheet1.xml", content: worksheetXml(summaryRows, false) },
    { name: "xl/worksheets/sheet2.xml", content: worksheetXml(detailRows, true) },
  ]);
}

/** Exports the full server aggregate and only the currently loaded detail page. */
export function buildCashExpenseWorkbookXlsx(input: CashExpenseXlsxInput): Uint8Array {
  validateRoles(input.roles);
  validateFilters(input.filters);
  const exportedAt = input.exportedAt ?? new Date().toISOString();
  requireTimestamp(exportedAt, "إنشاء الملف");
  const validated = validatePayload(input.payload);
  if (validated.items.length === 0) throw new Error("لا توجد تفاصيل في الصفحة الحالية لتصديرها.");

  const summaryRows: CellValue[][] = [
    ["المؤشر", "القيمة"],
    ["اسم التقرير", BUSINESS_BRAND_NAME + " — سجل المصروفات"],
    ["وقت قراءة الخادم UTC", input.payload.as_of_utc],
    ["وقت إنشاء الملف UTC", exportedAt],
    ["نطاق التفاصيل", "الصفحة الحالية فقط"],
    ["رقم الصفحة", validated.pageNumber],
    ["السجلات في تفاصيل هذه الصفحة", validated.items.length],
    ["عدد النتائج المطابقة لكل الفلاتر", validated.totalCount],
    ["حجم الصفحة", validated.limit],
    ["الإزاحة", validated.offset],
    ["البحث", input.filters.search || "دون بحث"],
    ["من تاريخ", input.filters.from || "بلا حد"],
    ["إلى تاريخ", input.filters.to || "بلا حد"],
    ["الحالة", input.filters.status === "all" ? "كل الحالات" : statusLabel(input.filters.status)],
    ["توجد صفحة لاحقة", input.payload.has_more ? "نعم" : "لا"],
    ["حدود التقرير", "ملخص العملات يشمل جميع النتائج المطابقة؛ ورقة التفاصيل لا تشمل إلا سجلات الصفحة الحالية."],
    [],
    ["ملخص جميع النتائج المطابقة حسب العملة"],
    ["العملة", "إجمالي المصروفات المسجلة", "عدد المسجل", "عدد الملغى"],
    ...validated.summaries.map(({ summary, amount }) => [
      summary.currency, amount, summary.posted_count, summary.void_count,
    ]),
  ];

  const detailRows: CellValue[][] = [
    ["رقم المصروف", "التاريخ", "التصنيف", "الوصف", "المبلغ", "العملة", "طريقة الدفع", "المرجع", "الحالة", "سبب الإلغاء"],
    ...validated.items.map(({ item, amount }) => [
      item.expense_number, item.expense_date, item.category, item.description, amount, item.currency,
      paymentLabel(item.payment_method), item.reference || null, statusLabel(item.status),
      item.status === "void" ? item.void_reason : null,
    ]),
  ];
  return packageWorkbook(summaryRows, detailRows, exportedAt);
}

export function downloadCashExpenseWorkbookXlsx(input: CashExpenseXlsxInput): boolean {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const bytes = buildCashExpenseWorkbookXlsx(input);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-cash-expenses-page-" + Math.floor(input.payload.offset / input.payload.limit + 1) +
    "-" + (input.exportedAt ?? new Date().toISOString()).slice(0, 10) + ".xlsx";
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
