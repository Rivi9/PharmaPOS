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
  type CustomerData
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
}

/** Map Drizzle camelCase Customer to the snake_case shape the renderer expects. */
function mapCustomer(c: Customer): CustomerDto {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    address: c.address ?? null,
    notes: c.notes ?? null,
    created_at: c.createdAt
  }
}

export function registerCustomerHandlers(): void {
  // Read-only handlers. Cashiers need these during checkout, so the gate is
  // being signed in to sell — but they return names, phone numbers and
  // addresses, and used to answer any renderer with no session at all.
  ipcMain.handle(IPC_CHANNELS.CUSTOMER_LIST, (event, search?: string) => {
    return withPermission(event, 'sales:create', () => listCustomers(search).map(mapCustomer))
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

  // Mutating handlers — require userId and appropriate permission
  ipcMain.handle(
    IPC_CHANNELS.CUSTOMER_CREATE,
    (_event, { ...data }: { userId: string } & CustomerData) => {
      return withPermission(_event, 'customers:create', () => createCustomer(data as CustomerData))
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.CUSTOMER_UPDATE,
    (_event, { id, data }: { id: string; data: Partial<CustomerData> }) => {
      return withPermission(_event, 'customers:update', () => updateCustomer(id, data))
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
