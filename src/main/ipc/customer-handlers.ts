import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  listCustomers,
  getCustomer,
  getCustomerByPhone,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  getCustomerPurchaseHistory,
  type CustomerData
} from '../services/customers'

export function registerCustomerHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CUSTOMER_LIST, (_event, search?: string) => {
    return listCustomers(search)
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_GET, (_event, id: string) => {
    return getCustomer(id)
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_GET_BY_PHONE, (_event, phone: string) => {
    return getCustomerByPhone(phone)
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_CREATE, (_event, data: CustomerData) => {
    return createCustomer(data)
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_UPDATE, (_event, { id, data }: { id: string; data: Partial<CustomerData> }) => {
    return updateCustomer(id, data)
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_DELETE, (_event, id: string) => {
    deleteCustomer(id)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.CUSTOMER_PURCHASE_HISTORY, (_event, { customerId, limit }: { customerId: string; limit?: number }) => {
    return getCustomerPurchaseHistory(customerId, limit)
  })
}
