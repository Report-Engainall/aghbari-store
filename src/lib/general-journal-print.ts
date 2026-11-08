import { parseLedgerMoneyCents, type LedgerAccountType } from "@/lib/general-ledger";
import type { FinancialStatementsReport } from "@/lib/financial-statements";

export type GeneralJournalPrintDocument = {
  kind: "journal";
  entryNumber: string;
  entryDate: string;
  description: string;
  status: "draft" | "posted" | "void";
  statusLabel: string;
  sourceLabel: string;
  reversalLabel: string | null;
  debitTotal: string;
  creditTotal: string;
  lines: Array<{
    lineNumber: number;
    accountCode: string;
    accountName: string;
    memo: string | null;
    debit: string;
    credit: string;
  }>;
};

export type FinancialStatementsPrintDocument = {
  kind: "statements";
  periodFrom: string;
  periodTo: string;
  postedEntryCount: number;
  revenueCents: bigint;
  expenseCents: bigint;
  netIncomeCents: bigint;
  assetsCents: bigint;
  liabilitiesCents: bigint;
  equityCents: bigint;
  cumulativeEarningsCents: bigint;
  liabilitiesEquityAndEarningsCents: bigint;
  balanceDifferenceCents: bigint;
  incomeLines: Array<{ code: string; name: string; accountType: "revenue" | "expense"; amountCents: bigint }>;
  balanceLines: Array<{ code: string; name: string; accountType: "asset" | "liability" | "equity"; amountCents: bigint }>;
};

export type GeneralLedgerPrintDocument = GeneralJournalPrintDocument | FinancialStatementsPrintDocument;

const SOURCE_LABELS: Record<string, string> = {
  manual: "قيد يدوي",
  adjustment: "قيد تسوية",
  cash_expense: "مصروف صندوق",
  customer_payment: "تحصيل عميل",
  customer_invoice_payment: "تحصيل فاتورة عميل",
  supplier_payment: "سداد مورد",
  purchase_receipt: "استلام مشتريات",
  sales_invoice: "فاتورة مبيعات",
  sales_return: "مرتجع مبيعات",
  purchase_return: "مرتجع مشتريات",
  inventory_adjustment: "تسوية مخزون",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validText(value: unknown, max: number, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= max && (allowEmpty || value.trim().length > 0);
}

function sum(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => total + value, 0n);
}

/**
 * Projects only the accounting fields permitted in a staff journal printout.
 * Entry IDs, account IDs, organization IDs, source references, timestamps,
 * actor metadata and all unknown server fields are deliberately omitted.
 */
export function projectGeneralJournalPrintDocument(value: unknown): GeneralJournalPrintDocument | null {
  if (
    !isRecord(value) ||
    !validText(value.entry_number, 64) ||
    !validIsoDate(value.entry_date) ||
    !validText(value.description, 240) ||
    (value.status !== "draft" && value.status !== "posted" && value.status !== "void") ||
    !validText(value.source_type, 80) ||
    !Array.isArray(value.lines) ||
    value.lines.length < 2 ||
    value.lines.length > 100 ||
    typeof value.debit_total !== "string" ||
    typeof value.credit_total !== "string"
  ) return null;

  const headerDebit = parseLedgerMoneyCents(value.debit_total);
  const headerCredit = parseLedgerMoneyCents(value.credit_total);
  if (headerDebit === null || headerCredit === null || headerDebit <= 0n || headerDebit !== headerCredit) return null;

  const seenLineNumbers = new Set<number>();
  const lines: GeneralJournalPrintDocument["lines"] = [];
  for (const item of value.lines) {
    if (
      !isRecord(item) ||
      !Number.isSafeInteger(item.line_number) ||
      (item.line_number as number) < 1 ||
      seenLineNumbers.has(item.line_number as number) ||
      !validText(item.account_code, 64) ||
      !validText(item.account_name, 160) ||
      !(item.memo === null || validText(item.memo, 300, true)) ||
      typeof item.debit !== "string" ||
      typeof item.credit !== "string"
    ) return null;

    const debit = parseLedgerMoneyCents(item.debit);
    const credit = parseLedgerMoneyCents(item.credit);
    if (debit === null || credit === null || !((debit > 0n && credit === 0n) || (credit > 0n && debit === 0n))) return null;

    seenLineNumbers.add(item.line_number as number);
    lines.push({
      lineNumber: item.line_number as number,
      accountCode: item.account_code,
      accountName: item.account_name,
      memo: item.memo === null || item.memo.trim() === "" ? null : item.memo,
      debit: item.debit,
      credit: item.credit,
    });
  }

  if (
    sum(lines.map((line) => parseLedgerMoneyCents(line.debit) ?? -1n)) !== headerDebit ||
    sum(lines.map((line) => parseLedgerMoneyCents(line.credit) ?? -1n)) !== headerCredit
  ) return null;

  const sourceType = value.source_type.toLowerCase();
  return {
    kind: "journal",
    entryNumber: value.entry_number,
    entryDate: value.entry_date,
    description: value.description,
    status: value.status,
    statusLabel: value.status === "posted" ? "مرحّل ومعتمد" : value.status === "draft" ? "مسودة غير مرحّلة" : "ملغى",
    sourceLabel: SOURCE_LABELS[sourceType] ?? "قيد مرتبط بعملية",
    reversalLabel: value.isReversal === true ? "قيد عكس" : value.hasReversal === true ? "مرتبط بقيد عكس" : null,
    debitTotal: value.debit_total,
    creditTotal: value.credit_total,
    lines,
  };
}

const ACCOUNT_TYPES: LedgerAccountType[] = ["asset", "liability", "equity", "revenue", "expense"];
function safeBigInt(value: unknown): value is bigint {
  return typeof value === "bigint";
}

/**
 * Projects the complete server-derived income statement and balance sheet.
 * Account UUIDs and all source payload metadata are excluded.
 */
export function projectFinancialStatementsPrintDocument(
  report: FinancialStatementsReport | null,
): FinancialStatementsPrintDocument | null {
  if (
    !report ||
    !validIsoDate(report.periodFrom) ||
    !validIsoDate(report.periodTo) ||
    report.periodFrom > report.periodTo ||
    !Number.isSafeInteger(report.postedEntryCount) ||
    report.postedEntryCount < 0 ||
    ![
      report.revenueCents,
      report.expenseCents,
      report.netIncomeCents,
      report.assetsCents,
      report.liabilitiesCents,
      report.equityCents,
      report.cumulativeEarningsCents,
      report.liabilitiesEquityAndEarningsCents,
      report.balanceDifferenceCents,
    ].every(safeBigInt) ||
    !Array.isArray(report.incomeLines) ||
    !Array.isArray(report.balanceLines) ||
    report.incomeLines.length > 1000 ||
    report.balanceLines.length > 1000
  ) return null;

  const incomeLines: FinancialStatementsPrintDocument["incomeLines"] = [];
  for (const line of report.incomeLines) {
    if (
      !line ||
      !validText(line.code, 64) ||
      !validText(line.name, 160) ||
      (line.accountType !== "revenue" && line.accountType !== "expense") ||
      !safeBigInt(line.amountCents)
    ) return null;
    incomeLines.push({ code: line.code, name: line.name, accountType: line.accountType, amountCents: line.amountCents });
  }

  const balanceLines: FinancialStatementsPrintDocument["balanceLines"] = [];
  for (const line of report.balanceLines) {
    if (
      !line ||
      !validText(line.code, 64) ||
      !validText(line.name, 160) ||
      !["asset", "liability", "equity"].includes(line.accountType) ||
      !ACCOUNT_TYPES.includes(line.accountType) ||
      !safeBigInt(line.amountCents)
    ) return null;
    balanceLines.push({
      code: line.code,
      name: line.name,
      accountType: line.accountType as "asset" | "liability" | "equity",
      amountCents: line.amountCents,
    });
  }

  const revenue = sum(incomeLines.filter((line) => line.accountType === "revenue").map((line) => line.amountCents));
  const expense = sum(incomeLines.filter((line) => line.accountType === "expense").map((line) => line.amountCents));
  const assets = sum(balanceLines.filter((line) => line.accountType === "asset").map((line) => line.amountCents));
  const liabilities = sum(balanceLines.filter((line) => line.accountType === "liability").map((line) => line.amountCents));
  const equity = sum(balanceLines.filter((line) => line.accountType === "equity").map((line) => line.amountCents));

  if (
    revenue !== report.revenueCents ||
    expense !== report.expenseCents ||
    report.netIncomeCents !== revenue - expense ||
    assets !== report.assetsCents ||
    liabilities !== report.liabilitiesCents ||
    equity !== report.equityCents ||
    report.liabilitiesEquityAndEarningsCents !== liabilities + equity + report.cumulativeEarningsCents ||
    report.balanceDifferenceCents !== assets - report.liabilitiesEquityAndEarningsCents
  ) return null;

  return {
    kind: "statements",
    periodFrom: report.periodFrom,
    periodTo: report.periodTo,
    postedEntryCount: report.postedEntryCount,
    revenueCents: report.revenueCents,
    expenseCents: report.expenseCents,
    netIncomeCents: report.netIncomeCents,
    assetsCents: report.assetsCents,
    liabilitiesCents: report.liabilitiesCents,
    equityCents: report.equityCents,
    cumulativeEarningsCents: report.cumulativeEarningsCents,
    liabilitiesEquityAndEarningsCents: report.liabilitiesEquityAndEarningsCents,
    balanceDifferenceCents: report.balanceDifferenceCents,
    incomeLines,
    balanceLines,
  };
}
