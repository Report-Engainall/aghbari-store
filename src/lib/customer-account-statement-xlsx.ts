import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import {
  isCustomerStatementPossiblyPartial,
  summarizeAccount,
  summarizeInvoiceAmounts,
  type CustomerStatementCreditMemo,
  type InvoiceAmount,
  type PaymentAmount,
} from "@/lib/commerce-utils";
import { xmlEscape, worksheetXml, zipStore, type CellValue } from "@/lib/onyx-export";

const MAX_INVOICES = 200;
const MAX_PAYMENTS = 500;
const MAX_CREDITS = 500;

type StatementInvoice = {
  id: string;
  invoice_number: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  currency: string;
  total_amount: number | string;
  paid_amount?: number | string;
  credit_memo_amount?: number | string;
  outstanding_amount?: number | string;
};

type StatementPayment = PaymentAmount & {
  id: string;
  paid_at: string;
};

export type CustomerAccountStatementWorkbookInput = {
  invoices: readonly unknown[];
  payments: readonly unknown[];
  credits: readonly CustomerStatementCreditMemo[];
  summary: unknown;
  summaryAsOfUtc: string;
  generatedAt: string;
  creditDetailsAvailable: boolean;
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

function moneyDecimal(value: unknown, label: string, allowZero = true): string {
  const raw = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!raw || raw.length > 40 || !/^\\d+(?:\\.\\d{1,2})?$/.test(raw)) {
    throw new Error("لا يمكن تصدير كشف الحساب: قيمة " + label + " غير صالحة.");
  }
  const [whole, fraction = ""] = raw.split(".");
  let amount: bigint;
  try {
    amount = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  } catch {
    throw new Error("لا يمكن تصدير كشف الحساب: قيمة " + label + " خارج حدود الدقة.");
  }
  if ((!allowZero && amount <= 0n) || amount < 0n) {
    throw new Error("لا يمكن تصدير كشف الحساب: قيمة " + label + " يجب أن تكون موجبة.");
  }
  return (amount / 100n).toString() + "." + (amount % 100n).toString().padStart(2, "0");
}

function safeStatus(value: string): string {
  const labels: Record<string, string> = {
    issued: "صادرة",
    unpaid: "مستحقة",
    partially_paid: "مدفوعة جزئيًا",
    paid: "مدفوعة",
    void: "ملغاة",
    overdue: "متأخرة",
  };
  return labels[value] ?? value;
}

function parseInvoices(values: readonly unknown[]): StatementInvoice[] {
  if (values.length > MAX_INVOICES) {
    throw new Error("تجاوز كشف الحساب حد 200 فاتورة؛ لم يُنشأ ملف يوحي باكتمال تفاصيل غير مكتملة.");
  }
  const ids = new Set<string>();
  const numbers = new Set<string>();
  return values.map((value) => {
    const row = record(value);
    if (!row || typeof row.id !== "string" || !row.id.trim() || ids.has(row.id) ||
        typeof row.invoice_number !== "string" || !row.invoice_number.trim() ||
        row.invoice_number.length > 100 || numbers.has(row.invoice_number) ||
        typeof row.status !== "string" || !row.status.trim() || row.status.length > 40 ||
        !validTimestamp(row.issued_at) ||
        !(row.due_at === null || row.due_at === undefined || validTimestamp(row.due_at)) ||
        typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency)) {
      throw new Error("لا يمكن تصدير كشف الحساب: بيانات فاتورة غير مكتملة أو مكررة.");
    }
    moneyDecimal(row.total_amount, "إجمالي الفاتورة");
    if (row.paid_amount !== undefined) moneyDecimal(row.paid_amount, "المدفوع");
    if (row.credit_memo_amount !== undefined) moneyDecimal(row.credit_memo_amount, "الإشعارات الدائنة");
    if (row.outstanding_amount !== undefined) moneyDecimal(row.outstanding_amount, "المتبقي");
    ids.add(row.id);
    numbers.add(row.invoice_number);
    return {
      id: row.id,
      invoice_number: row.invoice_number,
      status: row.status,
      issued_at: row.issued_at,
      due_at: row.due_at === null || row.due_at === undefined ? null : row.due_at,
      currency: row.currency,
      total_amount: row.total_amount as number | string,
      ...(row.paid_amount === undefined ? {} : { paid_amount: row.paid_amount as number | string }),
      ...(row.credit_memo_amount === undefined ? {} : { credit_memo_amount: row.credit_memo_amount as number | string }),
      ...(row.outstanding_amount === undefined ? {} : { outstanding_amount: row.outstanding_amount as number | string }),
    };
  });
}

function parsePayments(values: readonly unknown[]): StatementPayment[] {
  if (values.length > MAX_PAYMENTS) {
    throw new Error("تجاوز كشف الحساب حد 500 دفعة؛ لم يُنشأ ملف جزئي غير معلن.");
  }
  const ids = new Set<string>();
  return values.map((value) => {
    const row = record(value);
    if (!row || typeof row.id !== "string" || !row.id.trim() || ids.has(row.id) ||
        typeof row.invoice_id !== "string" || !row.invoice_id.trim() ||
        !validTimestamp(row.paid_at)) {
      throw new Error("لا يمكن تصدير كشف الحساب: بيانات دفعة غير مكتملة أو مكررة.");
    }
    const amount = moneyDecimal(row.amount, "مبلغ الدفعة", false);
    ids.add(row.id);
    return { id: row.id, invoice_id: row.invoice_id, amount, paid_at: row.paid_at };
  });
}

function validateCredits(values: readonly CustomerStatementCreditMemo[]): CustomerStatementCreditMemo[] {
  if (values.length > MAX_CREDITS) {
    throw new Error("تجاوز كشف الحساب حد 500 إشعار دائن؛ لم يُنشأ ملف جزئي غير معلن.");
  }
  const ids = new Set<string>();
  for (const credit of values) {
    if (!credit || typeof credit.id !== "string" || !credit.id.trim() || ids.has(credit.id) ||
        typeof credit.memo_number !== "string" || !credit.memo_number.trim() ||
        typeof credit.invoice_number !== "string" || !credit.invoice_number.trim() ||
        typeof credit.currency !== "string" || !/^[A-Z]{3}$/.test(credit.currency) ||
        !validTimestamp(credit.posted_at)) {
      throw new Error("لا يمكن تصدير كشف الحساب: بيانات إشعار دائن غير مكتملة.");
    }
    moneyDecimal(credit.total_amount, "قيمة الإشعار الدائن", false);
    ids.add(credit.id);
  }
  return [...values];
}

function safeCurrencySummary(value: unknown, invoiceRows: StatementInvoice[], paymentRows: StatementPayment[]) {
  const summary = summarizeAccount(
    invoiceRows as InvoiceAmount[],
    paymentRows as PaymentAmount[],
    value,
  );
  if (!summary.valid) {
    throw new Error("ملخص أرصدة دفتر العميل الكامل غير متاح أو غير متسق؛ أوقف التصدير بدلًا من جمع صفحات التفاصيل المحدودة.");
  }
  if (!Array.isArray(value)) throw new Error("ملخص العملة من الخادم غير صالح.");
  const rawRows = value.map(record);
  const seen = new Set<string>();
  const rows = rawRows.map((row) => {
    if (!row || typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency) ||
        seen.has(row.currency) ||
        typeof row.overdue_invoice_count !== "number" || !Number.isSafeInteger(row.overdue_invoice_count) || row.overdue_invoice_count < 0 ||
        typeof row.unknown_due_date_invoice_count !== "number" || !Number.isSafeInteger(row.unknown_due_date_invoice_count) || row.unknown_due_date_invoice_count < 0) {
      throw new Error("ملخص أعمار الأرصدة في كشف الحساب غير مكتمل.");
    }
    const overdueOutstanding = moneyDecimal(row.overdue_outstanding, "المتأخرات");
    const unknownDueDateOutstanding = moneyDecimal(row.unknown_due_date_outstanding, "المبالغ بتاريخ استحقاق غير محدد");
    seen.add(row.currency);
    return {
      currency: row.currency,
      overdue_invoice_count: row.overdue_invoice_count,
      overdue_outstanding: overdueOutstanding,
      unknown_due_date_invoice_count: row.unknown_due_date_invoice_count,
      unknown_due_date_outstanding: unknownDueDateOutstanding,
    };
  });
  if (rows.length !== summary.currencies.length ||
      rows.some((row) => !summary.currencies.some((currency) => currency.currency === row.currency))) {
    throw new Error("قائمة العملات في ملخص كشف الحساب لا تطابق دفتر العميل.");
  }
  return summary.currencies.map((currency) => {
    const aging = rows.find((row) => row.currency === currency.currency)!;
    return { ...currency, ...aging };
  });
}

function decimalFromSafeAmount(value: number): string {
  const minor = Math.round(value * 100);
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("تعذر تمثيل قيمة كشف الحساب بدقة آمنة.");
  return Math.floor(minor / 100).toString() + "." + String(minor % 100).padStart(2, "0");
}

function workbookSheets(input: CustomerAccountStatementWorkbookInput): { name: string; rows: CellValue[][] }[] {
  if (!input.creditDetailsAvailable) {
    throw new Error("تفاصيل الإشعارات الدائنة غير متاحة من الخادم؛ أوقف التصدير حتى لا يظهر كشف الحساب ناقصًا.");
  }
  if (!validTimestamp(input.generatedAt) || !validTimestamp(input.summaryAsOfUtc)) {
    throw new Error("وقت لقطة كشف الحساب من الخادم غير صالح.");
  }
  if (!Array.isArray(input.invoices) || !Array.isArray(input.payments) || !Array.isArray(input.credits)) {
    throw new Error("تفاصيل كشف الحساب غير صالحة.");
  }

  const invoices = parseInvoices(input.invoices);
  const payments = parsePayments(input.payments);
  const credits = validateCredits(input.credits);
  const currencySummary = safeCurrencySummary(input.summary, invoices, payments);
  const possiblyPartial = isCustomerStatementPossiblyPartial(invoices.length, payments.length, credits.length);
  const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
  const validInvoiceBalances = invoices.map((invoice) => ({
    invoice,
    balance: summarizeInvoiceAmounts(invoice as InvoiceAmount, payments),
  }));
  const invalidInvoiceCount = validInvoiceBalances.filter((entry) => !entry.balance.valid).length;
  const invalidPaymentCount = payments.filter((payment) =>
    !invoiceById.has(payment.invoice_id),
  ).length;

  const overview: CellValue[][] = [
    ["البيان", "القيمة"],
    ["اسم المستند", BUSINESS_BRAND_NAME + " — كشف حساب العميل"],
    ["وقت إعداد الملف", input.generatedAt],
    ["وقت لقطة أرصدة الخادم UTC", input.summaryAsOfUtc],
    ["عدد العملات", currencySummary.length],
    ["عدد الفواتير التفصيلية", invoices.length],
    ["عدد الدفعات التفصيلية", payments.length],
    ["عدد الإشعارات الدائنة التفصيلية", credits.length],
    ["فواتير تعذر اعتماد تفاصيل مبالغها", invalidInvoiceCount],
    ["دفعات لا ترتبط بفاتورة ضمن أحدث 200 فاتورة", invalidPaymentCount],
    ["اكتمال التفاصيل", possiblyPartial ? "تفاصيل محدودة؛ قد توجد سجلات أقدم غير مدرجة" : "ضمن حدود التفاصيل التي أعادها الخادم"],
    ["مصدر الملخص المالي", "الإجماليات حسب العملة من دفتر العميل الكامل كما أعادها RPC الخادم."],
    ["نطاق الفواتير", "أحدث 200 فاتورة بحد أقصى؛ تفاصيل الفواتير الأقدم لا تظهر هنا."],
    ["نطاق الدفعات", "أحدث 500 دفعة بحد أقصى؛ الإجمالي المدفوع بالفاتورة يعتمد على مجموع الخادم الكامل."],
    ["نطاق الإشعارات الدائنة", "أحدث 500 إشعار دائن مرحّل بحد أقصى؛ لا تتضمن القائمة الإشعارات المعكوسة."],
    ["منهجية الأرصدة", "كل عملة مستقلة. لا تجمع العملات ولا تستخدم أسعار صرف مفترضة."],
    ["القيم غير المتاحة", "الخلايا غير المتاحة تبقى فارغة؛ لا تُحوّل إلى صفر."],
    ["الخصوصية", "لا يتضمن الملف معرّفات العميل أو المؤسسة أو الفواتير أو الدفعات أو الإشعارات الدائنة الداخلية."],
    ["الحقول الداخلية", "لا يتضمن الملف التكلفة أو الهامش أو حسابات الأستاذ أو بيانات أعضاء المؤسسة."],
  ];

  const balances: CellValue[][] = [
    ["العملة", "إجمالي الفواتير في الدفتر الكامل", "المدفوع في الدفتر الكامل", "الإشعارات الدائنة المرحلة", "المتبقي", "عدد الفواتير المتأخرة", "المتأخرات", "فواتير بتاريخ استحقاق غير محدد", "المبالغ بتاريخ استحقاق غير محدد"],
    ...currencySummary.map((row) => [
      row.currency,
      decimalFromSafeAmount(row.invoiced),
      decimalFromSafeAmount(row.paid),
      decimalFromSafeAmount(row.credited),
      decimalFromSafeAmount(row.outstanding),
      row.overdue_invoice_count,
      row.overdue_outstanding,
      row.unknown_due_date_invoice_count,
      row.unknown_due_date_outstanding,
    ]),
  ];

  const invoiceDetails: CellValue[][] = [
    ["رقم الفاتورة", "الحالة", "تاريخ الإصدار", "تاريخ الاستحقاق", "العملة", "الإجمالي", "المدفوع", "الإشعارات الدائنة", "المتبقي", "حالة المطابقة"],
    ...validInvoiceBalances.map(({ invoice, balance }) => [
      invoice.invoice_number,
      safeStatus(invoice.status),
      invoice.issued_at,
      invoice.due_at,
      invoice.currency,
      balance.valid ? decimalFromSafeAmount(balance.total) : null,
      balance.valid ? decimalFromSafeAmount(balance.paid) : null,
      balance.valid ? decimalFromSafeAmount(balance.credited) : null,
      balance.valid ? decimalFromSafeAmount(balance.outstanding) : null,
      balance.valid ? "مطابق" : "غير متاح — راجع مصدر الفاتورة والمدفوعات",
    ]),
  ];

  const paymentDetails: CellValue[][] = [
    ["تاريخ الدفعة", "رقم الفاتورة ضمن أحدث التفاصيل", "العملة عند توفر فاتورتها", "المبلغ", "نطاق الربط"],
    ...payments.map((payment) => {
      const invoice = invoiceById.get(payment.invoice_id);
      return [
        payment.paid_at,
        invoice?.invoice_number ?? "فاتورة خارج أحدث 200 فاتورة",
        invoice?.currency ?? null,
        payment.amount,
        invoice ? "مرتبطة بفاتورة ضمن التفاصيل" : "مرجع الفاتورة غير موجود ضمن حدود التفاصيل",
      ];
    }),
  ];

  const creditDetails: CellValue[][] = [
    ["رقم الإشعار الدائن", "رقم الفاتورة الأصلية", "تاريخ الترحيل", "العملة", "المبلغ"],
    ...credits.map((credit) => [
      credit.memo_number,
      credit.invoice_number,
      credit.posted_at,
      credit.currency,
      moneyDecimal(credit.total_amount, "قيمة الإشعار الدائن", false),
    ]),
  ];

  return [
    { name: "ملخص الكشف", rows: overview },
    { name: "الأرصدة حسب العملة", rows: balances },
    { name: "الفواتير", rows: invoiceDetails },
    { name: "الدفعات", rows: paymentDetails },
    { name: "الإشعارات الدائنة", rows: creditDetails },
  ];
}

function workbookFiles(input: CustomerAccountStatementWorkbookInput): { name: string; content: string }[] {
  const sheets = workbookSheets(input);
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
    '<dc:title>' + xmlEscape(BUSINESS_BRAND_NAME + " — كشف حساب العميل") + '</dc:title><dc:creator>' + xmlEscape(BUSINESS_BRAND_NAME) + '</dc:creator>' +
    '<dc:subject>Authenticated customer account statement with complete per-currency summary and bounded details</dc:subject><dcterms:created xsi:type="dcterms:W3CDTF">' +
    xmlEscape(input.generatedAt) + '</dcterms:created></cp:coreProperties>';
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

export function buildCustomerAccountStatementWorkbookXlsx(input: CustomerAccountStatementWorkbookInput): Uint8Array {
  return zipStore(workbookFiles(input));
}

export function downloadCustomerAccountStatementWorkbookXlsx(input: CustomerAccountStatementWorkbookInput): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("تنزيل ملفات Excel غير متاح في هذا المتصفح.");
  }
  const bytes = buildCustomerAccountStatementWorkbookXlsx(input);
  const blob = new Blob([Uint8Array.from(bytes).buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "aghbari-customer-account-statement-" + input.generatedAt.slice(0, 10) + ".xlsx";
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
