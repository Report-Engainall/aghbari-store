import type {
  SupplierAccountActivityPayload,
  SupplierAccountActivityCurrencyTotal,
  SupplierAccountActivityEntry,
  SupplierAccountActivitySupplier,
} from "@/lib/supplier-account-activity";

export type SupplierAccountActivityPrintDocument = {
  generatedAt: string;
  from: string | null;
  to: string | null;
  asOfDate: string;
  entryCount: number;
  limit: number;
  offset: number;
  pageNumber: number;
  hasMore: boolean;
  suppliers: Array<{
    supplierName: string;
    currency: string;
    activityCount: number;
    debitTotal: number;
    creditTotal: number;
    netCreditMovement: number;
    pendingPaymentAmount: number | null;
    availableToAllocate: number | null;
    remainingPayable: number | null;
    balanceComplete: boolean;
    lastActivityDate: string | null;
  }>;
  currencyTotals: Array<{
    currency: string;
    debitTotal: number;
    creditTotal: number;
    netCreditMovement: number;
    activityCount: number;
    pendingPaymentAmount: number | null;
    availableToAllocate: number | null;
    remainingPayable: number | null;
    balanceComplete: boolean;
  }>;
  entries: Array<{
    journalEntryNumber: string;
    entryDate: string;
    description: string;
    sourceType: SupplierAccountActivityEntry["sourceType"];
    documentReference: string;
    receiptNumber: string;
    purchaseOrderNumber: string;
    supplierName: string;
    currency: string;
    payableAccountCode: string;
    payableAccountName: string;
    debit: number;
    credit: number;
  }>;
};

function validDate(value: string | null, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("تاريخ غير صالح في كشف الموردين: " + label + ".");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("تاريخ غير صالح في كشف الموردين: " + label + ".");
  }
  return value;
}

function requiredText(value: string, label: string, maximum = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error("حقل غير صالح في كشف الموردين: " + label + ".");
  }
  return value.trim();
}

function finiteAmount(value: number, label: string, nonNegative = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) ||
      Math.abs(value) >= 1e16 || (nonNegative && value < 0)) {
    throw new Error("مبلغ غير صالح في كشف الموردين: " + label + ".");
  }
  return value;
}

function safeNullableAmount(value: number | null | undefined, label: string): number | null {
  return value === null || value === undefined ? null : finiteAmount(value, label, true);
}

function safeCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("عدد غير صالح في كشف الموردين: " + label + ".");
  }
  return value;
}

function currency(value: string): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    throw new Error("رمز عملة غير صالح في كشف الموردين.");
  }
  return value;
}

function projectSupplier(row: SupplierAccountActivitySupplier) {
  const balanceComplete = row.balanceComplete === true;
  const remainingPayable = safeNullableAmount(row.remainingPayable, "المستحق النهائي");
  if (!balanceComplete && remainingPayable !== null) {
    throw new Error("ورد رصيد نهائي رغم أن تغطية مصدر المورد غير مكتملة؛ أوقف التصدير.");
  }
  return {
    supplierName: requiredText(row.supplierName, "المورد", 240),
    currency: currency(row.currency),
    activityCount: safeCount(row.activityCount, "حركات المورد"),
    debitTotal: finiteAmount(row.debitTotal, "مدين المورد", true),
    creditTotal: finiteAmount(row.creditTotal, "دائن المورد", true),
    netCreditMovement: finiteAmount(row.netCreditMovement, "صافي حركة المورد"),
    pendingPaymentAmount: safeNullableAmount(row.pendingPaymentAmount, "دفعات المورد غير المرحلة"),
    availableToAllocate: safeNullableAmount(row.availableToAllocate, "المتاح للتخصيص"),
    remainingPayable: balanceComplete ? remainingPayable : null,
    balanceComplete,
    lastActivityDate: validDate(row.lastActivityDate, "آخر حركة"),
  };
}

function projectCurrencyTotal(row: SupplierAccountActivityCurrencyTotal) {
  const balanceComplete = row.balanceComplete === true;
  const remainingPayable = safeNullableAmount(row.remainingPayable, "المستحق النهائي للعملة");
  if (!balanceComplete && remainingPayable !== null) {
    throw new Error("ورد رصيد نهائي رغم عدم اكتمال تغطية العملة؛ أوقف التصدير.");
  }
  return {
    currency: currency(row.currency),
    debitTotal: finiteAmount(row.debitTotal, "إجمالي المدين", true),
    creditTotal: finiteAmount(row.creditTotal, "إجمالي الدائن", true),
    netCreditMovement: finiteAmount(row.netCreditMovement, "صافي حركة العملة"),
    activityCount: safeCount(row.activityCount, "حركات العملة"),
    pendingPaymentAmount: safeNullableAmount(row.pendingPaymentAmount, "دفعات العملة غير المرحلة"),
    availableToAllocate: safeNullableAmount(row.availableToAllocate, "المتاح للتخصيص"),
    remainingPayable: balanceComplete ? remainingPayable : null,
    balanceComplete,
  };
}

/** A safe document projection: no UUIDs, tenant/profile IDs or account IDs leave the source model. */
export function projectSupplierAccountActivityPrintDocument(
  payload: SupplierAccountActivityPayload,
  filters: { from?: string; to?: string } = {},
  generatedAt = new Date().toISOString(),
): SupplierAccountActivityPrintDocument {
  if (!payload || payload.settlementIncluded !== true ||
      !Array.isArray(payload.suppliers) || !Array.isArray(payload.currencyTotals) ||
      !Array.isArray(payload.entries) || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("مصدر كشف الموردين غير مكتمل أو غير صالح؛ أوقف إنشاء المستند.");
  }
  const from = validDate(filters.from || null, "بداية الفترة");
  const to = validDate(filters.to || null, "نهاية الفترة");
  if (from && to && from > to) throw new Error("بداية الفترة تتجاوز نهايتها.");
  const asOfDate = validDate(payload.asOfDate, "تاريخ إعداد الكشف");
  if (!asOfDate) throw new Error("تاريخ إعداد كشف الموردين غير متاح.");
  const entryCount = safeCount(payload.entryCount, "إجمالي الحركات");
  const limit = safeCount(payload.limit, "حد الصفحة");
  const offset = safeCount(payload.offset, "إزاحة الصفحة");
  if (limit < 1 || limit > 100 || offset > 10000 ||
      payload.hasMore !== (entryCount > offset + limit) ||
      payload.entries.length > limit || offset + payload.entries.length > entryCount) {
    throw new Error("حدود تفاصيل كشف الموردين غير متطابقة؛ أوقف التصدير.");
  }
  const seenJournals = new Set<string>();
  const entries = payload.entries.map((row) => {
    const journalId = requiredText(row.journalEntryId, "مرجع القيد");
    if (seenJournals.has(journalId)) throw new Error("تكرر قيد في صفحة كشف الموردين؛ أوقف التصدير.");
    seenJournals.add(journalId);
    if (!(["purchase_receipt", "purchase_supplier_credit_note", "purchase_supplier_payment"] as const).includes(row.sourceType)) {
      throw new Error("نوع حركة غير مدعوم في كشف الموردين.");
    }
    const debit = finiteAmount(row.debit, "المدين", true);
    const credit = finiteAmount(row.credit, "الدائن", true);
    if (!((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) {
      throw new Error("قيد المورد يجب أن يكون مدينًا أو دائنًا فقط.");
    }
    return {
      journalEntryNumber: requiredText(row.journalEntryNumber, "رقم القيد", 80),
      entryDate: validDate(row.entryDate, "تاريخ القيد")!,
      description: requiredText(row.description, "وصف القيد"),
      sourceType: row.sourceType,
      documentReference: requiredText(row.documentReference, "مرجع المستند", 120),
      receiptNumber: requiredText(row.receiptNumber, "رقم إيصال الاستلام", 80),
      purchaseOrderNumber: requiredText(row.purchaseOrderNumber, "رقم أمر الشراء", 80),
      supplierName: requiredText(row.supplierName, "المورد", 240),
      currency: currency(row.currency),
      payableAccountCode: requiredText(row.payableAccountCode, "رمز حساب الالتزام", 80),
      payableAccountName: requiredText(row.payableAccountName, "اسم حساب الالتزام", 240),
      debit,
      credit,
    };
  });
  const suppliers = payload.suppliers.map(projectSupplier);
  const currencyTotals = payload.currencyTotals.map(projectCurrencyTotal);
  if (new Set(currencyTotals.map((row) => row.currency)).size !== currencyTotals.length) {
    throw new Error("تكررت عملة في إجماليات كشف الموردين.");
  }
  return {
    generatedAt,
    from,
    to,
    asOfDate,
    entryCount,
    limit,
    offset,
    pageNumber: Math.floor(offset / limit) + 1,
    hasMore: payload.hasMore,
    suppliers,
    currencyTotals,
    entries,
  };
}
