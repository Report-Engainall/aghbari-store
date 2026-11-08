export type DashboardOrderRow = {
  status: string;
  total_amount: unknown;
};

export type DashboardOrderMetrics = {
  orderCount: number;
  processingCount: number;
  totalSales: number | null;
  invalidOrderAmountCount: number;
  totalSalesIssue: 'invalid_amount' | 'overflow' | null;
};

function parseMoney(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > Number.MAX_SAFE_INTEGER) return null;
  return parsed;
}

/**
 * A dashboard may display a measured zero only when the complete observed set supports it.
 * Missing, malformed or overflowing order amounts invalidate the total instead of becoming zero.
 */
export function summarizeDashboardOrders(input: unknown): DashboardOrderMetrics {
  if (!Array.isArray(input)) {
    throw new Error('استجابة الطلبات غير صالحة؛ لم يتم احتساب مؤشرات المبيعات.');
  }

  let total = 0;
  let invalidOrderAmountCount = 0;
  let overflow = false;
  let processingCount = 0;

  for (const value of input) {
    if (!value || typeof value !== 'object') {
      throw new Error('تحتوي استجابة الطلبات على سجل غير صالح؛ تم إيقاف احتساب المؤشرات.');
    }
    const row = value as Record<string, unknown>;
    if (typeof row.status !== 'string') {
      throw new Error('حالة أحد الطلبات غير صالحة؛ لم يتم تأكيد مؤشرات الطلبات.');
    }
    if (row.status === 'processing' || row.status === 'pending') processingCount += 1;

    const amount = parseMoney(row.total_amount);
    if (amount === null) {
      invalidOrderAmountCount += 1;
      continue;
    }

    total += amount;
    if (!Number.isFinite(total) || total > Number.MAX_SAFE_INTEGER) overflow = true;
  }

  const totalSalesIssue: DashboardOrderMetrics['totalSalesIssue'] =
    invalidOrderAmountCount > 0 ? 'invalid_amount' : overflow ? 'overflow' : null;

  return {
    orderCount: input.length,
    processingCount,
    totalSales: totalSalesIssue === null ? total : null,
    invalidOrderAmountCount,
    totalSalesIssue,
  };
}

export function dashboardSalesDisplay(
  metrics: Pick<DashboardOrderMetrics, 'totalSales' | 'invalidOrderAmountCount' | 'totalSalesIssue'>,
  formatCurrency: (value: number) => string,
): string {
  if (metrics.totalSales !== null) return formatCurrency(metrics.totalSales);
  if (metrics.totalSalesIssue === 'invalid_amount') {
    return 'غير مكتمل — ' + metrics.invalidOrderAmountCount.toLocaleString('ar-YE') + ' مبلغ غير صالح';
  }
  return 'غير متاح — تعذر جمع المبالغ بأمان';
}

export function dashboardAverageOrderDisplay(
  metrics: Pick<DashboardOrderMetrics, 'totalSales' | 'orderCount' | 'invalidOrderAmountCount' | 'totalSalesIssue'>,
  formatCurrency: (value: number) => string,
): string {
  if (metrics.totalSales === null) {
    return dashboardSalesDisplay(metrics, formatCurrency);
  }
  if (metrics.orderCount === 0) return 'غير متاح — لا توجد طلبات';
  return formatCurrency(metrics.totalSales / metrics.orderCount);
}
