import type { SaleListStatus } from '../../../../shared/sales-history'

export const STATUS_LABELS: Record<SaleListStatus, string> = {
  completed: 'Completed',
  part_refunded: 'Part refunded',
  refunded: 'Refunded',
  voided: 'Voided'
}

export const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  card: 'Card',
  mixed: 'Cash + card'
}

/**
 * A stored timestamp as a Date. createSale writes ISO strings; rows written by
 * SQLite's datetime('now') are UTC with a space and no zone marker, which V8
 * would otherwise read as local time.
 */
export function parseStoredDate(dt: string): Date {
  return new Date(dt.includes('T') ? dt : dt.replace(' ', 'T') + 'Z')
}

/** Local date and time, e.g. "21 Oct 2026, 02:15 pm". */
export function formatDateTime(dt: string): string {
  return parseStoredDate(dt).toLocaleString('en-LK', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
