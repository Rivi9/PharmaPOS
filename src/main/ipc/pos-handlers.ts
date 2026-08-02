import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission, actingUserId } from './middleware'
import {
  searchProducts,
  getProductByBarcode,
  getQuickItems,
  checkStockAvailability
} from '../services/products'
import {
  createSale,
  getReceipt,
  getTodaySalesTotal,
  voidSale,
  computeShiftExpectedCash,
  recordCashMovement,
  getShiftCashMovements,
  createRefund
} from '../services/sales'
import { getCustomerPurchaseHistory } from '../services/customers'
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
    logAudit({      userId: sale.user_id,
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

  // Void sale — requires sales:void permission
  ipcMain.handle(IPC_CHANNELS.SALE_VOID, async (_event, { saleId, reason }) => {
    return withPermission(_event, 'sales:void', () => voidSale(saleId, actingUserId(_event), reason))
  })

  // Refund sale — requires sales:refund permission
  ipcMain.handle(
    IPC_CHANNELS.SALE_REFUND,
    async (_event, { saleId, items, reason, restock }) => {
      return withPermission(_event, 'sales:refund', () => {
        const result = createRefund(saleId, actingUserId(_event), items, reason ?? '', restock ?? false)
        logAudit({
        userId: actingUserId(_event),
          action: 'SALE_REFUNDED',
          entityType: 'sale',
          entityId: saleId,
          details: {
            refund_id: result.refund_id,
            total_refunded: items.reduce((s: number, i: any) => s + i.line_total, 0)
          }
        })
        return result
      })
    }
  )

  // Customer purchase history — no permission gate (cashier needs this)
  ipcMain.handle(IPC_CHANNELS.CUSTOMER_PURCHASE_HISTORY, async (_event, customerId: string) => {
    return getCustomerPurchaseHistory(customerId)
  })

  // Shift expected cash — no permission gate
  ipcMain.handle(
    IPC_CHANNELS.SHIFT_COMPUTE_EXPECTED_CASH,
    async (_event, { shiftId, openingCash }: { shiftId: string; openingCash: number }) => {
      return computeShiftExpectedCash(shiftId, openingCash)
    }
  )

  // Mid-shift cash in / out
  ipcMain.handle(
    IPC_CHANNELS.SHIFT_CASH_MOVEMENT,
    async (
      _event,
      params: {
        userId: string
        shiftId: string
        type: 'in' | 'out'
        amount: number
        reason: string
      }
    ) => {
      try {
        return {
          success: true,
          ...recordCashMovement({
            shiftId: params.shiftId,
            userId: params.userId,
            type: params.type,
            amount: params.amount,
            reason: params.reason
          })
        }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.SHIFT_CASH_MOVEMENTS, async (_event, shiftId: string) => {
    return getShiftCashMovements(shiftId)
  })
}
