import { getDatabase } from '../database'

/**
 * Aggregates sales data for a specific date into product_sales_daily table.
 * This is the core analytics aggregation job that should run daily.
 */
export function aggregateDailySales(date?: string): { processed: number } {
  const db = getDatabase()
  const targetDate = date || new Date().toISOString().split('T')[0]

  // Delete existing aggregations for the date (idempotent)
  db.prepare('DELETE FROM product_sales_daily WHERE date = ?').run(targetDate)

  // Aggregate sales by product for the date
  const stmt = db.prepare(`
    INSERT INTO product_sales_daily (id, date, product_id, quantity_sold, revenue, cost, profit)
    SELECT
      lower(hex(randomblob(16))) as id,
      date(s.created_at) as date,
      si.product_id,
      SUM(si.quantity) as quantity_sold,
      SUM(si.line_total) as revenue,
      SUM(si.cost_price * si.quantity) as cost,
      SUM(si.line_total - (si.cost_price * si.quantity)) as profit
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE date(s.created_at) = ?
      AND s.status = 'completed'
    GROUP BY date(s.created_at), si.product_id
  `)

  const result = stmt.run(targetDate)
  return { processed: result.changes }
}

/**
 * Run aggregation for a date range (useful for backfilling or historical corrections)
 */
export function aggregateDateRange(startDate: string, endDate: string): { daysProcessed: number } {
  const start = new Date(startDate)
  const end = new Date(endDate)
  let daysProcessed = 0

  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    aggregateDailySales(dateStr)
    daysProcessed++
  }

  return { daysProcessed }
}

/**
 * Get the last aggregated date
 */
export function getLastAggregatedDate(): string | null {
  const db = getDatabase()
  const result = db
    .prepare('SELECT MAX(date) as last_date FROM product_sales_daily')
    .get() as { last_date: string | null }

  return result.last_date
}

/**
 * Run incremental aggregation (only missing dates since last aggregation)
 */
export function runIncrementalAggregation(): { daysProcessed: number } {
  const lastDate = getLastAggregatedDate()
  const today = new Date().toISOString().split('T')[0]

  if (!lastDate) {
    // No previous aggregations, run for last 30 days
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    return aggregateDateRange(startDate, today)
  }

  // Aggregate from day after last aggregation to today
  const nextDate = new Date(lastDate)
  nextDate.setDate(nextDate.getDate() + 1)
  const startDate = nextDate.toISOString().split('T')[0]

  if (startDate > today) {
    return { daysProcessed: 0 } // Already up to date
  }

  return aggregateDateRange(startDate, today)
}
