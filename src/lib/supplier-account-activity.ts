import { supabase } from "./supabase";

export interface SupplierAccountActivitySupplier {
  supplierId: string;
  supplierName: string;
  currency: string;
  activityCount: number;
  debitTotal: number;
  creditTotal: number;
  netCreditMovement: number;
  lastActivityDate: string | null;
  remainingPayable?: number | null;
  pendingPaymentAmount?: number | null;
  availableToAllocate?: number | null;
  balanceComplete?: boolean;
}
export interface SupplierAccountActivityCurrencyTotal {
  currency: string;
  debitTotal: number;
  creditTotal: number;
  netCreditMovement: number;
  activityCount: number;
  remainingPayable?: number | null;
  pendingPaymentAmount?: number | null;
  availableToAllocate?: number | null;
  balanceComplete?: boolean;
}
export interface SupplierAccountActivityEntry {
  journalEntryId: string;
  journalEntryNumber: string;
  entryDate: string;
  description: string;
  sourceType: "purchase_receipt" | "purchase_supplier_credit_note" | "purchase_supplier_payment";
  documentReference: string;
  receiptNumber: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  payableAccountId: string;
  payableAccountCode: string;
  payableAccountName: string;
  debit: number;
  credit: number;
}
export interface SupplierAccountActivityPayload {
  suppliers: SupplierAccountActivitySupplier[];
  currencyTotals: SupplierAccountActivityCurrencyTotal[];
  entries: SupplierAccountActivityEntry[];
  entryCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  asOfDate: string;
  settlementIncluded: true;
}

type Raw = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown, label: string): Raw {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("بيانات " + label + " غير صالحة.");
  }
  return value as Raw;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("حقل " + label + " مفقود.");
  return value;
}
function uuid(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!UUID_PATTERN.test(parsed)) throw new Error("معرّف " + label + " غير صالح.");
  return parsed;
}
function amount(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || Math.abs(parsed) >= 10000000000000000) {
    throw new Error("مبلغ " + label + " غير صالح.");
  }
  return parsed;
}
function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("عدد " + label + " غير صالح.");
  }
  return value;
}
function date(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(parsed)) throw new Error("تاريخ " + label + " غير صالح.");
  const actual = new Date(parsed + "T00:00:00.000Z");
  if (!Number.isFinite(actual.getTime()) || actual.toISOString().slice(0, 10) !== parsed) {
    throw new Error("تاريخ " + label + " غير صالح.");
  }
  return parsed;
}
function nullableDate(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : date(value, label);
}
function currency(value: unknown): string {
  const parsed = text(value, "العملة");
  if (!/^[A-Z]{3}$/.test(parsed)) throw new Error("رمز العملة غير صالح.");
  return parsed;
}
function parseSupplier(value: unknown): SupplierAccountActivitySupplier {
  const row = object(value, "ملخص المورد");
  return {
    supplierId: uuid(row.supplier_id, "المورد"),
    supplierName: text(row.supplier_name, "اسم المورد"),
    currency: currency(row.currency),
    activityCount: count(row.activity_count, "الحركات"),
    debitTotal: amount(row.debit_total, "مدين المورد"),
    creditTotal: amount(row.credit_total, "دائن المورد"),
    netCreditMovement: amount(row.net_credit_movement, "صافي حركة المورد"),
    lastActivityDate: nullableDate(row.last_activity_date, "آخر حركة"),
    remainingPayable: row.remaining_payable === null ? null : amount(row.remaining_payable, "المستحق المتبقي"),
    pendingPaymentAmount: row.pending_payment_amount === null ? null : amount(row.pending_payment_amount, "الدفعات المعلقة"),
    availableToAllocate: row.available_to_allocate === null ? null : amount(row.available_to_allocate, "المتاح للتخصيص"),
    balanceComplete: row.balance_complete === true,
  };
}
function parseCurrencyTotal(value: unknown): SupplierAccountActivityCurrencyTotal {
  const row = object(value, "ملخص العملة");
  return {
    currency: currency(row.currency),
    debitTotal: amount(row.debit_total, "إجمالي المدين"),
    creditTotal: amount(row.credit_total, "إجمالي الدائن"),
    netCreditMovement: amount(row.net_credit_movement, "صافي الحركة"),
    activityCount: count(row.activity_count, "الحركات"),
    remainingPayable: row.remaining_payable === null ? null : amount(row.remaining_payable, "المستحق المتبقي"),
    pendingPaymentAmount: row.pending_payment_amount === null ? null : amount(row.pending_payment_amount, "الدفعات المعلقة"),
    availableToAllocate: row.available_to_allocate === null ? null : amount(row.available_to_allocate, "المتاح للتخصيص"),
    balanceComplete: row.balance_complete === true,
  };
}
function parseEntry(value: unknown): SupplierAccountActivityEntry {
  const row = object(value, "حركة الأستاذ");
  if (row.source_type !== "purchase_receipt" && row.source_type !== "purchase_supplier_credit_note" && row.source_type !== "purchase_supplier_payment") {
    throw new Error("مصدر حركة المورد غير معروف.");
  }
  const debit = amount(row.debit, "المدين");
  const credit = amount(row.credit, "الدائن");
  if (debit < 0 || credit < 0 || !((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) {
    throw new Error("حركة حساب المورد يجب أن تكون مدينة أو دائنة فقط.");
  }
  return {
    journalEntryId: uuid(row.journal_entry_id, "قيد اليومية"),
    journalEntryNumber: text(row.journal_entry_number, "رقم القيد"),
    entryDate: date(row.entry_date, "تاريخ القيد"),
    description: text(row.description, "وصف القيد"),
    sourceType: row.source_type,
    documentReference: text(row.document_reference, "مرجع المستند"),
    receiptNumber: row.receipt_number === "—" && row.source_type === "purchase_supplier_payment" ? "—" : text(row.receipt_number, "رقم إيصال الاستلام"),
    purchaseOrderNumber: row.purchase_order_number === "—" && row.source_type === "purchase_supplier_payment" ? "—" : text(row.purchase_order_number, "أمر الشراء"),
    supplierId: uuid(row.supplier_id, "المورد"),
    supplierName: text(row.supplier_name, "اسم المورد"),
    currency: currency(row.currency),
    payableAccountId: uuid(row.payable_account_id, "حساب المورد"),
    payableAccountCode: text(row.payable_account_code, "رمز حساب المورد"),
    payableAccountName: text(row.payable_account_name, "اسم حساب المورد"),
    debit,
    credit,
  };
}

export async function fetchSupplierAccountActivity(input: {
  from: string;
  to: string;
  limit: number;
  offset: number;
}): Promise<SupplierAccountActivityPayload> {
  if (input.from && input.to && input.from > input.to) {
    throw new Error("تاريخ البداية يجب ألا يتجاوز تاريخ النهاية.");
  }
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100 ||
      !Number.isInteger(input.offset) || input.offset < 0 || input.offset > 10000) {
    throw new Error("حدود عرض كشف المورد غير صالحة.");
  }
  const { data, error } = await supabase.rpc("fetch_supplier_account_activity", {
    p_from: input.from || null,
    p_to: input.to || null,
    p_limit: input.limit,
    p_offset: input.offset,
  });
  if (error) throw error;
  const row = object(data, "كشف حركة الموردين");
  if (!Array.isArray(row.suppliers) || !Array.isArray(row.currency_totals) || !Array.isArray(row.entries)) {
    throw new Error("أعاد الخادم قوائم كشف الموردين بصيغة غير صالحة.");
  }
  const limit = count(row.limit, "حد الصفحة");
  const offset = count(row.offset, "إزاحة الصفحة");
  const entryCount = count(row.entry_count, "إجمالي القيود");
  if (row.has_more !== (entryCount > offset + limit) || row.settlement_included !== true) {
    throw new Error("حدود الكشف أو نطاق بيانات التسوية غير متطابقة.");
  }
  return {
    suppliers: row.suppliers.map(parseSupplier),
    currencyTotals: row.currency_totals.map(parseCurrencyTotal),
    entries: row.entries.map(parseEntry),
    entryCount,
    limit,
    offset,
    hasMore: row.has_more,
    asOfDate: date(row.as_of_date, "تاريخ إعداد الكشف"),
    settlementIncluded: true,
  };
}
