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
    }),

  // Inventory - CSV Export
  exportProductsCSV: () => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_EXPORT_CSV),

  // Analytics
  analytics: {
    getDailyMetrics: (date: string) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_DAILY_METRICS, date),
    getPeriodMetrics: (startDate: string, endDate: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_PERIOD_METRICS, { startDate, endDate }),
    getTopProducts: (startDate: string, endDate: string, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_TOP_PRODUCTS, { startDate, endDate, limit }),
    getCategoryBreakdown: (startDate: string, endDate: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_CATEGORY_BREAKDOWN, { startDate, endDate }),
    getLowStockAlerts: () => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_LOW_STOCK_ALERTS),
    getExpiryAlerts: (daysAhead?: number) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_EXPIRY_ALERTS, daysAhead),
    runAggregation: (date?: string) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_RUN_AGGREGATION, date),
    reports: {
      generateSalesReport: (startDate: string, endDate: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_SALES_REPORT, { startDate, endDate }),
      generateInventoryValuation: () =>
        ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_INVENTORY_VALUATION),
      generateProfitLossReport: (startDate: string, endDate: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_PROFIT_LOSS_REPORT, { startDate, endDate })
    }
  },

  // AI
  ai: {
    getReorderSuggestions: () => ipcRenderer.invoke(IPC_CHANNELS.AI_REORDER_SUGGESTIONS),
    getSalesForecast: (productId: string, days: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SALES_FORECAST, { productId, days }),
    getDeadStockDetection: () => ipcRenderer.invoke(IPC_CHANNELS.AI_DEAD_STOCK_DETECTION),
    naturalQuery: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_NATURAL_QUERY, query)
  },

  // Backup
  backup: {
    create: (password?: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE, password),
    restore: (backupPath: string, password?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE, { backupPath, password }),
    listLocal: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_LIST_LOCAL),
    deleteLocal: (backupPath: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DELETE_LOCAL, backupPath),

    driveAuth: (accessToken: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_AUTH, accessToken),
    driveUpload: (filePath: string, fileName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_UPLOAD, { filePath, fileName }),
    driveList: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_LIST),
    driveDownload: (fileId: string, fileName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_DOWNLOAD, { fileId, fileName }),
    driveDelete: (fileId: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_DELETE, fileId),

    schedulerStart: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SCHEDULER_START),
    schedulerStop: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SCHEDULER_STOP),
    schedulerStatus: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SCHEDULER_STATUS)
  },

  // Users
  users: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.USER_LIST),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.USER_GET, id),
    create: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.USER_CREATE, data),
    update: (id: string, data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.USER_UPDATE, { id, data }),
    delete: (id: string, reactivate?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.USER_DELETE, { id, reactivate }),
    changePassword: (id: string, password: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.USER_CHANGE_PASSWORD, { id, password }),
    verifyPassword: (username: string, password: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.USER_VERIFY_PASSWORD, { username, password }),
    verifyPin: (pin: string) => ipcRenderer.invoke(IPC_CHANNELS.USER_VERIFY_PIN, pin),
    stats: () => ipcRenderer.invoke(IPC_CHANNELS.USER_STATS),

    checkPermission: (role: string, permission: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.USER_CHECK_PERMISSION, { role, permission }),
    getPermissions: (role: string) => ipcRenderer.invoke(IPC_CHANNELS.USER_GET_PERMISSIONS, role)
  },

  // Printer
  printer: {
    initialize: (config?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_INITIALIZE, config),
    test: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_TEST),
    saveConfig: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_SAVE_CONFIG, config),
    listUSB: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_LIST_USB),
    printReceipt: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_PRINT_RECEIPT, data),
    printShiftReport: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_PRINT_SHIFT_REPORT, data),
    openDrawer: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_OPEN_DRAWER)
  },

  // Setup
  setup: {
    isFirstRun: () => ipcRenderer.invoke(IPC_CHANNELS.SETUP_IS_FIRST_RUN),
    initialize: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SETUP_INITIALIZE, data),
    complete: () => ipcRenderer.invoke(IPC_CHANNELS.SETUP_COMPLETE)
  },

  // Customers
  customers: {
    list: (search?: string) => ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_LIST, search),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_GET, id),
    getByPhone: (phone: string) => ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_GET_BY_PHONE, phone),
    create: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_CREATE, data),
    update: (id: string, data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_UPDATE, { id, data }),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_DELETE, id),
    purchaseHistory: (customerId: string, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_PURCHASE_HISTORY, { customerId, limit })
  },

  // Audit Log
  audit: {
    query: (options: unknown) => ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LOG_QUERY, options),
    exportCsv: (options?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LOG_EXPORT_CSV, options)
  },

  // Pole Display (serial COM port)
  display: {
    update: (cartData: unknown) => ipcRenderer.invoke(IPC_CHANNELS.DISPLAY_UPDATE, cartData),
    saleComplete: (saleData: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.DISPLAY_SALE_COMPLETE, saleData),
    listPorts: () => ipcRenderer.invoke(IPC_CHANNELS.DISPLAY_LIST_PORTS),
    connect: (port: string, baudRate: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.DISPLAY_CONNECT, { port, baudRate }),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.DISPLAY_DISCONNECT),
    test: () => ipcRenderer.invoke(IPC_CHANNELS.DISPLAY_TEST),
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.DISPLAY_GET_STATUS)
  },

  // Updates
  updates: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_CHECK),
    download: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_DOWNLOAD),
    install: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_INSTALL)
  },

  // IPC Renderer for event listeners
  ipcRenderer: {
    on: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.on(channel, listener)
    },
    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
