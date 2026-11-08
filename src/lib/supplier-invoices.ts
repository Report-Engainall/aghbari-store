import { supabase } from "./supabase";

export type SupplierInvoiceMatchStatus =
  | "matched"
  | "variance_pending"
  | "variance_approved"
  | "variance_rejected";
export type SupplierInvoiceTaxAccountingStatus = "not_required" | "pending";

export interface SupplierInvoicePurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  status: "submitted" | "partially_received" | "received";
  currency: string;
}
export interface SupplierInvoiceReceivableLine {
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  currency: string;
  receiptId: string;
  receiptNumber: string;
  receivedAt: string;
  receiptItemId: string;
  purchaseOrderItemId: string;
  productId: string;
  itemCode: string;
  productName: string;
  unit: string | null;
  sourceReceivedQuantity: string;
  invoicedQuantity: string;
  remainingToInvoice: string;
  orderedUnitCost: string | null;
  receivedUnitCost: string | null;
  receivedLineTotal: string | null;
  sourceCostComplete: boolean;
}
export interface SupplierInvoiceLine {
  id: string;
  receiptId: string;
  receiptNumber: string;
  receiptItemId: string;
  purchaseOrderItemId: string;
  productId: string;
  itemCode: string;
  productName: string;
  unit: string | null;
  sourceReceivedQuantity: string;
  invoicedQuantity: string;
  orderedUnitCost: string;
  receivedUnitCost: string;
  invoicedUnitCost: string;
  expectedLineTotal: string;
  actualLineTotal: string;
  priceMatch: boolean;
}
export interface SupplierInvoiceEvent {
  action: "recorded_matched" | "recorded_variance_pending" | "variance_approved" | "variance_rejected" | "due_date_recorded";
  actorProfileId: string;
  reason: string | null;
  createdAt: string;
}
export interface SupplierInvoiceRecord {
  id: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber: string;
  invoiceDate: string;
  currency: string;
  merchandiseSubtotal: string;
  taxAmount: string;
  invoiceTotalAmount: string;
  expectedMerchandiseSubtotal: string;
  merchandiseVarianceAmount: string;
  matchStatus: SupplierInvoiceMatchStatus;
  taxAccountingStatus: SupplierInvoiceTaxAccountingStatus;
  createdByProfileId: string;
  createdAt: string;
  reviewedByProfileId: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  lines: SupplierInvoiceLine[];
  history: SupplierInvoiceEvent[];
}
export interface SupplierInvoiceWorkspace {
  purchaseOrders: SupplierInvoicePurchaseOrder[];
  receivableLines: SupplierInvoiceReceivableLine[];
  invoices: SupplierInvoiceRecord[];
  invoiceCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  asOfDate: string;
}
export interface SupplierInvoiceCommandResult {
  invoiceId: string;
  invoiceNumber: string;
  matchStatus: SupplierInvoiceMatchStatus;
  taxAccountingStatus: SupplierInvoiceTaxAccountingStatus;
  currency: string;
  merchandiseSubtotal: string;
  taxAmount: string;
  invoiceTotalAmount: string;
  expectedMerchandiseSubtotal: string;
  merchandiseVarianceAmount: string;
  replayed: boolean;
}

type Raw = Record<string, unknown>;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/;
const QUANTITY_PATTERN = /^(?:0|[1-9]\d{0,11})(?:\.\d{1,3})?$/;

function object(value: unknown, label: string): Raw {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("بيانات " + label + " غير صالحة.");
  return value as Raw;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("حقل " + label + " مفقود.");
  return value;
}
function nullableText(value: unknown, label: string): string | null {
  return value === null || value === undefined || value === "" ? null : text(value, label);
}
function uuid(value: unknown, label: string): string {
  const result = text(value, label);
  if (!UUID_PATTERN.test(result)) throw new Error("معرّف " + label + " غير صالح.");
  return result;
}
function currency(value: unknown): string {
  const result = text(value, "العملة");
  if (!/^[A-Z]{3}$/.test(result)) throw new Error("رمز العملة غير صالح.");
  return result;
}
function date(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) throw new Error("تاريخ " + label + " غير صالح.");
  const actual = new Date(result + "T00:00:00.000Z");
  if (!Number.isFinite(actual.getTime()) || actual.toISOString().slice(0, 10) !== result) throw new Error("تاريخ " + label + " غير صالح.");
  return result;
}
function money(value: unknown, label: string): string {
  const result = typeof value === "number" ? String(value) : text(value, label);
  if (!MONEY_PATTERN.test(result) || !Number.isFinite(Number(result))) throw new Error("مبلغ " + label + " غير صالح.");
  return result;
}
function quantity(value: unknown, label: string): string {
  const result = typeof value === "number" ? String(value) : text(value, label);
  if (!QUANTITY_PATTERN.test(result) || Number(result) <= 0) throw new Error("كمية " + label + " غير صالحة.");
  return result;
}
function moneyCents(value: string): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
}
function matchStatus(value: unknown): SupplierInvoiceMatchStatus {
  if (value === "matched" || value === "variance_pending" ||
      value === "variance_approved" || value === "variance_rejected") return value;
  throw new Error("حالة مطابقة فاتورة المورد غير معروفة.");
}
function taxStatus(value: unknown): SupplierInvoiceTaxAccountingStatus {
  if (value === "not_required" || value === "pending") return value;
  throw new Error("حالة معالجة ضريبة الفاتورة غير معروفة.");
}
function parsePurchaseOrder(value: unknown): SupplierInvoicePurchaseOrder {
  const row = object(value, "أمر الشراء");
  const status = row.status;
  if (status !== "submitted" && status !== "partially_received" && status !== "received") throw new Error("حالة أمر الشراء غير مؤهلة لمطابقة الفاتورة.");
  return {
    id: uuid(row.id, "أمر الشراء"),
    number: text(row.purchase_order_number, "رقم أمر الشراء"),
    supplierId: uuid(row.supplier_id, "المورد"),
    supplierName: text(row.supplier_name, "اسم المورد"),
    status,
    currency: currency(row.currency),
  };
}
function parseReceivableLine(value: unknown): SupplierInvoiceReceivableLine {
  const row = object(value, "بند الاستلام المتاح");
  return {
    purchaseOrderId: uuid(row.purchase_order_id, "أمر الشراء"),
    purchaseOrderNumber: text(row.purchase_order_number, "رقم أمر الشراء"),
    supplierId: uuid(row.supplier_id, "المورد"),
    supplierName: text(row.supplier_name, "المورد"),
    currency: currency(row.currency),
    receiptId: uuid(row.receipt_id, "إيصال الاستلام"),
    receiptNumber: text(row.receipt_number, "رقم الإيصال"),
    receivedAt: text(row.received_at, "وقت الاستلام"),
    receiptItemId: uuid(row.receipt_item_id, "بند الاستلام"),
    purchaseOrderItemId: uuid(row.purchase_order_item_id, "بند أمر الشراء"),
    productId: uuid(row.product_id, "المنتج"),
    itemCode: text(row.item_code_snapshot, "رمز المنتج"),
    productName: text(row.product_name_snapshot, "اسم المنتج"),
    unit: nullableText(row.unit_snapshot, "الوحدة"),
    sourceReceivedQuantity: quantity(row.source_received_quantity, "المستلم"),
    invoicedQuantity: row.invoiced_quantity === null ? "0" : quantity(row.invoiced_quantity, "المفوتر سابقًا"),
    remainingToInvoice: quantity(row.remaining_to_invoice, "المتبقي للفوترة"),
    orderedUnitCost: row.ordered_unit_cost === null ? null : money(row.ordered_unit_cost, "سعر أمر الشراء"),
    receivedUnitCost: row.received_unit_cost === null ? null : money(row.received_unit_cost, "سعر الاستلام"),
    receivedLineTotal: row.received_line_total === null ? null : money(row.received_line_total, "إجمالي الاستلام"),
    sourceCostComplete: row.source_cost_complete === true,
  };
}
function parseInvoiceLine(value: unknown): SupplierInvoiceLine {
  const row = object(value, "بند فاتورة المورد");
  return {
    id: uuid(row.id, "بند الفاتورة"),
    receiptId: uuid(row.receipt_id, "إيصال الاستلام"),
    receiptNumber: text(row.receipt_number, "رقم الإيصال"),
    receiptItemId: uuid(row.receipt_item_id, "بند الاستلام"),
    purchaseOrderItemId: uuid(row.purchase_order_item_id, "بند أمر الشراء"),
    productId: uuid(row.product_id, "المنتج"),
    itemCode: text(row.item_code, "رمز المنتج"),
    productName: text(row.product_name, "اسم المنتج"),
    unit: nullableText(row.unit, "الوحدة"),
    sourceReceivedQuantity: quantity(row.source_received_quantity, "المستلم"),
    invoicedQuantity: quantity(row.invoiced_quantity, "الكمية المفوترة"),
    orderedUnitCost: money(row.ordered_unit_cost, "سعر أمر الشراء"),
    receivedUnitCost: money(row.received_unit_cost, "سعر الاستلام"),
    invoicedUnitCost: money(row.invoiced_unit_cost, "سعر الفاتورة"),
    expectedLineTotal: money(row.expected_line_total, "القيمة المتوقعة"),
    actualLineTotal: money(row.actual_line_total, "القيمة الفعلية"),
    priceMatch: row.price_match === true,
  };
}
function parseEvent(value: unknown): SupplierInvoiceEvent {
  const row = object(value, "حدث مراجعة فاتورة المورد");
  const action = row.action;
  if (action !== "recorded_matched" && action !== "recorded_variance_pending" &&
      action !== "variance_approved" && action !== "variance_rejected" && action !== "due_date_recorded") {
    throw new Error("حدث فاتورة المورد غير معروف.");
  }
  return {
    action,
    actorProfileId: uuid(row.actor_profile_id, "منفذ الحدث"),
    reason: nullableText(row.reason, "سبب الحدث"),
    createdAt: text(row.created_at, "وقت الحدث"),
  };
}
function parseInvoice(value: unknown): SupplierInvoiceRecord {
  const row = object(value, "فاتورة المورد");
  if (!Array.isArray(row.lines) || !Array.isArray(row.history)) throw new Error("بنود أو سجل مراجعة فاتورة المورد غير صالح.");
  return {
    id: uuid(row.id, "فاتورة المورد"),
    purchaseOrderId: uuid(row.purchase_order_id, "أمر الشراء"),
    purchaseOrderNumber: text(row.purchase_order_number, "رقم أمر الشراء"),
    supplierId: uuid(row.supplier_id, "المورد"),
    supplierName: text(row.supplier_name, "اسم المورد"),
    invoiceNumber: text(row.supplier_invoice_number, "رقم فاتورة المورد"),
    invoiceDate: date(row.invoice_date, "الفاتورة"),
    currency: currency(row.currency),
    merchandiseSubtotal: money(row.merchandise_subtotal, "إجمالي البنود"),
    taxAmount: money(row.tax_amount, "ضريبة الفاتورة"),
    invoiceTotalAmount: money(row.invoice_total_amount, "إجمالي الفاتورة"),
    expectedMerchandiseSubtotal: money(row.expected_merchandise_subtotal, "القيمة المصدرية المتوقعة"),
    merchandiseVarianceAmount: money(row.merchandise_variance_amount, "فرق المطابقة"),
    matchStatus: matchStatus(row.match_status),
    taxAccountingStatus: taxStatus(row.tax_accounting_status),
    createdByProfileId: uuid(row.created_by_profile_id, "منشئ الفاتورة"),
    createdAt: text(row.created_at, "وقت إنشاء الفاتورة"),
    reviewedByProfileId: row.reviewed_by_profile_id === null ? null : uuid(row.reviewed_by_profile_id, "مراجع الفاتورة"),
    reviewedAt: nullableText(row.reviewed_at, "وقت المراجعة"),
    reviewReason: nullableText(row.review_reason, "سبب المراجعة"),
    lines: row.lines.map(parseInvoiceLine),
    history: row.history.map(parseEvent),
  };
}
function parseCommand(value: unknown): SupplierInvoiceCommandResult {
  const row = object(value, "نتيجة فاتورة المورد");
  return {
    invoiceId: uuid(row.invoice_id, "فاتورة المورد"),
    invoiceNumber: text(row.supplier_invoice_number, "رقم فاتورة المورد"),
    matchStatus: matchStatus(row.match_status),
    taxAccountingStatus: taxStatus(row.tax_accounting_status),
    currency: currency(row.currency),
    merchandiseSubtotal: money(row.merchandise_subtotal, "إجمالي البنود"),
    taxAmount: money(row.tax_amount, "الضريبة"),
    invoiceTotalAmount: money(row.invoice_total_amount, "إجمالي الفاتورة"),
    expectedMerchandiseSubtotal: money(row.expected_merchandise_subtotal, "القيمة المصدرية"),
    merchandiseVarianceAmount: money(row.merchandise_variance_amount, "فرق المطابقة"),
    replayed: row.replayed === true,
  };
}

export async function fetchSupplierInvoiceWorkspace(input: {
  purchaseOrderId?: string | null;
  limit?: number;
  offset?: number;
} = {}): Promise<SupplierInvoiceWorkspace> {
  const purchaseOrderId = input.purchaseOrderId ?? null;
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  if (purchaseOrderId !== null && !UUID_PATTERN.test(purchaseOrderId)) throw new Error("معرّف أمر الشراء غير صالح.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Error("حدود عرض فواتير المورد غير صالحة.");
  const { data, error } = await supabase.rpc("fetch_purchase_supplier_invoice_workspace", {
    p_purchase_order_id: purchaseOrderId, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  const row = object(data, "مساحة مطابقة فواتير الموردين");
  if (!Array.isArray(row.purchase_orders) || !Array.isArray(row.receivable_lines) || !Array.isArray(row.invoices)) {
    throw new Error("أعاد الخادم قوائم فواتير المورد بصيغة غير صالحة.");
  }
  const invoiceCount = typeof row.invoice_count === "number" ? row.invoice_count : Number.NaN;
  const actualLimit = typeof row.limit === "number" ? row.limit : Number.NaN;
  const actualOffset = typeof row.offset === "number" ? row.offset : Number.NaN;
  if (!Number.isSafeInteger(invoiceCount) || invoiceCount < 0 ||
      actualLimit !== limit || actualOffset !== offset ||
      row.has_more !== (invoiceCount > offset + limit)) throw new Error("حدود فواتير المورد غير متطابقة.");
  return {
    purchaseOrders: row.purchase_orders.map(parsePurchaseOrder),
    receivableLines: row.receivable_lines.map(parseReceivableLine),
    invoices: row.invoices.map(parseInvoice),
    invoiceCount, limit: actualLimit, offset: actualOffset,
    hasMore: row.has_more,
    asOfDate: date(row.as_of_date, "تاريخ إعداد مساحة الفواتير"),
  };
}

export async function recordSupplierInvoice(input: {
  purchaseOrderId: string;
  invoiceNumber: string;
  invoiceDate: string;
  merchandiseSubtotal: string;
  taxAmount: string;
  invoiceTotalAmount: string;
  lines: Array<{ receiptItemId: string; quantity: string; unitCost: string; lineTotal: string }>;
  idempotencyKey: string;
}): Promise<SupplierInvoiceCommandResult> {
  const invoiceNumber = input.invoiceNumber.trim();
  const subtotal = money(input.merchandiseSubtotal, "إجمالي البنود");
  const tax = money(input.taxAmount, "الضريبة");
  const total = money(input.invoiceTotalAmount, "إجمالي الفاتورة");
  if (!UUID_PATTERN.test(input.purchaseOrderId) || !UUID_PATTERN.test(input.idempotencyKey) ||
      invoiceNumber.length < 1 || invoiceNumber.length > 80 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate) ||
      Number(subtotal) <= 0 || !Array.isArray(input.lines) ||
      input.lines.length < 1 || input.lines.length > 100) throw new Error("بيانات فاتورة المورد غير صالحة.");
  date(input.invoiceDate, "الفاتورة");
  const seen = new Set<string>();
  let lineSum = 0n;
  const lines = input.lines.map((line) => {
    if (!UUID_PATTERN.test(line.receiptItemId) || seen.has(line.receiptItemId)) throw new Error("بند الاستلام يجب أن يكون صحيحًا وفريدًا في الفاتورة.");
    seen.add(line.receiptItemId);
    const qty = quantity(line.quantity, "الفاتورة");
    const unitCost = money(line.unitCost, "سعر الوحدة");
    const lineTotal = money(line.lineTotal, "إجمالي البند");
    lineSum += moneyCents(lineTotal);
    return {
      receipt_item_id: line.receiptItemId,
      quantity: qty,
      unit_cost: unitCost,
      line_total: lineTotal,
    };
  });
  if (lineSum !== moneyCents(subtotal) || moneyCents(total) !== moneyCents(subtotal) + moneyCents(tax)) {
    throw new Error("يجب أن يساوي إجمالي البنود مجموع الأسطر، وأن يساوي إجمالي الفاتورة البنود + الضريبة الموثقة.");
  }
  const { data, error } = await supabase.rpc("record_purchase_supplier_invoice", {
    p_purchase_order_id: input.purchaseOrderId,
    p_supplier_invoice_number: invoiceNumber,
    p_invoice_date: input.invoiceDate,
    p_merchandise_subtotal: subtotal,
    p_tax_amount: tax,
    p_invoice_total_amount: total,
    p_lines: lines,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const result = parseCommand(data);
  if (moneyCents(result.merchandiseSubtotal) !== moneyCents(subtotal) ||
      moneyCents(result.taxAmount) !== moneyCents(tax) ||
      moneyCents(result.invoiceTotalAmount) !== moneyCents(total)) {
    throw new Error("أعاد الخادم فاتورة لا تطابق المبالغ المصدرية المرسلة.");
  }
  return result;
}

export interface SupplierInvoiceDueDate {
  id: string;
  invoiceId: string;
  dueDate: string;
  sourceEvidenceId: string;
  sourceReference: string;
  reason: string;
  recordedByProfileId: string;
  recordedAt: string;
}

function parseSupplierInvoiceDueDate(value: unknown): SupplierInvoiceDueDate {
  const row = object(value, "دليل تاريخ استحقاق المورد");
  return {
    id: uuid(row.id, "دليل تاريخ الاستحقاق"),
    invoiceId: uuid(row.invoice_id, "فاتورة المورد"),
    dueDate: date(row.due_date, "استحقاق المورد"),
    sourceEvidenceId: uuid(row.source_evidence_id, "مرفق إثبات الاستحقاق"),
    sourceReference: text(row.source_reference, "مرجع مصدر الاستحقاق"),
    reason: text(row.reason, "سبب تسجيل الاستحقاق"),
    recordedByProfileId: uuid(row.recorded_by_profile_id, "مسجل الاستحقاق"),
    recordedAt: text(row.recorded_at, "وقت تسجيل الاستحقاق"),
  };
}

export async function fetchSupplierInvoiceDueDates(invoiceId?: string | null): Promise<SupplierInvoiceDueDate[]> {
  if (invoiceId && !UUID_PATTERN.test(invoiceId)) throw new Error("معرّف فاتورة المورد غير صالح.");
  const { data, error } = await supabase.rpc("fetch_purchase_supplier_invoice_due_dates", {
    p_invoice_id: invoiceId ?? null,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("أعاد الخادم قائمة استحقاقات المورد بصيغة غير صالحة.");
  const rows = data.map(parseSupplierInvoiceDueDate);
  const seenInvoices = new Set<string>();
  for (const row of rows) {
    if (seenInvoices.has(row.invoiceId)) throw new Error("يوجد أكثر من تاريخ استحقاق محفوظ للفاتورة نفسها.");
    seenInvoices.add(row.invoiceId);
  }
  return rows;
}

export async function recordSupplierInvoiceDueDate(input: {
  invoiceId: string;
  dueDate: string;
  sourceEvidenceId: string;
  sourceReference: string;
  reason: string;
  idempotencyKey: string;
}): Promise<SupplierInvoiceDueDate & { replayed: boolean }> {
  const sourceReference = input.sourceReference.trim();
  const reason = input.reason.trim();
  if (!UUID_PATTERN.test(input.invoiceId) || !UUID_PATTERN.test(input.sourceEvidenceId) ||
      !UUID_PATTERN.test(input.idempotencyKey) || sourceReference.length < 3 ||
      sourceReference.length > 200 || reason.length < 3 || reason.length > 500) {
    throw new Error("بيانات تاريخ استحقاق المورد أو مرجع الدليل أو سبب التسجيل غير صالحة.");
  }
  date(input.dueDate, "استحقاق المورد");
  const { data, error } = await supabase.rpc("record_purchase_supplier_invoice_due_date", {
    p_invoice_id: input.invoiceId,
    p_due_date: input.dueDate,
    p_source_evidence_id: input.sourceEvidenceId,
    p_source_reference: sourceReference,
    p_reason: reason,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const row = object(data, "نتيجة حفظ تاريخ استحقاق المورد");
  const parsed = parseSupplierInvoiceDueDate(row);
  if (parsed.invoiceId !== input.invoiceId || parsed.dueDate !== input.dueDate ||
      parsed.sourceEvidenceId !== input.sourceEvidenceId ||
      parsed.sourceReference !== sourceReference || parsed.reason !== reason ||
      typeof row.replayed !== "boolean") {
    throw new Error("لم يؤكد الخادم حفظ تاريخ الاستحقاق بنفس مستند المصدر والبيانات.");
  }
  return { ...parsed, replayed: row.replayed };
}

export async function reviewSupplierInvoiceVariance(input: {
  invoiceId: string;
  approve: boolean;
  reason: string;
}): Promise<{ invoiceId: string; matchStatus: SupplierInvoiceMatchStatus; replayed: boolean }> {
  const reason = input.reason.trim();
  if (!UUID_PATTERN.test(input.invoiceId) || reason.length < 3 || reason.length > 500) {
    throw new Error("قرار مراجعة فرق السعر يتطلب سببًا من 3 إلى 500 حرف.");
  }
  const { data, error } = await supabase.rpc("review_purchase_supplier_invoice_variance", {
    p_invoice_id: input.invoiceId, p_approve: input.approve, p_reason: reason,
  });
  if (error) throw error;
  const row = object(data, "قرار مراجعة فاتورة المورد");
  const status = matchStatus(row.match_status);
  const expected = input.approve ? "variance_approved" : "variance_rejected";
  if (status !== expected) throw new Error("لم يؤكد الخادم قرار مراجعة فرق سعر المورد.");
  return {
    invoiceId: uuid(row.invoice_id, "فاتورة المورد"),
    matchStatus: status,
    replayed: row.replayed === true,
  };
}


export interface SupplierInvoiceEvidence {
  id: string;
  invoiceId: string;
  storagePath: string;
  fileName: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  byteSize: number;
  contentSha256: string;
  uploadedByProfileId: string;
  createdAt: string;
}

const SUPPLIER_INVOICE_EVIDENCE_BUCKET = "supplier-invoice-evidence";
const SUPPLIER_INVOICE_EVIDENCE_LIMIT = 10 * 1024 * 1024;
const SUPPLIER_INVOICE_EVIDENCE_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

function parseSupplierInvoiceEvidence(value: unknown): SupplierInvoiceEvidence {
  const row = object(value, "مرفق فاتورة المورد");
  const mimeType = row.mime_type;
  if (mimeType !== "application/pdf" && mimeType !== "image/jpeg" &&
      mimeType !== "image/png" && mimeType !== "image/webp") {
    throw new Error("نوع ملف دليل فاتورة المورد غير مسموح.");
  }
  const byteSize = typeof row.byte_size === "number" ? row.byte_size : Number(row.byte_size);
  if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > SUPPLIER_INVOICE_EVIDENCE_LIMIT) {
    throw new Error("حجم مرفق فاتورة المورد غير صالح.");
  }
  const contentSha256 = text(row.content_sha256, "بصمة الملف");
  if (!/^[0-9a-f]{64}$/.test(contentSha256)) throw new Error("بصمة مرفق فاتورة المورد غير صالحة.");
  return {
    id: uuid(row.id, "مرفق الفاتورة"),
    invoiceId: uuid(row.invoice_id, "الفاتورة"),
    storagePath: text(row.storage_path, "مسار المرفق"),
    fileName: text(row.file_name, "اسم المرفق"),
    mimeType,
    byteSize,
    contentSha256,
    uploadedByProfileId: uuid(row.uploaded_by_profile_id, "رافع المرفق"),
    createdAt: text(row.created_at, "وقت رفع المرفق"),
  };
}

export async function fetchSupplierInvoiceEvidence(invoiceId: string): Promise<SupplierInvoiceEvidence[]> {
  if (!UUID_PATTERN.test(invoiceId)) throw new Error("معرّف فاتورة المورد غير صالح.");
  const { data, error } = await supabase.rpc("fetch_purchase_supplier_invoice_evidence", {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("أعاد الخادم قائمة مرفقات الفاتورة بصيغة غير صالحة.");
  return data.map(parseSupplierInvoiceEvidence);
}

export async function uploadSupplierInvoiceEvidence(input: {
  invoiceId: string;
  file: File;
}): Promise<SupplierInvoiceEvidence> {
  if (!UUID_PATTERN.test(input.invoiceId)) throw new Error("معرّف فاتورة المورد غير صالح.");
  const extension = SUPPLIER_INVOICE_EVIDENCE_TYPES[input.file.type as keyof typeof SUPPLIER_INVOICE_EVIDENCE_TYPES];
  if (!extension || input.file.size < 1 || input.file.size > SUPPLIER_INVOICE_EVIDENCE_LIMIT) {
    throw new Error("يسمح فقط بملف PDF أو JPG أو PNG أو WEBP، وبحجم لا يتجاوز 10 ميغابايت.");
  }
  if (!globalThis.crypto?.randomUUID || !globalThis.crypto?.subtle) {
    throw new Error("المتصفح لا يدعم إنشاء بصمة SHA-256 ومفتاح ملف آمن؛ لم يُرفع المرفق.");
  }
  const safeName = input.file.name
    .replace(/\//g, "_")
    .replace(/\\/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .trim()
    .slice(0, 180);
  if (!safeName) throw new Error("اسم ملف الدليل غير صالح.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await input.file.arrayBuffer());
  const contentSha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  const storagePath = input.invoiceId + "/" + globalThis.crypto.randomUUID() + "." + extension;

  const { error: uploadError } = await supabase.storage
    .from(SUPPLIER_INVOICE_EVIDENCE_BUCKET)
    .upload(storagePath, input.file, {
      cacheControl: "3600",
      contentType: input.file.type,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  try {
    const { data, error } = await supabase.rpc("record_purchase_supplier_invoice_evidence", {
      p_invoice_id: input.invoiceId,
      p_storage_path: storagePath,
      p_file_name: safeName,
      p_mime_type: input.file.type,
      p_byte_size: input.file.size,
      p_content_sha256: contentSha256,
    });
    if (error) throw error;
    const result = parseSupplierInvoiceEvidence(data);
    if (result.invoiceId !== input.invoiceId || result.storagePath !== storagePath ||
        result.contentSha256 !== contentSha256 || result.byteSize !== input.file.size) {
      throw new Error("لم يؤكد الخادم ربط الملف بالفاتورة وبصمته وحجمه.");
    }
    return result;
  } catch (cause) {
    // The storage DELETE policy permits cleanup only while this object has no immutable metadata row.
    await supabase.storage.from(SUPPLIER_INVOICE_EVIDENCE_BUCKET).remove([storagePath]).catch(() => undefined);
    throw cause;
  }
}

export async function createSupplierInvoiceEvidenceSignedUrl(storagePath: string): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$/.test(storagePath)) {
    throw new Error("مسار المرفق غير صالح.");
  }
  const { data, error } = await supabase.storage
    .from(SUPPLIER_INVOICE_EVIDENCE_BUCKET)
    .createSignedUrl(storagePath, 300);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("لم يُصدر التخزين رابطًا مؤقتًا للمرفق.");
  return data.signedUrl;
}


export type SupplierInvoiceAccountingStatusName =
  | "not_prepared"
  | "no_adjustment_required"
  | "journal_draft_created"
  | "journal_posted"
  | "journal_void"
  | "journal_reversed";

export interface SupplierInvoiceAccountingStatus {
  invoiceId: string;
  accountingStatus: SupplierInvoiceAccountingStatusName;
  currency: string;
  sourceMerchandiseAmount: string;
  merchandiseVarianceAmount: string;
  taxAmount: string;
  invoiceTotalAmount: string;
  handoffSequence: number | null;
  handoffId: string | null;
  journalEntryId: string | null;
  journalEntryNumber: string | null;
  journalStatus: "draft" | "posted" | "void" | null;
  sourcePayableAccountId: string | null;
  taxAccountId: string | null;
  merchandiseVarianceAccountId: string | null;
  createdByProfileId: string | null;
  createdAt: string | null;
}

export interface SupplierInvoiceAccountingCommandResult {
  invoiceId: string;
  handoffId: string;
  accountingStatus: SupplierInvoiceAccountingStatusName;
  handoffSequence: number;
  journalEntryId: string | null;
  journalEntryNumber: string | null;
  journalStatus: "draft" | "posted" | "void" | null;
  replayed: boolean;
}

function accountingStatusName(value: unknown): SupplierInvoiceAccountingStatusName {
  if (value === "not_prepared" || value === "no_adjustment_required" ||
      value === "journal_draft_created" || value === "journal_posted" ||
      value === "journal_void" || value === "journal_reversed") return value;
  throw new Error("حالة التسوية المحاسبية لفاتورة المورد غير معروفة.");
}

function optionalUuid(value: unknown, label: string): string | null {
  return value === null || value === undefined || value === "" ? null : uuid(value, label);
}

function signedMoney(value: unknown, label: string): string {
  const result = typeof value === "number" ? String(value) : text(value, label);
  if (!/^-?(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$/.test(result) ||
      !Number.isFinite(Number(result))) throw new Error("مبلغ " + label + " غير صالح.");
  return result;
}

function optionalJournalStatus(value: unknown): "draft" | "posted" | "void" | null {
  if (value === null || value === undefined) return null;
  if (value === "draft" || value === "posted" || value === "void") return value;
  throw new Error("حالة قيد تسوية فاتورة المورد غير معروفة.");
}

function parseSupplierInvoiceAccountingStatus(value: unknown): SupplierInvoiceAccountingStatus {
  const row = object(value, "حالة تسوية فاتورة المورد");
  const sequence = row.handoff_sequence === null || row.handoff_sequence === undefined
    ? null : row.handoff_sequence;
  if (sequence !== null && (!Number.isSafeInteger(sequence) || Number(sequence) < 1)) {
    throw new Error("رقم تسلسل تسوية فاتورة المورد غير صالح.");
  }
  return {
    invoiceId: uuid(row.invoice_id, "فاتورة المورد"),
    accountingStatus: accountingStatusName(row.accounting_status),
    currency: currency(row.currency),
    sourceMerchandiseAmount: money(row.source_merchandise_amount, "تكلفة الاستلام المصدرية"),
    merchandiseVarianceAmount: signedMoney(row.merchandise_variance_amount, "فرق تكلفة الاستلام"),
    taxAmount: money(row.tax_amount, "ضريبة المورد"),
    invoiceTotalAmount: money(row.invoice_total_amount, "إجمالي فاتورة المورد"),
    handoffSequence: sequence as number | null,
    handoffId: optionalUuid(row.handoff_id, "سجل التسوية"),
    journalEntryId: optionalUuid(row.journal_entry_id, "قيد تسوية المورد"),
    journalEntryNumber: nullableText(row.journal_entry_number, "رقم قيد التسوية"),
    journalStatus: optionalJournalStatus(row.journal_status),
    sourcePayableAccountId: optionalUuid(row.source_payable_account_id, "حساب المورد المصدر"),
    taxAccountId: optionalUuid(row.tax_account_id, "حساب الضريبة"),
    merchandiseVarianceAccountId: optionalUuid(row.merchandise_variance_account_id, "حساب فرق التكلفة"),
    createdByProfileId: optionalUuid(row.created_by_profile_id, "منفذ التسوية"),
    createdAt: nullableText(row.created_at, "وقت التسوية"),
  };
}

export async function fetchSupplierInvoiceAccountingStatus(invoiceId: string): Promise<SupplierInvoiceAccountingStatus> {
  if (!UUID_PATTERN.test(invoiceId)) throw new Error("معرّف فاتورة المورد غير صالح.");
  const { data, error } = await supabase.rpc("fetch_purchase_supplier_invoice_accounting_status", {
    p_invoice_id: invoiceId,
  });
  if (error) throw error;
  const result = parseSupplierInvoiceAccountingStatus(data);
  if (result.invoiceId !== invoiceId) throw new Error("أعاد الخادم حالة تسوية لفاتورة أخرى.");
  return result;
}

export async function prepareSupplierInvoiceAccountingDraft(input: {
  invoiceId: string;
  taxAccountId: string | null;
  merchandiseVarianceAccountId: string | null;
  idempotencyKey: string;
}): Promise<SupplierInvoiceAccountingCommandResult> {
  if (!UUID_PATTERN.test(input.invoiceId) || !UUID_PATTERN.test(input.idempotencyKey) ||
      (input.taxAccountId !== null && !UUID_PATTERN.test(input.taxAccountId)) ||
      (input.merchandiseVarianceAccountId !== null && !UUID_PATTERN.test(input.merchandiseVarianceAccountId))) {
    throw new Error("معرّف فاتورة أو حساب أو مفتاح منع تكرار التسوية غير صالح.");
  }
  const { data, error } = await supabase.rpc("prepare_purchase_supplier_invoice_accounting_draft", {
    p_invoice_id: input.invoiceId,
    p_tax_account_id: input.taxAccountId,
    p_merchandise_variance_account_id: input.merchandiseVarianceAccountId,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  const row = object(data, "نتيجة تسوية فاتورة المورد");
  const sequence = row.handoff_sequence;
  if (typeof sequence !== "number" || !Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("لم يؤكد الخادم تسلسل تسوية فاتورة المورد.");
  }
  const result: SupplierInvoiceAccountingCommandResult = {
    invoiceId: uuid(row.invoice_id, "فاتورة المورد"),
    handoffId: uuid(row.handoff_id, "سجل التسوية"),
    accountingStatus: accountingStatusName(row.accounting_status),
    handoffSequence: sequence,
    journalEntryId: optionalUuid(row.journal_entry_id, "قيد التسوية"),
    journalEntryNumber: nullableText(row.journal_entry_number, "رقم قيد التسوية"),
    journalStatus: optionalJournalStatus(row.journal_status),
    replayed: row.replayed === true,
  };
  if (result.invoiceId !== input.invoiceId) throw new Error("أعاد الخادم نتيجة تسوية لفاتورة أخرى.");
  if ((result.accountingStatus === "journal_draft_created" && (!result.journalEntryId || result.journalStatus !== "draft")) ||
      (result.accountingStatus === "journal_posted" && (!result.journalEntryId || result.journalStatus !== "posted")) ||
      (result.accountingStatus === "journal_void" && (!result.journalEntryId || result.journalStatus !== "void")) ||
      (result.accountingStatus === "journal_reversed" && (!result.journalEntryId || result.journalStatus !== "posted"))) {
    throw new Error("لم تتطابق حالة مسودة/قيد تسوية المورد مع سجل دفتر الأستاذ.");
  }
  if (result.accountingStatus === "no_adjustment_required" && result.journalEntryId !== null) {
    throw new Error("أعاد الخادم قيدًا غير متوقع لفاتورة لا تحتاج إلى تسوية.");
  }
  return result;
}
