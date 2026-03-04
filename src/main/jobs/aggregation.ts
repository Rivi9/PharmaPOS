import * as schedule from 'node-schedule'
import { aggregateDailySales } from '../services/analytics'

/**
 * Initialize daily aggregation job
 * Runs every day at 00:05 (5 minutes after midnight) to aggregate previous day's sales
 */
export function initializeAggregationJob(): void {
  // Run daily at 00:05
  schedule.scheduleJob('5 0 * * *', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const dateStr = yesterday.toISOString().split('T')[0]

    console.log(`[Aggregation Job] Running daily aggregation for ${dateStr}`)
    try {
      aggregateDailySales(dateStr)
      console.log(`[Aggregation Job] Successfully aggregated sales for ${dateStr}`)
    } catch (error: any) {
      console.error(`[Aggregation Job] Failed to aggregate sales for ${dateStr}:`, error.message)
    }
  })

  console.log('[Aggregation Job] Scheduled to run daily at 00:05')
}

/**
 * Run aggregation for a specific date manually
 */
export function runManualAggregation(date: string): void {
  console.log(`[Manual Aggregation] Running aggregation for ${date}`)
  try {
    aggregateDailySales(date)
    console.log(`[Manual Aggregation] Successfully aggregated sales for ${date}`)
  } catch (error: any) {
    console.error(`[Manual Aggregation] Failed to aggregate sales for ${date}:`, error.message)
    throw error
  }
}

/**
 * Backfill aggregation for a date range
 */
export function backfillAggregation(startDate: string, endDate: string): void {
  console.log(`[Backfill] Running aggregation from ${startDate} to ${endDate}`)

  const start = new Date(startDate)
  const end = new Date(endDate)
  const current = new Date(start)

  let successCount = 0
  let errorCount = 0

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0]
    try {
      aggregateDailySales(dateStr)
      successCount++
    } catch (error: any) {
      console.error(`[Backfill] Failed for ${dateStr}:`, error.message)
      errorCount++
    }
    current.setDate(current.getDate() + 1)
  }

  console.log(`[Backfill] Completed: ${successCount} successful, ${errorCount} failed`)
}
