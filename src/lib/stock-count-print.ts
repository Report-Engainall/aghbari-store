import type { InventoryStockCountLine, InventoryStockCountSession } from '@/lib/api';

export type StockCountPrintItem = {
  itemCode: string;
  productName: string;
  unit: string | null;
  expectedQuantity: number;
  reservedQuantity: number;
  countedQuantity: number | null;
  variance: number | null;
};

export type StockCountPrintDocument = {
  warehouseName: string;
  statusLabel: string;
  startedAt: string;
  totalLines: number;
  countedLines: number;
  items: StockCountPrintItem[];
};

const STATUS_LABELS: Record<InventoryStockCountSession['status'], string> = {
  open: 'مفتوحة',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
};

/**
 * Printable stock-count DTO. The page passes the existing staff visibility
 * authorization; this projection never includes tenant/session/product/actor
 * identifiers, idempotency keys, notes, lifecycle reasons, or financial data.
 */
export function projectStockCountPrintDocument(
  session: InventoryStockCountSession,
  lines: readonly InventoryStockCountLine[],
  warehouseName: string | null,
  canView: boolean,
): StockCountPrintDocument | null {
  if (!canView || !warehouseName?.trim()) return null;

  const items = lines.map((line): StockCountPrintItem => ({
    itemCode: line.product_code,
    productName: line.product_name,
    unit: line.unit,
    expectedQuantity: line.expected_quantity,
    reservedQuantity: line.expected_reserved_quantity,
    countedQuantity: line.counted_quantity,
    // Print only the persisted count. Unsaved input drafts are not part of this DTO.
    variance: line.counted_quantity === null
      ? null
      : line.counted_quantity - line.expected_quantity,
  }));

  return {
    warehouseName: warehouseName.trim(),
    statusLabel: STATUS_LABELS[session.status],
    startedAt: session.started_at,
    totalLines: items.length,
    countedLines: items.filter((item) => item.countedQuantity !== null).length,
    items,
  };
}
