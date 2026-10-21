import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission, actingUserId } from './middleware'
import { logAudit } from '../services/audit'
import {
  listCustomers,
  getCustomer,
  getCustomerByPhone,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  eraseCustomer,
  findCheckoutCustomer,
  getAllCustomerStats,
  customerStatsFor,
  type CustomerData,
  type CustomerStats
} from '../services/customers'
import type { Customer } from '../db/schema'

interface CustomerDto {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  created_at: string
  visits?: number
  total_spent?: number
  last_visit?: string | null
}

/** Map Drizzle camelCase Customer to the snake_case shape the renderer expects. */
function mapCustomer(c: Customer, stats?: CustomerStats): CustomerDto {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    address: c.address ?? null,
    notes: c.notes ?? null,
    created_at: c.createdAt,
    ...(stats && {
      visits: stats.visits,
      total_spent: stats.totalSpent,
      last_visit: stats.lastVisit
    })
  }
}

export function registerCustomerHandlers(): void {
  // Read-only handlers. Cashiers need these during checkout, so the gate is
  // being signed in to sell — but they return names, phone numbers and
  // addresses, and used to answer any renderer with no session at all.
  // With visits / spend / last visit, so the list and the detail panel show
  // what the linked sales add up to.
  ipcMain.handle(IPC_CHANNELS.CUSTOMER_LIST, (event, search?: string) => {
    return withPermission(event, 'sales:create', () => {
      const stats = getAllCustomerStats()
      return listCustomers(search).map((c) => mapCustomer(c, customerStatsFor(stats, c.id)))
    })
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_GET, (event, id: string) => {
    return withPermission(event, 'sales:create', () => {
      const c = getCustomer(id)
      return c ? mapCustomer(c) : null
    })
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_GET_BY_PHONE, (event, phone: string) => {
    return withPermission(event, 'sales:create', () => {
      const c = getCustomerByPhone(phone)
      return c ? mapCustomer(c) : null
    })
  })

  // What the till needs to tell the cashier what Complete Sale will do with the
  // number typed (planCheckoutCustomer runs on both sides with the same input).
  // Gated like the other customer reads: it answers whether a number belongs to
  // a customer and returns their details.
  ipcMain.handle(IPC_CHANNELS.CUSTOMER_CHECKOUT_LOOKUP, (event, phone: string) => {
    return withPermission(event, 'sales:create', () => {
      const { active, heldByRemoved } = findCheckoutCustomer(phone)
      return { active: active ? mapCustomer(active) : null, heldByRemoved }
    })
  })

  // Mutating handlers — require userId and appropriate permission
  ipcMain.handle(
    IPC_CHANNELS.CUSTOMER_CREATE,
    (_event, { ...data }: { userId: string } & CustomerData) => {
      return withPermission(_event, 'customers:create', () => {
        const made = createCustomer(data as CustomerData)
        // No name or number in the details: audit_log is append-only, so they
        // would outlive an erasure request. The entity id is enough to trace it.
        logAudit({
          userId: actingUserId(_event),
          action: 'CUSTOMER_CREATED',
          entityType: 'customer',
          entityId: made.id,
          details: { source: 'customers' }
        })
        return made
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CUSTOMER_UPDATE,
    (_event, { id, data }: { id: string; data: Partial<CustomerData> }) => {
      return withPermission(_event, 'customers:update', () => {
        const updated = updateCustomer(id, data)
        if (updated) {
          logAudit({
            userId: actingUserId(_event),
            action: 'CUSTOMER_UPDATED',
            entityType: 'customer',
            entityId: id,
            details: { source: 'customers', fields: Object.keys(data ?? {}) }
          })
        }
        return updated
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_DELETE, (_event, { id }: { id: string }) => {
    return withPermission(_event, 'customers:delete', () => {
      deleteCustomer(id)
      return { success: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_ERASE, (_event, { id }: { id: string }) => {
    return withPermission(_event, 'customers:erase', () => {
      // Logged before the erase so the entry can still name who was removed;
      // afterwards there is deliberately nothing left to identify them by.
      const target = getCustomer(id)
      const result = eraseCustomer(id)
      logAudit({
        userId: actingUserId(_event),
        action: 'CUSTOMER_ERASED',
        entityType: 'customer',
        entityId: id,
        details: { name: target?.name, salesScrubbed: result.salesScrubbed }
      })
      return { success: true, ...result }
    })
  })

  // NOTE: CUSTOMER_PURCHASE_HISTORY is handled in pos-handlers.ts
}
