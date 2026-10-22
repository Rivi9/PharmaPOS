import { round2 } from '../../../shared/money'

/**
 * The sales ledger: what each sale line and each refund contributed, in money.
 *
 * Every figure the reports show — the dashboard, the Sales Report, the P&L and
 * the `product_sales_daily` rollup they read — is derived from the functions in
 * this file, so they cannot drift apart. Before, `createSale`, the void, the
 * refund, the nightly rebuild and the Sales Report each did their own arithmetic:
 * the sale ignored the sale-level discount, the void reversed the gross while the
 * sale had added the net, the rebuild forgot refunds, and the Sales Report
 * ignored partial refunds — four reports, four different "sales" figures for
 * the same day.
 *
 * Conventions:
 * - `gross` is money the customer paid (VAT included, after the sale discount).
 * - `net` is `gross - tax`: revenue. VAT is owed to the revenue authority.
 * - A refund is booked against the day of the SALE it reverses, like the void,
 *   so a refund never makes a past day's figures disagree with its rollup.
 * - Dates are LOCAL calendar dates (`date(created_at, 'localtime')`): the shop
 *   runs at UTC+5:30, and a sale at 02:00 belongs to the day it was rung up.
 *
 * No Electron or better-sqlite3 imports, so the unit tests can run it against
 * `node:sqlite`, and the schema migration can run it before the app is up.
 */

/** The statement surface shared by better-sqlite3 and node:sqlite. */
interface Statement {
  all(...params: unknown[]): unknown[]
  run(...params: unknown[]): unknown
}
export interface SqlHandle {
  prepare(sql: string): Statement
}

/** A `sale_items` row, as far as money is concerned. */
export interface LedgerLine {
  quantity: number
  line_total: number
  /** This line's share of the sale-level discount. */
  discount_amount: number
  tax_amount: number
  cost_price: number
}

export interface LedgerAmounts {
  gross: number
  tax: number
  net: number
  cost: number
  profit: number
}

/** What one sale line added to the books. */
export function saleLineAmounts(line: LedgerLine): LedgerAmounts {
  const gross = round2(line.line_total - (line.discount_amount ?? 0))
  const tax = round2(line.tax_amount ?? 0)
  const net = round2(gross - tax)
  const cost = round2((line.cost_price ?? 0) * line.quantity)
  return { gross, tax, net, cost, profit: round2(net - cost) }
}

/**
 * What refunding `quantity` units of a line takes back off the books — priced
 * from the line as sold (after its discount share), never from the caller.
 */
export function refundLineAmounts(line: LedgerLine, quantity: number): LedgerAmounts {
  if (!(line.quantity > 0)) return { gross: 0, tax: 0, net: 0, cost: 0, profit: 0 }
  const gross = round2(((line.line_total - (line.discount_amount ?? 0)) / line.quantity) * quantity)
  const tax = round2(((line.tax_amount ?? 0) / line.quantity) * quantity)
  const net = round2(gross - tax)
  const cost = round2((line.cost_price ?? 0) * quantity)
  return { gross, tax, net, cost, profit: round2(net - cost) }
}

export interface LedgerEntry extends LedgerAmounts {
  /** Local calendar date of the sale. */
  date: string
  sale_id: string
  product_id: string
  /** Units: positive for a sale line, negative for a refund. Money likewise. */
  quantity: number
  kind: 'sale' | 'refund'
}

export interface LedgerSale {
  id: string
  date: string
  payment_method: string
}

/**
 * Ledger entries for the COMPLETED sales whose local date is in `range` (all of
 * them when omitted). Voided sales contribute nothing; a fully refunded sale is
 * status 'refunded' and nets to nothing, so it is left out too. A partially
 * refunded sale stays 'completed', and its refunds come back as negative entries.
 */
export function saleLedger(
  db: SqlHandle,
  range?: { start: string; end: string }
): { sales: LedgerSale[]; entries: LedgerEntry[] } {
  const where = range ? `AND date(s.created_at, 'localtime') BETWEEN ? AND ?` : ''
  const params = range ? [range.start, range.end] : []

  const sales = db
    .prepare(
      `SELECT s.id, date(s.created_at, 'localtime') AS date, s.payment_method
       FROM sales s WHERE s.status = 'completed' ${where}`
    )
    .all(...params) as LedgerSale[]

  const lines = db
    .prepare(
      `SELECT si.sale_id, si.product_id, si.quantity, si.line_total,
              COALESCE(si.discount_amount, 0) AS discount_amount,
              COALESCE(si.tax_amount, 0) AS tax_amount,
              COALESCE(si.cost_price, 0) AS cost_price,
              date(s.created_at, 'localtime') AS date
       FROM sale_items si JOIN sales s ON s.id = si.sale_id
       WHERE s.status = 'completed' ${where}
       ORDER BY si.sale_id, si.rowid`
    )
    .all(...params) as Array<LedgerLine & { sale_id: string; product_id: string; date: string }>

  const refunds = db
    .prepare(
      `SELECT r.sale_id, r.items
       FROM sale_refunds r JOIN sales s ON s.id = r.sale_id
       WHERE s.status = 'completed' ${where}`
    )
    .all(...params) as Array<{ sale_id: string; items: string }>

  const entries: LedgerEntry[] = []
  const linesBySale = new Map<string, typeof lines>()
  for (const line of lines) {
    const list = linesBySale.get(line.sale_id) ?? []
    list.push(line)
    linesBySale.set(line.sale_id, list)
    entries.push({
      ...saleLineAmounts(line),
      date: line.date,
      sale_id: line.sale_id,
      product_id: line.product_id,
      quantity: line.quantity,
      kind: 'sale'
    })
  }

  for (const refund of refunds) {
    let items: Array<{ product_id: string; quantity: number }>
    try {
      items = JSON.parse(refund.items)
    } catch {
      continue // a malformed historical row; createRefund skips it the same way
    }
    for (const item of Array.isArray(items) ? items : []) {
      // createRefund matches a refund item to the first line of that product.
      const line = linesBySale.get(refund.sale_id)?.find((l) => l.product_id === item.product_id)
      const quantity = Number(item.quantity)
      if (!line || !(quantity > 0)) continue
      const back = refundLineAmounts(line, quantity)
      entries.push({
        gross: -back.gross,
        tax: -back.tax,
        net: -back.net,
        cost: -back.cost,
        profit: -back.profit,
        date: line.date,
        sale_id: refund.sale_id,
        product_id: item.product_id,
        quantity: -quantity,
        kind: 'refund'
      })
    }
  }

  return { sales, entries }
}

/**
 * Rebuild `product_sales_daily` from the sales themselves, for the local dates
 * in `range` (or for everything). Idempotent: the rows for the range are
 * replaced, never added to. The caller owns the transaction.
 *
 * Refunds are subtracted. The old rebuild summed `status = 'completed'` lines
 * only, and a partially refunded sale stays 'completed' — so opening Analytics,
 * which re-runs this for the last week, quietly put every partial refund back
 * into the P&L.
 */
export function rebuildProductSalesDaily(
  db: SqlHandle,
  range?: { start: string; end: string }
): number {
  const { entries } = saleLedger(db, range)

  const rows = new Map<
    string,
    { date: string; product_id: string; qty: number; net: number; cost: number; profit: number }
  >()
  for (const e of entries) {
    const key = `${e.date}\u0000${e.product_id}`
    const row = rows.get(key) ?? {
      date: e.date,
      product_id: e.product_id,
      qty: 0,
      net: 0,
      cost: 0,
      profit: 0
    }
    row.qty += e.quantity
    row.net += e.net
    row.cost += e.cost
    row.profit += e.profit
    rows.set(key, row)
  }

  if (range) {
    db.prepare('DELETE FROM product_sales_daily WHERE date BETWEEN ? AND ?').run(
      range.start,
      range.end
    )
  } else {
    db.prepare('DELETE FROM product_sales_daily').run()
  }

  const insert = db.prepare(
    `INSERT INTO product_sales_daily (date, product_id, quantity_sold, revenue, cost, profit)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  for (const r of rows.values()) {
    insert.run(r.date, r.product_id, r.qty, round2(r.net), round2(r.cost), round2(r.profit))
  }
  return rows.size
}
