import type { InventoryTransferHistoryRow } from '@/lib/api';

/**
 * The warehouse transfer print template is a fixed, non-financial projection.
 * Do not pass backend identifiers or actor UUIDs into printable markup.
 */
export type InventoryTransferPrintRow = {
  created_at: string;
  item_code: string | null;
  product_name: string | null;
  unit: string | null;
  source_warehouse_name: string | null;
  destination_warehouse_name: string | null;
  quantity: number;
  transfer_type: string;
  reason: string;
};

export function projectInventoryTransferPrintRow(row: InventoryTransferHistoryRow): InventoryTransferPrintRow {
  const batchLineCount = Number.isSafeInteger(row.batch_line_count) && (row.batch_line_count ?? 0) > 0
    ? row.batch_line_count!
    : 1;
  return {
    created_at: row.created_at,
    item_code: row.item_code,
    product_name: row.product_name,
    unit: row.unit,
    source_warehouse_name: row.source_warehouse_name,
    destination_warehouse_name: row.destination_warehouse_name,
    quantity: row.quantity,
    transfer_type: row.batch_id ? 'دفعة متعددة (' + batchLineCount + ' أصناف)' : 'تحويل مفرد',
    reason: row.reason,
  };
}
