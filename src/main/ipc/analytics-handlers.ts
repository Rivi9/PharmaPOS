import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  aggregateDailySales,
  runIncrementalAggregation
} from '../services/analytics/aggregation'
import {
  getDailyMetrics,
  getPeriodMetrics,
  getTopProducts,
  getCategoryBreakdown,
  getLowStockAlerts,
  getExpiryAlerts
} from '../services/analytics/queries'

export function registerAnalyticsHandlers(): void {
  // Dashboard queries
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_DAILY_METRICS, (_event, date: string) => {
    return getDailyMetrics(date)
  })

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_PERIOD_METRICS,
    (_event, { startDate, endDate }: { startDate: string; endDate: string }) => {
      return getPeriodMetrics(startDate, endDate)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_TOP_PRODUCTS,
    (_event, { startDate, endDate, limit }: { startDate: string; endDate: string; limit?: number }) => {
      return getTopProducts(startDate, endDate, limit)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_CATEGORY_BREAKDOWN,
    (_event, { startDate, endDate }: { startDate: string; endDate: string }) => {
      return getCategoryBreakdown(startDate, endDate)
    }
  )

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_LOW_STOCK_ALERTS, () => {
    return getLowStockAlerts()
  })

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_EXPIRY_ALERTS, (_event, daysAhead?: number) => {
    return getExpiryAlerts(daysAhead)
  })

  // Aggregation control
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_RUN_AGGREGATION, (_event, date?: string) => {
    if (date) {
      return aggregateDailySales(date)
    } else {
      return runIncrementalAggregation()
    }
  })
}
