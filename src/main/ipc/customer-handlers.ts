import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission } from './middleware'
import {
  listCustomers,
  getCustomer,
  getCustomerByPhone,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  type CustomerData
} from '../services/customers'

export function registerCustomerHandlers(): void {
  // Read-only handlers — no permission gate (cashiers need these during checkout)
  ipcMain.handle(IPC_CHANNELS.CUSTOMER_LIST, (_event, search?: string) => {
    return listCustomers(search)
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_GET, (_event, id: string) => {
    return getCustomer(id)
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_GET_BY_PHONE, (_event, phone: string) => {
    return getCustomerByPhone(phone)
  })

  // Mutating handlers — require userId and appropriate permission
  ipcMain.handle(IPC_CHANNELS.CUSTOMER_CREATE, (_event, { userId, ...data }: { userId: string } & CustomerData) => {
    return withPermission(userId, 'customers:create', () => createCustomer(data as CustomerData))
  })

  ipcMain.handle(
    IPC_CHANNELS.CUSTOMER_UPDATE,
    (_event, { userId, id, data }: { userId: string; id: string; data: Partial<CustomerData> }) => {
      return withPermission(userId, 'customers:update', () => updateCustomer(id, data))
    }
  )

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_DELETE, (_event, { userId, id }: { userId: string; id: string }) => {
    return withPermission(userId, 'customers:delete', () => {
      deleteCustomer(id)
      return { success: true }
    })
  })

  // NOTE: CUSTOMER_PURCHASE_HISTORY is handled in pos-handlers.ts
}
