import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../main/ipc/channels'
import type {
  RefundPreview,
  SaleDetail,
  SaleListRow,
  SalesPageQuery
} from '../shared/sales-history'

const electronAPI = {
  // Auth
  getUsers: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_USERS),
  logout: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT),
  // Lets the renderer recover its own session after a reload (L7).
  currentUser: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CURRENT_USER),
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

  // Shift. The acting user comes from the main-process session, so no userId is
  // sent — passing one let a renderer open or read another cashier's shift.
  startShift: (data: { openingCash: number }) => ipcRenderer.invoke(IPC_CHANNELS.SHIFT_START, data),
  endShift: (data: { shiftId: string; closingCash: number; notes?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_END, data),
  getActiveShift: () => ipcRenderer.invoke(IPC_CHANNELS.SHIFT_GET_ACTIVE),

  // Product
  searchProducts: (query: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_SEARCH, query, limit),
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

  // Sales screen. No user id: the main process authorises from the session.
  sales: {
    listPage: (query: SalesPageQuery): Promise<{ rows: SaleListRow[]; total: number }> =>
      ipcRenderer.invoke(IPC_CHANNELS.SALE_LIST_PAGE, query),
    detail: (saleId: string): Promise<SaleDetail | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.SALE_DETAIL, saleId),
    refundPreview: (params: {
      saleId: string
      items: Array<{ product_id: string; quantity: number; product_name?: string }>
    }): Promise<RefundPreview> => ipcRenderer.invoke(IPC_CHANNELS.SALE_REFUND_PREVIEW, params)
  },

  // Stock
  checkStockAvailability: (productId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_CHECK_AVAILABILITY, productId),

  // Inventory - Products
  // `_userId` is vestigial on these two: the handler resolves the acting user
  // from the main-process session. It is kept so the call shape matches every
  // other inventory bridge rather than being the one odd one out.
  listProductsPage: (
    _userId: string,
    query?: { search?: string; limit?: number; offset?: number; includeInactive?: boolean }
  ) => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_LIST_PAGE, query ?? {}),
  listStockBatchesPage: (
    _userId: string,
    query?: { search?: string; limit?: number; offset?: number; includeSoldOut?: boolean }
  ) => ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_LIST_PAGE, query ?? {}),
  listProducts: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_LIST, { userId }),
  createProduct: (userId: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_CREATE, { userId, ...(data as object) }),
  updateProduct: (userId: string, id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_UPDATE, { userId, id, data }),
  deleteProduct: (userId: string, id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_DELETE, { userId, id }),
  reactivateProduct: (userId: string, id: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_REACTIVATE, { userId, id }),
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
  batchLedger: (userId: string, batchId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_LEDGER, { userId, batchId }),
  // `productId` is deliberately absent: the main process reads it off the batch,
  // so an adjustment cannot be filed against the wrong product (M14).
  adjustStockBatch: (
    userId: string,
    batchId: string,
    quantityChange: number,
    reason: string,
    adjustmentType?: 'add' | 'remove' | 'correction'
  ) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_ADJUST, {
      userId,
      batchId,
      quantityChange,
      reason,
      adjustmentType
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

  // AI insights removed — no pharmacy or customer data leaves the machine.

  // Backup
  backup: {
    create: (userId: string, password?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE, { userId, password }),
    restore: (userId: string, backupPath: string, password?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE, { userId, backupPath, password }),
    listLocal: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_LIST_LOCAL, userId),
    deleteLocal: (userId: string, backupPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DELETE_LOCAL, { userId, backupPath }),

    driveAuth: (userId: string, accessToken: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_AUTH, { userId, accessToken }),
    driveUpload: (userId: string, filePath: string, fileName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_UPLOAD, { userId, filePath, fileName }),
    driveList: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_LIST, userId),
    driveDownload: (userId: string, fileId: string, fileName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_DOWNLOAD, { userId, fileId, fileName }),
    driveDelete: (userId: string, fileId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_DELETE, { userId, fileId }),

    recoveryKey: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RECOVERY_KEY, userId),
    schedulerStart: (userId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SCHEDULER_START, userId),
    schedulerStop: (userId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SCHEDULER_STOP, userId),
    schedulerStatus: (userId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SCHEDULER_STATUS, userId)
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
    checkoutLookup: (phone: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_CHECKOUT_LOOKUP, phone),
    create: (userId: string, data: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_CREATE, { userId, ...(data as object) }),
    update: (userId: string, id: string, data: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_UPDATE, { userId, id, data }),
    delete: (userId: string, id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_DELETE, { userId, id }),
    erase: (userId: string, id: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_ERASE, { userId, id }),
    purchaseHistory: (customerId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_PURCHASE_HISTORY, customerId)
  },

  // Audit Log
  // `_actorId` is kept for call-site compatibility but NOT sent: AuditQueryOptions
  // treats `userId` as a row filter, so spreading the signed-in user's id into
  // the options limited the "all actions" log (and its CSV export) to that
  // user's own rows. The handler authorises from the session, not from this.
  audit: {
    query: (_actorId: string, options: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LOG_QUERY, { ...((options as object) ?? {}) }),
    exportCsv: (_actorId: string, options?: unknown) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LOG_EXPORT_CSV, { ...((options as object) ?? {}) })
  },

  // Shifts - Extended
  shifts: {
    // No opening float is sent: the main process uses the one recorded on the shift.
    computeExpectedCash: (shiftId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHIFT_COMPUTE_EXPECTED_CASH, { shiftId }),
    // No userId or shiftId: the movement is always the signed-in user's, on
    // their own open shift, resolved in the main process.
    recordCashMovement: (params: { type: 'in' | 'out'; amount: number; reason: string }) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHIFT_CASH_MOVEMENT, params),
    cashMovements: (shiftId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.SHIFT_CASH_MOVEMENTS, shiftId)
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
    // Listeners are typed by their callers; `unknown[]` would reject every typed one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    on: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.on(channel, listener)
    },
    // Listeners are typed by their callers; `unknown[]` would reject every typed one.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeListener: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.removeListener(channel, listener)
    },
    send: (channel: string, ...args: unknown[]) => {
      ipcRenderer.send(channel, ...args)
    }
  }
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
