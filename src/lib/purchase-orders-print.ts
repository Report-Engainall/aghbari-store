import type { PurchaseOrder, PurchaseOrderItem, PurchaseOrderStatus } from '@/lib/purchase-orders';

export type PurchaseOrderPrintItem = Pick<
  PurchaseOrderItem,
  | 'item_code'
  | 'product_name'
  | 'unit'
  | 'quantity_ordered'
  | 'quantity_received'
  | 'remaining_quantity'
  | 'unit_cost'
  | 'line_total'
>;

export type PurchaseOrderPrintDocument = {
  purchase_order_number: string;
  supplier_name: string;
  warehouse_name: string;
  status: PurchaseOrderStatus;
  created_at: string;
  total_cost: number | null;
  items: PurchaseOrderPrintItem[];
};

export type PurchaseOrderPrintResultsRow = {
  purchase_order_number: string;
  supplier_name: string;
  warehouse_name: string;
  status: PurchaseOrderStatus;
  created_at: string;
  item_count: number;
  total_cost: number | null;
};

export type PurchaseOrderPrintResults = {
  filter_label: string;
  orders: PurchaseOrderPrintResultsRow[];
};

function canPrintPurchaseOrders(roles: readonly string[]): boolean {
  return roles.some((role) => role === 'admin' || role === 'manager');
}

/**
 * Project the internal purchase-order model into the exact fields permitted
 * for the manager/admin print template. Never pass the source model to markup.
 */
export function projectPurchaseOrderPrintDocument(
  order: PurchaseOrder,
  roles: readonly string[],
): PurchaseOrderPrintDocument | null {
  if (!canPrintPurchaseOrders(roles)) return null;

  return {
    purchase_order_number: order.purchase_order_number,
    supplier_name: order.supplier_name,
    warehouse_name: order.warehouse_name,
    status: order.status,
    created_at: order.created_at,
    total_cost: order.total_cost,
    items: order.items.map((item) => ({
      item_code: item.item_code,
      product_name: item.product_name,
      unit: item.unit,
      quantity_ordered: item.quantity_ordered,
      quantity_received: item.quantity_received,
      remaining_quantity: item.remaining_quantity,
      unit_cost: item.unit_cost,
      line_total: item.line_total,
    })),
  };
}

/**
 * Build a role-gated print projection for the filtered purchase-order list.
 * IDs, actor metadata, internal notes, and cancellation reasons are omitted.
 */
export function projectPurchaseOrderPrintResults(
  orders: readonly PurchaseOrder[],
  filterLabel: string,
  roles: readonly string[],
): PurchaseOrderPrintResults | null {
  if (!canPrintPurchaseOrders(roles)) return null;

  return {
    filter_label: filterLabel,
    orders: orders.map((order) => ({
      purchase_order_number: order.purchase_order_number,
      supplier_name: order.supplier_name,
      warehouse_name: order.warehouse_name,
      status: order.status,
      created_at: order.created_at,
      item_count: order.items.length,
      total_cost: order.total_cost,
    })),
  };
}
