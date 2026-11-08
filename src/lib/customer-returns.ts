export type CustomerReturnReason = "damaged" | "wrong_item" | "missing_item" | "quality" | "other";
export type CustomerReturnRequestStatus = "submitted" | "under_review" | "approved" | "rejected" | "received" | "closed" | "cancelled";

export interface ReturnableOrderItem {
  order_item_id: string;
  item_code: string | null;
  product_name: string;
  unit: string | null;
  ordered_quantity: number;
  already_requested_quantity: number;
  remaining_quantity: number;
}

export interface CustomerReturnRequestItem {
  order_item_id: string;
  item_code: string | null;
  product_name: string;
  unit: string | null;
  requested_quantity: number;
}

export interface CustomerReturnRequestRecord {
  id: string;
  request_number: string;
  status: CustomerReturnRequestStatus;
  reason: CustomerReturnReason;
  notes: string | null;
  review_note: string | null;
  customer_cancelled_at: string | null;
  customer_cancellation_reason: string | null;
  created_at: string;
  items: CustomerReturnRequestItem[];
}

export interface CustomerReturnSummary {
  order_status: string;
  requests: CustomerReturnRequestRecord[];
  returnable_items: ReturnableOrderItem[];
}


export interface CustomerReturnHistoryCursor {
  created_at: string;
  id: string;
}

export interface CustomerReturnHistoryRecord {
  order_id: string;
  order_number: string;
  order_status: string;
  order_created_at: string;
  request: CustomerReturnRequestRecord;
}

export interface CustomerReturnHistoryPage {
  as_of: string;
  total_count: number;
  page_size: number;
  has_more: boolean;
  next_cursor: CustomerReturnHistoryCursor | null;
  requests: CustomerReturnHistoryRecord[];
}

const RETURN_HISTORY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validHistoryTimestamp(value: unknown, field: string): string {
  const timestamp = requiredText(value, field);
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error("تاريخ غير صالح في سجل المرتجعات: " + field);
  return timestamp;
}

export function readCustomerReturnHistoryPage(value: unknown): CustomerReturnHistoryPage {
  if (!isRecord(value) || !Array.isArray(value.requests) ||
      value.side_effects !== "NONE" ||
      typeof value.has_more !== "boolean" ||
      !Number.isSafeInteger(value.total_count) || (value.total_count as number) < 0 ||
      !Number.isSafeInteger(value.page_size) || (value.page_size as number) < 1 || (value.page_size as number) > 50) {
    throw new Error("أعاد الخادم صفحة سجل مرتجعات غير مكتملة.");
  }

  const asOf = validHistoryTimestamp(value.as_of, "as_of");
  const pageSize = value.page_size as number;
  const totalCount = value.total_count as number;
  const rawRequests = value.requests as unknown[];
  if (rawRequests.length > pageSize || rawRequests.length > 50 || rawRequests.length > totalCount ||
      (value.has_more && rawRequests.length !== pageSize)) {
    throw new Error("عدد عناصر صفحة المرتجعات لا يطابق حدود المصدر.");
  }

  const requests = rawRequests.map((entry): CustomerReturnHistoryRecord => {
    if (!isRecord(entry) || !isRecord(entry.request)) {
      throw new Error("أعاد المصدر صف مرتجع أو طلبًا أصليًا غير صالح.");
    }
    const orderId = requiredText(entry.order_id, "order_id");
    const orderNumber = requiredText(entry.order_number, "order_number");
    const orderStatus = requiredText(entry.order_status, "order_status");
    const orderCreatedAt = validHistoryTimestamp(entry.order_created_at, "order_created_at");
    if (!RETURN_HISTORY_UUID.test(orderId)) throw new Error("معرّف الطلب الأصلي في سجل المرتجعات غير صالح.");

    const summary = readCustomerReturnSummary({
      order_status: orderStatus,
      requests: [entry.request],
      returnable_items: [],
    });
    const request = summary.requests[0];
    validHistoryTimestamp(request.created_at, "request.created_at");
    if (!RETURN_HISTORY_UUID.test(request.id) || Date.parse(request.created_at) > Date.parse(asOf)) {
      throw new Error("تاريخ أو معرّف طلب الإرجاع خارج حدود لقطة المصدر.");
    }
    return {
      order_id: orderId,
      order_number: orderNumber,
      order_status: orderStatus,
      order_created_at: orderCreatedAt,
      request,
    };
  });

  const seen = new Set<string>();
  for (let index = 0; index < requests.length; index += 1) {
    const record = requests[index];
    if (!RETURN_HISTORY_UUID.test(record.request.id) || seen.has(record.request.id)) {
      throw new Error("يوجد معرّف مكرر أو غير صالح في سجل طلبات الإرجاع.");
    }
    seen.add(record.request.id);
    if (index > 0) {
      const previous = requests[index - 1].request;
      const current = record.request;
      const previousTime = Date.parse(previous.created_at);
      const currentTime = Date.parse(current.created_at);
      if (previousTime < currentTime ||
          (previousTime === currentTime && previous.id.toLowerCase() < current.id.toLowerCase())) {
        throw new Error("ترتيب صفحة سجل المرتجعات لا يطابق مؤشر المصدر.");
      }
    }
  }

  let nextCursor: CustomerReturnHistoryCursor | null = null;
  if (value.next_cursor !== null) {
    if (!isRecord(value.next_cursor)) throw new Error("مؤشر صفحة المرتجعات التالية غير صالح.");
    const cursorCreatedAt = validHistoryTimestamp(value.next_cursor.created_at, "next_cursor.created_at");
    const cursorId = requiredText(value.next_cursor.id, "next_cursor.id");
    if (!RETURN_HISTORY_UUID.test(cursorId)) throw new Error("معرّف مؤشر صفحة المرتجعات التالية غير صالح.");
    nextCursor = { created_at: cursorCreatedAt, id: cursorId };
  }
  if (value.has_more) {
    if (!nextCursor || requests.length === 0) throw new Error("صفحة المرتجعات تعلن وجود صفحات تالية دون مؤشر موثوق.");
    const last = requests[requests.length - 1].request;
    if (Date.parse(nextCursor.created_at) !== Date.parse(last.created_at) || nextCursor.id !== last.id) {
      throw new Error("مؤشر صفحة المرتجعات التالية لا يطابق آخر سجل معروض.");
    }
  } else if (nextCursor !== null) {
    throw new Error("أعاد المصدر مؤشرًا لصفحة تالية رغم اكتمال سجل المرتجعات.");
  }

  return {
    as_of: asOf,
    total_count: totalCount,
    page_size: pageSize,
    has_more: value.has_more,
    next_cursor: nextCursor,
    requests,
  };
}

export interface CustomerReturnLineInput {
  order_item_id: string;
  quantity: number;
}

const reasons = new Set<CustomerReturnReason>(["damaged", "wrong_item", "missing_item", "quality", "other"]);
const statuses = new Set<CustomerReturnRequestStatus>(["submitted", "under_review", "approved", "rejected", "received", "closed", "cancelled"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("بيانات المرتجع غير مكتملة: " + field);
  return value;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function finiteNonNegative(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < 0) throw new Error("قيمة غير صالحة في بيانات المرتجع: " + field);
  return number;
}

export function readCustomerReturnSummary(value: unknown): CustomerReturnSummary {
  if (!isRecord(value) || !Array.isArray(value.requests) || !Array.isArray(value.returnable_items)) {
    throw new Error("أعاد الخادم ملخص مرتجعات غير صالح.");
  }
  const orderStatus = requiredText(value.order_status, "order_status");
  const requests = value.requests.map((entry): CustomerReturnRequestRecord => {
    if (!isRecord(entry) || !Array.isArray(entry.items)) throw new Error("سجل طلب مرتجع غير صالح.");
    const status = requiredText(entry.status, "status") as CustomerReturnRequestStatus;
    const reason = requiredText(entry.reason, "reason") as CustomerReturnReason;
    if (!statuses.has(status) || !reasons.has(reason)) throw new Error("حالة أو سبب المرتجع غير معتمد.");
    const customerCancelledAt = nullableText(entry.customer_cancelled_at);
    const customerCancellationReason = nullableText(entry.customer_cancellation_reason);
    if (customerCancelledAt !== null && !Number.isFinite(Date.parse(customerCancelledAt))) {
      throw new Error("تاريخ سحب طلب الإرجاع غير صالح؛ لم يُعرض سجل غير موثوق.");
    }
    if (customerCancelledAt !== null &&
        (customerCancellationReason === null || customerCancellationReason.trim().length < 3 ||
         customerCancellationReason.length > 500 || status !== "cancelled")) {
      throw new Error("بيانات سحب طلب الإرجاع لا تطابق حالة السجل.");
    }
    const items = entry.items.map((line): CustomerReturnRequestItem => {
      if (!isRecord(line)) throw new Error("سطر مرتجع غير صالح.");
      return {
        order_item_id: requiredText(line.order_item_id, "order_item_id"),
        item_code: nullableText(line.item_code),
        product_name: requiredText(line.product_name, "product_name"),
        unit: nullableText(line.unit),
        requested_quantity: finiteNonNegative(line.requested_quantity, "requested_quantity"),
      };
    });
    return {
      id: requiredText(entry.id, "id"),
      request_number: requiredText(entry.request_number, "request_number"),
      status,
      reason,
      notes: nullableText(entry.notes),
      review_note: nullableText(entry.review_note),
      customer_cancelled_at: customerCancelledAt,
      customer_cancellation_reason: customerCancellationReason,
      created_at: requiredText(entry.created_at, "created_at"),
      items,
    };
  });
  const returnableItems = value.returnable_items.map((entry): ReturnableOrderItem => {
    if (!isRecord(entry)) throw new Error("بيانات كمية مرتجعة غير صالحة.");
    return {
      order_item_id: requiredText(entry.order_item_id, "order_item_id"),
      item_code: nullableText(entry.item_code),
      product_name: requiredText(entry.product_name, "product_name"),
      unit: nullableText(entry.unit),
      ordered_quantity: finiteNonNegative(entry.ordered_quantity, "ordered_quantity"),
      already_requested_quantity: finiteNonNegative(entry.already_requested_quantity, "already_requested_quantity"),
      remaining_quantity: finiteNonNegative(entry.remaining_quantity, "remaining_quantity"),
    };
  });
  return { order_status: orderStatus, requests, returnable_items: returnableItems };
}

export function buildCustomerReturnLines(
  drafts: Readonly<Record<string, string>>,
  items: readonly ReturnableOrderItem[],
): CustomerReturnLineInput[] {
  const byId = new Map(items.map((item) => [item.order_item_id, item]));
  const lines: CustomerReturnLineInput[] = [];
  for (const [orderItemId, rawQuantity] of Object.entries(drafts)) {
    if (!rawQuantity.trim()) continue;
    const item = byId.get(orderItemId);
    const quantity = Number(rawQuantity);
    if (!item || item.remaining_quantity <= 0) throw new Error("لا توجد كمية متاحة للإرجاع لهذا الصنف.");
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("أدخل كمية إرجاع موجبة لكل صنف تختاره.");
    if (Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 1e-8) {
      throw new Error("كمية الإرجاع تقبل حتى ثلاث منازل عشرية.");
    }
    if (quantity - item.remaining_quantity > 1e-9) {
      throw new Error("كمية الإرجاع تتجاوز الكمية المتاحة للصنف: " + item.product_name);
    }
    lines.push({ order_item_id: orderItemId, quantity: Math.round(quantity * 1000) / 1000 });
  }
  if (lines.length === 0) throw new Error("حدد صنفًا واحدًا وكمية الإرجاع قبل الإرسال.");
  if (lines.length > 100) throw new Error("لا يمكن إرسال أكثر من 100 صنف في طلب واحد.");
  return lines;
}

export function createReturnIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return "return-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 24);
}

export function readReturnMutationResult(value: unknown): { request_id: string; request_number: string; status: CustomerReturnRequestStatus; idempotent_replay: boolean } {
  if (!isRecord(value)) throw new Error("لم يرجع الخادم نتيجة صالحة لطلب الإرجاع.");
  const status = requiredText(value.status, "status") as CustomerReturnRequestStatus;
  if (!statuses.has(status)) throw new Error("حالة طلب الإرجاع التي أعادها الخادم غير معتمدة.");
  if (typeof value.idempotent_replay !== "boolean") throw new Error("نتيجة تكرار طلب الإرجاع غير مكتملة.");
  return {
    request_id: requiredText(value.request_id, "request_id"),
    request_number: requiredText(value.request_number, "request_number"),
    status,
    idempotent_replay: value.idempotent_replay,
  };
}
