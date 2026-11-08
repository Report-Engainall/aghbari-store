import { supabase } from "./supabase";

export type SupplierPaymentMethod = "cash" | "bank_transfer" | "cheque";
export type SupplierPaymentStatus = "recorded" | "journal_draft_created" | "void";
export type SupplierPaymentSettlementKind = "cash" | "bank";
export type SupplierPaymentReconciliationAction = "matched" | "exception";
export type SupplierPaymentEvidenceType = "bank_statement_line" | "cash_voucher" | "cheque_clearance";

export interface SupplierPaymentSettlementAccount {
  id: string;
  accountingAccountId: string;
  accountCode: string;
  accountName: string;
  kind: SupplierPaymentSettlementKind;
  currency: string;
  displayName: string;
}
export interface SupplierPaymentSupplier {
  id: string;
  name: string;
}
export interface SupplierPaymentOpenReceipt {
  receiptId: string;
  receiptNumber: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  receiptDate: string;
  sourceJournalEntryId: string;
  sourceJournalEntryNumber: string;
  payableAccountId: string;
  payableAccountCode: string;
  payableAccountName: string;
  sourceAmount: string;
  creditNoteTotal: string;
  reservedPaymentTotal: string;
  postedPaymentTotal: string;
  outstandingPayable: string;
  availableToAllocate: string;
}
export interface SupplierPaymentHistory {
  paymentId: string;
  paymentNumber: string;
  supplierId: string;
  paymentDate: string;
  amount: string;
  currency: string;
  paymentMethod: SupplierPaymentMethod;
  paymentReference: string;
  status: SupplierPaymentStatus;
  settlementAccountName: string;
  payableAccountCode: string;
  journalEntryId: string | null;
  journalEntryNumber: string | null;
  journalStatus: "draft" | "posted" | "void" | null;
  reconciliationStatus: SupplierPaymentReconciliationAction | null;
  reconciliationReference: string | null;
}
export interface SupplierPaymentWorkspace {
  settlementAccounts: SupplierPaymentSettlementAccount[];
  suppliers: SupplierPaymentSupplier[];
  openReceipts: SupplierPaymentOpenReceipt[];
  receiptCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  payments: SupplierPaymentHistory[];
  asOfDate: string;
}
export interface SupplierPaymentCommandResult {
  paymentId: string;
  paymentNumber: string;
  status: SupplierPaymentStatus;
  amount: string;
  currency: string;
  replayed: boolean;
}
export interface SupplierPaymentJournalDraftResult {
  paymentId: string;
  journalEntryId: string;
  journalEntryNumber: string;
  journalStatus: "draft" | "posted" | "void";
  replayed: boolean;
}
export interface SupplierPaymentReconciliationResult {
  paymentId: string;
  action: SupplierPaymentReconciliationAction;
  evidenceReference: string;
  replayed: boolean;
}

type Raw = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function object(value: unknown, label: string): Raw {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("بيانات " + label + " غير صالحة.");
  }
  return value as Raw;
}
function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("حقل " + label + " مفقود.");
  return value;
}
function nullableText(value: unknown, label: string): string | null {
  return value === null || value === undefined || value === "" ? null : requiredText(value, label);
}
function uuid(value: unknown, label: string): string {
  const parsed = requiredText(value, label);
  if (!UUID_PATTERN.test(parsed)) throw new Error("معرّف " + label + " غير صالح.");
  return parsed;
}
function currency(value: unknown): string {
  const parsed = requiredText(value, "العملة");
  if (!CURRENCY_PATTERN.test(parsed)) throw new Error("رمز العملة غير صالح.");
  return parsed;
}
function date(value: unknown, label: string): string {
  const parsed = requiredText(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) throw new Error("تاريخ " + label + " غير صالح.");
  const actual = new Date(parsed + "T00:00:00.000Z");
  if (!Number.isFinite(actual.getTime()) || actual.toISOString().slice(0, 10) !== parsed) {
    throw new Error("تاريخ " + label + " غير صالح.");
  }
  return parsed;
}
function money(value: unknown, label: string): string {
  const parsed = typeof value === "number" ? String(value) : requiredText(value, label);
  if (!MONEY_PATTERN.test(parsed) || !Number.isFinite(Number(parsed))) {
    throw new Error("مبلغ " + label + " غير صالح.");
  }
  return parsed;
}
function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("عدد " + label + " غير صالح.");
  }
  return value;
}
function nullableJournalStatus(value: unknown): "draft" | "posted" | "void" | null {
  if (value === null || value === undefined) return null;
  if (value === "draft" || value === "posted" || value === "void") return value;
  throw new Error("حالة قيد السداد غير معروفة.");
}
function paymentStatus(value: unknown): SupplierPaymentStatus {
  if (value === "recorded" || value === "journal_draft_created" || value === "void") return value;
  throw new Error("حالة سند سداد المورد غير معروفة.");
}
function method(value: unknown): SupplierPaymentMethod {
  if (value === "cash" || value === "bank_transfer" || value === "cheque") return value;
  throw new Error("وسيلة سداد المورد غير معروفة.");
}
function parseSettlementAccount(value: unknown): SupplierPaymentSettlementAccount {
  const row = object(value, "حساب التسوية");
  if (row.settlement_kind !== "cash" && row.settlement_kind !== "bank") {
    throw new Error("نوع حساب التسوية غير صالح.");
  }
  return {
    id: uuid(row.id, "ربط حساب التسوية"),
    accountingAccountId: uuid(row.accounting_account_id, "حساب الأستاذ"),
    accountCode: requiredText(row.account_code, "رمز الحساب"),
    accountName: requiredText(row.account_name, "اسم الحساب"),
    kind: row.settlement_kind,
    currency: currency(row.currency),
    displayName: requiredText(row.display_name, "اسم حساب التسوية"),
  };
}
function parseSupplier(value: unknown): SupplierPaymentSupplier {
  const row = object(value, "المورد");
  return { id: uuid(row.id, "المورد"), name: requiredText(row.name, "اسم المورد") };
}
function parseOpenReceipt(value: unknown): SupplierPaymentOpenReceipt {
  const row = object(value, "الرصيد المفتوح لإيصال الشراء");
  const sourceAmount = money(row.source_amount, "المصدر");
  const creditNoteTotal = money(row.credit_note_total, "الإشعارات الدائنة");
  const reservedPaymentTotal = money(row.reserved_payment_total, "الدفعات المعلقة");
  const postedPaymentTotal = money(row.posted_payment_total, "الدفعات المرحلة");
  const outstandingPayable = money(row.outstanding_payable, "المستحق المتبقي");
  const availableToAllocate = money(row.available_to_allocate, "المتاح للتخصيص");
  const currencyCode = currency(row.currency);
  return {
    receiptId: uuid(row.receipt_id, "إيصال الشراء"),
    receiptNumber: requiredText(row.receipt_number, "رقم الإيصال"),
    purchaseOrderNumber: requiredText(row.purchase_order_number, "أمر الشراء"),
    supplierId: uuid(row.supplier_id, "المورد"),
    supplierName: requiredText(row.supplier_name, "اسم المورد"),
    currency: currencyCode,
    receiptDate: date(row.receipt_date, "الإيصال"),
    sourceJournalEntryId: uuid(row.source_journal_entry_id, "قيد المصدر"),
    sourceJournalEntryNumber: requiredText(row.source_journal_entry_number, "رقم قيد المصدر"),
    payableAccountId: uuid(row.payable_account_id, "حساب المورد"),
    payableAccountCode: requiredText(row.payable_account_code, "رمز حساب المورد"),
    payableAccountName: requiredText(row.payable_account_name, "اسم حساب المورد"),
    sourceAmount, creditNoteTotal, reservedPaymentTotal, postedPaymentTotal,
    outstandingPayable, availableToAllocate,
  };
}
function parsePayment(value: unknown): SupplierPaymentHistory {
  const row = object(value, "سند السداد");
  const reconciliationStatus = row.reconciliation_status;
  if (reconciliationStatus !== null && reconciliationStatus !== undefined &&
      reconciliationStatus !== "matched" && reconciliationStatus !== "exception") {
    throw new Error("حالة المطابقة البنكية غير معروفة.");
  }
  return {
    paymentId: uuid(row.payment_id, "سند السداد"),
    paymentNumber: requiredText(row.payment_number, "رقم السداد"),
    supplierId: uuid(row.supplier_id, "المورد"),
    paymentDate: date(row.payment_date, "السداد"),
    amount: money(row.amount, "السداد"),
    currency: currency(row.currency),
    paymentMethod: method(row.payment_method),
    paymentReference: requiredText(row.payment_reference, "مرجع أداة السداد"),
    status: paymentStatus(row.status),
    settlementAccountName: requiredText(row.settlement_account_name, "حساب التسوية"),
    payableAccountCode: requiredText(row.payable_account_code, "حساب المورد"),
    journalEntryId: row.journal_entry_id === null ? null : uuid(row.journal_entry_id, "قيد السداد"),
    journalEntryNumber: nullableText(row.journal_entry_number, "رقم قيد السداد"),
    journalStatus: nullableJournalStatus(row.journal_status),
    reconciliationStatus: reconciliationStatus ?? null,
    reconciliationReference: nullableText(row.reconciliation_reference, "مرجع المطابقة"),
  };
}
function parsePaymentCommand(value: unknown): SupplierPaymentCommandResult {
  const row = object(value, "نتيجة سند السداد");
  return {
    paymentId: uuid(row.payment_id, "سند السداد"),
    paymentNumber: requiredText(row.payment_number, "رقم السداد"),
    status: paymentStatus(row.status),
    amount: money(row.amount, "السداد"),
    currency: currency(row.currency),
    replayed: row.replayed === true,
  };
}
function validateMoneyInput(value: string, label: string): string {
  const parsed = value.trim();
  if (!MONEY_PATTERN.test(parsed) || Number(parsed) <= 0) {
    throw new Error("أدخل مبلغ " + label + " موجبًا بدقتين عشريتين كحد أقصى.");
  }
  return parsed;
}
function toMinorUnits(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}

export async function fetchSupplierPaymentWorkspace(input: {
  supplierId?: string | null;
  currency?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<SupplierPaymentWorkspace> {
  const supplierId = input.supplierId ?? null;
  const currencyCode = input.currency?.trim().toUpperCase() || null;
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  if (supplierId !== null && !UUID_PATTERN.test(supplierId)) throw new Error("معرّف المورد غير صالح.");
  if (currencyCode !== null && !CURRENCY_PATTERN.test(currencyCode)) throw new Error("رمز العملة غير صالح.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new Error("حدود عرض مستحقات المورد غير صالحة.");
  }
  const { data, error } = await supabase.rpc("fetch_purchase_supplier_payment_workspace", {
    p_supplier_id: supplierId, p_currency: currencyCode, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  const row = object(data, "مساحة سداد الموردين");
  if (!Array.isArray(row.settlement_accounts) || !Array.isArray(row.suppliers) ||
      !Array.isArray(row.open_receipts) || !Array.isArray(row.payments)) {
    throw new Error("أعاد الخادم قوائم سداد الموردين بصيغة غير صالحة.");
  }
  const receiptCount = nonNegativeInteger(row.receipt_count, "إيصالات المورد");
  const parsedLimit = nonNegativeInteger(row.limit, "حد الصفحة");
  const parsedOffset = nonNegativeInteger(row.offset, "إزاحة الصفحة");
  if (parsedLimit !== limit || parsedOffset !== offset ||
      row.has_more !== (receiptCount > parsedOffset + parsedLimit)) {
    throw new Error("حدود صفحة مستحقات المورد غير متطابقة.");
  }
  const openReceipts = row.open_receipts.map(parseOpenReceipt);
  if (openReceipts.some((item) => item.availableToAllocate.startsWith("-"))) {
    throw new Error("يوجد إيصال بمستحقات غير متطابقة؛ أوقف النظام التخصيص حتى تتم التسوية.");
  }
  return {
    settlementAccounts: row.settlement_accounts.map(parseSettlementAccount),
    suppliers: row.suppliers.map(parseSupplier),
    openReceipts,
    receiptCount, limit: parsedLimit, offset: parsedOffset,
    hasMore: row.has_more,
    payments: row.payments.map(parsePayment),
    asOfDate: date(row.as_of_date, "تاريخ إعداد مساحة السداد"),
  };
}

export interface SupplierPaymentSettlementAccountRegistration {
  id: string;
  accountingAccountId: string;
  kind: SupplierPaymentSettlementKind;
  currency: string;
  displayName: string;
}

export async function registerSupplierSettlementAccount(input: {
  accountingAccountId: string;
  kind: SupplierPaymentSettlementKind;
  currency: string;
  displayName: string;
}): Promise<SupplierPaymentSettlementAccountRegistration> {
  const name = input.displayName.trim();
  const currencyCode = input.currency.trim().toUpperCase();
  if (!UUID_PATTERN.test(input.accountingAccountId) ||
      (input.kind !== "cash" && input.kind !== "bank") ||
      !CURRENCY_PATTERN.test(currencyCode) || name.length < 2 || name.length > 120) {
    throw new Error("بيانات ربط الصندوق أو البنك غير صالحة.");
  }
  const { data, error } = await supabase.rpc("register_purchase_supplier_settlement_account", {
    p_accounting_account_id: input.accountingAccountId,
    p_settlement_kind: input.kind,
    p_currency: currencyCode,
    p_display_name: name,
  });
  if (error) throw error;
  const row = object(data, "ربط حساب التسوية");
  if (row.settlement_kind !== input.kind || currency(row.currency) !== currencyCode) {
    throw new Error("لم يؤكد الخادم إعداد حساب التسوية المطلوب.");
  }
  return {
    id: uuid(row.settlement_account_id, "ربط حساب التسوية"),
    accountingAccountId: uuid(row.accounting_account_id, "حساب الأستاذ"),
    kind: row.settlement_kind as SupplierPaymentSettlementKind,
    currency: currencyCode,
    displayName: requiredText(row.display_name, "اسم حساب التسوية"),
  };
}

export async function recordSupplierPayment(input: {
  supplierId: string;
  paymentDate: string;
  amount: string;
  currency: string;
  method: SupplierPaymentMethod;
  settlementAccountMappingId: string;
  paymentReference: string;
  allocations: Array<{ receiptId: string; amount: string }>;
  idempotencyKey: string;
}): Promise<SupplierPaymentCommandResult> {
  const amountText = validateMoneyInput(input.amount, "السداد");
  const currencyCode = input.currency.trim().toUpperCase();
  const reference = input.paymentReference.trim();
  if (!UUID_PATTERN.test(input.supplierId) || !UUID_PATTERN.test(input.settlementAccountMappingId) ||
      !UUID_PATTERN.test(input.idempotencyKey) || !CURRENCY_PATTERN.test(currencyCode) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate) ||
      !["cash", "bank_transfer", "cheque"].includes(input.method) ||
      reference.length < 3 || reference.length > 200 ||
      !Array.isArray(input.allocations) || input.allocations.length < 1 || input.allocations.length > 100) {
    throw new Error("بيانات سند سداد المورد غير صالحة.");
  }
  date(input.paymentDate, "السداد");
  const seen = new Set<string>();
  let allocationTotal = 0n;
  const allocations = input.allocations.map((item) => {
    if (!UUID_PATTERN.test(item.receiptId) || seen.has(item.receiptId)) {
      throw new Error("يجب أن يكون كل إيصال مصدرًا فريدًا وصحيحًا في سند السداد.");
    }
    seen.add(item.receiptId);
    const allocationAmount = validateMoneyInput(item.amount, "التخصيص");
    allocationTotal += toMinorUnits(allocationAmount);
    return { receipt_id: item.receiptId, amount: allocationAmount };
  });
  if (allocationTotal !== toMinorUnits(amountText)) {
    throw new Error("يجب أن يساوي مجموع تخصيصات الإيصالات مبلغ سند السداد تمامًا.");
  }
  const { data, error } = await supabase.rpc("record_purchase_supplier_payment", {
    p_supplier_id: input.supplierId,
    p_payment_date: input.paymentDate,
    p_amount: amountText,
    p_currency: currencyCode,
    p_payment_method: input.method,
    p_settlement_account_mapping_id: input.settlementAccountMappingId,
    p_payment_reference: reference,
    p_allocations: allocations,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const result = parsePaymentCommand(data);
  if (toMinorUnits(result.amount) !== toMinorUnits(amountText) || result.currency !== currencyCode) {
    throw new Error("أعاد الخادم سند سداد لا يطابق المبلغ أو العملة المطلوبة.");
  }
  return result;
}

export async function prepareSupplierPaymentJournalDraft(input: {
  paymentId: string;
  idempotencyKey: string;
}): Promise<SupplierPaymentJournalDraftResult> {
  if (!UUID_PATTERN.test(input.paymentId) || !UUID_PATTERN.test(input.idempotencyKey)) {
    throw new Error("مرجع السداد أو مفتاح إنشاء القيد غير صالح.");
  }
  const { data, error } = await supabase.rpc("prepare_purchase_supplier_payment_journal_draft", {
    p_payment_id: input.paymentId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const row = object(data, "مسودة قيد سداد المورد");
  const journalStatus = nullableJournalStatus(row.status);
  if (journalStatus !== "draft" && journalStatus !== "posted" && journalStatus !== "void") {
    throw new Error("لم يؤكد الخادم حالة مسودة قيد سداد المورد.");
  }
  return {
    paymentId: uuid(row.payment_id, "سند السداد"),
    journalEntryId: uuid(row.journal_entry_id, "قيد السداد"),
    journalEntryNumber: requiredText(row.journal_entry_number, "رقم قيد السداد"),
    journalStatus,
    replayed: row.replayed === true,
  };
}

export async function voidSupplierPayment(input: {
  paymentId: string;
  reason: string;
}): Promise<{ paymentId: string; status: "void"; replayed: boolean }> {
  const reason = input.reason.trim();
  if (!UUID_PATTERN.test(input.paymentId) || reason.length < 5 || reason.length > 500) {
    throw new Error("إلغاء سند السداد يتطلب سببًا من 5 إلى 500 حرف.");
  }
  const { data, error } = await supabase.rpc("void_purchase_supplier_payment", {
    p_payment_id: input.paymentId, p_reason: reason,
  });
  if (error) throw error;
  const row = object(data, "إلغاء سند السداد");
  if (row.status !== "void") throw new Error("لم يؤكد الخادم إلغاء سند السداد.");
  return { paymentId: uuid(row.payment_id, "سند السداد"), status: "void", replayed: row.replayed === true };
}

export async function reconcileSupplierPayment(input: {
  paymentId: string;
  action: SupplierPaymentReconciliationAction;
  evidenceType: SupplierPaymentEvidenceType;
  evidenceReference: string;
  observedAmount: string;
  currency: string;
  reason?: string | null;
  idempotencyKey: string;
}): Promise<SupplierPaymentReconciliationResult> {
  const reference = input.evidenceReference.trim();
  const currencyCode = input.currency.trim().toUpperCase();
  const reason = input.reason?.trim() || null;
  const amountText = input.observedAmount.trim();
  if (!MONEY_PATTERN.test(amountText) || !Number.isFinite(Number(amountText))) {
    throw new Error("مبلغ " + "المبلغ المرصود" + " غير صالح.");
  }
  if (!UUID_PATTERN.test(input.paymentId) || !UUID_PATTERN.test(input.idempotencyKey) ||
      !["matched", "exception"].includes(input.action) ||
      !["bank_statement_line", "cash_voucher", "cheque_clearance"].includes(input.evidenceType) ||
      reference.length < 3 || reference.length > 200 || !CURRENCY_PATTERN.test(currencyCode) ||
      (input.action === "exception" && (!reason || reason.length < 3 || reason.length > 500)) ||
      (input.action === "matched" && reason !== null)) {
    throw new Error("بيانات مستند المطابقة أو سبب الاستثناء غير صالحة.");
  }
  const { data, error } = await supabase.rpc("reconcile_purchase_supplier_payment", {
    p_payment_id: input.paymentId,
    p_action: input.action,
    p_evidence_type: input.evidenceType,
    p_evidence_reference: reference,
    p_observed_amount: amountText,
    p_currency: currencyCode,
    p_reason: reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const row = object(data, "نتيجة مطابقة سداد المورد");
  if (row.action !== input.action || row.evidence_reference !== reference) {
    throw new Error("لم يؤكد الخادم مستند المطابقة المطلوب.");
  }
  return {
    paymentId: uuid(row.payment_id, "سند السداد"),
    action: row.action as SupplierPaymentReconciliationAction,
    evidenceReference: requiredText(row.evidence_reference, "مرجع المطابقة"),
    replayed: row.replayed === true,
  };
}
