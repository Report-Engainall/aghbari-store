export type InventoryMetricBalance = {
  quantity_available: unknown;
  reorder_point: unknown;
};

/**
 * Count low-stock rows from sellable stock, not gross on-hand quantity.
 * Any malformed/incomplete balance invalidates the aggregate, because a partial count
 * can mislead purchasing as much as silently coercing an unknown quantity to zero.
 */
export function countLowStockBalances(rows: readonly InventoryMetricBalance[]): number | null {
  let count = 0;

  for (const row of rows) {
    const available = row.quantity_available;
    const threshold = row.reorder_point;

    if (typeof available !== "number" || !Number.isFinite(available)) return null;
    if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0) return null;

    if (available <= threshold) count += 1;
  }

  return count;
}


export type InventoryAvailabilityStatus = 'low' | 'adequate' | 'unknown';

/**
 * Only compare observed sellable stock to an observed reorder threshold.
 * A missing balance or threshold is not equivalent to zero stock or a zero threshold.
 */
export function getInventoryAvailabilityStatus(
  available: unknown,
  reorderPoint: unknown,
): InventoryAvailabilityStatus {
  if (typeof available !== 'number' || !Number.isFinite(available)) return 'unknown';
  if (typeof reorderPoint !== 'number' || !Number.isFinite(reorderPoint) || reorderPoint < 0) return 'unknown';
  return available <= reorderPoint ? 'low' : 'adequate';
}
