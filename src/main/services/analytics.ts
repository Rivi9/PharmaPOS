import { getDatabase } from './database'

/**
 * Aggregates daily sales data from sale_items into product_sales_daily table
 * Runs daily at midnight to summarize previous day's sales
 */
export function aggregateDailySales(date: string): void {
  const db = getDatabase()

  // Delete existing data for this date to ensure idempotency
  db.prepare('DELETE FROM product_sales_daily WHERE date = ?').run(date)

  // Aggregate sales data by product for the given date
  const query = `
    INSERT INTO product_sales_daily (date, product_id, quantity_sold, revenue, cost, profit)
    SELECT
      DATE(s.completed_at) as date,
      si.product_id,
      SUM(si.quantity) as quantity_sold,
      SUM(si.subtotal) as revenue,
      SUM(si.quantity * p.cost_price) as cost,
      SUM(si.subtotal - (si.quantity * p.cost_price)) as profit
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    WHERE DATE(s.completed_at) = ?
      AND s.status = 'completed'
    GROUP BY DATE(s.completed_at), si.product_id
  `

  const result = db.prepare(query).run(date)
  console.log(`[Analytics] Aggregated daily sales for ${date}: ${result.changes} products`)
}

/**
 * Get daily sales metrics for a specific date
 */
export function getDailySalesMetrics(date: string): any {
  const db = getDatabase()

  const query = `
    SELECT
      ? as date,
      COALESCE(SUM(revenue), 0) as total_sales,
      COALESCE(SUM(profit), 0) as total_profit,
      COALESCE(SUM(cost), 0) as total_cost,
      COUNT(DISTINCT sale_id) as transaction_count,
      COALESCE(SUM(quantity_sold), 0) as items_sold,
      COALESCE(AVG(revenue), 0) as avg_transaction
    FROM (
      SELECT
        si.sale_id,
        SUM(si.subtotal) as revenue,
        SUM(si.quantity * p.cost_price) as cost,
        SUM(si.subtotal - (si.quantity * p.cost_price)) as profit,
        SUM(si.quantity) as quantity_sold
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      WHERE DATE(s.completed_at) = ?
        AND s.status = 'completed'
      GROUP BY si.sale_id
    )
  `

  return db.prepare(query).get(date, date)
}

/**
 * Get daily sales metrics for a date range
 */
export function getDailySalesMetricsRange(startDate: string, endDate: string): any[] {
  const db = getDatabase()

  const query = `
    SELECT
      DATE(s.completed_at) as date,
      COALESCE(SUM(si.subtotal), 0) as total_sales,
      COALESCE(SUM(si.subtotal - (si.quantity * p.cost_price)), 0) as total_profit,
      COALESCE(SUM(si.quantity * p.cost_price), 0) as total_cost,
      COUNT(DISTINCT s.id) as transaction_count,
      COALESCE(SUM(si.quantity), 0) as items_sold,
      COALESCE(AVG(sale_total.total), 0) as avg_transaction
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    LEFT JOIN (
      SELECT sale_id, SUM(subtotal) as total
      FROM sale_items
      GROUP BY sale_id
    ) sale_total ON sale_total.sale_id = s.id
    WHERE DATE(s.completed_at) BETWEEN ? AND ?
      AND s.status = 'completed'
    GROUP BY DATE(s.completed_at)
    ORDER BY date ASC
  `

  return db.prepare(query).all(startDate, endDate)
}

/**
 * Get top selling products for a date range
 */
export function getTopProducts(startDate: string, endDate: string, limit: number = 10): any[] {
  const db = getDatabase()

  const query = `
    SELECT
      p.id as product_id,
      p.name as product_name,
      SUM(si.quantity) as total_quantity,
      SUM(si.subtotal) as total_revenue,
      SUM(si.subtotal - (si.quantity * p.cost_price)) as total_profit
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    WHERE DATE(s.completed_at) BETWEEN ? AND ?
      AND s.status = 'completed'
    GROUP BY p.id, p.name
    ORDER BY total_quantity DESC
    LIMIT ?
  `

  return db.prepare(query).all(startDate, endDate, limit)
}

/**
 * Get sales breakdown by category
 */
export function getCategoryBreakdown(startDate: string, endDate: string): any[] {
  const db = getDatabase()

  const query = `
    WITH category_sales AS (
      SELECT
        COALESCE(c.id, 'uncategorized') as category_id,
        COALESCE(c.name, 'Uncategorized') as category_name,
        SUM(si.subtotal) as total_revenue,
        SUM(si.subtotal - (si.quantity * p.cost_price)) as total_profit
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE DATE(s.completed_at) BETWEEN ? AND ?
        AND s.status = 'completed'
      GROUP BY c.id, c.name
    ),
    total_sales AS (
      SELECT SUM(total_revenue) as grand_total
      FROM category_sales
    )
    SELECT
      cs.category_id,
      cs.category_name,
      cs.total_revenue,
      cs.total_profit,
      ROUND((cs.total_revenue * 100.0 / ts.grand_total), 2) as percentage
    FROM category_sales cs, total_sales ts
    ORDER BY cs.total_revenue DESC
  `

  return db.prepare(query).all(startDate, endDate)
}

/**
 * Get low stock alerts
 */
export function getLowStockAlerts(): any[] {
  const db = getDatabase()

  const query = `
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
    ORDER BY current_stock ASC
  `

  return db.prepare(query).all()
}

/**
 * Get expiry alerts for products expiring within specified days
 */
export function getExpiryAlerts(daysAhead: number = 30): any[] {
  const db = getDatabase()

  const query = `
    SELECT
      sb.id as batch_id,
      p.name as product_name,
      sb.batch_number,
      sb.quantity,
      sb.expiry_date,
      CAST((JULIANDAY(sb.expiry_date) - JULIANDAY('now')) AS INTEGER) as days_until_expiry
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    WHERE sb.expiry_date IS NOT NULL
      AND sb.quantity > 0
      AND JULIANDAY(sb.expiry_date) - JULIANDAY('now') <= ?
    ORDER BY days_until_expiry ASC
  `

  return db.prepare(query).all(daysAhead)
}
