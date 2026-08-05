import { getDatabase } from '../database'
import { localDateString, localDateOffset } from '../../../shared/dates'

/**
 * Aggregates sales data for a specific date into product_sales_daily table.
 * This is the core analytics aggregation job that should run daily.
 */
export function aggregateDailySales(date?: string): { processed: number } {
  const db = getDatabase()
  const targetDate = date || localDateString()

  // Delete existing aggregations for the date (idempotent)
  db.prepare('DELETE FROM product_sales_daily WHERE date = ?').run(targetDate)

  // Aggregate sales by product for the date
  const stmt = db.prepare(`
    INSERT INTO product_sales_daily (date, product_id, quantity_sold, revenue, cost, profit)
    SELECT
      date(s.created_at) as date,
      si.product_id,
      SUM(si.quantity) as quantity_sold,
      -- Net of VAT, matching what createSale writes live. Prices are tax-inclusive,
      -- so the gross line total is not revenue — the VAT portion is a liability.
      ROUND(SUM(si.line_total - si.tax_amount), 2) as revenue,
      ROUND(SUM(si.cost_price * si.quantity), 2) as cost,
      ROUND(SUM((si.line_total - si.tax_amount) - (si.cost_price * si.quantity)), 2) as profit
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
    const dateStr = localDateString(d)
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
  const result = db.prepare('SELECT MAX(date) as last_date FROM product_sales_daily').get() as {
    last_date: string | null
  }

  return result.last_date
}

/**
 * Run incremental aggregation (only missing dates since last aggregation)
 */
export function runIncrementalAggregation(): { daysProcessed: number } {
  const lastDate = getLastAggregatedDate()
  const today = localDateString()

  if (!lastDate) {
    // No previous aggregations, run for last 30 days
    const startDate = localDateOffset(-30)
    return aggregateDateRange(startDate, today)
  }

  // Re-aggregate a rolling window ending today, starting AT the last aggregated
  // date rather than the day after it. Starting at +1 meant that once any sale
  // happened today, startDate > today and the function returned immediately —
  // so a voided or corrected sale could never be reflected in the rollup.
  const windowStart = localDateOffset(-7)
  const startDate = lastDate < windowStart ? lastDate : windowStart

  return aggregateDateRange(startDate, today)
}
