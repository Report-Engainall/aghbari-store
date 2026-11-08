import type { SupplierPaymentHistory, SupplierPaymentWorkspace } from "@/lib/supplier-payments";

export type SupplierPaymentVoucherPrintDocument = {
  generatedAt: string;
  asOfDate: string;
  supplierName: string;
  paymentNumber: string;
  paymentDate: string;
  amount: string;
  currency: string;
  paymentMethodLabel: string;
  paymentReference: string;
  settlementAccountName: string;
  payableAccountCode: string;
  paymentStatusLabel: string;
  reconciliationStatusLabel: string;
  reconciliationReference: string | null;
  journalEntryNumber: string | null;
  journalStatusLabel: string;
  settlementEffectLabel: string;
};

function requireText(value: string, label: string, max = 240): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error("حقل " + label + " غير صالح في سند دفع المورد.");
  }
  return value.trim();
}

function validDate(value: string, label: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("تاريخ " + label + " غير صالح في سند دفع المورد.");
  }
  const parsed = new Date(value + "T00:00:00.000Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error("تاريخ " + label + " غير صالح في سند دفع المورد.");
  }
  return value;
}

function methodLabel(method: SupplierPaymentHistory["paymentMethod"]): string {
  if (method === "cash") return "نقدًا";
  if (method === "bank_transfer") return "تحويل بنكي";
  if (method === "cheque") return "شيك";
  throw new Error("وسيلة دفع مورد غير مدعومة.");
}

function paymentState(payment: SupplierPaymentHistory): {
  paymentStatusLabel: string;
  journalStatusLabel: string;
  settlementEffectLabel: string;
} {
  if (payment.status === "void") {
    return {
      paymentStatusLabel: "سند ملغى",
      journalStatusLabel: payment.journalStatus === "void" ? "قيد ملغى" :
        payment.journalStatus === "posted" ? "قيد مرحّل مع سند ملغى — يتطلب مراجعة" : "لا يوجد قيد مرحّل صالح",
      settlementEffectLabel: "السند الملغى لا يُعد سدادًا؛ راجع قيد الأستاذ المرتبط قبل أي تسوية لاحقة.",
    };
  }
  if (payment.journalStatus === "posted") {
    return {
      paymentStatusLabel: "قيد الدفع مرحّل",
      journalStatusLabel: "مرحّل",
      settlementEffectLabel: "قيد الدفع مرحّل؛ تُحتسب الدفعة ضمن المسدد من المستحق وفق مصدر الأستاذ.",
    };
  }
  if (payment.journalStatus === "draft" || payment.status === "journal_draft_created") {
    return {
      paymentStatusLabel: "قيد دفع غير مرحّل",
      journalStatusLabel: payment.journalStatus === "void" ? "ملغى" : "مسودة غير مرحلة",
      settlementEffectLabel: "السند/المسودة لا يخفضان المستحق النهائي قبل ترحيل قيد صحيح.",
    };
  }
  if (payment.journalStatus === "void") {
    return {
      paymentStatusLabel: "قيد الدفع ملغى",
      journalStatusLabel: "ملغى",
      settlementEffectLabel: "لا يوجد قيد دفع مرحّل محتسب في الرصيد.",
    };
  }
  return {
    paymentStatusLabel: "سند مسجل — التخصيص محجوز",
    journalStatusLabel: "لا يوجد قيد مرتبط",
    settlementEffectLabel: "حفظ السند يحجز التخصيص فقط؛ لا يمثل سدادًا نهائيًا قبل ترحيل القيد.",
  };
}

/** Projects the persisted payment header only; it never invents receipt-allocation lines. */
export function projectSupplierPaymentVoucherPrintDocument(
  workspace: SupplierPaymentWorkspace,
  payment: SupplierPaymentHistory,
  generatedAt = new Date().toISOString(),
): SupplierPaymentVoucherPrintDocument {
  if (!workspace || !Array.isArray(workspace.suppliers) || !Array.isArray(workspace.payments) ||
      !Number.isFinite(Date.parse(generatedAt)) || !workspace.payments.some((row) => row.paymentId === payment.paymentId)) {
    throw new Error("سند الدفع غير موجود ضمن لقطة المصدر الحالية.");
  }
  const supplier = workspace.suppliers.find((row) => row.id === payment.supplierId);
  if (!supplier) throw new Error("المورد المرتبط بالسند غير موجود في لقطة المصدر الحالية؛ أوقف الطباعة.");
  const amount = requireText(payment.amount, "المبلغ", 40);
  if (!/^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(amount) || Number(amount) <= 0) {
    throw new Error("مبلغ سند الدفع غير صالح؛ أوقف الطباعة.");
  }
  if (!/^[A-Z]{3}$/.test(payment.currency)) throw new Error("عملة سند الدفع غير صالحة.");
  const state = paymentState(payment);
  const reconciliationStatusLabel = payment.reconciliationStatus === "matched"
    ? "مطابقة مستقلة ناجحة"
    : payment.reconciliationStatus === "exception"
      ? "استثناء مطابقة مسجل"
      : "بانتظار دليل مستقل";
  return {
    generatedAt,
    asOfDate: validDate(workspace.asOfDate, "تاريخ المصدر"),
    supplierName: requireText(supplier.name, "اسم المورد"),
    paymentNumber: requireText(payment.paymentNumber, "رقم السند", 80),
    paymentDate: validDate(payment.paymentDate, "تاريخ الدفع"),
    amount,
    currency: payment.currency,
    paymentMethodLabel: methodLabel(payment.paymentMethod),
    paymentReference: requireText(payment.paymentReference, "مرجع الدفع", 200),
    settlementAccountName: requireText(payment.settlementAccountName, "حساب التسوية"),
    payableAccountCode: requireText(payment.payableAccountCode, "حساب الالتزام", 80),
    paymentStatusLabel: state.paymentStatusLabel,
    reconciliationStatusLabel,
    reconciliationReference: payment.reconciliationReference
      ? requireText(payment.reconciliationReference, "مرجع المطابقة", 200)
      : null,
    journalEntryNumber: payment.journalEntryNumber
      ? requireText(payment.journalEntryNumber, "رقم القيد", 80)
      : null,
    journalStatusLabel: state.journalStatusLabel,
    settlementEffectLabel: state.settlementEffectLabel,
  };
}
