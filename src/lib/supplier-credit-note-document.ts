import type { SupplierReturnCreditNoteRecord } from "@/lib/supplier-credit-notes";

export type SupplierCreditNoteDocumentEvent = {
  documentNumber: string;
  actionLabel: string;
  reason: string | null;
  createdAt: string;
};

export type SupplierCreditNoteDocument = {
  returnNumber: string;
  sourceReceiptNumber: string;
  purchaseOrderNumber: string;
  supplierName: string;
  postedAt: string;
  currency: string;
  sourceAmount: number | null;
  creditNoteNumber: string | null;
  creditNoteIssuedOn: string | null;
  actualAmount: number | null;
  varianceAmount: number | null;
  varianceConsistent: boolean;
  creditNoteStatusLabel: string;
  varianceReviewReason: string | null;
  sourceJournalEntryNumber: string | null;
  sourceJournalStatusLabel: string;
  journalEntryNumber: string | null;
  journalStatusLabel: string;
  events: SupplierCreditNoteDocumentEvent[];
  generatedAt: string;
};

const ACTION_LABELS: Record<string, string> = {
  recorded_exact_match: "تسجيل إشعار مطابق",
  recorded_variance_pending: "تسجيل فرق بانتظار المراجعة",
  variance_approved: "اعتماد فرق المبلغ",
  variance_rejected: "رفض إشعار المورد",
  journal_draft_created: "إنشاء مسودة القيد",
};

function text(value: unknown, label: string, max = 500): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("تعذر إنشاء مستند المطابقة: حقل " + label + " غير صالح.");
  }
  return value.trim();
}

function dateTime(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error("تعذر إنشاء مستند المطابقة: تاريخ " + label + " غير صالح.");
  }
  return new Date(value).toISOString();
}

function dateOnly(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("تعذر إنشاء مستند المطابقة: تاريخ " + label + " غير صالح.");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("تعذر إنشاء مستند المطابقة: تاريخ " + label + " غير صالح.");
  }
  return value;
}

function cents(value: unknown, label: string, positive = false): bigint | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) ||
      Math.abs(value) > Number.MAX_SAFE_INTEGER / 100 || (positive && value <= 0)) {
    throw new Error("تعذر إنشاء مستند المطابقة: مبلغ " + label + " غير صالح.");
  }
  return BigInt(Math.round(value * 100));
}

function statusLabel(status: SupplierReturnCreditNoteRecord["creditNoteStatus"]): string {
  switch (status) {
    case "exact_match": return "مطابق للمصدر";
    case "variance_pending": return "فرق بانتظار اعتماد المحاسب";
    case "variance_approved": return "فرق معتمد";
    case "variance_rejected": return "مرفوض — يتطلب مستندًا مصححًا";
    case "journal_draft_created": return "مسودة قيد أُنشئت";
    default: return "لم يسجل إشعار دائن";
  }
}

function journalLabel(status: SupplierReturnCreditNoteRecord["journalStatus"] |
  SupplierReturnCreditNoteRecord["sourceJournalStatus"]): string {
  switch (status) {
    case "draft": return "مسودة — غير مُرحّل";
    case "posted": return "مُرحّل";
    case "void": return "ملغى";
    default: return "غير متاح";
  }
}

/** Projects saved finance evidence without exposing tenant, actor, account or internal record IDs. */
export function projectSupplierCreditNoteDocument(
  source: SupplierReturnCreditNoteRecord,
  generatedAt = new Date().toISOString(),
): SupplierCreditNoteDocument {
  if (!source || !Array.isArray(source.reviewHistory) || source.reviewHistory.length > 1000) {
    throw new Error("سجل مطابقة إشعار المورد غير مكتمل؛ أوقف إنشاء المستند.");
  }
  if (!/^[A-Z]{3}$/.test(source.currency)) throw new Error("عملة المستند غير صالحة.");

  const sourceCents = cents(source.sourceAmount, "المصدر");
  const actualCents = cents(source.actualAmount, "المستند الفعلي", true);
  const declaredVariance = cents(source.varianceAmount, "الفرق");
  const hasBothAmounts = sourceCents !== null && actualCents !== null;
  const expectedVariance = hasBothAmounts ? actualCents - sourceCents : null;
  const varianceConsistent = expectedVariance === declaredVariance &&
    (hasBothAmounts || declaredVariance === null);

  const events = source.reviewHistory.map((event) => {
    const actionLabel = ACTION_LABELS[event.action];
    if (!actionLabel) throw new Error("نوع حدث مراجعة غير معروف؛ أوقف إنشاء المستند.");
    return {
      documentNumber: text(event.supplierCreditNoteNumber, "رقم المستند في سجل المراجعة", 80),
      actionLabel,
      reason: event.reason === null ? null : text(event.reason, "سبب القرار", 500),
      createdAt: dateTime(event.createdAt, "حدث المراجعة"),
    };
  });

  return {
    returnNumber: text(source.returnNumber, "رقم المرتجع", 120),
    sourceReceiptNumber: text(source.sourceReceiptNumber, "إيصال المصدر", 120),
    purchaseOrderNumber: text(source.purchaseOrderNumber, "أمر الشراء", 120),
    supplierName: text(source.supplierName, "اسم المورد", 300),
    postedAt: dateTime(source.postedAt, "ترحيل المرتجع"),
    currency: source.currency,
    sourceAmount: sourceCents === null ? null : Number(sourceCents) / 100,
    creditNoteNumber: source.supplierCreditNoteNumber === null ? null :
      text(source.supplierCreditNoteNumber, "رقم إشعار المورد", 80),
    creditNoteIssuedOn: dateOnly(source.creditNoteIssuedOn, "إصدار إشعار المورد"),
    actualAmount: actualCents === null ? null : Number(actualCents) / 100,
    varianceAmount: varianceConsistent && expectedVariance !== null ? Number(expectedVariance) / 100 : null,
    varianceConsistent,
    creditNoteStatusLabel: statusLabel(source.creditNoteStatus),
    varianceReviewReason: source.varianceReviewReason === null ? null :
      text(source.varianceReviewReason, "سبب مراجعة الفرق", 500),
    sourceJournalEntryNumber: source.sourceJournalEntryNumber === null ? null :
      text(source.sourceJournalEntryNumber, "رقم قيد المصدر", 120),
    sourceJournalStatusLabel: journalLabel(source.sourceJournalStatus),
    journalEntryNumber: source.journalEntryNumber === null ? null :
      text(source.journalEntryNumber, "رقم قيد المورد", 120),
    journalStatusLabel: journalLabel(source.journalStatus),
    events,
    generatedAt: dateTime(generatedAt, "إنشاء المستند"),
  };
}
