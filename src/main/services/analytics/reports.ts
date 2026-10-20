import { getDatabase } from '../database'
import { round2 } from '../../../shared/money'
import { saleLedger, type LedgerEntry } from './ledger'

/**
 * Every money figure here is NET of VAT, after the sale discount and after
 * refunds — the same basis as the dashboard and the P&L, which read the
 * product_sales_daily rollup built from the same ledger — except where a field
 * says `gross` (VAT included: what the customer paid) and `payment_methods`,
 * which are amounts tendered.
 */
export interface SalesReportData {
  start_date: string
  end_date: string
  /** Net sales: excluding VAT, after discounts and refunds. */
  total_sales: number
  /** What the customers paid, VAT included, after refunds. */
  total_gross_sales: number
  /** VAT contained in the sales, after refunds. */
  total_vat: number
  /** Refunded against sales in the period, VAT included. */
  total_refunded: number
  total_profit: number
  total_cost: number
  total_transactions: number
  /** Units sold less units refunded. */
  total_items_sold: number
  /** Net sales per transaction. */
  avg_transaction: number
  daily_breakdown: Array<{
    date: string
    /** Net, like total_sales. */
    sales: number
    profit: number
    transactions: number
  }>
  top_products: Array<{
    product_name: string
    quantity: number
    /** Net, like total_sales. */
    revenue: number
    profit: number
  }>
  payment_methods: Array<{
    method: string
    count: number
    /** Tendered, VAT included, after refunds. */
    amount: number
  }>
}

export interface InventoryValuationData {
  /** Sellable stock only, at the batch's own selling price. */
  total_value: number
  /** Sellable stock at the price each batch was actually bought for. */
  total_cost: number
  total_items: number
  /** Expired stock, reported separately — it is a write-off, not an asset. */
  expired_value: number
  expired_cost: number
  expired_units: number
  by_category: Array<{
    category_name: string
    item_count: number
    total_quantity: number
    total_value: number
    total_cost: number
  }>
  by_product: Array<{
    product_name: string
    quantity: number
    cost_per_unit: number
    unit_price: number
    total_cost: number
    total_value: number
  }>
}

export interface ProfitLossData {
  start_date: string
  end_date: string
  total_revenue: number
  total_cost: number
  gross_profit: number
  gross_margin_percent: number
  by_category: Array<{
    category_name: string
    revenue: number
    cost: number
    profit: number
    margin_percent: number
  }>
  by_month: Array<{
    month: string
    revenue: number
    cost: number
    profit: number
  }>
}

/**
 * Generate comprehensive sales report for date range
 *
 * Built from the sales ledger rather than from `sales.total`. The old SQL took
 * the header total of every 'completed' sale, and a partly refunded sale stays
 * 'completed' — so its refunds never left the report — while the summary was
 * labelled gross, the profit net and the top products gross: three bases on one
 * page, and none of them the P&L's. Dates are local (`date(created_at,
 * 'localtime')`), matching the local dates the Reports panel sends.
 */
export function generateSalesReport(startDate: string, endDate: string): SalesReportData {
  const db = getDatabase()
  const { sales, entries } = saleLedger(db, { start: startDate, end: endDate })

  type Totals = { gross: number; tax: number; net: number; cost: number; profit: number }
  const zero = (): Totals => ({ gross: 0, tax: 0, net: 0, cost: 0, profit: 0 })
  const add = (t: Totals, e: LedgerEntry): void => {
    t.gross += e.gross
    t.tax += e.tax
    t.net += e.net
    t.cost += e.cost
    t.profit += e.profit
  }

  const total = zero()
  let refunded = 0
  let itemsSold = 0
  const byDay = new Map<string, Totals & { transactions: number }>()
  const byProduct = new Map<string, Totals & { quantity: number }>()
  const bySale = new Map<string, Totals>()

  for (const sale of sales) {
    const day = byDay.get(sale.date) ?? { ...zero(), transactions: 0 }
    day.transactions++
    byDay.set(sale.date, day)
  }

  for (const e of entries) {
    add(total, e)
    if (e.kind === 'refund') refunded -= e.gross
    itemsSold += e.quantity

    const day = byDay.get(e.date) ?? { ...zero(), transactions: 0 }
    add(day, e)
    byDay.set(e.date, day)

    const product = byProduct.get(e.product_id) ?? { ...zero(), quantity: 0 }
    add(product, e)
    product.quantity += e.quantity
    byProduct.set(e.product_id, product)

    const sale = bySale.get(e.sale_id) ?? zero()
    add(sale, e)
    bySale.set(e.sale_id, sale)
  }

  const names = new Map(
    (db.prepare('SELECT id, name FROM products').all() as Array<{ id: string; name: string }>).map(
      (p) => [p.id, p.name]
    )
  )

  const methods = new Map<string, { count: number; amount: number }>()
  for (const sale of sales) {
    const m = methods.get(sale.payment_method) ?? { count: 0, amount: 0 }
    m.count++
    m.amount += bySale.get(sale.id)?.gross ?? 0
    methods.set(sale.payment_method, m)
  }

  const transactions = sales.length
  const netSales = round2(total.net)

  return {
    start_date: startDate,
    end_date: endDate,
    total_sales: netSales,
    total_gross_sales: round2(total.gross),
    total_vat: round2(total.tax),
    total_refunded: round2(refunded),
    total_profit: round2(total.profit),
    total_cost: round2(total.cost),
    total_transactions: transactions,
    total_items_sold: itemsSold,
    avg_transaction: transactions > 0 ? round2(netSales / transactions) : 0,
    daily_breakdown: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        sales: round2(d.net),
        profit: round2(d.profit),
        transactions: d.transactions
      })),
    top_products: [...byProduct.entries()]
      .map(([id, p]) => ({
        product_name: names.get(id) ?? '(deleted product)',
        quantity: p.quantity,
        revenue: round2(p.net),
        profit: round2(p.profit)
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    payment_methods: [...methods.entries()].map(([method, m]) => ({
      method,
      count: m.count,
      amount: round2(m.amount)
    }))
  }
}

/**
 * Generate inventory valuation report (current stock value)
 */
/**
 * What the stock on the shelves is worth.
 *
 * H28. The previous version counted **every** batch row — including expired
 * stock and batches already sold down to zero — and valued all of it at
 * `products.cost_price` and `products.unit_price` rather than the batch's own
 * figures. 500 units of an expired antibiotic at Rs. 85 inflated "Total Stock
 * Value" by Rs. 42,500 of goods that cannot legally be sold, and a product whose
 * price had changed since purchase was valued at today's price against stock
 * bought at last year's cost.
 *
 * Now: only sellable stock counts toward the totals — quantity above zero and
 * not past its expiry — priced from `stock_batches` with the product as a
 * fallback for batches that carry no price of their own. Expired stock is
 * reported separately rather than dropped, because the operator has to be able
 * to see and write off what is sitting there.
 */
export function generateInventoryValuation(): InventoryValuationData {
  const db = getDatabase()

  // Sellable: has stock left, and either no expiry or an expiry not yet reached.
  // `expiry_date = ''` is treated as "no expiry" — an empty string was stored by
  // an earlier version and sorts below every date comparison (H8).
  const SELLABLE = `sb.quantity > 0
      AND (sb.expiry_date IS NULL OR sb.expiry_date = '' OR sb.expiry_date >= date('now','localtime'))`
  const EXPIRED = `sb.quantity > 0
      AND sb.expiry_date IS NOT NULL AND sb.expiry_date <> ''
      AND sb.expiry_date < date('now','localtime')`

  // Batch price first, product price as the fallback: a batch bought at a
  // different cost must be valued at what it actually cost.
  const UNIT_COST = 'COALESCE(sb.cost_price, p.cost_price, 0)'
  const UNIT_VALUE = 'COALESCE(sb.selling_price, p.unit_price, 0)'

  const summary = db
    .prepare(
      `
    SELECT
      COUNT(DISTINCT p.id) as total_items,
      COALESCE(SUM(sb.quantity * ${UNIT_COST}), 0) as total_cost,
      COALESCE(SUM(sb.quantity * ${UNIT_VALUE}), 0) as total_value
    FROM products p
    JOIN stock_batches sb ON p.id = sb.product_id AND ${SELLABLE}
    WHERE p.is_active = 1
  `
    )
    .get() as { total_items: number; total_cost: number; total_value: number }

  const expired = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(sb.quantity), 0) as expired_units,
      COALESCE(SUM(sb.quantity * ${UNIT_COST}), 0) as expired_cost,
      COALESCE(SUM(sb.quantity * ${UNIT_VALUE}), 0) as expired_value
    FROM products p
    JOIN stock_batches sb ON p.id = sb.product_id AND ${EXPIRED}
    WHERE p.is_active = 1
  `
    )
    .get() as { expired_units: number; expired_cost: number; expired_value: number }

  const byCategory = db
    .prepare(
      `
    SELECT
      COALESCE(c.name, 'Uncategorized') as category_name,
      COUNT(DISTINCT p.id) as item_count,
      COALESCE(SUM(sb.quantity), 0) as total_quantity,
      COALESCE(SUM(sb.quantity * ${UNIT_COST}), 0) as total_cost,
      COALESCE(SUM(sb.quantity * ${UNIT_VALUE}), 0) as total_value
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    JOIN stock_batches sb ON p.id = sb.product_id AND ${SELLABLE}
    WHERE p.is_active = 1
    GROUP BY c.id, c.name
    ORDER BY total_value DESC
  `
    )
    .all() as InventoryValuationData['by_category']

  // Weighted unit figures, not the product's current price: with several batches
  // at different costs a single "cost per unit" is only meaningful as an average
  // of what is actually on the shelf.
  const byProduct = db
    .prepare(
      `
    SELECT
      p.name as product_name,
      SUM(sb.quantity) as quantity,
      ROUND(SUM(sb.quantity * ${UNIT_COST}) / SUM(sb.quantity), 2) as cost_per_unit,
      ROUND(SUM(sb.quantity * ${UNIT_VALUE}) / SUM(sb.quantity), 2) as unit_price,
      ROUND(SUM(sb.quantity * ${UNIT_COST}), 2) as total_cost,
      ROUND(SUM(sb.quantity * ${UNIT_VALUE}), 2) as total_value
    FROM products p
    JOIN stock_batches sb ON p.id = sb.product_id AND ${SELLABLE}
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY total_value DESC
  `
    )
    .all() as InventoryValuationData['by_product']

  return {
    total_value: round2(summary.total_value),
    total_cost: round2(summary.total_cost),
    total_items: summary.total_items,
    expired_value: round2(expired.expired_value),
    expired_cost: round2(expired.expired_cost),
    expired_units: expired.expired_units,
    by_category: byCategory,
    by_product: byProduct
  }
}

/**
 * Generate profit & loss report for date range
 */
export function generateProfitLossReport(startDate: string, endDate: string): ProfitLossData {
  const db = getDatabase()

  // Overall P&L
  const overall = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(psd.revenue), 0) as total_revenue,
      COALESCE(SUM(psd.cost), 0) as total_cost,
      COALESCE(SUM(psd.profit), 0) as gross_profit
    FROM product_sales_daily psd
    WHERE psd.date BETWEEN ? AND ?
  `
    )
    .get(startDate, endDate) as { total_revenue: number; total_cost: number; gross_profit: number }

  const grossMarginPercent =
    overall.total_revenue > 0 ? (overall.gross_profit / overall.total_revenue) * 100 : 0

  // By category
  const byCategory = db
    .prepare(
      `
    SELECT
      COALESCE(c.name, 'Uncategorized') as category_name,
      SUM(psd.revenue) as revenue,
      SUM(psd.cost) as cost,
      SUM(psd.profit) as profit,
      CASE
        WHEN SUM(psd.revenue) > 0 THEN (SUM(psd.profit) / SUM(psd.revenue)) * 100
        ELSE 0
      END as margin_percent
    FROM product_sales_daily psd
    JOIN products p ON psd.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE psd.date BETWEEN ? AND ?
    GROUP BY c.id, c.name
    ORDER BY profit DESC
  `
    )
    .all(startDate, endDate) as ProfitLossData['by_category']

  // By month (for trend)
  const byMonth = db
    .prepare(
      `
    SELECT
      strftime('%Y-%m', psd.date) as month,
      SUM(psd.revenue) as revenue,
      SUM(psd.cost) as cost,
      SUM(psd.profit) as profit
    FROM product_sales_daily psd
    WHERE psd.date BETWEEN ? AND ?
    GROUP BY month
    ORDER BY month ASC
  `
    )
    .all(startDate, endDate) as ProfitLossData['by_month']

  return {
    start_date: startDate,
    end_date: endDate,
    total_revenue: overall.total_revenue,
    total_cost: overall.total_cost,
    gross_profit: overall.gross_profit,
    gross_margin_percent: grossMarginPercent,
    by_category: byCategory,
    by_month: byMonth
  }
}
