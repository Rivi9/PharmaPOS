import { getDatabase } from '../database'
import { localDateString, localDateOffset } from '../../../shared/dates'
import { rebuildProductSalesDaily } from './ledger'

/**
 * Aggregates sales data for a specific date into product_sales_daily table.
 * This is the core analytics aggregation job that should run daily.
 *
 * Rebuilt from the sales ledger (./ledger.ts): local calendar date, net of VAT
 * and of the sale discount, with refunds subtracted — the same figures
 * createSale, the void and the refund maintain live. The previous SQL summed
 * completed lines only, so every run (and opening Analytics runs it for the past
 * week) quietly put partially refunded revenue back into the P&L.
 */
export function aggregateDailySales(date?: string): { processed: number } {
  const db = getDatabase()
  const targetDate = date || localDateString()

  // One transaction, so a reader never sees the day deleted but not yet rebuilt.
  const processed = db.transaction(() =>
    rebuildProductSalesDaily(db, { start: targetDate, end: targetDate })
  )()
  return { processed }
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
