import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changeUserPassword,
  verifyUserPassword,
  verifyPinCode,
  deactivateUser,
  reactivateUser,
  getUserStats
} from '../services/users/user-management'
import {
  hasPermission,
  getRolePermissions,
  type Permission,
  type Role
} from '../services/users/permissions'

export function registerUserHandlers(): void {
  // User management
  ipcMain.handle(IPC_CHANNELS.USER_LIST, () => {
    return listUsers()
  })

  ipcMain.handle(IPC_CHANNELS.USER_GET, (_event, id: string) => {
    return getUserById(id)
  })

  ipcMain.handle(IPC_CHANNELS.USER_CREATE, async (_event, data) => {
    return await createUser(data)
  })

  ipcMain.handle(IPC_CHANNELS.USER_UPDATE, (_event, { id, data }) => {
    updateUser(id, data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.USER_DELETE, (_event, { id, reactivate }) => {
    if (reactivate) {
      reactivateUser(id)
    } else {
      deactivateUser(id)
    }
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.USER_CHANGE_PASSWORD, async (_event, { id, password }) => {
    await changeUserPassword(id, password)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.USER_VERIFY_PASSWORD, async (_event, { username, password }) => {
    return await verifyUserPassword(username, password)
  })

  ipcMain.handle(IPC_CHANNELS.USER_VERIFY_PIN, (_event, pin: string) => {
    return verifyPinCode(pin)
  })

  ipcMain.handle(IPC_CHANNELS.USER_STATS, () => {
    return getUserStats()
  })

  // Permissions
  ipcMain.handle(
    IPC_CHANNELS.USER_CHECK_PERMISSION,
    (_event, { role, permission }: { role: Role; permission: Permission }) => {
      return hasPermission(role, permission)
    }
  )

  ipcMain.handle(IPC_CHANNELS.USER_GET_PERMISSIONS, (_event, role: Role) => {
    return getRolePermissions(role)
  })
}
