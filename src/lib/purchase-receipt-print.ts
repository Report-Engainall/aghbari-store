import { supabase } from "@/lib/supabase";
import { isPurchaseOrderUuid } from "@/lib/purchase-orders";

export type PurchaseReceiptHistoryItem = {
  item_code: string;
  product_name: string;
  unit: string | null;
  quantity_received: string;
  batch_number: string | null;
  expiry_date: string | null;
};

export type PurchaseReceiptHistoryRow = {
  id: string;
  receipt_number: string;
  received_at: string;
  item_count: number;
  items: PurchaseReceiptHistoryItem[];
};

export type PurchaseReceiptHistoryPage = {
  receipts: PurchaseReceiptHistoryRow[];
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type PurchaseReceiptPrintItem = {
  item_code: string;
  product_name: string;
  unit: string | null;
  quantity_received: string;
  batch_number: string | null;
  expiry_date: string | null;
  unit_cost: string | null;
  line_total: string | null;
};

export type PurchaseReceiptPrintDocument = {
  receipt_number: string;
  purchase_order_number: string;
  supplier_name: string;
  warehouse_name: string;
  received_at: string;
  currency: string;
  costs_complete: boolean;
  received_cost: string | null;
  items: PurchaseReceiptPrintItem[];
};

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("بيانات إيصال الاستلام غير مكتملة: " + label);
  }
  return value;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function parseMoneyCents(value: unknown): bigint | null {
  if (typeof value !== "string" || !/^\d{1,13}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  try {
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  } catch {
    return null;
  }
}

function parsePositiveQuantity(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{1,12}(?:\.\d{1,3})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  try {
    const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, "0"));
    return milli > 0n ? value : null;
  } catch {
    return null;
  }
}

function parseBatchNumber(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.trim() !== value || value.length > 100) return null;
  return value;
}

function parseExpiryDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function parseReceiptHistoryItems(value: unknown, itemCount: number): PurchaseReceiptHistoryItem[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length !== itemCount || value.length > 100) {
    throw new Error("تفاصيل الدفعات في إيصال الاستلام غير مكتملة.");
  }
  return value.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error("تفاصيل بند إيصال الاستلام رقم " + (index + 1) + " غير صالحة.");
    const quantity = parsePositiveQuantity(candidate.quantity_received);
    const batch = parseBatchNumber(candidate.batch_number);
    const expiry = parseExpiryDate(candidate.expiry_date);
    if (
      quantity === null ||
      !(candidate.unit === null || typeof candidate.unit === "string") ||
      (candidate.batch_number !== null && candidate.batch_number !== undefined && batch === null) ||
      (candidate.expiry_date !== null && candidate.expiry_date !== undefined && candidate.expiry_date !== "" && expiry === null) ||
      (expiry !== null && batch === null)
    ) throw new Error("كمية أو رقم دفعة أو تاريخ انتهاء غير صالح في تفاصيل إيصال الاستلام.");
    return {
      item_code: requiredText(candidate.item_code, "رمز الصنف"),
      product_name: requiredText(candidate.product_name, "اسم الصنف"),
      unit: candidate.unit as string | null,
      quantity_received: quantity,
      batch_number: batch,
      expiry_date: expiry,
    };
  });
}

export function parsePurchaseReceiptHistoryPage(value: unknown): PurchaseReceiptHistoryPage {
  if (!isRecord(value) || !Array.isArray(value.receipts)) {
    throw new Error("أعاد الخادم سجل إيصالات استلام غير صالح.");
  }
  const total = value.total_count;
  const limit = value.limit;
  const offset = value.offset;
  if (
    !Number.isSafeInteger(total) || (total as number) < 0 ||
    !Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100 ||
    !Number.isSafeInteger(offset) || (offset as number) < 0 ||
    typeof value.has_more !== "boolean"
  ) {
    throw new Error("بيانات ترقيم سجل إيصالات الاستلام غير صالحة.");
  }

  const receipts = value.receipts.map((candidate, index) => {
    if (!isRecord(candidate) || !isPurchaseOrderUuid(candidate.id) ||
        !validTimestamp(candidate.received_at)) {
      throw new Error("بيانات الإيصال رقم " + (index + 1) + " غير صالحة.");
    }
    const count = candidate.item_count;
    if (!Number.isSafeInteger(count) || (count as number) < 1 || (count as number) > 100) {
      throw new Error("عدد بنود الإيصال غير صالح.");
    }
    return {
      id: candidate.id,
      receipt_number: requiredText(candidate.receipt_number, "رقم الإيصال"),
      received_at: candidate.received_at,
      item_count: count as number,
      items: parseReceiptHistoryItems(candidate.items, count as number),
    };
  });

  if (receipts.length > (limit as number) ||
      (offset as number) + receipts.length > (total as number) ||
      value.has_more !== ((offset as number) + receipts.length < (total as number))) {
    throw new Error("تعارضت بيانات سجل إيصالات الاستلام مع معلومات الترقيم.");
  }

  return {
    receipts,
    total_count: total as number,
    limit: limit as number,
    offset: offset as number,
    has_more: value.has_more,
  };
}

export function parsePurchaseReceiptPrintDocument(value: unknown): PurchaseReceiptPrintDocument {
  if (
    !isRecord(value) ||
    !validTimestamp(value.received_at) ||
    typeof value.currency !== "string" || !/^[A-Z]{3}$/.test(value.currency) ||
    typeof value.costs_complete !== "boolean" ||
    !Array.isArray(value.items) ||
    value.items.length < 1 || value.items.length > 100
  ) {
    throw new Error("أعاد الخادم بيانات طباعة إيصال غير مكتملة أو غير صالحة.");
  }

  const items: PurchaseReceiptPrintItem[] = value.items.map((candidate, index) => {
    if (!isRecord(candidate)) throw new Error("بند الإيصال رقم " + (index + 1) + " غير صالح.");
    const quantity = parsePositiveQuantity(candidate.quantity_received);
    const batch = parseBatchNumber(candidate.batch_number);
    const expiry = parseExpiryDate(candidate.expiry_date);
    if (
      quantity === null ||
      !(candidate.unit === null || typeof candidate.unit === "string") ||
      (candidate.batch_number !== null && candidate.batch_number !== undefined && batch === null) ||
      (candidate.expiry_date !== null && candidate.expiry_date !== undefined && candidate.expiry_date !== "" && expiry === null) ||
      (expiry !== null && batch === null) ||
      (candidate.unit_cost !== null && parseMoneyCents(candidate.unit_cost) === null) ||
      (candidate.line_total !== null && parseMoneyCents(candidate.line_total) === null)
    ) {
      throw new Error("بيانات كمية أو تكلفة بند الإيصال غير صالحة.");
    }
    return {
      item_code: requiredText(candidate.item_code, "رمز الصنف"),
      product_name: requiredText(candidate.product_name, "اسم الصنف"),
      unit: candidate.unit as string | null,
      quantity_received: quantity,
      batch_number: batch,
      expiry_date: expiry,
      unit_cost: candidate.unit_cost as string | null,
      line_total: candidate.line_total as string | null,
    };
  });

  const receivedCost = value.received_cost;
  if (value.costs_complete) {
    const expected = parseMoneyCents(receivedCost);
    const lineValues = items.map((item) => parseMoneyCents(item.line_total));
    if (expected === null || lineValues.some((amount) => amount === null)) {
      throw new Error("أعاد الخادم تكاليف غير مكتملة مع إعلان اكتمالها.");
    }
    const actual = (lineValues as bigint[]).reduce((total, amount) => total + amount, 0n);
    if (actual !== expected || items.some((item) => item.unit_cost === null)) {
      throw new Error("تكاليف بنود إيصال الاستلام لا تتطابق مع إجمالي الإيصال.");
    }
  } else if (
    receivedCost !== null ||
    items.some((item) => item.unit_cost !== null || item.line_total !== null)
  ) {
    throw new Error("يجب إخفاء جميع التكاليف عندما تكون تكلفة المصدر غير مكتملة.");
  }

  return {
    receipt_number: requiredText(value.receipt_number, "رقم الإيصال"),
    purchase_order_number: requiredText(value.purchase_order_number, "رقم أمر الشراء"),
    supplier_name: requiredText(value.supplier_name, "المورد"),
    warehouse_name: requiredText(value.warehouse_name, "المخزن"),
    received_at: value.received_at,
    currency: value.currency,
    costs_complete: value.costs_complete,
    received_cost: value.costs_complete ? receivedCost as string : null,
    items,
  };
}

export async function fetchPurchaseReceiptPrintHistory(
  purchaseOrderId: string,
  page: { limit?: number; offset?: number } = {},
): Promise<PurchaseReceiptHistoryPage> {
  if (!isPurchaseOrderUuid(purchaseOrderId)) throw new Error("معرّف أمر الشراء غير صالح.");
  const limit = page.limit ?? 20;
  const offset = page.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 500000) {
    throw new Error("صفحة سجل إيصالات الاستلام غير صالحة.");
  }
  const { data, error } = await supabase.rpc("fetch_purchase_order_receipt_history", {
    p_purchase_order_id: purchaseOrderId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message || "تعذر تحميل سجل إيصالات الاستلام.");
  return parsePurchaseReceiptHistoryPage(data);
}

export async function fetchPurchaseReceiptPrintDocument(
  receiptId: string,
): Promise<PurchaseReceiptPrintDocument> {
  if (!isPurchaseOrderUuid(receiptId)) throw new Error("معرّف إيصال الاستلام غير صالح.");
  const { data, error } = await supabase.rpc("get_purchase_receipt_print_data", {
    p_receipt_id: receiptId,
  });
  if (error) throw new Error(error.message || "تعذر تحميل الإيصال المحفوظ للطباعة.");
  return parsePurchaseReceiptPrintDocument(data);
}
