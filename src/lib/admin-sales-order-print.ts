type RawRecord = Record<string, unknown>;
export type AdminSalesOrderPrintItem = {
  itemCode: string | null;
  productName: string;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
};
export type AdminSalesOrderPrintDocument = {
  orderNumber: string;
  createdAt: string;
  statusLabel: string;
  customerName: string;
  customerCode: string;
  totalItems: number | null;
  totalAmount: number | null;
  deliveryAddress: null | {
    recipientName: string | null;
    phone: string | null;
    addressLine1: string;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
  };
  items: AdminSalesOrderPrintItem[];
};
const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة', pending: 'بانتظار المراجعة', confirmed: 'مؤكد',
  processing: 'قيد التجهيز', shipped: 'تم الشحن', delivered: 'تم التسليم', cancelled: 'ملغي',
};
function record(value: unknown): RawRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RawRecord : null;
}
function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function numberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
/** Strict internal sales-print projection. Proposed drafts and all source/actor/tenant IDs are excluded. */
export function projectAdminSalesOrderPrintDocument(
  orderValue: unknown,
  itemValues: readonly unknown[],
  canPrint: boolean,
): AdminSalesOrderPrintDocument | null {
  const order = record(orderValue);
  if (!canPrint || !order) return null;
  const orderNumber = textOrNull(order.order_number) ?? textOrNull(order.order_code);
  if (!orderNumber) return null;
  const customer = record(order.customer);
  const delivery = record(order.delivery_address_snapshot);
  const items = itemValues.map((raw): AdminSalesOrderPrintItem => {
    const item = record(raw);
    if (!item) return {
      itemCode: null, productName: 'صنف غير مسمى', unit: null,
      quantity: null, unitPrice: null, lineTotal: null,
    };
    const quantity = numberOrNull(item.approved_quantity ?? item.quantity);
    const unitPrice = numberOrNull(item.approved_unit_price ?? item.unit_price_snapshot ?? item.unit_price);
    const explicitLineTotal = numberOrNull(item.line_total);
    const lineTotal = explicitLineTotal ?? (quantity !== null && unitPrice !== null ? quantity * unitPrice : null);
    return {
      itemCode: textOrNull(item.item_code) ?? textOrNull(item.product_code),
      productName: textOrNull(item.product_name_snapshot) ?? textOrNull(item.product_name) ?? 'صنف غير مسمى',
      unit: textOrNull(item.unit_snapshot) ?? textOrNull(item.unit),
      quantity, unitPrice, lineTotal,
    };
  });
  return {
    orderNumber,
    createdAt: textOrNull(order.created_at) ?? '',
    statusLabel: STATUS_LABELS[String(order.status ?? '')] ?? textOrNull(order.status) ?? 'غير محدد',
    customerName: textOrNull(customer?.business_name) ?? textOrNull(customer?.full_name) ?? textOrNull(customer?.company_name) ?? '—',
    customerCode: textOrNull(customer?.customer_code) ?? '—',
    totalItems: numberOrNull(order.total_items),
    totalAmount: numberOrNull(order.total_amount),
    deliveryAddress: delivery ? {
      recipientName: textOrNull(delivery.recipient_name),
      phone: textOrNull(delivery.phone),
      addressLine1: textOrNull(delivery.address_line1) ?? '',
      addressLine2: textOrNull(delivery.address_line2),
      city: textOrNull(delivery.city),
      region: textOrNull(delivery.region),
      postalCode: textOrNull(delivery.postal_code),
      country: textOrNull(delivery.country),
    } : null,
    items,
  };
}
