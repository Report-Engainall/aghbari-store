import { supabase } from "./supabase";

export interface SupplierReturnableReceiptLine {
  receiptItemId: string;
  productId: string;
  itemCode: string;
  productName: string;
  unit: string | null;
  quantityReceived: number;
  alreadyReturned: number;
  remainingQuantity: number;
  unitCost: number | null;
  lineTotal: number | null;
}
export interface SupplierReturnableReceipt {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  receivedAt: string;
  currency: string;
  items: SupplierReturnableReceiptLine[];
}
export interface SupplierReturnItem {
  id: string;
  sourceReceiptItemId: string;
  productId: string;
  itemCode: string;
  productName: string;
  unit: string | null;
  sourceReceivedQuantity: number;
  quantityReturned: number;
  unitCost: number | null;
  lineTotal: number | null;
}
export interface SupplierReturn {
  id: string;
  returnNumber: string;
  sourceReceiptId: string;
  sourceReceiptNumber: string;
  purchaseOrderId: string;
  purchaseOrderNumber: string;
  supplierId: string;
  supplierName: string;
  warehouseId: string;
  warehouseName: string;
  currency: string;
  status: "draft" | "posted";
  reason: string;
  notes: string | null;
  totalCost: number | null;
  createdAt: string;
  postedAt: string | null;
  postedBy: string | null;
  items: SupplierReturnItem[];
}
export interface SupplierReturnWorkspaceData {
  receipts: SupplierReturnableReceipt[];
  returns: SupplierReturn[];
}
export interface SupplierReturnCommandResult {
  supplierReturn: SupplierReturn;
  idempotentReplay: boolean;
}
type Raw = Record<string, unknown>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idempotencyPattern = /^[A-Za-z0-9_-]{16,128}$/;

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
function amount(value: unknown, label: string): number {
  const result = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(result) || Math.abs(result) > Number.MAX_SAFE_INTEGER) {
    throw new Error("قيمة " + label + " غير صالحة.");
  }
  return result;
}
function nullableAmount(value: unknown, label: string): number | null {
  return value === null || value === undefined ? null : amount(value, label);
}
function date(value: unknown, label: string): string {
  const result = text(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error("تاريخ " + label + " غير صالح.");
  return result;
}
function nullableDate(value: unknown, label: string): string | null {
  return value === null || value === undefined ? null : date(value, label);
}
function uuid(value: unknown, label: string): string {
  const result = text(value, label);
  if (!uuidPattern.test(result)) throw new Error("معرّف " + label + " غير صالح.");
  return result;
}
function quantity(value: unknown, label: string): number {
  const result = amount(value, label);
  if (result < 0 || result > 999999999999.999 || Math.round(result * 1000) !== result * 1000) {
    throw new Error("كمية " + label + " غير صالحة.");
  }
  return result;
}
function parseReturnableLine(value: unknown, index: number): SupplierReturnableReceiptLine {
  const row = object(value, "بند الإيصال " + (index + 1));
  const quantityReceived = quantity(row.quantity_received, "المستلمة");
  const alreadyReturned = quantity(row.already_returned, "المرتجع سابقًا");
  const remainingQuantity = quantity(row.remaining_quantity, "القابلة للمرتجع");
  if (alreadyReturned > quantityReceived || Math.abs(quantityReceived - alreadyReturned - remainingQuantity) > 0.0005) {
    throw new Error("كميات الإيصال والمرتجع غير متطابقة.");
  }
  const unitCost = nullableAmount(row.unit_cost, "تكلفة الوحدة");
  const lineTotal = nullableAmount(row.line_total, "تكلفة سطر الإيصال");
  if (unitCost !== null && unitCost < 0 || lineTotal !== null && lineTotal < 0) {
    throw new Error("تكلفة مصدر الإيصال غير صالحة.");
  }
  return {
    receiptItemId: uuid(row.receipt_item_id, "بند الإيصال"),
    productId: uuid(row.product_id, "الصنف"),
    itemCode: text(row.item_code, "رمز الصنف"),
    productName: text(row.product_name, "اسم الصنف"),
    unit: nullableText(row.unit, "وحدة الصنف"),
    quantityReceived,
    alreadyReturned,
    remainingQuantity,
    unitCost,
    lineTotal,
  };
}
function parseReceipt(value: unknown, index: number): SupplierReturnableReceipt {
  const row = object(value, "إيصال الشراء " + (index + 1));
  if (!Array.isArray(row.items)) throw new Error("بنود إيصال الشراء غير صالحة.");
  const currency = text(row.currency, "عملة الإيصال");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("عملة الإيصال غير صالحة.");
  return {
    id: uuid(row.id, "الإيصال"),
    receiptNumber: text(row.receipt_number, "رقم الإيصال"),
    purchaseOrderId: uuid(row.purchase_order_id, "أمر الشراء"),
    purchaseOrderNumber: text(row.purchase_order_number, "رقم أمر الشراء"),
    supplierId: uuid(row.supplier_id, "المورد"),
    supplierName: text(row.supplier_name, "اسم المورد"),
    warehouseId: uuid(row.warehouse_id, "المخزن"),
    warehouseName: text(row.warehouse_name, "اسم المخزن"),
    receivedAt: date(row.received_at, "تاريخ الاستلام"),
    currency,
    items: row.items.map(parseReturnableLine),
  };
}
function parseReturnItem(value: unknown, index: number): SupplierReturnItem {
  const row = object(value, "بند المرتجع " + (index + 1));
  const unitCost = nullableAmount(row.unit_cost, "تكلفة المرتجع");
  const lineTotal = nullableAmount(row.line_total, "إجمالي تكلفة المرتجع");
  if (unitCost !== null && unitCost < 0 || lineTotal !== null && lineTotal < 0) {
    throw new Error("تكلفة بند المرتجع غير صالحة.");
  }
  return {
    id: uuid(row.id, "بند المرتجع"),
    sourceReceiptItemId: uuid(row.source_receipt_item_id, "بند الإيصال المصدر"),
    productId: uuid(row.product_id, "الصنف"),
    itemCode: text(row.item_code, "رمز الصنف"),
    productName: text(row.product_name, "اسم الصنف"),
    unit: nullableText(row.unit, "وحدة الصنف"),
    sourceReceivedQuantity: quantity(row.source_received_quantity, "المستلمة من المورد"),
    quantityReturned: quantity(row.quantity_returned, "المرتجعة"),
    unitCost,
    lineTotal,
  };
}
export function parseSupplierReturn(value: unknown): SupplierReturn {
  const row = object(value, "مرتجع المورد");
  const status = row.status;
  if (status !== "draft" && status !== "posted") throw new Error("حالة مرتجع المورد غير معروفة.");
  if (!Array.isArray(row.items)) throw new Error("بنود مرتجع المورد غير صالحة.");
  const currency = text(row.currency, "عملة المرتجع");
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("عملة المرتجع غير صالحة.");
  const totalCost = nullableAmount(row.total_cost, "إجمالي المرتجع");
  if (totalCost !== null && totalCost < 0) throw new Error("إجمالي تكلفة المرتجع غير صالح.");
  return {
    id: uuid(row.id, "مرتجع المورد"),
    returnNumber: text(row.return_number, "رقم المرتجع"),
    sourceReceiptId: uuid(row.source_receipt_id, "الإيصال المصدر"),
    sourceReceiptNumber: text(row.source_receipt_number, "رقم الإيصال المصدر"),
    purchaseOrderId: uuid(row.purchase_order_id, "أمر الشراء"),
    purchaseOrderNumber: text(row.purchase_order_number, "رقم أمر الشراء"),
    supplierId: uuid(row.supplier_id, "المورد"),
    supplierName: text(row.supplier_name, "اسم المورد"),
    warehouseId: uuid(row.warehouse_id, "المخزن"),
    warehouseName: text(row.warehouse_name, "اسم المخزن"),
    currency,
    status,
    reason: text(row.reason, "سبب المرتجع"),
    notes: nullableText(row.notes, "ملاحظات المرتجع"),
    totalCost,
    createdAt: date(row.created_at, "تاريخ إنشاء المرتجع"),
    postedAt: nullableDate(row.posted_at, "تاريخ ترحيل المرتجع"),
    postedBy: nullableText(row.posted_by, "مرحل المرتجع"),
    items: row.items.map(parseReturnItem),
  };
}
function parseCommand(value: unknown): SupplierReturnCommandResult {
  const row = object(value, "نتيجة مرتجع المورد");
  return {
    supplierReturn: parseSupplierReturn(row.supplier_return),
    idempotentReplay: row.idempotent_replay === true,
  };
}
export async function fetchSupplierReturns(): Promise<SupplierReturnWorkspaceData> {
  const { data, error } = await supabase.rpc("fetch_purchase_supplier_returns");
  if (error) throw error;
  const row = object(data, "بيانات مرتجعات الموردين");
  if (!Array.isArray(row.receipts) || !Array.isArray(row.returns)) {
    throw new Error("قائمة إيصالات الشراء أو مرتجعات الموردين غير صالحة.");
  }
  return {
    receipts: row.receipts.map(parseReceipt),
    returns: row.returns.map(parseSupplierReturn),
  };
}
export async function createSupplierReturn(input: {
  receiptId: string;
  lines: Array<{ receipt_item_id: string; quantity: number }>;
  reason: string;
  notes: string;
  idempotencyKey: string;
}): Promise<SupplierReturnCommandResult> {
  const reason = input.reason.trim();
  const notes = input.notes.trim();
  if (!uuidPattern.test(input.receiptId) || !idempotencyPattern.test(input.idempotencyKey) ||
      reason.length < 3 || reason.length > 1000 || notes.length > 2000 ||
      !input.lines.length || input.lines.length > 100) {
    throw new Error("مرجع الإيصال أو سبب المرتجع أو مفتاح منع التكرار أو البنود غير صالحة.");
  }
  const seen = new Set<string>();
  for (const line of input.lines) {
    if (!uuidPattern.test(line.receipt_item_id) || seen.has(line.receipt_item_id)) {
      throw new Error("بند الإيصال غير صالح أو مكرر في المرتجع.");
    }
    seen.add(line.receipt_item_id);
    if (!Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 999999999999.999 ||
        Math.round(line.quantity * 1000) !== line.quantity * 1000) {
      throw new Error("كمية المرتجع يجب أن تكون موجبة وبحد أقصى ثلاث منازل عشرية.");
    }
  }
  const { data, error } = await supabase.rpc("create_purchase_supplier_return", {
    p_receipt_id: input.receiptId,
    p_lines: input.lines,
    p_reason: reason,
    p_notes: notes || null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw error;
  return parseCommand(data);
}
export async function postSupplierReturn(returnId: string): Promise<SupplierReturnCommandResult> {
  if (!uuidPattern.test(returnId)) throw new Error("معرّف مرتجع المورد غير صالح.");
  const { data, error } = await supabase.rpc("post_purchase_supplier_return", { p_return_id: returnId });
  if (error) throw error;
  return parseCommand(data);
}
