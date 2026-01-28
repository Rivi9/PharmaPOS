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
  PRODUCT_EXPORT_CSV: 'product:exportCsv'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
