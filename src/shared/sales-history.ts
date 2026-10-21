/**
 * Shapes shared by the Sales screen and the main process's sales-history
 * service (src/main/services/sales-history.ts), which owns the queries and the
 * void / refund rules.
 */

/** What the list shows. A partly refunded sale is still 'completed' in the table. */
export type SaleListStatus = 'completed' | 'part_refunded' | 'refunded' | 'voided'
export const SALE_LIST_STATUSES: SaleListStatus[] = [
  'completed',
  'part_refunded',
  'refunded',
  'voided'
]

export interface SalesPageQuery {
  /** Receipt number, customer name or phone (any format — it is normalised). */
  search?: string
  /** Local calendar dates, `YYYY-MM-DD`, inclusive. */
  startDate?: string
  endDate?: string
  status?: SaleListStatus
  limit?: number
  offset?: number
}

export interface SaleListRow {
  id: string
  receipt_number: string
  created_at: string
  cashier_name: string | null
  customer_name: string | null
  customer_phone: string | null
  payment_method: string
  total: number
  refunded: number
  status: SaleListStatus
}

export interface RefundQuote {
  lines: Array<{ product_id: string; quantity: number; gross: number; tax: number }>
  /** What goes back to the customer, VAT included. */
  amount: number
  tax: number
  /** Paid out of the drawer. */
  cash: number
  /** Reversed to the card. */
  card: number
  /** Nothing would remain refundable afterwards. */
  fully_refunded: boolean
}

export interface SaleDetail {
  sale: {
    id: string
    receipt_number: string
    created_at: string
    status: SaleListStatus
    cashier_name: string | null
    customer_id: string | null
    customer_name: string | null
    customer_phone: string | null
    subtotal: number
    discount_amount: number
    tax_amount: number
    total: number
    payment_method: string
    cash_received: number
    card_received: number
    change_given: number
    void_reason: string | null
    voided_at: string | null
    voided_by_name: string | null
    refunded: number
    /** What the customer paid and kept. */
    net_total: number
    vat_rate: number
  }
  items: Array<{
    id: string
    product_id: string
    product_name: string
    quantity: number
    unit_price: number
    line_total: number
    /** This line's share of the sale-level discount. */
    discount_amount: number
    /** What was paid for the line: line_total less its discount share. */
    paid: number
    tax_amount: number
    refunded_quantity: number
    refundable_quantity: number
  }>
  refunds: Array<{
    id: string
    created_at: string
    user_name: string | null
    total_refunded: number
    tax_refunded: number
    cash_refunded: number
    restocked: boolean
    reason: string | null
    items: Array<{ product_id: string; product_name: string; quantity: number }>
  }>
  /** Null when the sale can be voided; otherwise why not. */
  void_blocked: string | null
  /** Null when something can still be refunded; otherwise why not. */
  refund_blocked: string | null
}

/** `sales.refundPreview`: the quote, and whether there is a drawer to pay it from. */
export interface RefundPreview extends RefundQuote {
  /** The signed-in user has an open shift; a refund is refused without one. */
  shift_open: boolean
}
