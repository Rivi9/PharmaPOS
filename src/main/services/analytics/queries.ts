import { getDatabase } from '../database'
import type {
  DailySalesMetric,
  TopProduct,
  CategoryBreakdown,
  LowStockAlert,
  ExpiryAlert
} from '../../../renderer/src/types/analytics'

/**
 * Get aggregated metrics for a specific date
 */
export function getDailyMetrics(date: string): DailySalesMetric | null {
  const db = getDatabase()

  const metrics = db
    .prepare(
      `
    SELECT
      ? as date,
      COALESCE(SUM(psd.revenue), 0) as total_sales,
      COALESCE(SUM(psd.profit), 0) as total_profit,
      COALESCE(SUM(psd.cost), 0) as total_cost,
      COUNT(DISTINCT s.id) as transaction_count,
      COALESCE(SUM(psd.quantity_sold), 0) as items_sold,
      CASE
        WHEN COUNT(DISTINCT s.id) > 0 THEN COALESCE(SUM(psd.revenue), 0) / COUNT(DISTINCT s.id)
        ELSE 0
      END as avg_transaction
    FROM product_sales_daily psd
    LEFT JOIN sales s ON date(s.created_at) = psd.date AND s.status = 'completed'
    WHERE psd.date = ?
  `
    )
    .get(date, date) as DailySalesMetric | undefined

  return metrics || null
}

/**
 * Get metrics for a date range (for trend charts)
 */
export function getPeriodMetrics(startDate: string, endDate: string): DailySalesMetric[] {
  const db = getDatabase()

  const metrics = db
    .prepare(
      `
    SELECT
      psd.date,
      COALESCE(SUM(psd.revenue), 0) as total_sales,
      COALESCE(SUM(psd.profit), 0) as total_profit,
      COALESCE(SUM(psd.cost), 0) as total_cost,
      COUNT(DISTINCT s.id) as transaction_count,
      COALESCE(SUM(psd.quantity_sold), 0) as items_sold,
      CASE
        WHEN COUNT(DISTINCT s.id) > 0 THEN COALESCE(SUM(psd.revenue), 0) / COUNT(DISTINCT s.id)
        ELSE 0
      END as avg_transaction
    FROM product_sales_daily psd
    LEFT JOIN sales s ON date(s.created_at) = psd.date AND s.status = 'completed'
    WHERE psd.date BETWEEN ? AND ?
    GROUP BY psd.date
    ORDER BY psd.date ASC
  `
    )
    .all(startDate, endDate) as DailySalesMetric[]

  return metrics
}

/**
 * Get top selling products for a date range
 */
export function getTopProducts(startDate: string, endDate: string, limit: number = 10): TopProduct[] {
  const db = getDatabase()

  const products = db
    .prepare(
      `
    SELECT
      psd.product_id,
      p.name as product_name,
      SUM(psd.quantity_sold) as total_quantity,
      SUM(psd.revenue) as total_revenue,
      SUM(psd.profit) as total_profit
    FROM product_sales_daily psd
    JOIN products p ON psd.product_id = p.id
    WHERE psd.date BETWEEN ? AND ?
    GROUP BY psd.product_id, p.name
    ORDER BY total_revenue DESC
    LIMIT ?
  `
    )
    .all(startDate, endDate, limit) as TopProduct[]

  return products
}

/**
 * Get sales breakdown by category for a date range
 */
export function getCategoryBreakdown(startDate: string, endDate: string): CategoryBreakdown[] {
  const db = getDatabase()

  const breakdown = db
    .prepare(
      `
    WITH category_totals AS (
      SELECT
        COALESCE(c.id, 'uncategorized') as category_id,
        COALESCE(c.name, 'Uncategorized') as category_name,
        SUM(psd.revenue) as total_revenue,
        SUM(psd.profit) as total_profit
      FROM product_sales_daily psd
      JOIN products p ON psd.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE psd.date BETWEEN ? AND ?
      GROUP BY c.id, c.name
    ),
    grand_total AS (
      SELECT SUM(total_revenue) as grand_total_revenue
      FROM category_totals
    )
    SELECT
      ct.category_id,
      ct.category_name,
      ct.total_revenue,
      ct.total_profit,
      CASE
        WHEN gt.grand_total_revenue > 0 THEN ROUND((ct.total_revenue / gt.grand_total_revenue) * 100, 2)
        ELSE 0
      END as percentage
    FROM category_totals ct, grand_total gt
    ORDER BY ct.total_revenue DESC
  `
    )
    .all(startDate, endDate) as CategoryBreakdown[]

  return breakdown
}

/**
 * Get low stock alerts
 */
export function getLowStockAlerts(): LowStockAlert[] {
  const db = getDatabase()

  const alerts = db
    .prepare(
      `
    SELECT
      p.id as product_id,
      p.name as product_name,
      COALESCE(SUM(sb.quantity), 0) as current_stock,
      p.reorder_level,
      p.reorder_qty
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
    GROUP BY p.id
    HAVING current_stock <= p.reorder_level
    ORDER BY (current_stock - p.reorder_level) ASC
  `
    )
    .all() as LowStockAlert[]

  return alerts
}

/**
 * Get expiry alerts (batches expiring within 30 days)
 */
export function getExpiryAlerts(daysAhead: number = 30): ExpiryAlert[] {
  const db = getDatabase()

  const cutoffDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const alerts = db
    .prepare(
      `
    SELECT
      sb.id as batch_id,
      p.name as product_name,
      sb.batch_number,
      sb.quantity,
      sb.expiry_date,
      CAST(julianday(sb.expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    WHERE sb.expiry_date IS NOT NULL
      AND sb.expiry_date <= ?
      AND sb.quantity > 0
    ORDER BY sb.expiry_date ASC
  `
    )
    .all(cutoffDate) as ExpiryAlert[]

  return alerts
}
