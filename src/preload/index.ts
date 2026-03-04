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
  void: (params: { userId: string; saleId: string; reason: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SALE_VOID, params),
  refund: (params: {
    userId: string
    saleId: string
    items: Array<{
      product_id: string
      product_name: string
      quantity: number
      unit_price: number
      line_total: number
    }>
    reason?: string
    restock?: boolean
  }) => ipcRenderer.invoke(IPC_CHANNELS.SALE_REFUND, params),

  // Stock
  checkStockAvailability: (productId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_CHECK_AVAILABILITY, productId),
  deductStock: (productId: string, quantity: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_DEDUCT, { productId, quantity }),

  // Inventory - Products
  listProducts: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_LIST, { userId }),
  createProduct: (userId: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_CREATE, { userId, ...(data as object) }),
  updateProduct: (userId: string, id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_UPDATE, { userId, id, data }),
  deleteProduct: (userId: string, id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_DELETE, { userId, id }),
  getLowStockProducts: (userId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_LOW_STOCK, { userId }),

  // Inventory - Categories
  listCategories: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_LIST, { userId }),
  createCategory: (userId: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_CREATE, { userId, ...(data as object) }),
  updateCategory: (userId: string, id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_UPDATE, { userId, id, data }),
  deleteCategory: (userId: string, id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_DELETE, { userId, id }),

  // Inventory - Suppliers
  listSuppliers: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_LIST, { userId }),
  createSupplier: (userId: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_CREATE, { userId, ...(data as object) }),
  updateSupplier: (userId: string, id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_UPDATE, { userId, id, data }),
  deleteSupplier: (userId: string, id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_DELETE, { userId, id }),

  // Inventory - Stock Batches
  listStockBatches: (userId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_LIST, { userId }),
  createStockBatch: (userId: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_CREATE, { userId, ...(data as object) }),
  updateStockBatch: (userId: string, id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_UPDATE, { userId, id, data }),
  deleteStockBatch: (userId: string, id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_DELETE, { userId, id }),
  adjustStockBatch: (userId: string, batchId: string, quantityChange: number, reason: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_ADJUST, {
      userId,
      batchId,
      quantityChange,
      reason
    }),

  // Inventory - CSV Export
  exportProductsCSV: (userId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_EXPORT_CSV, { userId }),

  // Inventory - Excel Import (opens native file dialog in main process)
  importProductsExcel: (userId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_IMPORT_CSV, { userId }),

  // Analytics
  analytics: {
    getDailyMetrics: (userId: string, date: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_DAILY_METRICS, { userId, date }),
    getPeriodMetrics: (userId: string, startDate: string, endDate: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_PERIOD_METRICS, { userId, startDate, endDate }),
    getTopProducts: (userId: string, startDate: string, endDate: string, limit?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_TOP_PRODUCTS, {
        userId,
        startDate,
        endDate,
        limit
      }),
    getCategoryBreakdown: (userId: string, startDate: string, endDate: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_CATEGORY_BREAKDOWN, { userId, startDate, endDate }),
    getLowStockAlerts: (userId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_LOW_STOCK_ALERTS, { userId }),
    getExpiryAlerts: (userId: string, daysAhead?: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_EXPIRY_ALERTS, { userId, daysAhead }),
    runAggregation: (userId: string, date?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_RUN_AGGREGATION, { userId, date }),
    reports: {
      generateSalesReport: (userId: string, startDate: string, endDate: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_SALES_REPORT, { userId, startDate, endDate }),
      generateInventoryValuation: (userId: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_INVENTORY_VALUATION, { userId }),
      generateProfitLossReport: (userId: string, startDate: string, endDate: string) =>
        ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_PROFIT_LOSS_REPORT, {
          userId,
          startDate,
          endDate
        })
    }
  },

  // AI
  ai: {
    getReorderSuggestions: (userId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_REORDER_SUGGESTIONS, { userId }),
    getSalesForecast: (userId: string, productId: string, days: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SALES_FORECAST, { userId, productId, days }),
    getDeadStockDetection: (userId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_DEAD_STOCK_DETECTION, { userId }),
    naturalQuery: (userId: string, query: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_NATURAL_QUERY, { userId, query })
  },

  // Backup
  backup: {
    create: (userId: string, password?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE, { userId, password }),
    restore: (userId: string, backupPath: string, password?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE, { userId, backupPath, password }),
    listLocal: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_LIST_LOCAL),
    deleteLocal: (backupPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DELETE_LOCAL, backupPath),

    driveAuth: (accessToken: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_AUTH, accessToken),
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
    list: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.USER_LIST, { userId }),
    get: (userId: string, id: string) => ipcRenderer.invoke(IPC_CHANNELS.USER_GET, { userId, id }),
    create: (userId: string, data: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.USER_CREATE, { userId, ...(data as object) }),
    update: (userId: string, id: string, data: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.USER_UPDATE, { userId, id, data }),
    delete: (userId: string, id: string, reactivate?: boolean) =>
      ipcRenderer.invoke(IPC_CHANNELS.USER_DELETE, { userId, id, reactivate }),
    changePassword: (userId: string, id: string, password: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.USER_CHANGE_PASSWORD, { userId, id, password }),
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
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_GET_CONFIG),
    initialize: (config?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_INITIALIZE, config),
    test: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_TEST),
    saveConfig: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_SAVE_CONFIG, config),
    listUSB: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_LIST_USB),
    printReceipt: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_PRINT_RECEIPT, data),
    printShiftReport: (data: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.PRINTER_PRINT_SHIFT_REPORT, data),
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
    create: (userId: string, data: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_CREATE, { userId, ...(data as object) }),
    update: (userId: string, id: string, data: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_UPDATE, { userId, id, data }),
    delete: (userId: string, id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_DELETE, { userId, id }),
    purchaseHistory: (customerId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_PURCHASE_HISTORY, customerId)
  },

  // Audit Log
  audit: {
    query: (userId: string, options: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LOG_QUERY, { userId, ...(options as object) }),
    exportCsv: (userId: string, options?: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LOG_EXPORT_CSV, {
        userId,
        ...((options as object) ?? {})
      })
  },

  // Shifts - Extended
  shifts: {
    computeExpectedCash: (shiftId: string, openingCash: number) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHIFT_COMPUTE_EXPECTED_CASH, { shiftId, openingCash })
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
    },
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args)
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
