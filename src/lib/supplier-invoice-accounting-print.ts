import type { SupplierInvoiceAccountingStatus, SupplierInvoiceAccountingStatusName, SupplierInvoiceRecord } from "@/lib/supplier-invoices";

export interface SupplierInvoiceAccountingPrintAccount {
  code: string;
  name: string;
}

export interface SupplierInvoiceAccountingPrintLine {
  receiptNumber: string;
  itemCode: string;
  productName: string;
  unit: string | null;
  quantity: string;
  receivedUnitCost: string;
  invoicedUnitCost: string;
  sourceLineTotal: string;
  invoiceLineTotal: string;
}

export interface SupplierInvoiceAccountingPrintDocument {
  generatedAt: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  purchaseOrderNumber: string;
  currency: string;
  matchStatus: SupplierInvoiceRecord["matchStatus"];
  accountingStatus: SupplierInvoiceAccountingStatusName;
  sourceMerchandiseAmount: string;
  invoiceMerchandiseSubtotal: string;
  merchandiseVarianceAmount: string;
  taxAmount: string;
  invoiceTotalAmount: string;
  netAdjustmentAmount: string;
  payableDirection: "increase" | "decrease" | "none";
  payableAccount: SupplierInvoiceAccountingPrintAccount | null;
  taxAccount: SupplierInvoiceAccountingPrintAccount | null;
  varianceAccount: SupplierInvoiceAccountingPrintAccount | null;
  journalEntryNumber: string | null;
  journalStatus: "draft" | "posted" | "void" | null;
  lines: SupplierInvoiceAccountingPrintLine[];
}

type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  account_type: string;
  is_active: boolean;
};

function parseCents(value: string, label: string, signed = false): bigint {
  const pattern = signed
    ? /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/
    : /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
  if (typeof value !== "string" || !pattern.test(value)) {
    throw new Error("قيمة " + label + " غير صالحة لمستند الطباعة.");
  }
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const cents = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -cents : cents;
}

function formatCents(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return (negative ? "-" : "") + (absolute / 100n).toString() + "." +
    (absolute % 100n).toString().padStart(2, "0");
}

function quantityMilli(value: string): bigint {
  if (!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/.test(value)) {
    throw new Error("كمية سطر فاتورة المورد غير صالحة لمستند الطباعة.");
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt((fraction + "000").slice(0, 3));
}

function roundedLineCents(quantity: string, unitCost: string): bigint {
  const extended = quantityMilli(quantity) * parseCents(unitCost, "تكلفة الاستلام");
  return (extended + 500n) / 1000n;
}

function accountReference(
  id: string | null,
  accounts: LedgerAccount[],
  expectedTypes: string[],
  label: string,
): SupplierInvoiceAccountingPrintAccount | null {
  if (!id) return null;
  const account = accounts.find((item) => item.id === id);
  if (!account || !expectedTypes.includes(account.account_type) || !account.code.trim() || !account.name.trim()) {
    throw new Error("تعذر مطابقة " + label + " مع حساب نشط في دليل الحسابات؛ أوقف الطباعة.");
  }
  return { code: account.code, name: account.name };
}

export function projectSupplierInvoiceAccountingPrintDocument(input: {
  invoice: SupplierInvoiceRecord;
  accounting: SupplierInvoiceAccountingStatus;
  accounts: LedgerAccount[];
  generatedAt?: string;
}): SupplierInvoiceAccountingPrintDocument {
  const { invoice, accounting, accounts } = input;
  if (invoice.id !== accounting.invoiceId || invoice.currency !== accounting.currency ||
      invoice.taxAmount !== accounting.taxAmount || invoice.invoiceTotalAmount !== accounting.invoiceTotalAmount) {
    throw new Error("بيانات الفاتورة وحالة تسويتها لا تشير إلى المستند نفسه؛ أوقف الطباعة.");
  }
  if (!invoice.lines.length || invoice.lines.length > 100) {
    throw new Error("عدد بنود الفاتورة خارج حدود مستند الطباعة.");
  }

  const expectedSource = invoice.lines.reduce(
    (sum, line) => sum + roundedLineCents(line.invoicedQuantity, line.receivedUnitCost),
    0n,
  );
  const actualSource = parseCents(accounting.sourceMerchandiseAmount, "تكلفة الاستلام المصدرية");
  const invoiceSubtotal = parseCents(invoice.merchandiseSubtotal, "إجمالي البنود");
  const invoiceTax = parseCents(invoice.taxAmount, "الضريبة");
  const invoiceTotal = parseCents(invoice.invoiceTotalAmount, "إجمالي الفاتورة");
  const sourceVariance = invoiceSubtotal - expectedSource;
  const netAdjustment = invoiceTotal - expectedSource;
  const reportedVariance = parseCents(accounting.merchandiseVarianceAmount, "فرق تكلفة الاستلام", true);
  const sumInvoiceLines = invoice.lines.reduce(
    (sum, line) => sum + parseCents(line.actualLineTotal, "قيمة بند الفاتورة"),
    0n,
  );

  if (expectedSource !== actualSource || sourceVariance !== reportedVariance ||
      sumInvoiceLines !== invoiceSubtotal || invoiceSubtotal + invoiceTax !== invoiceTotal ||
      netAdjustment !== invoiceTotal - actualSource) {
    throw new Error("لم تتطابق مجاميع البنود وتكلفة الاستلام والضريبة مع لقطة التسوية؛ أوقف الطباعة.");
  }

  if ((accounting.accountingStatus === "no_adjustment_required" && (invoiceTax !== 0n || sourceVariance !== 0n)) ||
      (accounting.accountingStatus === "journal_draft_created" && (!accounting.journalEntryId || accounting.journalStatus !== "draft")) ||
      (accounting.accountingStatus === "journal_posted" && (!accounting.journalEntryId || accounting.journalStatus !== "posted")) ||
      (accounting.accountingStatus === "journal_void" && (!accounting.journalEntryId || accounting.journalStatus !== "void")) ||
      (accounting.accountingStatus === "journal_reversed" && (!accounting.journalEntryId || accounting.journalStatus !== "posted"))) {
    throw new Error("حالة القيد المحاسبي لا تطابق عقد مستند الطباعة.");
  }

  const payableAccount = accountReference(accounting.sourcePayableAccountId, accounts, ["liability"], "حساب الدائن الأصلي");
  const taxAccount = accountReference(accounting.taxAccountId, accounts, ["asset", "expense"], "حساب الضريبة");
  const varianceAccount = accountReference(accounting.merchandiseVarianceAccountId, accounts, ["expense"], "حساب فرق التكلفة");
  if (invoiceTax > 0n && !taxAccount && accounting.accountingStatus !== "not_prepared" &&
      accounting.accountingStatus !== "journal_void" && accounting.accountingStatus !== "journal_reversed") {
    throw new Error("حساب الضريبة غير موجود في عقد التسوية المحفوظ.");
  }
  if (sourceVariance !== 0n && !varianceAccount && accounting.accountingStatus !== "not_prepared" &&
      accounting.accountingStatus !== "journal_void" && accounting.accountingStatus !== "journal_reversed") {
    throw new Error("حساب فرق التكلفة غير موجود في عقد التسوية المحفوظ.");
  }

  return {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    supplierName: invoice.supplierName,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    purchaseOrderNumber: invoice.purchaseOrderNumber,
    currency: invoice.currency,
    matchStatus: invoice.matchStatus,
    accountingStatus: accounting.accountingStatus,
    sourceMerchandiseAmount: formatCents(actualSource),
    invoiceMerchandiseSubtotal: formatCents(invoiceSubtotal),
    merchandiseVarianceAmount: formatCents(sourceVariance),
    taxAmount: formatCents(invoiceTax),
    invoiceTotalAmount: formatCents(invoiceTotal),
    netAdjustmentAmount: formatCents(netAdjustment),
    payableDirection: netAdjustment > 0n ? "increase" : netAdjustment < 0n ? "decrease" : "none",
    payableAccount,
    taxAccount,
    varianceAccount,
    journalEntryNumber: accounting.journalEntryNumber,
    journalStatus: accounting.journalStatus,
    lines: invoice.lines.map((line) => ({
      receiptNumber: line.receiptNumber,
      itemCode: line.itemCode,
      productName: line.productName,
      unit: line.unit,
      quantity: line.invoicedQuantity,
      receivedUnitCost: line.receivedUnitCost,
      invoicedUnitCost: line.invoicedUnitCost,
      sourceLineTotal: line.expectedLineTotal,
      invoiceLineTotal: line.actualLineTotal,
    })),
  };
}
