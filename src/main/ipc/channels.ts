export const IPC_CHANNELS = {
  // Database
  DB_QUERY: 'db:query',

  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_USERS: 'auth:getUsers',
  AUTH_CREATE_USER: 'auth:createUser',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:getAll',

  // Shift
  SHIFT_START: 'shift:start',
  SHIFT_END: 'shift:end',
  SHIFT_GET_ACTIVE: 'shift:getActive',

  // Product
  PRODUCT_SEARCH: 'product:search',
  PRODUCT_GET_BY_BARCODE: 'product:getByBarcode',
  PRODUCT_GET_QUICK_ITEMS: 'product:getQuickItems',

  // Sales
  SALE_CREATE: 'sale:create',
  SALE_GET_RECEIPT: 'sale:getReceipt',
  SALE_GET_TODAY_TOTAL: 'sale:getTodayTotal',

  // Stock
  STOCK_CHECK_AVAILABILITY: 'stock:checkAvailability',
  STOCK_DEDUCT: 'stock:deduct',

  // Inventory - Products
  PRODUCT_LIST: 'product:list',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',
  PRODUCT_LOW_STOCK: 'product:lowStock',

  // Inventory - Categories
  CATEGORY_LIST: 'category:list',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_DELETE: 'category:delete',

  // Inventory - Suppliers
  SUPPLIER_LIST: 'supplier:list',
  SUPPLIER_CREATE: 'supplier:create',
  SUPPLIER_UPDATE: 'supplier:update',
  SUPPLIER_DELETE: 'supplier:delete',

  // Inventory - Stock Batches
  STOCK_BATCH_LIST: 'stock:batchList',
  STOCK_BATCH_CREATE: 'stock:batchCreate',
  STOCK_BATCH_UPDATE: 'stock:batchUpdate',
  STOCK_BATCH_DELETE: 'stock:batchDelete',
  STOCK_BATCH_ADJUST: 'stock:batchAdjust',

  // Inventory - Import/Export
  PRODUCT_IMPORT_CSV: 'product:importCsv',
  PRODUCT_EXPORT_CSV: 'product:exportCsv',

  // Analytics - Dashboard
  ANALYTICS_DAILY_METRICS: 'analytics:daily-metrics',
  ANALYTICS_PERIOD_METRICS: 'analytics:period-metrics',
  ANALYTICS_TOP_PRODUCTS: 'analytics:top-products',
  ANALYTICS_CATEGORY_BREAKDOWN: 'analytics:category-breakdown',
  ANALYTICS_LOW_STOCK_ALERTS: 'analytics:low-stock-alerts',
  ANALYTICS_EXPIRY_ALERTS: 'analytics:expiry-alerts',

  // Analytics - Reports
  ANALYTICS_SALES_REPORT: 'analytics:sales-report',
  ANALYTICS_INVENTORY_VALUATION: 'analytics:inventory-valuation',
  ANALYTICS_PROFIT_LOSS_REPORT: 'analytics:profit-loss-report',

  // Analytics - Aggregation
  ANALYTICS_RUN_AGGREGATION: 'analytics:run-aggregation',

  // AI - Gemini Integration
  AI_REORDER_SUGGESTIONS: 'ai:reorder-suggestions',
  AI_SALES_FORECAST: 'ai:sales-forecast',
  AI_DEAD_STOCK_DETECTION: 'ai:dead-stock-detection',
  AI_NATURAL_QUERY: 'ai:natural-query',

  // Backup - Local
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_LIST_LOCAL: 'backup:list-local',
  BACKUP_DELETE_LOCAL: 'backup:delete-local',

  // Backup - Google Drive
  BACKUP_DRIVE_AUTH: 'backup:drive-auth',
  BACKUP_DRIVE_UPLOAD: 'backup:drive-upload',
  BACKUP_DRIVE_LIST: 'backup:drive-list',
  BACKUP_DRIVE_DOWNLOAD: 'backup:drive-download',
  BACKUP_DRIVE_DELETE: 'backup:drive-delete',

  // Backup - Scheduler
  BACKUP_SCHEDULER_START: 'backup:scheduler-start',
  BACKUP_SCHEDULER_STOP: 'backup:scheduler-stop',
  BACKUP_SCHEDULER_STATUS: 'backup:scheduler-status',

  // Users - Management
  USER_LIST: 'user:list',
  USER_GET: 'user:get',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_CHANGE_PASSWORD: 'user:change-password',
  USER_VERIFY_PASSWORD: 'user:verify-password',
  USER_VERIFY_PIN: 'user:verify-pin',
  USER_STATS: 'user:stats',

  // Users - Permissions
  USER_CHECK_PERMISSION: 'user:check-permission',
  USER_GET_PERMISSIONS: 'user:get-permissions',

  // Printer
  PRINTER_INITIALIZE: 'printer:initialize',
  PRINTER_TEST: 'printer:test',
  PRINTER_SAVE_CONFIG: 'printer:save-config',
  PRINTER_LIST_USB: 'printer:list-usb',
  PRINTER_PRINT_RECEIPT: 'printer:print-receipt',
  PRINTER_PRINT_SHIFT_REPORT: 'printer:print-shift-report',
  PRINTER_OPEN_DRAWER: 'printer:open-drawer',

  // Updates
  UPDATES_CHECK: 'updates:check',
  UPDATES_DOWNLOAD: 'updates:download',
  UPDATES_INSTALL: 'updates:install',

  // Setup
  SETUP_IS_FIRST_RUN: 'setup:is-first-run',
  SETUP_INITIALIZE: 'setup:initialize',
  SETUP_COMPLETE: 'setup:complete',

  // Customer Display
  DISPLAY_UPDATE: 'display:update',
  DISPLAY_SALE_COMPLETE: 'display:sale-complete',

  // Audit Log
  AUDIT_LOG_QUERY: 'audit:query',
  AUDIT_LOG_EXPORT_CSV: 'audit:export-csv',

  // Customer Management
  CUSTOMER_LIST: 'customer:list',
  CUSTOMER_GET: 'customer:get',
  CUSTOMER_GET_BY_PHONE: 'customer:getByPhone',
  CUSTOMER_CREATE: 'customer:create',
  CUSTOMER_UPDATE: 'customer:update',
  CUSTOMER_DELETE: 'customer:delete',
  CUSTOMER_PURCHASE_HISTORY: 'customer:purchaseHistory'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
