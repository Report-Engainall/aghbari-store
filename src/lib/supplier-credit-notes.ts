import { supabase } from "./supabase";

export type SupplierCreditNoteAccountType = "asset" | "liability" | "expense" | "revenue";
export type SupplierCreditNoteStatus =
  | "exact_match"
  | "variance_pending"
  | "variance_approved"
  | "variance_rejected"
  | "journal_draft_created";
export type SupplierCreditNoteJournalStatus = "draft" | "posted" | "void";

export interface SupplierCreditNoteAccount {
  id: string;
  code: string;
  name: string;
  accountType: SupplierCreditNoteAccountType;
  isActive: boolean;
}
export interface SupplierCreditNoteReviewEvent {
  supplierCreditNoteNumber: string;
  action: "recorded_exact_match" | "recorded_variance_pending" | "variance_approved" | "variance_rejected" | "journal_draft_created";
  reason: string | null;
  createdAt: string;
}
export interface SupplierReturnCreditNoteRecord {
  returnId: string;
  returnNumber: string;
  sourceReceiptId: string;
  sourceReceiptNumber: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  postedAt: string;
  sourceAmount: number | null;
  currency: string;
  creditNoteId: string | null;
  supplierCreditNoteNumber: string | null;
  creditNoteIssuedOn: string | null;
  actualAmount: number | null;
  varianceAmount: number | null;
  creditNoteStatus: SupplierCreditNoteStatus | null;
  varianceReviewReason: string | null;
  reviewHistory: SupplierCreditNoteReviewEvent[];
  sourceJournalEntryId: string | null;
  sourceJournalEntryNumber: string | null;
  sourceJournalStatus: SupplierCreditNoteJournalStatus | null;
  inventoryAccountId: string | null;
  payableAccountId: string | null;
  journalEntryId: string | null;
  journalEntryNumber: string | null;
  journalStatus: SupplierCreditNoteJournalStatus | null;
  varianceAccountId: string | null;
}
export interface SupplierCreditNoteWorkspaceData {
  accounts: SupplierCreditNoteAccount[];
  returns: SupplierReturnCreditNoteRecord[];
}
export interface SupplierCreditNoteCommandResult {
  creditNoteId: string;
  status: SupplierCreditNoteStatus;
  actualAmount: number | null;
  sourceAmount: number | null;
  varianceAmount: number | null;
  journalEntryId: string | null;
  journalEntryNumber: string | null;
  journalStatus: SupplierCreditNoteJournalStatus | null;
  replayed: boolean;
}

type Raw = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new Error("حقل " + label + " غير صالح.");
  return value;
}
function uuid(value: unknown, label: string): string {
  const result = requiredText(value, label);
  if (!UUID_PATTERN.test(result)) throw new Error("معرّف " + label + " غير صالح.");
  return result;
}
function nullableUuid(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : uuid(value, label);
}
function amount(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || Math.abs(parsed) >= 10000000000000000) {
    throw new Error("قيمة " + label + " غير صالحة.");
  }
  return parsed;
}
function nullableAmount(value: unknown, label: string): number | null {
  return value === null || value === undefined ? null : amount(value, label);
}
function date(value: unknown, label: string): string {
  const result = requiredText(value, label);
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(result)) throw new Error("تاريخ " + label + " غير صالح.");
  const parsed = new Date(result + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== result) {
    throw new Error("تاريخ " + label + " غير صالح.");
  }
  return result;
}
function nullableDate(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : date(value, label);
}
function status(value: unknown): SupplierCreditNoteStatus {
  if (value === "exact_match" || value === "variance_pending" || value === "variance_approved" ||
      value === "variance_rejected" || value === "journal_draft_created") return value;
  throw new Error("حالة مطابقة إشعار المورد غير معروفة.");
}
function journalStatus(value: unknown): SupplierCreditNoteJournalStatus | null {
  return value === "draft" || value === "posted" || value === "void" ? value : null;
}
function parseAccount(value: unknown): SupplierCreditNoteAccount {
  const row = object(value, "حساب التسوية");
  const accountType = row.account_type;
  if (accountType !== "asset" && accountType !== "liability" && accountType !== "expense" && accountType !== "revenue") {
    throw new Error("نوع حساب التسوية غير صالح.");
  }
  return {
    id: uuid(row.id, "الحساب"),
    code: requiredText(row.code, "رمز الحساب"),
    name: requiredText(row.name, "اسم الحساب"),
    accountType,
    isActive: row.is_active === true,
  };
}
function parseReturn(value: unknown): SupplierReturnCreditNoteRecord {
  const row = object(value, "مرتجع المورد");
  const currency = requiredText(row.currency, "العملة");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("عملة المرتجع غير صالحة.");
  const noteStatus = row.credit_note_status === null || row.credit_note_status === undefined
    ? null : status(row.credit_note_status);
  if (!Array.isArray(row.credit_note_history)) throw new Error("سجل مراجعة إشعار المورد غير صالح.");
  const reviewHistory = row.credit_note_history.map((value): SupplierCreditNoteReviewEvent => {
    const event = object(value, "حدث مراجعة إشعار المورد");
    const action = event.action;
    if (action !== "recorded_exact_match" && action !== "recorded_variance_pending" &&
        action !== "variance_approved" && action !== "variance_rejected" &&
        action !== "journal_draft_created") throw new Error("نوع حدث مراجعة إشعار المورد غير معروف.");
    return {
      supplierCreditNoteNumber: requiredText(event.credit_note_number, "رقم الإشعار في سجل المراجعة"),
      action,
      reason: nullableText(event.reason, "سبب المراجعة"),
      createdAt: requiredText(event.created_at, "وقت المراجعة"),
    };
  });
  const varianceAmount = nullableAmount(row.variance_amount, "فرق إشعار المورد");
  const actualAmount = nullableAmount(row.actual_amount, "المبلغ الفعلي للإشعار");
  const sourceAmount = nullableAmount(row.source_amount, "تكلفة مصدر المرتجع");
  if (actualAmount !== null && actualAmount <= 0 || sourceAmount !== null && sourceAmount < 0) {
    throw new Error("مبلغ إشعار المورد أو تكلفة المصدر غير صالح.");
  }
  return {
    returnId: uuid(row.return_id, "مرتجع المورد"),
    returnNumber: requiredText(row.return_number, "رقم المرتجع"),
    sourceReceiptId: uuid(row.source_receipt_id, "إيصال المصدر"),
    sourceReceiptNumber: requiredText(row.source_receipt_number, "رقم إيصال المصدر"),
    purchaseOrderNumber: requiredText(row.purchase_order_number, "أمر الشراء"),
    supplierId: uuid(row.supplier_id, "المورد"),
    supplierName: requiredText(row.supplier_name, "اسم المورد"),
    postedAt: requiredText(row.posted_at, "تاريخ ترحيل المرتجع"),
    sourceAmount,
    currency,
    creditNoteId: nullableUuid(row.credit_note_id, "إشعار المورد"),
    supplierCreditNoteNumber: nullableText(row.supplier_credit_note_number, "رقم إشعار المورد"),
    creditNoteIssuedOn: nullableDate(row.credit_note_issued_on, "تاريخ إشعار المورد"),
    actualAmount,
    varianceAmount,
    creditNoteStatus: noteStatus,
    varianceReviewReason: nullableText(row.variance_review_reason, "سبب اعتماد الفرق"),
    reviewHistory,
    sourceJournalEntryId: nullableUuid(row.source_journal_entry_id, "قيد إيصال المصدر"),
    sourceJournalEntryNumber: nullableText(row.source_journal_entry_number, "رقم قيد إيصال المصدر"),
    sourceJournalStatus: journalStatus(row.source_journal_status),
    inventoryAccountId: nullableUuid(row.inventory_account_id, "حساب المخزون المصدر"),
    payableAccountId: nullableUuid(row.payable_account_id, "حساب المورد المصدر"),
    journalEntryId: nullableUuid(row.journal_entry_id, "مسودة القيد"),
    journalEntryNumber: nullableText(row.journal_entry_number, "رقم مسودة القيد"),
    journalStatus: journalStatus(row.journal_status),
    varianceAccountId: nullableUuid(row.variance_account_id, "حساب فرق الإشعار"),
  };
}
function parseCommand(value: unknown): SupplierCreditNoteCommandResult {
  const row = object(value, "نتيجة عملية إشعار المورد");
  const noteStatus = status(row.status);
  const journalStatusValue = journalStatus(row.status === "draft" || row.status === "posted" || row.status === "void" ? row.status : null);
  return {
    creditNoteId: uuid(row.credit_note_id, "إشعار المورد"),
    status: noteStatus,
    actualAmount: nullableAmount(row.actual_amount, "المبلغ الفعلي"),
    sourceAmount: nullableAmount(row.source_amount, "مبلغ المصدر"),
    varianceAmount: nullableAmount(row.variance_amount, "فرق المبلغ"),
    journalEntryId: nullableUuid(row.journal_entry_id, "القيد"),
    journalEntryNumber: nullableText(row.journal_entry_number, "رقم القيد"),
    journalStatus: journalStatusValue,
    replayed: row.replayed === true,
  };
}

export async function fetchSupplierCreditNoteWorkspace(): Promise<SupplierCreditNoteWorkspaceData> {
  const { data, error } = await supabase.rpc("fetch_purchase_supplier_credit_note_workspace");
  if (error) throw error;
  const row = object(data, "مطابقة إشعارات الموردين");
  if (!Array.isArray(row.accounts) || !Array.isArray(row.returns)) {
    throw new Error("قائمة الحسابات أو مرتجعات الموردين غير صالحة.");
  }
  return { accounts: row.accounts.map(parseAccount), returns: row.returns.map(parseReturn) };
}

export async function recordSupplierCreditNote(input: {
  returnId: string;
  supplierCreditNoteNumber: string;
  issuedOn: string;
  actualAmount: string;
  currency: string;
  idempotencyKey: string;
}): Promise<SupplierCreditNoteCommandResult> {
  if (!UUID_PATTERN.test(input.returnId) || !UUID_PATTERN.test(input.idempotencyKey) ||
      !input.supplierCreditNoteNumber.trim() || input.supplierCreditNoteNumber.trim().length > 80 ||
      !/^\\d{4}-\\d{2}-\\d{2}$/.test(input.issuedOn) ||
      !/^[A-Z]{3}$/.test(input.currency)) {
    throw new Error("بيانات إشعار المورد أو مفتاح العملية غير صالحة.");
  }
  const amountText = input.actualAmount.trim();
  if (!/^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$/.test(amountText) || Number(amountText) <= 0) {
    throw new Error("أدخل مبلغ الإشعار موجبًا بدقتين عشريتين كحد أقصى.");
  }
  const { data, error } = await supabase.rpc("record_purchase_supplier_credit_note", {
    p_return_id: input.returnId,
    p_supplier_credit_note_number: input.supplierCreditNoteNumber.trim(),
    p_issued_on: input.issuedOn,
    p_actual_amount: amountText,
    p_currency: input.currency,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return parseCommand(data);
}

export async function reviewSupplierCreditNoteVariance(input: {
  creditNoteId: string;
  approve: boolean;
  reason: string;
}): Promise<SupplierCreditNoteCommandResult> {
  const reason = input.reason.trim();
  if (!UUID_PATTERN.test(input.creditNoteId) || reason.length < 3 || reason.length > 500) {
    throw new Error("قرار مراجعة الفرق يتطلب سببًا من 3 إلى 500 حرف.");
  }
  const { data, error } = await supabase.rpc("review_purchase_supplier_credit_note_variance", {
    p_credit_note_id: input.creditNoteId,
    p_approve: input.approve,
    p_reason: reason,
  });
  if (error) throw error;
  const row = object(data, "قرار مراجعة الفرق");
  return {
    creditNoteId: uuid(row.credit_note_id, "إشعار المورد"),
    status: status(row.status),
    actualAmount: null,
    sourceAmount: null,
    varianceAmount: null,
    journalEntryId: null,
    journalEntryNumber: null,
    journalStatus: null,
    replayed: row.replayed === true,
  };
}

export async function prepareSupplierCreditNoteJournalDraft(input: {
  creditNoteId: string;
  varianceAccountId: string | null;
  idempotencyKey: string;
}): Promise<{
  creditNoteId: string;
  journalEntryId: string;
  journalEntryNumber: string;
  journalStatus: SupplierCreditNoteJournalStatus;
  replayed: boolean;
}> {
  if (!UUID_PATTERN.test(input.creditNoteId) || !UUID_PATTERN.test(input.idempotencyKey) ||
      (input.varianceAccountId !== null && !UUID_PATTERN.test(input.varianceAccountId))) {
    throw new Error("مرجع إشعار المورد أو حساب الفرق أو مفتاح العملية غير صالح.");
  }
  const { data, error } = await supabase.rpc("prepare_purchase_supplier_credit_note_journal_draft", {
    p_credit_note_id: input.creditNoteId,
    p_variance_account_id: input.varianceAccountId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const row = object(data, "مسودة قيد المورد");
  const journalState = journalStatus(row.status);
  if (!journalState) throw new Error("حالة مسودة قيد المورد غير معروفة.");
  return {
    creditNoteId: uuid(row.credit_note_id, "إشعار المورد"),
    journalEntryId: uuid(row.journal_entry_id, "قيد المورد"),
    journalEntryNumber: requiredText(row.journal_entry_number, "رقم قيد المورد"),
    journalStatus: journalState,
    replayed: row.replayed === true,
  };
}
