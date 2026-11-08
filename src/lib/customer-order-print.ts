import { ORDER_STATUS_LABELS as CANONICAL_ORDER_STATUS_LABELS } from '@/lib/types';

export type CustomerOrderPrintAddressSource = {
  label?: string | null; recipient_name?: string | null; phone?: string | null;
  address_line1?: string | null; address_line2?: string | null; city?: string | null;
  region?: string | null; postal_code?: string | null; country?: string | null;
  delivery_instructions?: string | null;
};
export type CustomerOrderPrintOrderSource = {
  order_number: string; status: string; created_at: string; notes: string | null;
  delivery_address_snapshot: CustomerOrderPrintAddressSource | null;
  quantity_review_required?: boolean; customer_adjustment_note?: string | null;
  customer_payment_requested_at?: string | null; payment_request_status?: string;
};
export type CustomerOrderPrintLineSource = {
  item_code: string | null; product_name_snapshot: string; unit_snapshot: string | null;
  quantity: number; requested_quantity?: number | null; approved_quantity?: number | null;
};
export type CustomerOrderPrintHistorySource = { to_status: string; created_at: string };
export type CustomerOrderPrintCustomerSource = {
  customer_code: string | null; business_name: string | null; contact_name: string | null;
};
export type CustomerOrderPrintItem = {
  itemCode: string | null; productName: string; unit: string | null;
  requestedQuantity: number | null; approvedQuantity: number | null; adjusted: boolean;
};
export type CustomerOrderPrintDocument = {
  orderNumber: string; status: string; statusLabel: string; createdAt: string;
  customer: { code: string; name: string };
  deliveryAddress: null | {
    label: string | null; recipientName: string | null; phone: string | null;
    addressLine1: string; addressLine2: string | null; city: string | null; region: string | null;
    postalCode: string | null; country: string | null; deliveryInstructions: string | null;
  };
  items: CustomerOrderPrintItem[]; quantityReviewRequired: boolean;
  adjustmentNote: string | null; paymentRequested: boolean; customerNotes: string | null;
  history: Array<{ status: string; statusLabel: string; createdAt: string }>;
};
const ORDER_STATUS_LABELS: Record<string, string> = {
  ...CANONICAL_ORDER_STATUS_LABELS,
  draft: 'مسودة',
  pending: 'بانتظار المراجعة',
  confirmed: 'مؤكد',
  processing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  needs_customer_amendment: 'بانتظار تعديل العميل',
  returned_for_adjustment: 'أُعيد للتعديل',
  awaiting_customer_payment: 'بانتظار إبلاغ السداد',
};
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function quantityOrNull(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}
/** Strict customer-facing DTO: IDs, tenant keys, actor fields, admin notes, financial values and raw payloads are never copied. */
export function projectCustomerOrderPrintDocument(
  order: CustomerOrderPrintOrderSource,
  lines: readonly CustomerOrderPrintLineSource[],
  history: readonly CustomerOrderPrintHistorySource[],
  customer: CustomerOrderPrintCustomerSource | null,
  fallbackCustomerName: string | null,
): CustomerOrderPrintDocument {
  const delivery = order.delivery_address_snapshot;
  const items = lines.map((line): CustomerOrderPrintItem => {
    const requestedQuantity = quantityOrNull(line.requested_quantity ?? line.quantity);
    const approvedQuantity = quantityOrNull(line.approved_quantity ?? line.quantity);
    return {
      itemCode: textOrNull(line.item_code),
      productName: textOrNull(line.product_name_snapshot) ?? 'صنف غير مسمى',
      unit: textOrNull(line.unit_snapshot),
      requestedQuantity, approvedQuantity,
      adjusted: line.approved_quantity != null && requestedQuantity !== null &&
        approvedQuantity !== null && requestedQuantity !== approvedQuantity,
    };
  });
  return {
    orderNumber: textOrNull(order.order_number) ?? 'غير مسجل',
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status] ?? order.status,
    createdAt: order.created_at,
    customer: {
      code: textOrNull(customer?.customer_code) ?? '—',
      name: textOrNull(customer?.business_name) ?? textOrNull(customer?.contact_name) ??
        textOrNull(fallbackCustomerName) ?? '—',
    },
    deliveryAddress: delivery ? {
      label: textOrNull(delivery.label), recipientName: textOrNull(delivery.recipient_name),
      phone: textOrNull(delivery.phone), addressLine1: textOrNull(delivery.address_line1) ?? '',
      addressLine2: textOrNull(delivery.address_line2), city: textOrNull(delivery.city),
      region: textOrNull(delivery.region), postalCode: textOrNull(delivery.postal_code),
      country: textOrNull(delivery.country), deliveryInstructions: textOrNull(delivery.delivery_instructions),
    } : null,
    items,
    quantityReviewRequired: order.quantity_review_required === true,
    adjustmentNote: textOrNull(order.customer_adjustment_note),
    paymentRequested: Boolean(order.customer_payment_requested_at) && order.payment_request_status === 'requested',
    customerNotes: textOrNull(order.notes),
    history: history.map((entry) => ({
      status: entry.to_status,
      statusLabel: ORDER_STATUS_LABELS[entry.to_status] ?? entry.to_status,
      createdAt: entry.created_at,
    })),
  };
}
