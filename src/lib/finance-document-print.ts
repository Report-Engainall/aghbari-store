import { BUSINESS_BRAND_NAME, BUSINESS_BRAND_NAME_AR, BUSINESS_BRAND_NAME_EN_UPPER } from "@/lib/brand";
import { readPrintableReturnCreditMemo } from "@/lib/customer-return-credit-memos";
import financeDocumentPrintStyles from "@/lib/finance-document-print.styles.css?inline";

type UnknownRecord = Record<string, unknown>;
type Money = string;
const CURRENCY_CODE = /^[A-Z]{3}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface FinancePrintCustomer {
  id: string;
  customer_code: string | null;
  business_name: string | null;
  contact_name: string | null;
}
export interface FinancePrintInvoiceOption {
  id: string;
  invoice_number: string;
  customer_id: string;
  customer_name: string;
  status: string;
  issued_at: string;
  currency: string;
}
export interface FinancePrintCreditMemoOption {
  id: string;
  memo_number: string;
  customer_id: string;
  customer_name: string;
  invoice_number: string;
  status: "draft" | "posted" | "reversed";
  created_at: string;
  currency: string;
  total_amount: Money;
}
export interface FinancePrintOptions {
  organization_name: string;
  customers: FinancePrintCustomer[];
  customers_has_more: boolean;
  invoices: FinancePrintInvoiceOption[];
  invoices_has_more: boolean;
  credit_memos: FinancePrintCreditMemoOption[];
  credit_memos_has_more: boolean;
  limit: number;
}
export interface StaffInvoiceLine {
  id: string;
  item_code: string | null;
  description: string;
  unit: string | null;
  quantity: string;
  unit_price: Money;
  line_total: Money;
}
export interface StaffInvoicePrintPayload {
  invoice: {
    id: string;
    invoice_number: string;
    status: string;
    issued_at: string;
    due_at: string | null;
    currency: string;
    subtotal: Money;
    tax_amount: Money;
    total_amount: Money;
  };
  customer: FinancePrintCustomer;
  lines: StaffInvoiceLine[];
}
export interface StaffStatementInvoice {
  id: string;
  invoice_number: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  currency: string;
  subtotal: Money;
  tax_amount: Money;
  total_amount: Money;
  paid_amount: Money;
  credit_memo_amount: Money;
  outstanding_amount: Money;
}
export interface StaffStatementPayment {
  id: string;
  invoice_id: string;
  invoice_number: string;
  currency: string;
  amount: Money;
  paid_at: string;
  payment_method: string;
  reference: string | null;
}
export interface StaffStatementCredit {
  id: string;
  memo_number: string;
  invoice_id: string;
  invoice_number: string;
  currency: string;
  subtotal_amount: Money;
  tax_amount: Money;
  total_amount: Money;
  created_at: string;
  posted_at: string;
}
export interface StaffStatementSummary {
  currency: string;
  invoiced: Money;
  paid: Money;
  credited: Money;
  outstanding: Money;
  overdue_invoice_count: number;
  overdue_outstanding: Money;
  unknown_due_date_invoice_count: number;
  unknown_due_date_outstanding: Money;
}
export interface StaffStatementPrintPayload {
  customer: FinancePrintCustomer;
  invoices: StaffStatementInvoice[];
  payments: StaffStatementPayment[];
  credits: StaffStatementCredit[];
  summary: StaffStatementSummary[];
  summary_as_of_utc: string;
  truncated: { invoices: boolean; payments: boolean; credits: boolean };
  full_statement: true;
  record_counts: { invoices: number; payments: number; credits: number; total: number };
}
export type PrintableCreditMemo = ReturnType<typeof readPrintableReturnCreditMemo>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requiredText(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("بيانات المستند المالي غير مكتملة: " + name);
  return value.trim();
}
function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function readBoolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") throw new Error("قيمة صلاحية قائمة المستندات غير صالحة: " + name);
  return value;
}
function readCurrency(value: unknown): string {
  const currency = requiredText(value, "currency").toUpperCase();
  if (!CURRENCY_CODE.test(currency)) throw new Error("رمز عملة غير صالح في المستند المالي.");
  return currency;
}
function normalizedMoney(value: unknown, name: string): Money {
  const raw = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof raw !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) {
    throw new Error("قيمة مالية غير صالحة في المستند: " + name);
  }
  const parts = raw.trim().split(".");
  return parts[0] + "." + (parts[1] ?? "").padEnd(2, "0");
}
function moneyCents(value: Money): bigint {
  const [whole, fraction] = value.split(".");
  return BigInt(whole) * 100n + BigInt(fraction);
}
function quantityText(value: unknown, name: string): string {
  const raw = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof raw !== "string" || !/^\d+(?:\.\d{1,3})?$/.test(raw.trim())) {
    throw new Error("كمية غير صالحة في المستند: " + name);
  }
  return raw.trim();
}
function isoDate(value: unknown, name: string): string {
  const raw = requiredText(value, name);
  if (!Number.isFinite(Date.parse(raw))) throw new Error("تاريخ غير صالح في المستند: " + name);
  return raw;
}
function readCustomer(value: unknown): FinancePrintCustomer {
  if (!isRecord(value)) throw new Error("بيانات العميل في المستند غير صالحة.");
  return {
    id: requiredText(value.id, "customer.id"),
    customer_code: nullableText(value.customer_code),
    business_name: nullableText(value.business_name),
    contact_name: nullableText(value.contact_name),
  };
}
function customerLabel(customer: FinancePrintCustomer): string {
  // Internal UUIDs are authorization keys, not customer-facing document labels.
  return customer.business_name || customer.contact_name || customer.customer_code || "عميل غير مسمى";
}
function printableMemoCustomerLabel(value: unknown, fallbackValue: unknown): string {
  const label = nullableText(value);
  if (label && !UUID.test(label)) return label;
  const fallback = nullableText(fallbackValue);
  if (fallback && !UUID.test(fallback)) return fallback;
  return "عميل غير مسمى";
}
function assertUUID(value: string, name: string): string {
  if (!UUID.test(value)) throw new Error("معرّف غير صالح في المستند: " + name);
  return value;
}

export function readFinancePrintOptions(value: unknown): FinancePrintOptions {
  if (!isRecord(value) || !Array.isArray(value.customers) || !Array.isArray(value.invoices) || !Array.isArray(value.credit_memos)) {
    throw new Error("أعاد الخادم قائمة مستندات مالية غير مكتملة.");
  }
  const customers = value.customers.map((item) => readCustomer(item));
  const invoices = value.invoices.map((item): FinancePrintInvoiceOption => {
    if (!isRecord(item)) throw new Error("عنصر فاتورة للطباعة غير صالح.");
    const status = requiredText(item.status, "invoice.status");
    const currency = readCurrency(item.currency);
    return {
      id: assertUUID(requiredText(item.id, "invoice.id"), "invoice.id"),
      invoice_number: requiredText(item.invoice_number, "invoice.invoice_number"),
      customer_id: assertUUID(requiredText(item.customer_id, "invoice.customer_id"), "invoice.customer_id"),
      customer_name: requiredText(item.customer_name, "invoice.customer_name"),
      status,
      issued_at: isoDate(item.issued_at, "invoice.issued_at"),
      currency,
    };
  });
  const credit_memos = value.credit_memos.map((item): FinancePrintCreditMemoOption => {
    if (!isRecord(item)) throw new Error("عنصر إشعار دائن للطباعة غير صالح.");
    const status = requiredText(item.status, "credit_memo.status");
    if (status !== "draft" && status !== "posted" && status !== "reversed") throw new Error("حالة إشعار دائن غير مسموحة للطباعة.");
    return {
      id: assertUUID(requiredText(item.id, "credit_memo.id"), "credit_memo.id"),
      memo_number: requiredText(item.memo_number, "credit_memo.memo_number"),
      customer_id: assertUUID(requiredText(item.customer_id, "credit_memo.customer_id"), "credit_memo.customer_id"),
      customer_name: requiredText(item.customer_name, "credit_memo.customer_name"),
      invoice_number: requiredText(item.invoice_number, "credit_memo.invoice_number"),
      status,
      created_at: isoDate(item.created_at, "credit_memo.created_at"),
      currency: readCurrency(item.currency),
      total_amount: normalizedMoney(item.total_amount, "credit_memo.total_amount"),
    };
  });
  const limit = itemCount(value.limit, "limit");
  return {
    organization_name: requiredText(value.organization_name, "organization_name"),
    customers,
    customers_has_more: readBoolean(value.customers_has_more, "customers_has_more"),
    invoices,
    invoices_has_more: readBoolean(value.invoices_has_more, "invoices_has_more"),
    credit_memos,
    credit_memos_has_more: readBoolean(value.credit_memos_has_more, "credit_memos_has_more"),
    limit,
  };
}
function itemCount(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 500) {
    throw new Error("عدد عناصر غير صالح في قائمة المستندات: " + name);
  }
  return value;
}

export function readStaffInvoicePrintPayload(value: unknown): StaffInvoicePrintPayload {
  if (!isRecord(value) || !isRecord(value.invoice) || !Array.isArray(value.lines)) {
    throw new Error("بيانات الفاتورة للطباعة غير مكتملة.");
  }
  const invoiceRaw = value.invoice;
  const invoice = {
    id: assertUUID(requiredText(invoiceRaw.id, "invoice.id"), "invoice.id"),
    invoice_number: requiredText(invoiceRaw.invoice_number, "invoice.invoice_number"),
    status: requiredText(invoiceRaw.status, "invoice.status"),
    issued_at: isoDate(invoiceRaw.issued_at, "invoice.issued_at"),
    due_at: invoiceRaw.due_at == null ? null : isoDate(invoiceRaw.due_at, "invoice.due_at"),
    currency: readCurrency(invoiceRaw.currency),
    subtotal: normalizedMoney(invoiceRaw.subtotal, "invoice.subtotal"),
    tax_amount: normalizedMoney(invoiceRaw.tax_amount, "invoice.tax_amount"),
    total_amount: normalizedMoney(invoiceRaw.total_amount, "invoice.total_amount"),
  };
  const customer = readCustomer(value.customer);
  if (value.lines.length < 1 || value.lines.length > 500) throw new Error("عدد بنود الفاتورة خارج حدود الطباعة الآمنة.");
  const lines = value.lines.map((raw): StaffInvoiceLine => {
    if (!isRecord(raw)) throw new Error("بند فاتورة غير صالح.");
    return {
      id: requiredText(raw.id, "line.id"),
      item_code: nullableText(raw.item_code),
      description: requiredText(raw.description, "line.description"),
      unit: nullableText(raw.unit),
      quantity: quantityText(raw.quantity, "line.quantity"),
      unit_price: normalizedMoney(raw.unit_price, "line.unit_price"),
      line_total: normalizedMoney(raw.line_total, "line.line_total"),
    };
  });
  const linesCents = lines.reduce((sum, line) => sum + moneyCents(line.line_total), 0n);
  if (linesCents !== moneyCents(invoice.subtotal) || moneyCents(invoice.subtotal) + moneyCents(invoice.tax_amount) !== moneyCents(invoice.total_amount)) {
    throw new Error("بنود الفاتورة أو الضريبة لا تتطابق مع إجمالي المصدر؛ تم منع الطباعة.");
  }
  return { invoice, customer, lines };
}

export function readStaffStatementPrintPayload(value: unknown): StaffStatementPrintPayload {
  if (!isRecord(value) || !Array.isArray(value.invoices) || !Array.isArray(value.payments) ||
      !Array.isArray(value.credits) || !Array.isArray(value.summary) || !isRecord(value.truncated)) {
    throw new Error("بيانات كشف الحساب للطباعة غير مكتملة.");
  }
  const customer = readCustomer(value.customer);
  const invoices = value.invoices.map((raw): StaffStatementInvoice => {
    if (!isRecord(raw)) throw new Error("سطر فاتورة في كشف الحساب غير صالح.");
    return {
      id: assertUUID(requiredText(raw.id, "statement.invoice.id"), "statement.invoice.id"),
      invoice_number: requiredText(raw.invoice_number, "statement.invoice.invoice_number"),
      status: requiredText(raw.status, "statement.invoice.status"),
      issued_at: isoDate(raw.issued_at, "statement.invoice.issued_at"),
      due_at: raw.due_at == null ? null : isoDate(raw.due_at, "statement.invoice.due_at"),
      currency: readCurrency(raw.currency),
      subtotal: normalizedMoney(raw.subtotal, "statement.invoice.subtotal"),
      tax_amount: normalizedMoney(raw.tax_amount, "statement.invoice.tax_amount"),
      total_amount: normalizedMoney(raw.total_amount, "statement.invoice.total_amount"),
      paid_amount: normalizedMoney(raw.paid_amount, "statement.invoice.paid_amount"),
      credit_memo_amount: normalizedMoney(raw.credit_memo_amount, "statement.invoice.credit_memo_amount"),
      outstanding_amount: normalizedMoney(raw.outstanding_amount, "statement.invoice.outstanding_amount"),
    };
  });
  const payments = value.payments.map((raw): StaffStatementPayment => {
    if (!isRecord(raw)) throw new Error("سطر دفعة في كشف الحساب غير صالح.");
    return {
      id: requiredText(raw.id, "payment.id"),
      invoice_id: assertUUID(requiredText(raw.invoice_id, "payment.invoice_id"), "payment.invoice_id"),
      invoice_number: requiredText(raw.invoice_number, "payment.invoice_number"),
      currency: readCurrency(raw.currency),
      amount: normalizedMoney(raw.amount, "payment.amount"),
      paid_at: isoDate(raw.paid_at, "payment.paid_at"),
      payment_method: requiredText(raw.payment_method, "payment.payment_method"),
      reference: nullableText(raw.reference),
    };
  });
  const credits = value.credits.map((raw): StaffStatementCredit => {
    if (!isRecord(raw)) throw new Error("سطر إشعار دائن في كشف الحساب غير صالح.");
    return {
      id: requiredText(raw.id, "credit.id"),
      memo_number: requiredText(raw.memo_number, "credit.memo_number"),
      invoice_id: assertUUID(requiredText(raw.invoice_id, "credit.invoice_id"), "credit.invoice_id"),
      invoice_number: requiredText(raw.invoice_number, "credit.invoice_number"),
      currency: readCurrency(raw.currency),
      subtotal_amount: normalizedMoney(raw.subtotal_amount, "credit.subtotal_amount"),
      tax_amount: normalizedMoney(raw.tax_amount, "credit.tax_amount"),
      total_amount: normalizedMoney(raw.total_amount, "credit.total_amount"),
      created_at: isoDate(raw.created_at, "credit.created_at"),
      posted_at: isoDate(raw.posted_at, "credit.posted_at"),
    };
  });
  const summary = value.summary.map((raw): StaffStatementSummary => {
    if (!isRecord(raw)) throw new Error("ملخص عملة في كشف الحساب غير صالح.");
    const row = {
      currency: readCurrency(raw.currency),
      invoiced: normalizedMoney(raw.invoiced, "summary.invoiced"),
      paid: normalizedMoney(raw.paid, "summary.paid"),
      credited: normalizedMoney(raw.credited, "summary.credited"),
      outstanding: normalizedMoney(raw.outstanding, "summary.outstanding"),
      overdue_invoice_count: nonNegativeCount(raw.overdue_invoice_count, "summary.overdue_invoice_count"),
      overdue_outstanding: normalizedMoney(raw.overdue_outstanding, "summary.overdue_outstanding"),
      unknown_due_date_invoice_count: nonNegativeCount(raw.unknown_due_date_invoice_count, "unknown_due_date_invoice_count"),
      unknown_due_date_outstanding: normalizedMoney(raw.unknown_due_date_outstanding, "summary.unknown_due_date_outstanding"),
    };
    if (moneyCents(row.overdue_outstanding) + moneyCents(row.unknown_due_date_outstanding) > moneyCents(row.outstanding)) {
      throw new Error("شرائح أعمار الذمم تتجاوز الرصيد المستحق في كشف الحساب.");
    }
    return row;
  });
  if (new Set(summary.map((row) => row.currency)).size !== summary.length) throw new Error("كشف الحساب يحتوي ملخصًا مكررًا للعملة.");
  const truncated = {
    invoices: readBoolean(value.truncated.invoices, "truncated.invoices"),
    payments: readBoolean(value.truncated.payments, "truncated.payments"),
    credits: readBoolean(value.truncated.credits, "truncated.credits"),
  };
  if (value.full_statement !== true || !isRecord(value.record_counts)) {
    throw new Error("كشف الحساب ليس معلّمًا من الخادم ككشف كامل.");
  }
  const record_counts = {
    invoices: nonNegativeCount(value.record_counts.invoices, "record_counts.invoices"),
    payments: nonNegativeCount(value.record_counts.payments, "record_counts.payments"),
    credits: nonNegativeCount(value.record_counts.credits, "record_counts.credits"),
    total: nonNegativeCount(value.record_counts.total, "record_counts.total"),
  };
  if (truncated.invoices || truncated.payments || truncated.credits ||
      record_counts.invoices !== invoices.length ||
      record_counts.payments !== payments.length ||
      record_counts.credits !== credits.length ||
      record_counts.total !== record_counts.invoices + record_counts.payments + record_counts.credits ||
      record_counts.total > 10000) {
    throw new Error("تفاصيل كشف الحساب لا تطابق أعداد السجلات الكاملة؛ تم منع الطباعة.");
  }
  return {
    customer, invoices, payments, credits, summary,
    summary_as_of_utc: isoDate(value.summary_as_of_utc, "summary_as_of_utc"),
    truncated, full_statement: true, record_counts,
  };
}
function nonNegativeCount(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("عدد غير صالح في المستند: " + name);
  return value;
}

function fmtDate(value: string): string {
  return new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}
function fmtDateTime(value: string): string {
  return new Intl.DateTimeFormat("ar-YE", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}
function fmtMoney(value: Money, currency: string): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "غير متاح";
  return new Intl.NumberFormat("ar-YE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(numeric) + " " + currency;
}
function fmtQty(value: string): string {
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(Number(value));
}
function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function addBase(doc: Document, title: string): HTMLElement {
  doc.title = `${title} | ${BUSINESS_BRAND_NAME}`;
  doc.documentElement.lang = "ar";
  doc.documentElement.dir = "rtl";
  doc.body.replaceChildren();
  const style = el(doc, "style");
  style.textContent = financeDocumentPrintStyles;
  doc.head.appendChild(style);
  const main = el(doc, "main");
  const header = el(doc, "header");
  const brandBox = el(doc, "div");
  brandBox.setAttribute("aria-label", BUSINESS_BRAND_NAME);
  brandBox.append(el(doc, "div", BUSINESS_BRAND_NAME_AR, "brand"), el(doc, "small", BUSINESS_BRAND_NAME_EN_UPPER));
  const titleBox = el(doc, "div");
  titleBox.append(el(doc, "h1", title), el(doc, "p", "تاريخ إنشاء المستند: " + fmtDateTime(new Date().toISOString())));
  header.append(brandBox, titleBox);
  main.appendChild(header);
  doc.body.appendChild(main);
  return main;
}
function addMeta(doc: Document, main: HTMLElement, rows: Array<[string, string]>) {
  const section = el(doc, "section", undefined, "meta");
  for (const [label, value] of rows) {
    const p = el(doc, "p");
    p.append(el(doc, "strong", label + ": "), doc.createTextNode(value));
    section.appendChild(p);
  }
  main.appendChild(section);
}
function addTable(doc: Document, main: HTMLElement, title: string, headers: string[], rows: string[][]) {
  main.appendChild(el(doc, "h2", title));
  const table = el(doc, "table");
  const head = el(doc, "thead");
  const headerRow = el(doc, "tr");
  for (const label of headers) headerRow.appendChild(el(doc, "th", label));
  head.appendChild(headerRow);
  table.appendChild(head);
  const body = el(doc, "tbody");
  for (const values of rows) {
    const row = el(doc, "tr");
    for (const value of values) row.appendChild(el(doc, "td", value));
    body.appendChild(row);
  }
  if (!rows.length) {
    const row = el(doc, "tr");
    const cell = el(doc, "td", "لا توجد حركات ضمن السجل المتاح.");
    cell.colSpan = headers.length;
    row.appendChild(cell);
    body.appendChild(row);
  }
  table.appendChild(body);
  main.appendChild(table);
}
function addNote(doc: Document, main: HTMLElement, text: string) {
  main.appendChild(el(doc, "p", text, "note"));
}
function statusAr(status: string): string {
  const statuses: Record<string, string> = { issued: "صادرة", partially_paid: "مدفوعة جزئيًا", paid: "مدفوعة", void: "ملغاة", draft: "مسودة — غير مُرحّلة", posted: "مُرحّل محاسبيًا", reversed: "معكوس ماليًا" };
  return statuses[status] ?? status;
}

export function renderStaffInvoiceDocument(doc: Document, payload: StaffInvoicePrintPayload, organizationName: string): void {
  const issuerName = requiredText(organizationName, "organization_name");
  const main = addBase(doc, "فاتورة العميل " + payload.invoice.invoice_number);
  addMeta(doc, main, [
    ["المؤسسة المصدرة", issuerName],
    ["العميل", customerLabel(payload.customer)],
    ["رقم العميل", payload.customer.customer_code || "غير مسجل"],
    ["رقم الفاتورة", payload.invoice.invoice_number],
    ["الحالة", statusAr(payload.invoice.status)],
    ["تاريخ الإصدار", fmtDate(payload.invoice.issued_at)],
    ["تاريخ الاستحقاق", payload.invoice.due_at ? fmtDate(payload.invoice.due_at) : "غير محدد"],
    ["العملة", payload.invoice.currency],
  ]);
  addTable(doc, main, "تفاصيل الفاتورة", ["رمز الصنف", "الصنف", "الوحدة", "الكمية", "سعر الوحدة", "الإجمالي"], payload.lines.map((line) => [
    line.item_code || "—", line.description, line.unit || "—", fmtQty(line.quantity),
    fmtMoney(line.unit_price, payload.invoice.currency), fmtMoney(line.line_total, payload.invoice.currency),
  ]));
  const totals = el(doc, "section", undefined, "totals");
  totals.append(el(doc, "p", "المجموع قبل الضريبة: " + fmtMoney(payload.invoice.subtotal, payload.invoice.currency)));
  totals.append(el(doc, "p", "الضريبة: " + fmtMoney(payload.invoice.tax_amount, payload.invoice.currency)));
  totals.append(el(doc, "p", "الإجمالي النهائي: " + fmtMoney(payload.invoice.total_amount, payload.invoice.currency), "grand"));
  main.appendChild(totals);
  addNote(doc, main, "تم إنشاء بيانات الفاتورة من مصدر محاسبي داخل المؤسسة الحالية. المستند لا ينشئ دفعة ولا يغير حالة الفاتورة.");
}

export function renderStaffStatementDocument(doc: Document, payload: StaffStatementPrintPayload, organizationName: string): void {
  const issuerName = requiredText(organizationName, "organization_name");
  const main = addBase(doc, "كشف حساب العميل " + customerLabel(payload.customer));
  addMeta(doc, main, [
    ["المؤسسة المصدرة", issuerName],
    ["العميل", customerLabel(payload.customer)],
    ["رقم العميل", payload.customer.customer_code || "غير مسجل"],
    ["تاريخ الرصيد المرجعي", fmtDateTime(payload.summary_as_of_utc)],
  ]);
  addTable(doc, main, "ملخص الذمم الكامل حسب العملة", [
    "العملة", "إجمالي الفواتير", "المدفوع", "الإشعارات الدائنة المرحلة", "المتبقي", "فواتير متأخرة", "قيمة المتأخر", "استحقاق غير محدد",
  ], payload.summary.map((row) => [
    row.currency, fmtMoney(row.invoiced, row.currency), fmtMoney(row.paid, row.currency), fmtMoney(row.credited, row.currency),
    fmtMoney(row.outstanding, row.currency), row.overdue_invoice_count.toLocaleString("ar-YE"),
    fmtMoney(row.overdue_outstanding, row.currency), fmtMoney(row.unknown_due_date_outstanding, row.currency),
  ]));
  addTable(doc, main, "الفواتير (أحدث السجلات)", [
    "الفاتورة", "الإصدار", "الاستحقاق", "الحالة", "الإجمالي", "المدفوع", "الإشعار الدائن", "المتبقي",
  ], payload.invoices.map((row) => [
    row.invoice_number, fmtDate(row.issued_at), row.due_at ? fmtDate(row.due_at) : "غير محدد", statusAr(row.status),
    fmtMoney(row.total_amount, row.currency), fmtMoney(row.paid_amount, row.currency),
    fmtMoney(row.credit_memo_amount, row.currency), fmtMoney(row.outstanding_amount, row.currency),
  ]));
  addTable(doc, main, "الدفعات المسجلة", ["التاريخ", "مرجع الفاتورة", "طريقة الدفع", "المرجع", "المبلغ"], payload.payments.map((row) => [
    fmtDate(row.paid_at), row.invoice_number, row.payment_method, row.reference || "—", fmtMoney(row.amount, row.currency),
  ]));
  addTable(doc, main, "الإشعارات الدائنة المرحلة", ["الإشعار", "الفاتورة", "الإنشاء", "الترحيل", "الإجمالي"], payload.credits.map((row) => [
    row.memo_number, row.invoice_number, fmtDate(row.created_at), fmtDate(row.posted_at), fmtMoney(row.total_amount, row.currency),
  ]));
  if (payload.truncated.invoices || payload.truncated.payments || payload.truncated.credits) {
    const limited: string[] = [];
    if (payload.truncated.invoices) limited.push("الفواتير: أحدث 200");
    if (payload.truncated.payments) limited.push("الدفعات: أحدث 500");
    if (payload.truncated.credits) limited.push("الإشعارات الدائنة: أحدث 500");
    addNote(doc, main, "تنبيه: تفاصيل بعض الجداول محدودة (" + limited.join("؛ ") + "). ملخص الأرصدة محسوب خادميًا من كامل دفتر العميل حسب العملة، ولا تُعامل التفاصيل المحدودة كحركة كاملة.");
  } else {
    addNote(doc, main, "كشف الحساب مبني على الفواتير والدفعات والإشعارات الدائنة المرحلة ضمن دفتر المؤسسة. المسودات لا تخفض الذمم.");
  }
}

export function renderCreditMemoDocument(doc: Document, payload: PrintableCreditMemo, organizationName: string): void {
  const issuerName = requiredText(organizationName, "organization_name");
  const main = addBase(doc, "الإشعار الدائن " + payload.memo.memo_number);
  const metadata: Array<[string, string]> = [
    ["المؤسسة المصدرة", issuerName],
    ["العميل", printableMemoCustomerLabel(payload.customer.name, payload.customer.contact_name)],
    ["الطلب", payload.invoice.order_number],
    ["الفاتورة الأصلية", payload.invoice.invoice_number],
    ["رقم الإشعار", payload.memo.memo_number],
    ["حالة الإشعار", statusAr(payload.memo.status)],
    ["رقم القيد الأصلي", payload.journal.entry_number],
    ["حالة القيد الأصلي", statusAr(payload.journal.status)],
    ["تاريخ الإعداد", fmtDateTime(payload.memo.created_at)],
  ];
  if (payload.memo.status === "reversed") {
    if (!payload.memo.reversed_at || !payload.memo.reversal_reason || !payload.memo.reversal_journal_entry_number) {
      throw new Error("الإشعار المعكوس يفتقد دليل العكس المالي؛ تم منع الطباعة.");
    }
    metadata.push(
      ["تاريخ العكس", fmtDateTime(payload.memo.reversed_at)],
      ["رقم قيد العكس", payload.memo.reversal_journal_entry_number],
      ["حالة قيد العكس", "مُرحّل محاسبيًا"],
      ["سبب العكس", payload.memo.reversal_reason],
    );
  }
  addMeta(doc, main, metadata);
  addTable(doc, main, "تفاصيل البنود المرتجعة", ["رمز الصنف", "الصنف", "الوحدة", "الكمية المرتجعة", "كمية الفاتورة", "قيمة السطر", "القيمة الدائنة"], payload.lines.map((line) => [
    line.item_code || "—", line.description, line.unit || "—", fmtQty(String(line.returned_quantity)),
    fmtQty(String(line.invoice_quantity)), fmtMoney(String(line.invoice_line_total.toFixed(2)), payload.invoice.currency),
    fmtMoney(String(line.credited_subtotal.toFixed(2)), payload.memo.currency),
  ]));
  const totals = el(doc, "section", undefined, "totals");
  totals.append(el(doc, "p", "المجموع قبل الضريبة: " + fmtMoney(payload.memo.subtotal_amount.toFixed(2), payload.memo.currency)));
  totals.append(el(doc, "p", "الضريبة: " + fmtMoney(payload.memo.tax_amount.toFixed(2), payload.memo.currency)));
  totals.append(el(doc, "p", "الإجمالي الدائن: " + fmtMoney(payload.memo.total_amount.toFixed(2), payload.memo.currency), "grand"));
  main.appendChild(totals);
  addNote(doc, main, payload.memo.status === "draft"
    ? "هذه مسودة غير مُرحّلة ولا تغير ذمم العميل أو السجلات المحاسبية، ولا تمثل إثبات استرداد نقدي."
    : payload.memo.status === "reversed"
      ? "هذا الإشعار معكوس ماليًا بقيد مقابل مُرحّل؛ لا يمثل رصيدًا دائنًا قائمًا ولا إثبات استرداد نقدي."
      : "تم ترحيل الإشعار والقيد المزدوج المرتبط به. هذا المستند لا يمثل إثبات استرداد نقدي.");
}

export function readPrintableCreditMemo(value: unknown): PrintableCreditMemo {
  return readPrintableReturnCreditMemo(value);
}


// Multi-invoice receipts are printed from a fresh, finance-authorized server snapshot.
export interface FinancePrintReceiptOption {
  id: string;
  receipt_number: string;
  customer_code: string | null;
  customer_name: string;
  currency: string;
  total_amount: Money;
  allocation_count: number;
  paid_at: string;
  payment_method: string;
  reference: string | null;
}
export interface FinancePrintReceiptOptions {
  organization_name: string;
  receipts: FinancePrintReceiptOption[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}
export interface CustomerPaymentReceiptPrintPayload {
  receipt: {
    id: string;
    receipt_number: string;
    currency: string;
    total_amount: Money;
    allocation_count: number;
    payment_method: "cash" | "transfer" | "card" | "credit_adjustment" | "other";
    reference: string | null;
    paid_at: string;
  };
  customer: FinancePrintCustomer;
  allocations: Array<{
    invoice_number: string;
    invoice_issued_at: string;
    currency: string;
    amount: Money;
  }>;
}

function positiveReceiptNumber(value: unknown, name: string): string {
  const raw = requiredText(value, name);
  if (!/^[1-9]\d{0,17}$/.test(raw)) throw new Error("رقم سند القبض غير صالح.");
  return raw;
}
function receiptAllocationCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 2 || value > 50) {
    throw new Error("عدد تخصيصات سند القبض خارج الحدود المسموحة.");
  }
  return value;
}

export function readCustomerPaymentReceiptPrintOptions(value: unknown): FinancePrintReceiptOptions {
  if (!isRecord(value) || !Array.isArray(value.receipts)) {
    throw new Error("أعاد الخادم قائمة سندات القبض غير مكتملة.");
  }
  const receipts = value.receipts.map((raw): FinancePrintReceiptOption => {
    if (!isRecord(raw)) throw new Error("عنصر سند القبض في القائمة غير صالح.");
    const currency = readCurrency(raw.currency);
    return {
      id: assertUUID(requiredText(raw.id, "receipt.id"), "receipt.id"),
      receipt_number: positiveReceiptNumber(raw.receipt_number, "receipt.receipt_number"),
      customer_code: nullableText(raw.customer_code),
      customer_name: printableMemoCustomerLabel(raw.customer_name, raw.customer_code),
      currency,
      total_amount: normalizedMoney(raw.total_amount, "receipt.total_amount"),
      allocation_count: receiptAllocationCount(raw.allocation_count),
      paid_at: isoDate(raw.paid_at, "receipt.paid_at"),
      payment_method: requiredText(raw.payment_method, "receipt.payment_method"),
      reference: nullableText(raw.reference),
    };
  });
  if (receipts.some((row) => moneyCents(row.total_amount) <= 0n)) {
    throw new Error("قائمة سندات القبض تحتوي مبلغًا غير موجب.");
  }
  const total = nonNegativeCount(value.total, "receipt_options.total");
  const limit = itemCount(value.limit, "receipt_options.limit");
  const offset = nonNegativeCount(value.offset, "receipt_options.offset");
  const has_more = readBoolean(value.has_more, "receipt_options.has_more");
  if (receipts.length > limit || offset > total || offset + receipts.length > total ||
      (has_more && receipts.length === 0) ||
      new Set(receipts.map((row) => row.id)).size !== receipts.length) {
    throw new Error("صفحة سندات القبض لا تطابق العدد أو حدود الترقيم التي أعلنها الخادم.");
  }
  return {
    organization_name: requiredText(value.organization_name, "receipt_options.organization_name"),
    receipts,
    total,
    limit,
    offset,
    has_more,
  };
}

export function readCustomerPaymentReceiptPrintPayload(value: unknown): CustomerPaymentReceiptPrintPayload {
  if (!isRecord(value) || !isRecord(value.receipt) || !Array.isArray(value.allocations)) {
    throw new Error("بيانات سند القبض للطباعة غير مكتملة.");
  }
  const raw = value.receipt;
  const currency = readCurrency(raw.currency);
  const total_amount = normalizedMoney(raw.total_amount, "receipt.total_amount");
  if (moneyCents(total_amount) <= 0n) throw new Error("إجمالي سند القبض يجب أن يكون موجبًا.");
  const paymentMethod = requiredText(raw.payment_method, "receipt.payment_method");
  if (!["cash", "transfer", "card", "credit_adjustment", "other"].includes(paymentMethod)) {
    throw new Error("طريقة الدفع في سند القبض غير مدعومة للطباعة.");
  }
  const allocation_count = receiptAllocationCount(raw.allocation_count);
  if (value.allocations.length !== allocation_count) {
    throw new Error("عدد تخصيصات السند لا يطابق العدد المثبت في رأس السند.");
  }
  const allocations = value.allocations.map((item): CustomerPaymentReceiptPrintPayload["allocations"][number] => {
    if (!isRecord(item)) throw new Error("تفصيل تخصيص فاتورة في السند غير صالح.");
    const allocationCurrency = readCurrency(item.currency);
    const amount = normalizedMoney(item.amount, "allocation.amount");
    if (allocationCurrency !== currency || moneyCents(amount) <= 0n) {
      throw new Error("عملة أو قيمة أحد تخصيصات السند لا تطابق رأس السند.");
    }
    return {
      invoice_number: requiredText(item.invoice_number, "allocation.invoice_number"),
      invoice_issued_at: isoDate(item.invoice_issued_at, "allocation.invoice_issued_at"),
      currency: allocationCurrency,
      amount,
    };
  });
  if (new Set(allocations.map((item) => item.invoice_number)).size !== allocations.length) {
    throw new Error("السند يحتوي فاتورة مكررة؛ تم منع الطباعة.");
  }
  const allocatedCents = allocations.reduce((sum, item) => sum + moneyCents(item.amount), 0n);
  if (allocatedCents !== moneyCents(total_amount)) {
    throw new Error("مجموع تخصيصات الفواتير لا يطابق إجمالي سند القبض؛ تم منع الطباعة.");
  }
  const customer = readCustomer(value.customer);
  assertUUID(customer.id, "customer.id");
  return {
    receipt: {
      id: assertUUID(requiredText(raw.id, "receipt.id"), "receipt.id"),
      receipt_number: positiveReceiptNumber(raw.receipt_number, "receipt.receipt_number"),
      currency,
      total_amount,
      allocation_count,
      payment_method: paymentMethod as CustomerPaymentReceiptPrintPayload["receipt"]["payment_method"],
      reference: nullableText(raw.reference),
      paid_at: isoDate(raw.paid_at, "receipt.paid_at"),
    },
    customer,
    allocations,
  };
}

export function renderCustomerPaymentReceiptDocument(
  doc: Document,
  payload: CustomerPaymentReceiptPrintPayload,
  organizationName: string,
): void {
  const issuerName = requiredText(organizationName, "organization_name");
  const receiptNumber = "SND-" + payload.receipt.receipt_number.padStart(6, "0");
  const methods: Record<CustomerPaymentReceiptPrintPayload["receipt"]["payment_method"], string> = {
    cash: "نقدًا",
    transfer: "تحويل",
    card: "بطاقة",
    credit_adjustment: "تسوية دائنة",
    other: "أخرى",
  };
  const main = addBase(doc, "سند قبض العميل " + receiptNumber);
  addMeta(doc, main, [
    ["المؤسسة المستلمة", issuerName],
    ["العميل", customerLabel(payload.customer)],
    ["رقم العميل", payload.customer.customer_code || "غير مسجل"],
    ["رقم سند القبض", receiptNumber],
    ["تاريخ القبض", fmtDateTime(payload.receipt.paid_at)],
    ["طريقة الدفع", methods[payload.receipt.payment_method]],
    ["المرجع", payload.receipt.reference || "—"],
    ["العملة", payload.receipt.currency],
  ]);
  addTable(doc, main, "توزيع مبلغ السند على الفواتير", [
    "الفاتورة", "تاريخ الفاتورة", "العملة", "المبلغ المخصص",
  ], payload.allocations.map((item) => [
    item.invoice_number,
    fmtDate(item.invoice_issued_at),
    item.currency,
    fmtMoney(item.amount, item.currency),
  ]));
  const totals = el(doc, "section", undefined, "totals");
  totals.append(el(doc, "p", "عدد الفواتير: " + payload.receipt.allocation_count.toLocaleString("ar-YE")));
  totals.append(el(doc, "p", "إجمالي سند القبض: " + fmtMoney(payload.receipt.total_amount, payload.receipt.currency), "grand"));
  main.appendChild(totals);
  addNote(doc, main,
    "هذا سند قبض واحد موزع على الفواتير الموضحة. يحتفظ النظام بتخصيص مستقل لكل فاتورة، ولا تنشئ الطباعة أي حركة مالية جديدة أو تغيّر الأرصدة.");
}
