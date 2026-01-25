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
  STOCK_DEDUCT: 'stock:deduct'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
