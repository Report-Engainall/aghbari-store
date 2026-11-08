export interface CustomerReturnReceiptLine {
  request_item_id: string;
  product_id: string | null;
  item_code: string | null;
  product_name: string;
  unit: string | null;
  requested_quantity: number;
  received_quantity: number;
  remaining_quantity: number;
}

export interface CustomerReturnReceiptRequest {
  id: string;
  request_number: string;
  order_number: string;
  customer_name: string;
  created_at: string;
  items: CustomerReturnReceiptLine[];
}

export interface CustomerReturnReceiptWarehouse {
  id: string;
  name: string;
  code: string | null;
}

export interface CustomerReturnReceiptQueue {
  warehouses: CustomerReturnReceiptWarehouse[];
  requests: CustomerReturnReceiptRequest[];
}

export interface CustomerReturnReceiptDraft {
  received_quantity: string;
  restockable_quantity: string;
}

export interface CustomerReturnReceiptLineInput {
  request_item_id: string;
  received_quantity: number;
  restockable_quantity: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("بيانات استلام المرتجع غير مكتملة: " + field);
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function decimalQuantity(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 999999999999.999 ||
      Math.abs(parsed * 1000 - Math.round(parsed * 1000)) > 1e-7) {
    throw new Error("كمية غير صالحة في " + field + "؛ استخدم حتى ثلاث منازل عشرية.");
  }
  return Math.round(parsed * 1000) / 1000;
}

export function readCustomerReturnReceiptQueue(value: unknown): CustomerReturnReceiptQueue {
  if (!isRecord(value) || !Array.isArray(value.warehouses) || !Array.isArray(value.requests)) {
    throw new Error("أعاد الخادم قائمة استلام مرتجعات غير صالحة.");
  }
  const warehouses = value.warehouses.map((entry): CustomerReturnReceiptWarehouse => {
    if (!isRecord(entry)) throw new Error("بيانات مخزن الاستلام غير صالحة.");
    return {
      id: requiredText(entry.id, "warehouse.id"),
      name: requiredText(entry.name, "warehouse.name"),
      code: nullableText(entry.code),
    };
  });
  const requests = value.requests.map((entry): CustomerReturnReceiptRequest => {
    if (!isRecord(entry) || !Array.isArray(entry.items)) throw new Error("سجل طلب مرتجع للاستلام غير صالح.");
    const items = entry.items.map((line): CustomerReturnReceiptLine => {
      if (!isRecord(line)) throw new Error("سطر استلام مرتجع غير صالح.");
      const requested = decimalQuantity(line.requested_quantity, "requested_quantity");
      const received = decimalQuantity(line.received_quantity, "received_quantity");
      const remaining = decimalQuantity(line.remaining_quantity, "remaining_quantity");
      if (remaining <= 0 || Math.abs(requested - received - remaining) > 0.0011) {
        throw new Error("رصيد الكمية المتبقية للاستلام غير متسق.");
      }
      return {
        request_item_id: requiredText(line.request_item_id, "request_item_id"),
        product_id: nullableText(line.product_id),
        item_code: nullableText(line.item_code),
        product_name: requiredText(line.product_name, "product_name"),
        unit: nullableText(line.unit),
        requested_quantity: requested,
        received_quantity: received,
        remaining_quantity: remaining,
      };
    });
    return {
      id: requiredText(entry.id, "request.id"),
      request_number: requiredText(entry.request_number, "request_number"),
      order_number: requiredText(entry.order_number, "order_number"),
      customer_name: requiredText(entry.customer_name, "customer_name"),
      created_at: requiredText(entry.created_at, "created_at"),
      items,
    };
  });
  return { warehouses, requests };
}

export function buildCustomerReturnReceiptLines(
  drafts: Readonly<Record<string, CustomerReturnReceiptDraft>>,
  items: readonly CustomerReturnReceiptLine[],
): CustomerReturnReceiptLineInput[] {
  const byId = new Map(items.map((item) => [item.request_item_id, item]));
  const lines: CustomerReturnReceiptLineInput[] = [];
  for (const [requestItemId, draft] of Object.entries(drafts)) {
    if (!draft?.received_quantity?.trim()) continue;
    const item = byId.get(requestItemId);
    if (!item || item.remaining_quantity <= 0) {
      throw new Error("لا توجد كمية متبقية للاستلام لهذا الصنف.");
    }
    if (!draft.restockable_quantity?.trim()) {
      throw new Error("حدد الكمية الصالحة لإعادة المخزون بعد الفحص؛ والباقي يسجل تالفًا.");
    }
    const received = decimalQuantity(draft.received_quantity, "الكمية المستلمة");
    const restockable = decimalQuantity(draft.restockable_quantity, "الكمية الصالحة للمخزون");
    if (received <= 0) throw new Error("الكمية المستلمة يجب أن تكون أكبر من صفر.");
    if (received - item.remaining_quantity > 1e-7) {
      throw new Error("الكمية المستلمة تتجاوز المتبقي المعتمد للصنف: " + item.product_name);
    }
    if (restockable > received) {
      throw new Error("الكمية الصالحة للمخزون لا يمكن أن تتجاوز الكمية المستلمة.");
    }
    if (restockable > 0 && !item.product_id) {
      throw new Error("لا يمكن إرجاع الصنف للمخزون قبل ربطه بمنتج فعلي: " + item.product_name);
    }
    lines.push({
      request_item_id: requestItemId,
      received_quantity: received,
      restockable_quantity: restockable,
    });
  }
  if (!lines.length) throw new Error("أدخل كمية مستلمة لصنف واحد على الأقل.");
  if (lines.length > 100) throw new Error("لا يمكن استلام أكثر من 100 صنف في عملية واحدة.");
  return lines;
}

export function createReturnReceiptIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "return-receipt-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 24);
}


export interface CustomerReturnReceiptPrintLine {
  item_code: string | null;
  product_name: string;
  unit: string | null;
  received_quantity: number;
  restockable_quantity: number;
  defective_quantity: number;
}

export interface CustomerReturnReceiptPrintData {
  receipt_number: string;
  request_number: string;
  order_number: string;
  customer_name: string;
  warehouse_name: string;
  received_at: string;
  notes: string | null;
  received_line_count: number;
  received_quantity: number;
  restockable_quantity: number;
  defective_quantity: number;
  lines: CustomerReturnReceiptPrintLine[];
}

/**
 * Parses the server-read, persisted receipt snapshot used for reprints.
 * It deliberately projects only customer-facing receipt fields and validates
 * the persisted line totals against the header summary before allowing print.
 */
export function readCustomerReturnReceiptPrintData(value: unknown): CustomerReturnReceiptPrintData {
  if (!isRecord(value) || !Array.isArray(value.lines)) {
    throw new Error("لم يرجع الخادم نسخة إيصال محفوظة صالحة للطباعة.");
  }
  const lines = value.lines.map((raw): CustomerReturnReceiptPrintLine => {
    if (!isRecord(raw)) throw new Error("سطر في نسخة إيصال المرتجع غير صالح.");
    const received = decimalQuantity(raw.received_quantity, "print.received_quantity");
    const restockable = decimalQuantity(raw.restockable_quantity, "print.restockable_quantity");
    const defective = decimalQuantity(raw.defective_quantity, "print.defective_quantity");
    if (received <= 0 || restockable > received ||
        Math.round((restockable + defective) * 1000) !== Math.round(received * 1000)) {
      throw new Error("تقسيم الكمية المحفوظة بين الصالح والتالف غير متسق؛ تم منع الطباعة.");
    }
    return {
      item_code: nullableText(raw.item_code),
      product_name: requiredText(raw.product_name, "print.product_name"),
      unit: nullableText(raw.unit),
      received_quantity: received,
      restockable_quantity: restockable,
      defective_quantity: defective,
    };
  });
  const receivedLineCount = value.received_line_count;
  if (!Number.isSafeInteger(receivedLineCount) || typeof receivedLineCount !== "number" ||
      receivedLineCount < 1 || receivedLineCount > 100 || lines.length !== receivedLineCount) {
    throw new Error("عدد بنود نسخة الإيصال لا يطابق السجل المحفوظ؛ تم منع الطباعة.");
  }
  const receivedQuantity = decimalQuantity(value.received_quantity, "print.received_quantity");
  const restockableQuantity = decimalQuantity(value.restockable_quantity, "print.restockable_quantity");
  const defectiveQuantity = decimalQuantity(value.defective_quantity, "print.defective_quantity");
  const toMilli = (quantity: number) => Math.round(quantity * 1000);
  const sum = (field: keyof Pick<CustomerReturnReceiptPrintLine,
    "received_quantity" | "restockable_quantity" | "defective_quantity">) =>
    lines.reduce((total, line) => total + toMilli(line[field]), 0);
  if (sum("received_quantity") !== toMilli(receivedQuantity) ||
      sum("restockable_quantity") !== toMilli(restockableQuantity) ||
      sum("defective_quantity") !== toMilli(defectiveQuantity) ||
      toMilli(restockableQuantity + defectiveQuantity) !== toMilli(receivedQuantity)) {
    throw new Error("إجماليات نسخة الإيصال لا تطابق تفاصيل الاستلام المحفوظة؛ تم منع الطباعة.");
  }
  const receivedAt = requiredText(value.received_at, "print.received_at");
  if (!Number.isFinite(Date.parse(receivedAt))) throw new Error("وقت الاستلام المحفوظ غير صالح.");
  return {
    receipt_number: requiredText(value.receipt_number, "print.receipt_number"),
    request_number: requiredText(value.request_number, "print.request_number"),
    order_number: requiredText(value.order_number, "print.order_number"),
    customer_name: requiredText(value.customer_name, "print.customer_name"),
    warehouse_name: requiredText(value.warehouse_name, "print.warehouse_name"),
    received_at: receivedAt,
    notes: nullableText(value.notes),
    received_line_count: receivedLineCount,
    received_quantity: receivedQuantity,
    restockable_quantity: restockableQuantity,
    defective_quantity: defectiveQuantity,
    lines,
  };
}

export function readReturnReceiptMutationResult(value: unknown): {
  receipt_id: string;
  receipt_number: string;
  request_status: "approved" | "received";
  received_line_count: number;
  received_quantity: number;
  restockable_quantity: number;
  defective_quantity: number;
  idempotent_replay: boolean;
} {
  if (!isRecord(value)) throw new Error("لم يرجع الخادم نتيجة صالحة لاستلام المرتجع.");
  const status = requiredText(value.request_status, "request_status");
  if (status !== "approved" && status !== "received") throw new Error("حالة طلب المرتجع بعد الاستلام غير متوقعة.");
  const lineCount = value.received_line_count;
  if (typeof lineCount !== "number" || !Number.isInteger(lineCount) || lineCount < 1 || lineCount > 100) {
    throw new Error("عدد بنود الاستلام الذي أعاده الخادم غير صالح.");
  }
  if (typeof value.idempotent_replay !== "boolean") throw new Error("نتيجة تكرار الاستلام غير مكتملة.");
  return {
    receipt_id: requiredText(value.receipt_id, "receipt_id"),
    receipt_number: requiredText(value.receipt_number, "receipt_number"),
    request_status: status,
    received_line_count: lineCount,
    received_quantity: decimalQuantity(value.received_quantity, "received_quantity"),
    restockable_quantity: decimalQuantity(value.restockable_quantity, "restockable_quantity"),
    defective_quantity: decimalQuantity(value.defective_quantity, "defective_quantity"),
    idempotent_replay: value.idempotent_replay,
  };
}


export interface CustomerReturnReceiptHistoryEntry {
  receipt_id: string;
  receipt_number: string;
  request_number: string;
  order_number: string;
  customer_name: string;
  warehouse_name: string;
  received_at: string;
  received_line_count: number;
  received_quantity: number;
  restockable_quantity: number;
  defective_quantity: number;
}

export interface CustomerReturnReceiptPrintHistory {
  receipts: CustomerReturnReceiptHistoryEntry[];
  has_more: boolean;
  limit: number;
  offset: number;
}

export function readCustomerReturnReceiptPrintHistory(value: unknown): CustomerReturnReceiptPrintHistory {
  if (!isRecord(value) || !Array.isArray(value.receipts) ||
      typeof value.has_more !== "boolean" ||
      typeof value.limit !== "number" || !Number.isSafeInteger(value.limit) ||
      value.limit < 1 || value.limit > 100 || value.receipts.length > value.limit ||
      typeof value.offset !== "number" || !Number.isSafeInteger(value.offset) ||
      value.offset < 0 || value.offset > 1_000_000) {
    throw new Error("أعاد الخادم سجل إيصالات محفوظة غير صالح.");
  }
  const seenIds = new Set<string>();
  const receipts = value.receipts.map((raw): CustomerReturnReceiptHistoryEntry => {
    if (!isRecord(raw)) throw new Error("سجل إيصال محفوظ غير صالح.");
    const receiptId = requiredText(raw.receipt_id, "history.receipt_id");
    if (seenIds.has(receiptId)) throw new Error("سجل الإيصالات يحتوي معرّفًا مكررًا؛ تم منع العرض.");
    seenIds.add(receiptId);
    const receivedAt = requiredText(raw.received_at, "history.received_at");
    if (!Number.isFinite(Date.parse(receivedAt))) throw new Error("تاريخ إيصال محفوظ غير صالح.");
    const lineCount = raw.received_line_count;
    if (typeof lineCount !== "number" || !Number.isSafeInteger(lineCount) || lineCount < 1 || lineCount > 100) {
      throw new Error("عدد بنود إيصال محفوظ غير صالح.");
    }
    const received = decimalQuantity(raw.received_quantity, "history.received_quantity");
    const restockable = decimalQuantity(raw.restockable_quantity, "history.restockable_quantity");
    const defective = decimalQuantity(raw.defective_quantity, "history.defective_quantity");
    if (received <= 0 || restockable > received ||
        Math.round((restockable + defective) * 1000) !== Math.round(received * 1000)) {
      throw new Error("إجماليات إيصال محفوظ غير متسقة؛ تم منع إعادة الطباعة.");
    }
    return {
      receipt_id: receiptId,
      receipt_number: requiredText(raw.receipt_number, "history.receipt_number"),
      request_number: requiredText(raw.request_number, "history.request_number"),
      order_number: requiredText(raw.order_number, "history.order_number"),
      customer_name: requiredText(raw.customer_name, "history.customer_name"),
      warehouse_name: requiredText(raw.warehouse_name, "history.warehouse_name"),
      received_at: receivedAt,
      received_line_count: lineCount,
      received_quantity: received,
      restockable_quantity: restockable,
      defective_quantity: defective,
    };
  });
  return { receipts, has_more: value.has_more, limit: value.limit, offset: value.offset };
}
