export type OrderStatusBadgeTone = 'success' | 'error' | 'warning' | 'info'

const SUCCESS_ORDER_STATUSES = new Set(['delivered', 'approved', 'invoiced'])
const ERROR_ORDER_STATUSES = new Set(['cancelled', 'rejected'])

export function getOrderStatusBadgeClass(status: string): string {
  if (SUCCESS_ORDER_STATUSES.has(status)) return 'badge-success'
  if (ERROR_ORDER_STATUSES.has(status)) return 'badge-error'
  if (status === 'returned') return 'badge-warning'
  return 'badge-info'
}
