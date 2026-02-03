import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  generateReorderSuggestions,
  detectDeadStock,
  handleNaturalQuery
} from '../services/ai/insights'

export function registerAIHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AI_REORDER_SUGGESTIONS, async () => {
    return await generateReorderSuggestions()
  })

  ipcMain.handle(IPC_CHANNELS.AI_SALES_FORECAST, async (_event, { productId, days }) => {
    // Placeholder - complex forecasting would require ML model
    return {
      product_id: productId,
      forecast_days: days,
      predicted_sales: 0,
      message: 'Sales forecasting coming soon'
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_DEAD_STOCK_DETECTION, async () => {
    return await detectDeadStock()
  })

  ipcMain.handle(IPC_CHANNELS.AI_NATURAL_QUERY, async (_event, query: string) => {
    return await handleNaturalQuery(query)
  })
}
