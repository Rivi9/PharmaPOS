import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission } from './middleware'
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
import {
  generateSalesReport,
  generateInventoryValuation,
  generateProfitLossReport
} from '../services/analytics/reports'

export function registerAnalyticsHandlers(): void {
  // Dashboard queries — reports:view
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_DAILY_METRICS, (_event, { userId, date }: { userId: string; date: string }) => {
    return withPermission(userId, 'reports:view', () => getDailyMetrics(date))
  })

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_PERIOD_METRICS,
    (_event, { userId, startDate, endDate }: { userId: string; startDate: string; endDate: string }) => {
      return withPermission(userId, 'reports:view', () => getPeriodMetrics(startDate, endDate))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_TOP_PRODUCTS,
    (_event, { userId, startDate, endDate, limit }: { userId: string; startDate: string; endDate: string; limit?: number }) => {
      return withPermission(userId, 'reports:view', () => getTopProducts(startDate, endDate, limit))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_CATEGORY_BREAKDOWN,
    (_event, { userId, startDate, endDate }: { userId: string; startDate: string; endDate: string }) => {
      return withPermission(userId, 'reports:view', () => getCategoryBreakdown(startDate, endDate))
    }
  )

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_LOW_STOCK_ALERTS, (_event, { userId }: { userId: string }) => {
    return withPermission(userId, 'reports:view', () => getLowStockAlerts())
  })

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_EXPIRY_ALERTS,
    (_event, { userId, daysAhead }: { userId: string; daysAhead?: number }) => {
      return withPermission(userId, 'reports:view', () => getExpiryAlerts(daysAhead))
    }
  )

  // Aggregation control — reports:generate
  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_RUN_AGGREGATION,
    (_event, { userId, date }: { userId: string; date?: string }) => {
      return withPermission(userId, 'reports:generate', () => {
        if (date) {
          return aggregateDailySales(date)
        } else {
          return runIncrementalAggregation()
        }
      })
    }
  )

  // Reports — reports:generate
  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_SALES_REPORT,
    (_event, { userId, startDate, endDate }: { userId: string; startDate: string; endDate: string }) => {
      return withPermission(userId, 'reports:generate', () => generateSalesReport(startDate, endDate))
    }
  )

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_INVENTORY_VALUATION, (_event, { userId }: { userId: string }) => {
    return withPermission(userId, 'reports:generate', () => generateInventoryValuation())
  })

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_PROFIT_LOSS_REPORT,
    (_event, { userId, startDate, endDate }: { userId: string; startDate: string; endDate: string }) => {
      return withPermission(userId, 'reports:generate', () => generateProfitLossReport(startDate, endDate))
    }
  )
}
