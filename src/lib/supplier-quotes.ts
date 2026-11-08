import { supabase } from "./supabase";
import { parsePurchaseOrder, type PurchaseOrder } from "./purchase-orders";

export type SupplierQuoteStatus = "received" | "awarded" | "expired";
export interface SupplierQuoteLine {
  id: string;
  product_id: string;
  item_code: string;
  product_name: string;
  unit: string | null;
  quantity_quoted: number;
  unit_cost: number;
  line_total: number;
}
export interface SupplierQuote {
  id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_code: string;
  quote_number: string;
  supplier_reference: string | null;
  currency: string;
  valid_until: string | null;
  delivery_days: number | null;
  payment_terms: string | null;
  notes: string | null;
  status: SupplierQuoteStatus;
  purchase_order_id: string | null;
  created_at: string;
  updated_at: string;
  items: SupplierQuoteLine[];
}
export type SupplierQuoteLineInput = {
  product_id: string;
  quantity: number;
  unit_cost: number;
};
export type SupplierQuoteAwardResult = {
  supplier_quote: SupplierQuote;
  purchase_order: PurchaseOrder;
  idempotent_replay: boolean;
};

type Raw = Record<string, unknown>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idempotencyPattern = /^[A-Za-z0-9_-]{16,128}$/;
const statuses = ["received", "awarded", "expired"] as const;

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
function nullableText(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("حقل " + label + " غير صالح.");
  return value;
}
function date(value: unknown, label: string): string {
  const parsed = text(value, label);
  if (!Number.isFinite(Date.parse(parsed))) throw new Error("تاريخ " + label + " غير صالح.");
  return parsed;
}
function nullableDate(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : date(value, label);
}
function amount(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9999999999999.99) {
    throw new Error("قيمة " + label + " غير صالحة.");
  }
  return parsed;
}
function nullableInteger(value: unknown, label: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 3650) {
    throw new Error("قيمة " + label + " غير صالحة.");
  }
  return value;
}
function parseLine(value: unknown, index: number): SupplierQuoteLine {
  const row = object(value, "بند العرض " + (index + 1));
  const id = text(row.id, "معرّف بند العرض");
  const productId = text(row.product_id, "الصنف");
  if (!uuidPattern.test(id) || !uuidPattern.test(productId)) throw new Error("مرجع بند عرض المورد غير صالح.");
  const quantity = amount(row.quantity_quoted, "الكمية المعروضة");
  if (quantity <= 0 || Math.round(quantity * 1000) !== quantity * 1000) {
    throw new Error("الكمية المعروضة يجب أن تكون موجبة وبحد أقصى ثلاث منازل عشرية.");
  }
  return {
    id,
    product_id: productId,
    item_code: text(row.item_code, "رمز الصنف"),
    product_name: text(row.product_name, "اسم الصنف"),
    unit: nullableText(row.unit, "وحدة الصنف"),
    quantity_quoted: quantity,
    unit_cost: amount(row.unit_cost, "تكلفة الوحدة"),
    line_total: amount(row.line_total, "إجمالي البند"),
  };
}
export function parseSupplierQuote(value: unknown): SupplierQuote {
  const row = object(value, "عرض المورد");
  const id = text(row.id, "معرّف العرض");
  const supplierId = text(row.supplier_id, "المورد");
  if (!uuidPattern.test(id) || !uuidPattern.test(supplierId) || !Array.isArray(row.items)) {
    throw new Error("معرّف عرض المورد أو بنوده غير صالح.");
  }
  const status = row.status;
  if (typeof status !== "string" || !statuses.includes(status as SupplierQuoteStatus)) {
    throw new Error("حالة عرض المورد غير معروفة.");
  }
  const currency = text(row.currency, "عملة العرض");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("عملة عرض المورد غير صالحة.");
  const purchaseOrderId = nullableText(row.purchase_order_id, "أمر الشراء المرتبط");
  if (purchaseOrderId && !uuidPattern.test(purchaseOrderId)) throw new Error("مرجع أمر الشراء المرتبط غير صالح.");
  return {
    id,
    supplier_id: supplierId,
    supplier_name: text(row.supplier_name, "اسم المورد"),
    supplier_code: text(row.supplier_code, "رمز المورد"),
    quote_number: text(row.quote_number, "رقم العرض"),
    supplier_reference: nullableText(row.supplier_reference, "مرجع المورد"),
    currency,
    valid_until: nullableDate(row.valid_until, "صلاحية العرض"),
    delivery_days: nullableInteger(row.delivery_days, "مدة التوريد"),
    payment_terms: nullableText(row.payment_terms, "شروط الدفع"),
    notes: nullableText(row.notes, "ملاحظات العرض"),
    status: status as SupplierQuoteStatus,
    purchase_order_id: purchaseOrderId,
    created_at: date(row.created_at, "تاريخ تسجيل العرض"),
    updated_at: date(row.updated_at, "آخر تحديث للعرض"),
    items: row.items.map(parseLine),
  };
}
function parseQuoteCommand(value: unknown): { supplier_quote: SupplierQuote; idempotent_replay: boolean } {
  const row = object(value, "نتيجة حفظ عرض المورد");
  return {
    supplier_quote: parseSupplierQuote(row.supplier_quote),
    idempotent_replay: row.idempotent_replay === true,
  };
}
export async function fetchSupplierQuotes(): Promise<SupplierQuote[]> {
  const { data, error } = await supabase.rpc("fetch_purchase_supplier_quotes");
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("قائمة عروض الموردين التي أعادها الخادم غير صالحة.");
  return data.map(parseSupplierQuote);
}
export async function createSupplierQuote(input: {
  supplierId: string;
  quoteNumber: string;
  supplierReference: string;
  validUntil: string;
  deliveryDays: number | null;
  paymentTerms: string;
  notes: string;
  lines: SupplierQuoteLineInput[];
  idempotencyKey: string;
}): Promise<{ supplier_quote: SupplierQuote; idempotent_replay: boolean }> {
  const quoteNumber = input.quoteNumber.trim();
  const supplierReference = input.supplierReference.trim();
  const paymentTerms = input.paymentTerms.trim();
  const notes = input.notes.trim();
  if (!uuidPattern.test(input.supplierId) || !idempotencyPattern.test(input.idempotencyKey) ||
      !quoteNumber || quoteNumber.length > 80 || supplierReference.length > 120 ||
      paymentTerms.length > 1000 || notes.length > 2000 ||
      (input.validUntil !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(input.validUntil)) ||
      (input.deliveryDays !== null && (!Number.isInteger(input.deliveryDays) || input.deliveryDays < 0 || input.deliveryDays > 3650)) ||
      !input.lines.length || input.lines.length > 100) {
    throw new Error("بيانات عرض المورد أو مفتاح منع التكرار غير صالحة.");
  }
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (!uuidPattern.test(line.product_id) || seen.has(line.product_id)) {
      throw new Error("الصنف غير صالح أو مكرر داخل عرض المورد.");
    }
    seen.add(line.product_id);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 ||
        Math.round(line.quantity * 1000) !== line.quantity * 1000 ||
        !Number.isFinite(line.unit_cost) || line.unit_cost < 0 ||
        Math.round(line.unit_cost * 100) !== line.unit_cost * 100) {
      throw new Error("الكمية أو تكلفة الوحدة خارج حدود الدقة المسموحة.");
    }
  }
  const { data, error } = await supabase.rpc("create_purchase_supplier_quote", {
    p_supplier_id: input.supplierId,
    p_quote_number: quoteNumber,
    p_supplier_reference: supplierReference || null,
    p_valid_until: input.validUntil || null,
    p_delivery_days: input.deliveryDays,
    p_payment_terms: paymentTerms || null,
    p_notes: notes || null,
    p_lines: input.lines,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return parseQuoteCommand(data);
}
export async function awardSupplierQuote(input: {
  quoteId: string;
  warehouseId: string;
  notes: string;
}): Promise<SupplierQuoteAwardResult> {
  if (!uuidPattern.test(input.quoteId) || !uuidPattern.test(input.warehouseId) || input.notes.trim().length > 1900) {
    throw new Error("مرجع العرض أو المخزن أو الملاحظات غير صالح.");
  }
  const { data, error } = await supabase.rpc("award_purchase_supplier_quote", {
    p_quote_id: input.quoteId,
    p_warehouse_id: input.warehouseId,
    p_notes: input.notes.trim() || null,
  });
  if (error) throw error;
  const row = object(data, "نتيجة اعتماد عرض المورد");
  return {
    supplier_quote: parseSupplierQuote(row.supplier_quote),
    purchase_order: parsePurchaseOrder(row.purchase_order),
    idempotent_replay: row.idempotent_replay === true,
  };
}
