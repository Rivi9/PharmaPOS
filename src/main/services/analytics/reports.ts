import { getDatabase } from '../database'

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
  total_value: number
  total_cost: number
  total_items: number
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
      COALESCE(SUM(total), 0) as total_sales,
      COALESCE(SUM(total - (
        SELECT SUM(si.cost_price * si.quantity)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )), 0) as total_profit,
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

  const avgTransaction = summary.total_transactions > 0 ? summary.total_sales / summary.total_transactions : 0

  // Daily breakdown
  const dailyBreakdown = db
    .prepare(
      `
    SELECT
      date(s.created_at) as date,
      COALESCE(SUM(s.total), 0) as sales,
      COALESCE(SUM(s.total - (
        SELECT SUM(si.cost_price * si.quantity)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )), 0) as profit,
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
export function generateInventoryValuation(): InventoryValuationData {
  const db = getDatabase()

  // Overall summary
  const summary = db
    .prepare(
      `
    SELECT
      COUNT(DISTINCT p.id) as total_items,
      COALESCE(SUM(sb.quantity * p.cost_price), 0) as total_cost,
      COALESCE(SUM(sb.quantity * p.unit_price), 0) as total_value
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
  `
    )
    .get() as any

  // By category
  const byCategory = db
    .prepare(
      `
    SELECT
      COALESCE(c.name, 'Uncategorized') as category_name,
      COUNT(DISTINCT p.id) as item_count,
      COALESCE(SUM(sb.quantity), 0) as total_quantity,
      COALESCE(SUM(sb.quantity * p.cost_price), 0) as total_cost,
      COALESCE(SUM(sb.quantity * p.unit_price), 0) as total_value
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
    GROUP BY c.id, c.name
    ORDER BY total_value DESC
  `
    )
    .all() as any[]

  // By product (with stock)
  const byProduct = db
    .prepare(
      `
    SELECT
      p.name as product_name,
      COALESCE(SUM(sb.quantity), 0) as quantity,
      p.cost_price as cost_per_unit,
      p.unit_price as unit_price,
      COALESCE(SUM(sb.quantity), 0) * p.cost_price as total_cost,
      COALESCE(SUM(sb.quantity), 0) * p.unit_price as total_value
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
    GROUP BY p.id
    HAVING quantity > 0
    ORDER BY total_value DESC
  `
    )
    .all() as any[]

  return {
    total_value: summary.total_value,
    total_cost: summary.total_cost,
    total_items: summary.total_items,
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
