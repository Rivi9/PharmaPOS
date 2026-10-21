import { round2 } from '../../shared/money'
import { normalisePhone } from '../../shared/customers'
import { refundLineAmounts, saleLineAmounts } from './analytics/ledger'
import {
  SALE_LIST_STATUSES,
  type RefundQuote,
  type SaleDetail,
  type SaleListRow,
  type SalesPageQuery
} from '../../shared/sales-history'

export type { SalesPageQuery, SaleListRow, SaleDetail, RefundQuote }

/**
 * Sales history: the paged list behind the Sales screen, one sale in full, and
 * the rules for voiding and refunding it.
 *
 * The rules live here, next to the queries, so the screen and the main process
 * cannot disagree: `voidSale` refuses with `voidBlockReason`, the detail view
 * greys the button out with the same function, and the refund amount the
 * screen shows is `quoteRefund` — the very function `createRefund` prices with.
 *
 * No Electron or better-sqlite3 imports, so the unit tests can run it against
 * `node:sqlite`.
 */

interface Statement {
  all(...params: unknown[]): unknown[]
  get(...params: unknown[]): unknown
}
export interface SqlHandle {
  prepare(sql: string): Statement
}

const MAX_PAGE = 200
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The list status, from the stored status and whether any refund exists. */
const STATUS_SQL = `CASE
  WHEN s.status = 'voided' THEN 'voided'
  WHEN s.status = 'refunded' THEN 'refunded'
  WHEN EXISTS (SELECT 1 FROM sale_refunds x WHERE x.sale_id = s.id) THEN 'part_refunded'
  ELSE 'completed' END`

/**
 * One page of sales, newest first, filtered and counted in SQL — the same shape
 * as `listProductsPage` (H18): never the whole table over IPC.
 *
 * Dates are the LOCAL calendar day of the sale, `date(created_at, 'localtime')`,
 * the convention every report uses (see analytics/ledger.ts). Filtering on the
 * UTC date put a sale rung up at 00:30 in Colombo on the previous day.
 */
export function listSalesPage(
  db: SqlHandle,
  query: SalesPageQuery = {}
): { rows: SaleListRow[]; total: number } {
  const limit = Math.min(Math.max(1, Math.floor(query.limit ?? 50)), MAX_PAGE)
  const offset = Math.max(0, Math.floor(query.offset ?? 0))

  const where: string[] = []
  const params: unknown[] = []

  const term = String(query.search ?? '')
    .replace(/[%_]/g, '')
    .trim()
  if (term) {
    const like = `%${term}%`
    const or = [`s.receipt_number LIKE ?`, `COALESCE(c.name, s.customer_name) LIKE ?`]
    params.push(like, like)
    // A phone is stored normalised (0771234567), and typed any old way at the
    // counter ("+94 77 123 4567"), so a number-looking search is normalised the
    // same way before it is matched.
    if (/^[\d\s+()-]+$/.test(term)) {
      const digits = normalisePhone(term)
      if (digits && digits.length >= 3) {
        or.push(`s.customer_phone LIKE ?`, `c.phone LIKE ?`)
        params.push(`%${digits}%`, `%${digits}%`)
      }
    }
    where.push(`(${or.join(' OR ')})`)
  }
  if (query.startDate && LOCAL_DATE.test(query.startDate)) {
    where.push(`date(s.created_at, 'localtime') >= ?`)
    params.push(query.startDate)
  }
  if (query.endDate && LOCAL_DATE.test(query.endDate)) {
    where.push(`date(s.created_at, 'localtime') <= ?`)
    params.push(query.endDate)
  }
  if (query.status && SALE_LIST_STATUSES.includes(query.status)) {
    where.push(`${STATUS_SQL} = ?`)
    params.push(query.status)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const from = `FROM sales s LEFT JOIN customers c ON c.id = s.customer_id`

  const { total } = db.prepare(`SELECT COUNT(*) AS total ${from} ${whereSql}`).get(...params) as {
    total: number
  }

  const rows = db
    .prepare(
      `SELECT s.id, s.receipt_number, s.created_at, u.full_name AS cashier_name,
              COALESCE(c.name, s.customer_name) AS customer_name,
              COALESCE(c.phone, s.customer_phone) AS customer_phone,
              s.payment_method, s.total,
              COALESCE((SELECT SUM(r.total_refunded) FROM sale_refunds r WHERE r.sale_id = s.id), 0)
                AS refunded,
              ${STATUS_SQL} AS status
       ${from}
       LEFT JOIN users u ON u.id = s.user_id
       ${whereSql}
       ORDER BY s.created_at DESC, s.receipt_number DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as SaleListRow[]

  return { rows: rows.map((r) => ({ ...r, refunded: round2(r.refunded) })), total }
}

/**
 * Why a sale cannot be voided, or null when it can.
 *
 * A void erases a sale as if it was never rung up: stock back, rollup reversed,
 * the drawer no longer expects the cash. That is right for a mis-ring at the
 * counter, today. A sale from an earlier day sits in a day whose reports were
 * already read (and a shift whose drawer was already counted), so it is
 * refunded instead — a refund is paid from today's drawer and leaves the
 * original day as it was. A sale with refunds against it has already put part
 * of itself back; voiding it too would do that twice.
 */
export function voidBlockReason(sale: {
  status: string
  refundCount: number
  sameDay: boolean
}): string | null {
  if (sale.status === 'voided') return 'This sale has already been voided'
  if (sale.status === 'refunded') return 'This sale has been refunded in full'
  if (sale.status !== 'completed') return `Cannot void a ${sale.status} sale`
  if (sale.refundCount > 0) {
    return 'This sale has refunds against it — refund the remaining items instead'
  }
  if (!sale.sameDay) return 'Only today’s sales can be voided — refund it instead'
  return null
}

/** The fields `voidBlockReason` needs, read the same way for the check and the screen. */
export function voidCheck(
  db: SqlHandle,
  saleId: string
): { status: string; refundCount: number; sameDay: boolean } | null {
  const row = db
    .prepare(
      `SELECT status,
              (SELECT COUNT(*) FROM sale_refunds r WHERE r.sale_id = s.id) AS refund_count,
              date(created_at, 'localtime') = date('now', 'localtime') AS same_day
       FROM sales s WHERE id = ?`
    )
    .get(saleId) as { status: string; refund_count: number; same_day: number } | undefined
  return row
    ? { status: row.status, refundCount: row.refund_count, sameDay: row.same_day === 1 }
    : null
}

/** A `sale_items` row as the refund pricing reads it. */
export interface SoldLine {
  id: string
  product_id: string
  batch_id: string | null
  quantity: number
  unit_price: number
  line_total: number
  discount_amount: number
  tax_amount: number
  cost_price: number
}

function soldLines(db: SqlHandle, saleId: string): SoldLine[] {
  return db
    .prepare(
      `SELECT id, product_id, batch_id, quantity, unit_price, line_total,
              COALESCE(discount_amount, 0) AS discount_amount,
              COALESCE(tax_amount, 0) AS tax_amount,
              COALESCE(cost_price, 0) AS cost_price
       FROM sale_items WHERE sale_id = ? ORDER BY rowid`
    )
    .all(saleId) as SoldLine[]
}

/** Units already refunded, per product (refund items are keyed by product). */
function refundedByProduct(db: SqlHandle, saleId: string): Map<string, number> {
  const rows = db.prepare('SELECT items FROM sale_refunds WHERE sale_id = ?').all(saleId) as Array<{
    items: string
  }>
  const refunded = new Map<string, number>()
  for (const row of rows) {
    try {
      for (const i of JSON.parse(row.items) as Array<{ product_id: string; quantity: number }>) {
        refunded.set(i.product_id, (refunded.get(i.product_id) ?? 0) + Number(i.quantity))
      }
    } catch {
      /* a malformed historical row must not block a legitimate refund */
    }
  }
  return refunded
}

export interface RefundRequestLine {
  product_id: string
  quantity: number
  product_name?: string
}

/**
 * Validate and price a refund without writing anything.
 *
 * `createRefund` prices with this, and the Sales screen previews with it, so the
 * figure shown before the button is pressed is the figure booked. Priced from
 * the ORIGINAL sale lines (after their discount share), never from the caller.
 * Refund items match the first line of their product, as they always have.
 */
export function quoteRefund(
  db: SqlHandle,
  saleId: string,
  items: RefundRequestLine[]
): RefundQuote & { sold: SoldLine[]; alreadyRefunded: Map<string, number> } {
  const sale = db
    .prepare(
      `SELECT status, total, payment_method, cash_received, change_given FROM sales WHERE id = ?`
    )
    .get(saleId) as
    | {
        status: string
        total: number
        payment_method: string
        cash_received: number | null
        change_given: number | null
      }
    | undefined
  if (!sale) throw new Error('Sale not found')
  if (sale.status === 'voided') throw new Error('Cannot refund a voided sale')

  const sold = soldLines(db, saleId)
  const alreadyRefunded = refundedByProduct(db, saleId)

  // Validate against the original sale. The caller's items were previously
  // trusted verbatim, so a sale could be refunded repeatedly and for more
  // than was ever bought.
  let amount = 0
  let tax = 0
  const lines: RefundQuote['lines'] = []
  const counted = new Map(alreadyRefunded)
  for (const item of items) {
    const soldLine = sold.find((s) => s.product_id === item.product_id)
    const name = item.product_name || 'That item'
    if (!soldLine) throw new Error(`${name} was not part of this sale`)
    const quantity = Number(item.quantity)
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new Error('Refund quantity must be a whole number greater than zero')
    }
    // Counted across this request too, so the same product listed twice
    // cannot together exceed what was sold.
    const remaining = soldLine.quantity - (counted.get(item.product_id) ?? 0)
    if (quantity > remaining) {
      throw new Error(`Cannot refund ${quantity} of ${name} — only ${remaining} remain refundable`)
    }
    counted.set(item.product_id, (counted.get(item.product_id) ?? 0) + quantity)
    const back = refundLineAmounts(soldLine, quantity)
    amount = round2(amount + back.gross)
    tax = round2(tax + back.tax)
    lines.push({ product_id: item.product_id, quantity, gross: back.gross, tax: back.tax })
  }

  // The refund goes back the way the sale was paid: cash from the drawer, card
  // to the card, a mixed sale in proportion to the cash it was paid with.
  const cashShare =
    sale.payment_method === 'cash'
      ? 1
      : sale.payment_method === 'mixed' && sale.total > 0
        ? Math.min(
            Math.max(((sale.cash_received ?? 0) - (sale.change_given ?? 0)) / sale.total, 0),
            1
          )
        : 0
  const cash = round2(amount * cashShare)

  const totalSold = sold.reduce((s, l) => s + l.quantity, 0)
  const totalRefunded = [...counted.values()].reduce((s, q) => s + q, 0)

  return {
    lines,
    amount,
    tax,
    cash,
    card: round2(amount - cash),
    fully_refunded: totalRefunded >= totalSold,
    sold,
    alreadyRefunded
  }
}

/** One sale in full, for the Sales screen's detail panel. */
export function getSaleDetail(db: SqlHandle, saleId: string): SaleDetail | null {
  const row = db
    .prepare(
      `SELECT s.id, s.receipt_number, s.created_at, ${STATUS_SQL} AS status,
              u.full_name AS cashier_name, s.customer_id,
              COALESCE(c.name, s.customer_name) AS customer_name,
              COALESCE(c.phone, s.customer_phone) AS customer_phone,
              s.subtotal, s.discount_amount, s.tax_amount, s.total, s.payment_method,
              COALESCE(s.cash_received, 0) AS cash_received,
              COALESCE(s.card_received, 0) AS card_received,
              COALESCE(s.change_given, 0) AS change_given,
              s.void_reason, s.voided_at, vu.full_name AS voided_by_name
       FROM sales s
       LEFT JOIN users u ON u.id = s.user_id
       LEFT JOIN users vu ON vu.id = s.voided_by
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ?`
    )
    .get(saleId) as Omit<SaleDetail['sale'], 'refunded' | 'net_total' | 'vat_rate'> | undefined
  if (!row) return null

  const items = db
    .prepare(
      // The snapshot first, the catalogue only for rows that predate it (M9).
      `SELECT si.id, si.product_id,
              COALESCE(si.product_name, p.name, '(deleted product)') AS product_name,
              si.quantity, si.unit_price, si.line_total,
              COALESCE(si.discount_amount, 0) AS discount_amount,
              COALESCE(si.tax_amount, 0) AS tax_amount,
              COALESCE(si.cost_price, 0) AS cost_price,
              COALESCE(si.tax_rate, 0) AS tax_rate
       FROM sale_items si LEFT JOIN products p ON p.id = si.product_id
       WHERE si.sale_id = ? ORDER BY si.rowid`
    )
    .all(saleId) as Array<{
    id: string
    product_id: string
    product_name: string
    quantity: number
    unit_price: number
    line_total: number
    discount_amount: number
    tax_amount: number
    cost_price: number
    tax_rate: number
  }>

  const refundRows = db
    .prepare(
      `SELECT r.id, r.created_at, r.items, r.total_refunded, COALESCE(r.tax_refunded, 0) AS tax_refunded,
              COALESCE(r.cash_refunded, 0) AS cash_refunded, r.restock, r.reason,
              u.full_name AS user_name
       FROM sale_refunds r LEFT JOIN users u ON u.id = r.user_id
       WHERE r.sale_id = ? ORDER BY r.created_at, r.rowid`
    )
    .all(saleId) as Array<{
    id: string
    created_at: string
    items: string
    total_refunded: number
    tax_refunded: number
    cash_refunded: number
    restock: number
    reason: string | null
    user_name: string | null
  }>

  const nameOf = new Map(items.map((i) => [i.product_id, i.product_name]))
  const refunds: SaleDetail['refunds'] = refundRows.map((r) => {
    let parsed: Array<{ product_id: string; quantity: number }> = []
    try {
      const raw = JSON.parse(r.items)
      if (Array.isArray(raw)) parsed = raw
    } catch {
      /* a malformed historical row; listed without its items */
    }
    return {
      id: r.id,
      created_at: r.created_at,
      user_name: r.user_name,
      total_refunded: round2(r.total_refunded),
      tax_refunded: round2(r.tax_refunded),
      cash_refunded: round2(r.cash_refunded),
      restocked: r.restock === 1,
      reason: r.reason,
      items: parsed.map((i) => ({
        product_id: i.product_id,
        product_name: nameOf.get(i.product_id) ?? '(item not on this sale)',
        quantity: Number(i.quantity)
      }))
    }
  })

  // Refunds match the FIRST line of their product (createRefund's rule), so the
  // refunded and refundable counts are given against that line.
  const refunded = refundedByProduct(db, saleId)
  const seen = new Set<string>()
  const voided = row.status === 'voided'
  const detailItems: SaleDetail['items'] = items.map((i) => {
    const first = !seen.has(i.product_id)
    seen.add(i.product_id)
    const back = first ? Math.min(refunded.get(i.product_id) ?? 0, i.quantity) : 0
    return {
      id: i.id,
      product_id: i.product_id,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      line_total: i.line_total,
      discount_amount: round2(i.discount_amount),
      paid: saleLineAmounts(i).gross,
      tax_amount: round2(i.tax_amount),
      refunded_quantity: back,
      refundable_quantity: voided || !first ? 0 : Math.max(i.quantity - back, 0)
    }
  })

  const refundedTotal = round2(refunds.reduce((s, r) => s + r.total_refunded, 0))
  const check = voidCheck(db, saleId)!
  const anythingLeft = detailItems.some((i) => i.refundable_quantity > 0)

  return {
    sale: {
      ...row,
      refunded: refundedTotal,
      net_total: voided ? 0 : round2(row.total - refundedTotal),
      vat_rate: items[0]?.tax_rate ?? 0
    },
    items: detailItems,
    refunds,
    void_blocked: voidBlockReason(check),
    refund_blocked: voided
      ? 'A voided sale cannot be refunded'
      : anythingLeft
        ? null
        : 'Everything on this sale has already been refunded'
  }
}
