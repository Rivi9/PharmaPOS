import { getDatabase } from '../database'
import { localDateOffset } from '../../../shared/dates'
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

  // NEVER join product_sales_daily to sales: one row per product against one row
  // per sale is a cartesian product, and every SUM came back multiplied by the
  // day's transaction count. The transaction count is a scalar subquery instead.
  //
  // total_sales is NET: revenue excluding VAT, after discounts and refunds — the
  // same figure the P&L and the Sales Report call net sales. Transactions are
  // counted on the local date, which is how product_sales_daily is keyed;
  // `date(created_at)` is the UTC date and moved 00:00–05:29 to the day before.
  const metrics = db
    .prepare(
      `
    SELECT
      ? as date,
      COALESCE(SUM(psd.revenue), 0) as total_sales,
      COALESCE(SUM(psd.profit), 0) as total_profit,
      COALESCE(SUM(psd.cost), 0) as total_cost,
      (
        SELECT COUNT(*) FROM sales
        WHERE date(created_at, 'localtime') = ? AND status = 'completed'
      ) as transaction_count,
      COALESCE(SUM(psd.quantity_sold), 0) as items_sold,
      CASE
        WHEN (SELECT COUNT(*) FROM sales WHERE date(created_at, 'localtime') = ? AND status = 'completed') > 0
        THEN COALESCE(SUM(psd.revenue), 0) /
             (SELECT COUNT(*) FROM sales WHERE date(created_at, 'localtime') = ? AND status = 'completed')
        ELSE 0
      END as avg_transaction
    FROM product_sales_daily psd
    WHERE psd.date = ?
  `
    )
    .get(date, date, date, date, date) as DailySalesMetric | undefined

  return metrics || null
}

/**
 * Get metrics for a date range (for trend charts)
 */
export function getPeriodMetrics(startDate: string, endDate: string): DailySalesMetric[] {
  const db = getDatabase()

  // Same fan-out fix as getDailyMetrics — the per-day transaction count is a
  // correlated subquery so it cannot multiply the psd aggregates.
  const metrics = db
    .prepare(
      `
    SELECT
      psd.date,
      COALESCE(SUM(psd.revenue), 0) as total_sales,
      COALESCE(SUM(psd.profit), 0) as total_profit,
      COALESCE(SUM(psd.cost), 0) as total_cost,
      (
        SELECT COUNT(*) FROM sales s
        WHERE date(s.created_at, 'localtime') = psd.date AND s.status = 'completed'
      ) as transaction_count,
      COALESCE(SUM(psd.quantity_sold), 0) as items_sold,
      CASE
        WHEN (SELECT COUNT(*) FROM sales s
              WHERE date(s.created_at, 'localtime') = psd.date AND s.status = 'completed') > 0
        THEN COALESCE(SUM(psd.revenue), 0) /
             (SELECT COUNT(*) FROM sales s
              WHERE date(s.created_at, 'localtime') = psd.date AND s.status = 'completed')
        ELSE 0
      END as avg_transaction
    FROM product_sales_daily psd
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
export function getTopProducts(
  startDate: string,
  endDate: string,
  limit: number = 10
): TopProduct[] {
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
    SELECT * FROM (
      SELECT
        p.id as product_id,
        p.name as product_name,
        COALESCE((
          SELECT SUM(b.quantity) FROM stock_batches b
          WHERE b.product_id = p.id AND b.quantity > 0
            AND (b.expiry_date IS NULL OR b.expiry_date = '' OR b.expiry_date >= date('now','localtime'))
        ), 0) as current_stock,
        p.reorder_level,
        p.reorder_qty
      FROM products p
      WHERE p.is_active = 1
        -- Only products that have ever been stocked. Counting never-stocked rows
        -- meant a partial catalogue import produced thousands of "low stock"
        -- alerts and buried the real reorder signals.
        AND EXISTS (SELECT 1 FROM stock_batches b WHERE b.product_id = p.id)
    )
    -- Wrapped so the computed stock can be filtered: with the aggregate replaced
    -- by a subquery this is no longer an aggregate query, so HAVING is invalid.
    WHERE current_stock <= reorder_level
    ORDER BY (current_stock - reorder_level) ASC
    LIMIT 200
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

  // Local calendar days, both ends. The cutoff was the UTC date, and the count
  // subtracted julianday('now') — the current UTC instant, a fractional day —
  // then truncated with CAST, so from 05:30 local onwards every countdown was a
  // day short ("expires tomorrow" read 0 days) and the window's last day was
  // decided by the UTC calendar. Whole local dates on both sides now.
  const cutoffDate = localDateOffset(daysAhead)

  const alerts = db
    .prepare(
      `
    SELECT
      sb.id as batch_id,
      p.name as product_name,
      sb.batch_number,
      sb.quantity,
      sb.expiry_date,
      CAST(ROUND(julianday(date(sb.expiry_date)) - julianday(date('now', 'localtime'))) AS INTEGER)
        as days_until_expiry
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    WHERE sb.expiry_date IS NOT NULL
      AND sb.expiry_date <> ''
      AND sb.expiry_date <= ?
      AND sb.quantity > 0
    ORDER BY sb.expiry_date ASC
  `
    )
    .all(cutoffDate) as ExpiryAlert[]

  return alerts
}
