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
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_DEDUCT, { productId, quantity }),

  // Inventory - Products
  listProducts: () => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_LIST),
  createProduct: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_CREATE, data),
  updateProduct: (id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_UPDATE, { id, data }),
  deleteProduct: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_DELETE, id),
  getLowStockProducts: () => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_LOW_STOCK),

  // Inventory - Categories
  listCategories: () => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_LIST),
  createCategory: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_CREATE, data),
  updateCategory: (id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_UPDATE, { id, data }),
  deleteCategory: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_DELETE, id),

  // Inventory - Suppliers
  listSuppliers: () => ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_LIST),
  createSupplier: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_CREATE, data),
  updateSupplier: (id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_UPDATE, { id, data }),
  deleteSupplier: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_DELETE, id),

  // Inventory - Stock Batches
  listStockBatches: () => ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_LIST),
  createStockBatch: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_CREATE, data),
  updateStockBatch: (id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_UPDATE, { id, data }),
  deleteStockBatch: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_DELETE, id),
  adjustStockBatch: (batchId: string, quantityChange: number, reason: string, userId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_ADJUST, {
      batchId,
      quantityChange,
      reason,
      userId
    })
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
