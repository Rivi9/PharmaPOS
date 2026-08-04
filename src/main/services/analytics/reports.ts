import { getDatabase } from '../database'
import { round2 } from '../../../shared/money'

export interface SalesReportData {
  start_date: string
  end_date: string
  total_sales: number
  total_profit: number
  total_cost: number
  total_transactions: number
  total_items_sold: number
  avg_transaction: number
  daily_breakdown: Array<{
    date: string
    sales: number
    profit: number
    transactions: number
  }>
  top_products: Array<{
    product_name: string
    quantity: number
    revenue: number
    profit: number
  }>
  payment_methods: Array<{
    method: string
    count: number
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
 */
export function generateSalesReport(startDate: string, endDate: string): SalesReportData {
  const db = getDatabase()

  // Summary metrics
  const summary = db
    .prepare(
      `
    SELECT
      -- Gross: what was actually banked, VAT included.
      COALESCE(SUM(total), 0) as total_sales,
      COALESCE(SUM(tax_amount), 0) as total_vat,
      -- Net revenue, the same basis the P&L uses, so the two reports reconcile.
      ROUND(COALESCE(SUM(total - tax_amount), 0), 2) as total_net_sales,
      -- Profit must be computed on NET revenue. Using the VAT-inclusive total
      -- booked the pharmacy's VAT liability as profit.
      ROUND(COALESCE(SUM((total - tax_amount) - (
        SELECT COALESCE(SUM(si.cost_price * si.quantity), 0)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )), 0), 2) as total_profit,
      COALESCE(SUM((
        SELECT SUM(si.cost_price * si.quantity)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )), 0) as total_cost,
      COUNT(*) as total_transactions,
      COALESCE(SUM((
        SELECT SUM(si.quantity)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )), 0) as total_items_sold
    FROM sales s
    WHERE date(s.created_at) BETWEEN ? AND ?
      AND s.status = 'completed'
  `
    )
    .get(startDate, endDate) as any

  const avgTransaction =
    summary.total_transactions > 0 ? summary.total_sales / summary.total_transactions : 0

  // Daily breakdown
  const dailyBreakdown = db
    .prepare(
      `
    SELECT
      date(s.created_at) as date,
      COALESCE(SUM(s.total), 0) as sales,
      ROUND(COALESCE(SUM((s.total - s.tax_amount) - (
        SELECT COALESCE(SUM(si.cost_price * si.quantity), 0)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )), 0), 2) as profit,
      COUNT(*) as transactions
    FROM sales s
    WHERE date(s.created_at) BETWEEN ? AND ?
      AND s.status = 'completed'
    GROUP BY date(s.created_at)
    ORDER BY date ASC
  `
    )
    .all(startDate, endDate) as any[]

  // Top products
  const topProducts = db
    .prepare(
      `
    SELECT
      p.name as product_name,
      SUM(si.quantity) as quantity,
      SUM(si.line_total) as revenue,
      SUM(si.line_total - (si.cost_price * si.quantity)) as profit
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    WHERE date(s.created_at) BETWEEN ? AND ?
      AND s.status = 'completed'
    GROUP BY p.id, p.name
    ORDER BY revenue DESC
    LIMIT 10
  `
    )
    .all(startDate, endDate) as any[]

  // Payment methods breakdown
  const paymentMethods = db
    .prepare(
      `
    SELECT
      payment_method as method,
      COUNT(*) as count,
      SUM(total) as amount
    FROM sales
    WHERE date(created_at) BETWEEN ? AND ?
      AND status = 'completed'
    GROUP BY payment_method
  `
    )
    .all(startDate, endDate) as any[]

  return {
    start_date: startDate,
    end_date: endDate,
    total_sales: summary.total_sales,
    total_profit: summary.total_profit,
    total_cost: summary.total_cost,
    total_transactions: summary.total_transactions,
    total_items_sold: summary.total_items_sold,
    avg_transaction: avgTransaction,
    daily_breakdown: dailyBreakdown,
    top_products: topProducts,
    payment_methods: paymentMethods
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
    .get(startDate, endDate) as any

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
    .all(startDate, endDate) as any[]

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
    .all(startDate, endDate) as any[]

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
