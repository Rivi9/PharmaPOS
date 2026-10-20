import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission, actingUserId } from './middleware'
import { logAudit } from '../services/audit'
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changeUserPassword,
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

interface UserDto {
  id: string
  username: string
  full_name: string
  role: User['role']
  pin_set: boolean
  is_active: User['isActive']
  created_at: string
  updated_at: string
}

/** Map Drizzle camelCase User to the snake_case shape the renderer expects. */
function mapUser(u: User): UserDto {
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

  ipcMain.handle(IPC_CHANNELS.USER_GET, async (_event, { id }: { id: string }) => {
    return withPermission(_event, 'users:view', () => {
      const u = getUserById(id)
      return u ? mapUser(u) : null
    })
  })

  ipcMain.handle(IPC_CHANNELS.USER_CREATE, async (_event, { ...data }) => {
    return withPermission(_event, 'users:create', async () => {
      const created = await createUser(data)
      logAudit({
        userId: actingUserId(_event),
        action: 'USER_CREATED',
        entityType: 'user',
        entityId: (created as { id?: string })?.id,
        details: { username: data.username, role: data.role }
      })
      return created
    })
  })

  ipcMain.handle(IPC_CHANNELS.USER_UPDATE, async (_event, { id, data }) => {
    return withPermission(_event, 'users:update', async () => {
      const before = getUserById(id)
      const result = await updateUser(id, data)
      // Record what changed, never the secrets themselves.
      logAudit({
        userId: actingUserId(_event),
        action: 'USER_UPDATED',
        entityType: 'user',
        entityId: id,
        details: {
          fields: Object.keys(data).filter((k) => k !== 'password' && k !== 'pin_code'),
          pin_changed: data.pin_code !== undefined,
          password_changed: data.password !== undefined,
          role_from: before?.role,
          role_to: data.role
        }
      })
      return result
    })
  })

  ipcMain.handle(IPC_CHANNELS.USER_CHANGE_PASSWORD, async (_event, { id, password }) => {
    return withPermission(_event, 'users:update', async () => {
      const result = await changeUserPassword(id, password)
      logAudit({
        userId: actingUserId(_event),
        action: 'USER_UPDATED',
        entityType: 'user',
        entityId: id,
        details: { password_changed: true }
      })
      return result
    })
  })

  ipcMain.handle(IPC_CHANNELS.USER_DELETE, async (_event, { id, reactivate }) => {
    return withPermission(_event, 'users:delete', async () => {
      if (reactivate) {
        reactivateUser(id)
      } else {
        await deactivateUser(id)
      }
      logAudit({
        userId: actingUserId(_event),
        action: reactivate ? 'USER_UPDATED' : 'USER_DELETED',
        entityType: 'user',
        entityId: id,
        details: { reactivated: Boolean(reactivate) }
      })
      return { success: true }
    })
  })

  // `user:verify-password` and `user:verify-pin` used to live here: unused by
  // the app, needing no login, and with none of AUTH_LOGIN's lockout or audit. A
  // signed-in cashier could walk all 10,000 PINs through verify-pin and get back
  // whichever account matched — the admin's included — with no trace. Sign-in
  // goes through AUTH_LOGIN only.

  ipcMain.handle(IPC_CHANNELS.USER_STATS, (event) => {
    return withPermission(event, 'users:view', () => getUserStats())
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
