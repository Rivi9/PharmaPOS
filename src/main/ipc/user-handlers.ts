import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission } from './middleware'
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
import type { User } from '../db/schema'

/** Map Drizzle camelCase User to the snake_case shape the renderer expects. */
function mapUser(u: User) {
  return {
    id: u.id,
    username: u.username,
    full_name: u.fullName,
    role: u.role,
    // Never expose the PIN hash. It is bcrypt over a 4-digit PIN — 10,000
    // candidates — so shipping it to the renderer made every PIN, including the
    // admin's, recoverable offline in minutes with no failed-login trace.
    pin_set: Boolean(u.pinCode),
    is_active: u.isActive,
    created_at: u.createdAt,
    updated_at: u.updatedAt
  }
}

export function registerUserHandlers(): void {
  // User management

  ipcMain.handle(IPC_CHANNELS.USER_LIST, async (_event) => {
    return withPermission(_event, 'users:view', () => listUsers().map(mapUser))
  })

  ipcMain.handle(
    IPC_CHANNELS.USER_GET,
    async (_event, { id }: { id: string }) => {
      return withPermission(_event, 'users:view', () => {
        const u = getUserById(id)
        return u ? mapUser(u) : null
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.USER_CREATE, async (_event, { ...data }) => {
    return withPermission(_event, 'users:create', () => createUser(data))
  })

  ipcMain.handle(IPC_CHANNELS.USER_UPDATE, async (_event, { id, data }) => {
    return withPermission(_event, 'users:update', () => updateUser(id, data))
  })

  ipcMain.handle(IPC_CHANNELS.USER_CHANGE_PASSWORD, async (_event, { id, password }) => {
    return withPermission(_event, 'users:update', () => changeUserPassword(id, password))
  })

  ipcMain.handle(IPC_CHANNELS.USER_DELETE, async (_event, { id, reactivate }) => {
    return withPermission(_event, 'users:delete', async () => {
      if (reactivate) {
        reactivateUser(id)
      } else {
        await deactivateUser(id)
      }
      return { success: true }
    })
  })

  // Login flow — no permission check required

  ipcMain.handle(IPC_CHANNELS.USER_VERIFY_PASSWORD, async (_event, { username, password }) => {
    const u = await verifyUserPassword(username, password)
    return u ? mapUser(u) : null
  })

  ipcMain.handle(IPC_CHANNELS.USER_VERIFY_PIN, async (_event, pin: string) => {
    const u = await verifyPinCode(pin)
    return u ? mapUser(u) : null
  })

  ipcMain.handle(IPC_CHANNELS.USER_STATS, () => {
    return getUserStats()
  })

  // Permissions — no permission check required

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
