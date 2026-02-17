import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission } from './middleware'
import {
  generateReorderSuggestions,
  detectDeadStock,
  handleNaturalQuery
} from '../services/ai/insights'

export function registerAIHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AI_REORDER_SUGGESTIONS, async (_event, { userId }) => {
    return withPermission(userId, 'analytics:view', () => generateReorderSuggestions())
  })

  ipcMain.handle(IPC_CHANNELS.AI_SALES_FORECAST, async (_event, { userId, productId, days }) => {
    return withPermission(userId, 'analytics:view', () => ({
      product_id: productId,
      forecast_days: days,
      predicted_sales: 0,
      message: 'Sales forecasting coming soon'
    }))
  })

  ipcMain.handle(IPC_CHANNELS.AI_DEAD_STOCK_DETECTION, async (_event, { userId }) => {
    return withPermission(userId, 'analytics:view', () => detectDeadStock())
  })

  ipcMain.handle(IPC_CHANNELS.AI_NATURAL_QUERY, async (_event, { userId, query }) => {
    return withPermission(userId, 'analytics:view', () => handleNaturalQuery(query))
  })
}
