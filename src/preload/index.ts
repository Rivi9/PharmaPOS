import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../main/ipc/channels'

const electronAPI = {
  // Auth
  getUsers: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_USERS),
  login: (data: { userId: string; pin?: string; password?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, data),
  createUser: (data: {
    username: string
    password: string
    fullName: string
    role: string
    pin?: string
  }) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CREATE_USER, data),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key, value }),
  getAllSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),

  // Shift
  startShift: (data: { userId: string; openingCash: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_START, data),
  endShift: (data: { shiftId: string; closingCash: number; notes?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_END, data),
  getActiveShift: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.SHIFT_GET_ACTIVE, userId),

  // Product
  searchProducts: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_SEARCH, query),
  getProductByBarcode: (barcode: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_GET_BY_BARCODE, barcode),
  getQuickItems: () => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_GET_QUICK_ITEMS),

  // Sales
  createSale: (saleData: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SALE_CREATE, saleData),
  getReceipt: (saleId: string) => ipcRenderer.invoke(IPC_CHANNELS.SALE_GET_RECEIPT, saleId),
  getTodaySalesTotal: (shiftId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALE_GET_TODAY_TOTAL, shiftId),

  // Stock
  checkStockAvailability: (productId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_CHECK_AVAILABILITY, productId),
  deductStock: (productId: string, quantity: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_DEDUCT, { productId, quantity })
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
