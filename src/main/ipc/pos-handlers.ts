import { ipcMain, type IpcMainInvokeEvent } from 'electron'
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
import {
  listSalesPage,
  getSaleDetail,
  quoteRefund,
  type SalesPageQuery,
  type RefundRequestLine
} from '../services/sales-history'
import { getActiveShiftForUser } from '../services/shifts'
import { getDatabase } from '../services/database'
import { getUserById } from '../services/users/user-management'
import { hasPermission, type Role } from '../services/users/permissions'

export function registerPOSHandlers(): void {
  // Product handlers
  ipcMain.handle(IPC_CHANNELS.PRODUCT_SEARCH, async (_event, query: string, limit?: number) => {
    return searchProducts(String(query ?? ''), typeof limit === 'number' ? limit : undefined)
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_GET_BY_BARCODE, async (_event, barcode: string) => {
    return getProductByBarcode(barcode)
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_GET_QUICK_ITEMS, async () => {
    return getQuickItems()
  })

  // Sales handlers.
  // `user_id` and `shift_id` used to be taken from the payload, so a sale could
  // be booked against another cashier or against a closed, already-reconciled
  // shift — where it would never appear in any cash count. Both are now resolved
  // from the session, and the audit entry names the real actor.
  ipcMain.handle(IPC_CHANNELS.SALE_CREATE, async (event, saleData: unknown) => {
    return withPermission(event, 'sales:create', () => {
      const userId = actingUserId(event)
      const shift = getActiveShiftForUser(userId)
      if (!shift) {
        throw new Error('Start a shift before ringing up a sale')
      }

      // A new phone number at checkout creates the customer, so that part of the
      // sale needs customers:create in its own right. Without it the sale still
      // goes through and the typed name and number stay on the receipt only.
      const role = getUserById(userId)?.role as Role | undefined
      const canCreateCustomer = !!role && hasPermission(role, 'customers:create')

      const result = createSale(
        {
          ...(saleData as Record<string, unknown>),
          user_id: userId,
          shift_id: shift.id
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        { canCreateCustomer }
      )

      // The SALE_CREATED audit entry is written inside createSale's transaction,
      // so it cannot be lost between the commit and this point (M13).
      return result
    })
  })

  // A receipt carries the customer's name and phone and what they were
  // dispensed. It was readable by any renderer, signed in or not.
  ipcMain.handle(IPC_CHANNELS.SALE_GET_RECEIPT, async (event, saleId: string) => {
    return withPermission(event, 'sales:create', () => getReceipt(saleId))
  })

  ipcMain.handle(IPC_CHANNELS.SALE_GET_TODAY_TOTAL, async (event, shiftId: string) => {
    return withPermission(event, 'sales:create', () => getTodaySalesTotal(shiftId))
  })

  // Stock handlers
  ipcMain.handle(IPC_CHANNELS.STOCK_CHECK_AVAILABILITY, async (_event, productId: string) => {
    return checkStockAvailability(productId)
  })

  // (`stock:deduct` was a stub that only threw — stock leaves through createSale's
  // FEFO deduction and nowhere else — so the channel was removed rather than kept
  // as an attractive place to bolt on an unaudited stock path.)

  // Void sale — requires sales:void permission
  ipcMain.handle(IPC_CHANNELS.SALE_VOID, async (_event, { saleId, reason }) => {
    return withPermission(_event, 'sales:void', () =>
      voidSale(saleId, actingUserId(_event), reason)
    )
  })

  // Refund sale — requires sales:refund permission
  ipcMain.handle(IPC_CHANNELS.SALE_REFUND, async (_event, { saleId, items, reason, restock }) => {
    // The SALE_REFUNDED audit entry is written once, inside createRefund's
    // transaction, with the amount the server priced. This handler used to add a
    // second one totalling the renderer's line_total values — undiscounted and
    // caller-supplied — so every refund appeared twice with two different sums.
    return withPermission(_event, 'sales:refund', () =>
      createRefund(saleId, actingUserId(_event), items, reason ?? '', restock ?? false)
    )
  })

  // Sales screen. The list and one sale in full need `sales:view_all` — every
  // role holds it, so a cashier can find a sale and reprint its receipt — while
  // void and refund stay behind their own permissions above.
  ipcMain.handle(IPC_CHANNELS.SALE_LIST_PAGE, async (event, query: SalesPageQuery) => {
    return withPermission(event, 'sales:view_all', () => listSalesPage(getDatabase(), query ?? {}))
  })

  ipcMain.handle(IPC_CHANNELS.SALE_DETAIL, async (event, saleId: string) => {
    return withPermission(event, 'sales:view_all', () =>
      getSaleDetail(getDatabase(), String(saleId ?? ''))
    )
  })

  // What a refund would pay back, priced by the function createRefund itself
  // uses, and whether the caller has the open shift it must be paid from.
  // Nothing is written.
  ipcMain.handle(
    IPC_CHANNELS.SALE_REFUND_PREVIEW,
    async (event, { saleId, items }: { saleId: string; items: RefundRequestLine[] }) => {
      return withPermission(event, 'sales:refund', () => {
        const q = quoteRefund(
          getDatabase(),
          String(saleId ?? ''),
          Array.isArray(items) ? items : []
        )
        return {
          lines: q.lines,
          amount: q.amount,
          tax: q.tax,
          cash: q.cash,
          card: q.card,
          fully_refunded: q.fully_refunded,
          shift_open: !!getActiveShiftForUser(actingUserId(event))
        }
      })
    }
  )

  // Customer purchase history. Cashiers need it at checkout, so the gate is
  // being signed in to sell — but it is a customer's dispensing record, and it
  // used to answer anyone, signed in or not.
  ipcMain.handle(IPC_CHANNELS.CUSTOMER_PURCHASE_HISTORY, async (event, customerId: string) => {
    return withPermission(event, 'sales:create', () => getCustomerPurchaseHistory(customerId))
  })

  // Shift expected cash. The opening float is the one recorded on the shift,
  // not a figure the renderer sends up.
  ipcMain.handle(
    IPC_CHANNELS.SHIFT_COMPUTE_EXPECTED_CASH,
    async (event, { shiftId }: { shiftId: string; openingCash?: number }) => {
      return withPermission(event, 'shifts:manage', () => {
        const shift = shiftVisibleTo(event, shiftId)
        return computeShiftExpectedCash(shift.id, shift.opening_cash ?? 0)
      })
    }
  )

  // Mid-shift cash in / out.
  // This took `userId` and `shiftId` from the payload and needed no login, so
  // any renderer could post a cash movement against any open shift in anyone's
  // name — moving the expected drawer figure and the blame with it. Both now come
  // from the session: the movement is always the signed-in user's, on their own
  // open shift. Any ids in the payload are ignored.
  ipcMain.handle(
    IPC_CHANNELS.SHIFT_CASH_MOVEMENT,
    async (event, params: { type: 'in' | 'out'; amount: number; reason: string }) => {
      try {
        return await withPermission(event, 'shifts:manage', () => {
          const userId = actingUserId(event)
          const shift = getActiveShiftForUser(userId)
          if (!shift) throw new Error('Start a shift before recording cash in or out')
          if (params?.type !== 'in' && params?.type !== 'out') {
            throw new Error('Choose cash in or cash out')
          }
          return {
            success: true,
            ...recordCashMovement({
              shiftId: shift.id,
              userId,
              type: params.type,
              amount: Number(params.amount),
              reason: String(params.reason ?? '')
            })
          }
        })
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(IPC_CHANNELS.SHIFT_CASH_MOVEMENTS, async (event, shiftId: string) => {
    return withPermission(event, 'shifts:manage', () =>
      getShiftCashMovements(shiftVisibleTo(event, shiftId).id)
    )
  })
}

/**
 * The shift, if the caller may see its cash figures: their own, or any shift for
 * a manager or admin (who may also close someone else's — see SHIFT_END).
 */
function shiftVisibleTo(
  event: IpcMainInvokeEvent,
  shiftId: string
): { id: string; user_id: string; opening_cash: number } {
  const shift = getDatabase()
    .prepare('SELECT id, user_id, opening_cash FROM shifts WHERE id = ?')
    .get(shiftId) as { id: string; user_id: string; opening_cash: number } | undefined
  if (!shift) throw new Error('That shift no longer exists')
  const actor = getUserById(actingUserId(event))
  if (shift.user_id !== actor?.id && (!actor || actor.role === 'cashier')) {
    throw new Error('You can only view your own shift')
  }
  return shift
}
