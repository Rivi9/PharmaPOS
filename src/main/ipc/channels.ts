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
} as const

export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
