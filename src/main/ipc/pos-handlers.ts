import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  searchProducts,
  getProductByBarcode,
  getQuickItems,
  checkStockAvailability
} from '../services/products'
import { createSale, getReceipt, getTodaySalesTotal } from '../services/sales'
import { logAudit } from '../services/audit'

export function registerPOSHandlers(): void {
  // Product handlers
  ipcMain.handle(IPC_CHANNELS.PRODUCT_SEARCH, async (_event, query: string) => {
    return searchProducts(query)
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_GET_BY_BARCODE, async (_event, barcode: string) => {
    return getProductByBarcode(barcode)
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_GET_QUICK_ITEMS, async () => {
    return getQuickItems()
  })

  // Sales handlers
  ipcMain.handle(IPC_CHANNELS.SALE_CREATE, async (_event, saleData: unknown) => {
    const result = createSale(saleData as any) // Type validated by service
    const sale = saleData as { user_id: string; total: number; payment_method: string }
    logAudit({
      userId: sale.user_id,
      action: 'SALE_CREATED',
      entityType: 'sale',
      entityId: result.sale_id,
      details: {
        receipt_number: result.receipt_number,
        total: sale.total,
        payment_method: sale.payment_method
      }
    })
    return result
  })

  ipcMain.handle(IPC_CHANNELS.SALE_GET_RECEIPT, async (_event, saleId: string) => {
    return getReceipt(saleId)
  })

  ipcMain.handle(IPC_CHANNELS.SALE_GET_TODAY_TOTAL, async (_event, shiftId: string) => {
    return getTodaySalesTotal(shiftId)
  })

  // Stock handlers
  ipcMain.handle(IPC_CHANNELS.STOCK_CHECK_AVAILABILITY, async (_event, productId: string) => {
    return checkStockAvailability(productId)
  })

  ipcMain.handle(
    IPC_CHANNELS.STOCK_DEDUCT,
    async (_event, _data: { productId: string; quantity: number }) => {
      // Note: Stock deduction is handled by createSale with FEFO logic
      // This handler is for manual stock checks if needed
      throw new Error('Stock deduction should be done via createSale')
    }
  )
}
