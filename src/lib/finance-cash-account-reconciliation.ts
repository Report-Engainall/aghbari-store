import { supabase } from "@/lib/supabase";

export type CashSettlementKind = "cash" | "bank";
export type CashEvidenceKind = "opening_balance" | "cash_count" | "bank_statement";
export type OpeningDecision = "approved" | "rejected";

export interface CashSettlementAccount {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  displayName: string;
  settlementKind: CashSettlementKind;
  currency: string;
  isActive: boolean;
}
export interface CashAccountEvidence {
  id: string;
  mappingId: string;
  evidenceKind: CashEvidenceKind;
  fileName: string;
  mimeType: string;
  byteSize: number;
  contentSha256: string;
  storagePath: string;
  createdAt: string;
  uploadedBy: string;
}
export interface CashOpeningBalanceProposal {
  id: string;
  mappingId: string;
  evidenceId: string;
  asOfDate: string;
  openingBalance: string;
  currency: string;
  submittedBy: string;
  submittedAt: string;
  reviewDecision: OpeningDecision | null;
  reviewReason: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  postedGlBalance: string | null;
  postedGlLineCount: number | null;
}
export interface BankStatementLine {
  id: string;
  lineNumber: number;
  transactionDate: string;
  externalReference: string | null;
  description: string;
  signedAmount: string;
  matchId: string | null;
  journalEntryId: string | null;
  journalLineNumber: number | null;
}
export interface BankReconciliationRun {
  id: string;
  runNumber: number;
  outcome: "VERIFIED" | "NEEDS_REVIEW";
  statementDifference: string;
  ledgerDifference: string;
  unmatchedStatementLines: number;
  unmatchedLedgerLines: number;
  statementNetMovement: string;
  ledgerNetMovement: string;
  reviewedBy: string;
  reviewedAt: string;
  reason: string;
}
export interface FinanceBankStatement {
  id: string;
  mappingId: string;
  evidenceId: string;
  statementReference: string;
  periodFrom: string;
  periodTo: string;
  openingBalance: string;
  closingBalance: string;
  currency: string;
  createdBy: string;
  createdAt: string;
  lines: BankStatementLine[];
  lineCount: number;
  matchedCount: number;
  latestRun: BankReconciliationRun | null;
  isVoided: boolean;
  voidReason: string | null;
  voidedBy: string | null;
  voidedAt: string | null;
}
export interface CashReconciliationWorkspace {
  role: "admin" | "manager" | "accountant";
  accounts: CashSettlementAccount[];
  evidence: CashAccountEvidence[];
  openingBalances: CashOpeningBalanceProposal[];
  statements: FinanceBankStatement[];
}
export interface BankMatchCandidate {
  journalEntryId: string;
  journalLineNumber: number;
  entryNumber: number;
  entryDate: string;
  description: string;
  accountCode: string;
  accountName: string;
  debit: string;
  credit: string;
  signedAmount: string;
}

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MONEY = /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function object(value: unknown, label: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(label + " غير صالح.");
  return value as Row;
}
function list(value: unknown, label: string, max = 10000): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(label + " غير مكتمل أو تجاوز الحد.");
  return value;
}
function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error(label + " غير صالح.");
  return value;
}
function optionalText(value: unknown, max = 500): string | null {
  if (value === null || value === undefined) return null;
  return text(value, "حقل نصي", max);
}
function uuid(value: unknown, label: string): string {
  const result = text(value, label, 36);
  if (!UUID.test(result)) throw new Error(label + " غير صالح.");
  return result;
}
function day(value: unknown, label: string): string {
  const result = text(value, label, 10);
  if (!DAY.test(result) || Number.isNaN(Date.parse(result + "T00:00:00Z"))) throw new Error(label + " غير صالح.");
  return result;
}
function money(value: unknown, label: string): string {
  const result = typeof value === "number" ? String(value) : text(value, label, 24);
  if (!MONEY.test(result) || !Number.isFinite(Number(result)) || Math.abs(Number(result)) >= 1e16) {
    throw new Error(label + " غير صالح.");
  }
  return result;
}
function integer(value: unknown, label: string, min = 0, max = 10000000): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) throw new Error(label + " غير صالح.");
  return value;
}
function timestamp(value: unknown, label: string): string {
  const result = text(value, label, 80);
  if (!Number.isFinite(Date.parse(result))) throw new Error(label + " غير صالح.");
  return result;
}
function account(value: unknown): CashSettlementAccount {
  const row = object(value, "حساب التسوية");
  if (row.settlement_kind !== "cash" && row.settlement_kind !== "bank") throw new Error("نوع حساب التسوية غير صالح.");
  const currency = text(row.currency, "العملة", 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("عملة الحساب غير صالحة.");
  if (typeof row.is_active !== "boolean") throw new Error("حالة الحساب غير صالحة.");
  return {
    id: uuid(row.id, "ربط الحساب"),
    accountId: uuid(row.account_id, "الحساب المحاسبي"),
    accountCode: text(row.account_code, "رمز الحساب", 80),
    accountName: text(row.account_name, "اسم الحساب", 160),
    displayName: text(row.display_name, "اسم الحساب المعروض", 160),
    settlementKind: row.settlement_kind,
    currency,
    isActive: row.is_active,
  };
}
function evidence(value: unknown): CashAccountEvidence {
  const row = object(value, "مستند الحساب");
  if (row.evidence_kind !== "opening_balance" && row.evidence_kind !== "cash_count" && row.evidence_kind !== "bank_statement") {
    throw new Error("نوع إثبات الحساب غير صالح.");
  }
  const mimeType = text(row.mime_type, "نوع الملف", 50);
  if (!MIME_EXT[mimeType]) throw new Error("نوع ملف إثبات الحساب غير مدعوم.");
  const byteSize = integer(row.byte_size, "حجم الملف", 1, 10485760);
  const hash = text(row.content_sha256, "بصمة الملف", 64);
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("بصمة الملف غير صالحة.");
  return {
    id: uuid(row.id, "معرف الإثبات"),
    mappingId: uuid(row.mapping_id, "ربط الحساب"),
    evidenceKind: row.evidence_kind,
    fileName: text(row.file_name, "اسم الملف", 180),
    mimeType,
    byteSize,
    contentSha256: hash,
    storagePath: text(row.storage_path, "مسار الملف", 100),
    createdAt: timestamp(row.created_at, "وقت الرفع"),
    uploadedBy: uuid(row.uploaded_by, "رافع الملف"),
  };
}
function opening(value: unknown): CashOpeningBalanceProposal {
  const row = object(value, "طلب الرصيد الافتتاحي");
  const decision = row.review_decision;
  if (decision !== null && decision !== undefined && decision !== "approved" && decision !== "rejected") {
    throw new Error("قرار مراجعة الرصيد الافتتاحي غير صالح.");
  }
  const currency = text(row.currency, "العملة", 3);
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("عملة الرصيد الافتتاحي غير صالحة.");
  return {
    id: uuid(row.id, "طلب الرصيد"),
    mappingId: uuid(row.mapping_id, "ربط الحساب"),
    evidenceId: uuid(row.evidence_id, "مستند الرصيد"),
    asOfDate: day(row.as_of_date, "تاريخ الرصيد"),
    openingBalance: money(row.opening_balance, "الرصيد الافتتاحي"),
    currency,
    submittedBy: uuid(row.submitted_by, "مقدم الطلب"),
    submittedAt: timestamp(row.submitted_at, "وقت تقديم الطلب"),
    reviewDecision: (decision as OpeningDecision | null | undefined) ?? null,
    reviewReason: optionalText(row.review_reason, 500),
    reviewedBy: row.reviewed_by == null ? null : uuid(row.reviewed_by, "المراجع"),
    reviewedAt: row.reviewed_at == null ? null : timestamp(row.reviewed_at, "وقت المراجعة"),
    postedGlBalance: row.posted_gl_balance == null ? null : money(row.posted_gl_balance, "رصيد الأستاذ"),
    postedGlLineCount: row.posted_gl_line_count == null ? null : integer(row.posted_gl_line_count, "عدد قيود الأستاذ"),
  };
}
function statementLine(value: unknown): BankStatementLine {
  const row = object(value, "سطر كشف البنك");
  const matchId = row.match_id == null ? null : uuid(row.match_id, "معرف المطابقة");
  const journalEntryId = row.journal_entry_id == null ? null : uuid(row.journal_entry_id, "قيد الأستاذ");
  const journalLineNumber = row.journal_line_number == null ? null : integer(row.journal_line_number, "سطر الأستاذ", 1, 100);
  if ((matchId === null) !== (journalEntryId === null) || (journalEntryId === null) !== (journalLineNumber === null)) {
    throw new Error("بيانات ربط حركة الكشف بقيد الأستاذ غير مكتملة.");
  }
  return {
    id: uuid(row.id, "سطر الكشف"),
    lineNumber: integer(row.line_number, "رقم السطر", 1, 10000),
    transactionDate: day(row.transaction_date, "تاريخ الحركة"),
    externalReference: optionalText(row.external_reference, 160),
    description: text(row.description, "وصف الحركة", 500),
    signedAmount: money(row.signed_amount, "مبلغ الحركة"),
    matchId,
    journalEntryId,
    journalLineNumber,
  };
}
function run(value: unknown): BankReconciliationRun {
  const row = object(value, "نتيجة المطابقة");
  if (row.outcome !== "VERIFIED" && row.outcome !== "NEEDS_REVIEW") throw new Error("حالة المطابقة غير صالحة.");
  return {
    id: uuid(row.id, "تشغيل المطابقة"),
    runNumber: integer(row.run_number, "رقم تشغيل المطابقة", 1),
    outcome: row.outcome,
    statementDifference: money(row.statement_difference, "فرق الكشف"),
    ledgerDifference: money(row.ledger_difference, "فرق الأستاذ"),
    unmatchedStatementLines: integer(row.unmatched_statement_lines, "السطور غير المطابقة"),
    unmatchedLedgerLines: integer(row.unmatched_ledger_lines, "القيود غير المطابقة"),
    statementNetMovement: money(row.statement_net_movement, "صافي الكشف"),
    ledgerNetMovement: money(row.ledger_net_movement, "صافي الأستاذ"),
    reviewedBy: uuid(row.reviewed_by, "منفذ المطابقة"),
    reviewedAt: timestamp(row.reviewed_at, "وقت المطابقة"),
    reason: text(row.reason, "ملاحظة المطابقة", 500),
  };
}
function bankStatement(value: unknown): FinanceBankStatement {
  const row = object(value, "كشف البنك");
  const lines = list(row.lines, "حركات كشف البنك", 10000).map(statementLine);
  const latestRun = row.latest_run == null ? null : run(row.latest_run);
  if (typeof row.is_voided !== "boolean") throw new Error("حالة إلغاء كشف البنك غير صالحة.");
  const isVoided = row.is_voided;
  const voidReason = optionalText(row.void_reason, 500);
  const voidedBy = row.voided_by == null ? null : uuid(row.voided_by, "منفذ إلغاء الكشف");
  const voidedAt = row.voided_at == null ? null : timestamp(row.voided_at, "وقت إلغاء الكشف");
  if (isVoided ? !voidReason || !voidedBy || !voidedAt : Boolean(voidReason || voidedBy || voidedAt)) {
    throw new Error("بيانات إلغاء كشف البنك غير مكتملة أو متعارضة.");
  }
  const lineCount = integer(row.line_count, "عدد حركات الكشف", 0, 10000);
  const matchedCount = integer(row.matched_count, "عدد الحركات المطابقة", 0, 10000);
  const lineNumbers = new Set(lines.map((item) => item.lineNumber));
  const currency = text(row.currency, "عملة الكشف", 3);
  const periodFrom = day(row.period_from, "بداية الكشف");
  const periodTo = day(row.period_to, "نهاية الكشف");
  if (lineCount !== lines.length || lineNumbers.size !== lines.length || matchedCount > lineCount ||
      matchedCount !== lines.filter((item) => item.matchId).length || periodFrom > periodTo ||
      lines.some((item) => item.transactionDate < periodFrom || item.transactionDate > periodTo) ||
      !/^[A-Z]{3}$/.test(currency) ||
      (latestRun?.outcome === "VERIFIED" && (matchedCount !== lineCount ||
        latestRun.unmatchedStatementLines !== 0 || latestRun.unmatchedLedgerLines !== 0 ||
        latestRun.statementDifference !== "0" && latestRun.statementDifference !== "0.00" ||
        latestRun.ledgerDifference !== "0" && latestRun.ledgerDifference !== "0.00"))) {
    throw new Error("تغطية حركات كشف البنك أو فروق المطابقة غير متطابقة.");
  }
  return {
    id: uuid(row.id, "كشف البنك"),
    mappingId: uuid(row.mapping_id, "ربط البنك"),
    evidenceId: uuid(row.evidence_id, "دليل الكشف"),
    statementReference: text(row.statement_reference, "مرجع الكشف", 120),
    periodFrom,
    periodTo,
    openingBalance: money(row.opening_balance, "رصيد بداية الكشف"),
    closingBalance: money(row.closing_balance, "رصيد نهاية الكشف"),
    currency,
    createdBy: uuid(row.created_by, "منشئ الكشف"),
    createdAt: timestamp(row.created_at, "وقت إنشاء الكشف"),
    lines,
    lineCount,
    matchedCount,
    latestRun,
    isVoided,
    voidReason,
    voidedBy,
    voidedAt,
  };
}

export function parseCashReconciliationWorkspace(value: unknown): CashReconciliationWorkspace {
  const row = object(value, "مساحة مطابقة النقد والبنوك");
  const authorization = object(row.authorization, "صلاحيات المساحة");
  if (row.status !== "OK" || row.sideEffects !== "NONE" ||
      authorization.tenantScope !== "SERVER_RESOLVED_AUTHENTICATED_TENANT" ||
      (authorization.effectiveRole !== "admin" && authorization.effectiveRole !== "manager" && authorization.effectiveRole !== "accountant")) {
    throw new Error("لم يثبت الخادم صلاحية الحساب ونطاق المؤسسة؛ أوقف العرض.");
  }
  const accounts = list(row.accounts, "حسابات الصندوق والبنوك", 200).map(account);
  const evidenceRows = list(row.evidence, "مستندات الحسابات", 500).map(evidence);
  const openings = list(row.openingBalances, "طلبات الأرصدة الافتتاحية", 2000).map(opening);
  const statements = list(row.statements, "كشوف البنوك", 500).map(bankStatement);
  const accountById = new Map(accounts.map((item) => [item.id, item]));
  if (accountById.size !== accounts.length) throw new Error("تكرر ربط الحساب النقدي أو المصرفي.");
  if (evidenceRows.some((item) => {
        const mapped = accountById.get(item.mappingId);
        return !mapped || (item.evidenceKind === "bank_statement" && mapped.settlementKind !== "bank") ||
          (item.evidenceKind === "cash_count" && mapped.settlementKind !== "cash");
      }) ||
      openings.some((item) => {
        const mapped = accountById.get(item.mappingId);
        return !mapped || mapped.currency !== item.currency;
      }) ||
      statements.some((item) => {
        const mapped = accountById.get(item.mappingId);
        return !mapped || mapped.settlementKind !== "bank" || mapped.currency !== item.currency;
      })) {
    throw new Error("توجد مستندات أو أرصدة أو كشوف لا تتطابق مع نوع حساب المؤسسة أو عملته.");
  }
  return {
    role: authorization.effectiveRole,
    accounts,
    evidence: evidenceRows,
    openingBalances: openings,
    statements,
  };
}
export async function fetchCashReconciliationWorkspace(): Promise<CashReconciliationWorkspace> {
  const { data, error } = await supabase.rpc("fetch_finance_cash_reconciliation_workspace");
  if (error) throw error;
  return parseCashReconciliationWorkspace(data);
}

export async function uploadCashAccountEvidence(input: {
  mappingId: string;
  evidenceKind: CashEvidenceKind;
  file: File;
}): Promise<{ id: string; storagePath: string; evidenceKind: CashEvidenceKind }> {
  if (!UUID.test(input.mappingId)) throw new Error("ربط الحساب غير صالح.");
  const extension = MIME_EXT[input.file.type];
  if (!extension || input.file.size < 1 || input.file.size > 10485760) {
    throw new Error("يسمح بملف PDF أو JPG أو PNG أو WEBP لا يتجاوز 10 ميغابايت.");
  }
  if (!globalThis.crypto?.randomUUID || !globalThis.crypto?.subtle) {
    throw new Error("المتصفح لا يدعم توليد مفتاح آمن وبصمة SHA-256؛ لم يُرفع الملف.");
  }
  const safeName = input.file.name.replace(/\//g, "_").replace(/\\/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "_").trim().slice(0, 180);
  if (!safeName) throw new Error("اسم المستند غير صالح.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await input.file.arrayBuffer());
  const contentSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const storagePath = input.mappingId + "/" + globalThis.crypto.randomUUID() + "." + extension;
  const { error: uploadError } = await supabase.storage.from("finance-cash-account-evidence").upload(storagePath, input.file, {
    cacheControl: "3600", contentType: input.file.type, upsert: false,
  });
  if (uploadError) throw uploadError;
  try {
    const { data, error } = await supabase.rpc("record_finance_cash_account_evidence", {
      p_settlement_account_mapping_id: input.mappingId,
      p_evidence_kind: input.evidenceKind,
      p_storage_path: storagePath,
      p_file_name: safeName,
      p_mime_type: input.file.type,
      p_byte_size: input.file.size,
      p_content_sha256: contentSha256,
    });
    if (error) throw error;
    const row = object(data, "تأكيد تسجيل المستند");
    const id = uuid(row.id, "معرف المستند");
    if (row.storage_path !== storagePath || row.evidence_kind !== input.evidenceKind) {
      throw new Error("لم يؤكد الخادم ربط المستند بالحساب ونوع الإثبات.");
    }
    return { id, storagePath, evidenceKind: input.evidenceKind };
  } catch (cause) {
    await supabase.storage.from("finance-cash-account-evidence").remove([storagePath]).catch(() => undefined);
    throw cause;
  }
}

export async function createCashAccountEvidenceSignedUrl(storagePath: string): Promise<string> {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/i.test(storagePath)) throw new Error("مسار مستند الحساب غير صالح.");
  const { data, error } = await supabase.storage.from("finance-cash-account-evidence").createSignedUrl(storagePath, 300);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("لم يصدر التخزين رابطاً مؤقتاً للمستند.");
  return data.signedUrl;
}

export async function submitCashOpeningBalance(input: {
  mappingId: string; evidenceId: string; asOfDate: string; openingBalance: string; idempotencyKey: string;
}) {
  const { data, error } = await supabase.rpc("submit_finance_cash_opening_balance", {
    p_settlement_account_mapping_id: input.mappingId,
    p_evidence_id: input.evidenceId,
    p_as_of_date: input.asOfDate,
    p_opening_balance: input.openingBalance,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return uuid(object(data, "تأكيد طلب الرصيد").proposal_id, "طلب الرصيد");
}
export async function reviewCashOpeningBalance(input: { proposalId: string; decision: OpeningDecision; reason: string }) {
  const { data, error } = await supabase.rpc("review_finance_cash_opening_balance", {
    p_proposal_id: input.proposalId, p_decision: input.decision, p_reason: input.reason,
  });
  if (error) throw error;
  return object(data, "نتيجة مراجعة الرصيد");
}
export async function createBankStatement(input: {
  mappingId: string; evidenceId: string; reference: string; periodFrom: string; periodTo: string;
  openingBalance: string; closingBalance: string;
}) {
  const { data, error } = await supabase.rpc("create_finance_bank_statement", {
    p_settlement_account_mapping_id: input.mappingId, p_evidence_id: input.evidenceId,
    p_statement_reference: input.reference, p_period_from: input.periodFrom, p_period_to: input.periodTo,
    p_opening_balance: input.openingBalance, p_closing_balance: input.closingBalance,
  });
  if (error) throw error;
  return uuid(object(data, "تأكيد كشف البنك").statement_id, "كشف البنك");
}
export async function voidBankStatement(input: { statementId: string; reason: string }) {
  const { data, error } = await supabase.rpc("void_finance_bank_statement", {
    p_statement_id: input.statementId,
    p_reason: input.reason,
  });
  if (error) throw error;
  const row = object(data, "تأكيد إلغاء كشف البنك");
  const statementId = uuid(row.statement_id, "كشف البنك");
  const voidId = uuid(row.void_id, "سجل إلغاء الكشف");
  if (statementId !== input.statementId || row.voided !== true || typeof row.replayed !== "boolean") {
    throw new Error("لم يؤكد الخادم إلغاء كشف البنك بالمعرف والنتيجة المتوقعة.");
  }
  return { statementId, voidId, replayed: row.replayed };
}

export async function recordBankStatementLine(input: {
  statementId: string; lineNumber: number; transactionDate: string; externalReference: string;
  description: string; signedAmount: string; idempotencyKey: string;
}) {
  const { data, error } = await supabase.rpc("record_finance_bank_statement_line", {
    p_statement_id: input.statementId, p_line_number: input.lineNumber,
    p_transaction_date: input.transactionDate, p_external_reference: input.externalReference || null,
    p_description: input.description, p_signed_amount: input.signedAmount, p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return uuid(object(data, "تأكيد سطر كشف البنك").line_id, "سطر الكشف");
}
export async function fetchBankMatchCandidates(statementId: string, lineId: string): Promise<BankMatchCandidate[]> {
  const { data, error } = await supabase.rpc("fetch_finance_bank_statement_match_candidates", {
    p_statement_id: statementId, p_statement_line_id: lineId,
  });
  if (error) throw error;
  return list(data, "قيود الأستاذ المطابقة", 100).map((item) => {
    const row = object(item, "قيد مرشح");
    return {
      journalEntryId: uuid(row.journal_entry_id, "قيد الأستاذ"),
      journalLineNumber: integer(row.journal_line_number, "سطر الأستاذ", 1, 100),
      entryNumber: integer(row.entry_number, "رقم القيد", 1),
      entryDate: day(row.entry_date, "تاريخ القيد"),
      description: text(row.description, "وصف القيد", 240),
      accountCode: text(row.account_code, "رمز الحساب", 80),
      accountName: text(row.account_name, "اسم الحساب", 160),
      debit: money(row.debit, "المدين"),
      credit: money(row.credit, "الدائن"),
      signedAmount: money(row.signed_amount, "صافي السطر"),
    };
  });
}
export async function matchBankStatementLine(input: {
  statementId: string; lineId: string; journalEntryId: string; journalLineNumber: number;
}) {
  const { data, error } = await supabase.rpc("match_finance_bank_statement_line", {
    p_statement_id: input.statementId, p_statement_line_id: input.lineId,
    p_journal_entry_id: input.journalEntryId, p_journal_line_number: input.journalLineNumber,
  });
  if (error) throw error;
  return object(data, "نتيجة المطابقة");
}
export async function finalizeBankStatementReconciliation(input: { statementId: string; reason: string }) {
  const { data, error } = await supabase.rpc("finalize_finance_bank_statement_reconciliation", {
    p_statement_id: input.statementId, p_reason: input.reason,
  });
  if (error) throw error;
  return object(data, "نتيجة إقفال المطابقة");
}
