import type { IpcMainInvokeEvent } from 'electron'
import { getUserById } from '../services/users/user-management'
import { hasPermission, type Permission } from '../services/users/permissions'
import { requireSessionUser } from './session'

/**
 * Run `handler` only if the *authenticated* user holds `permission`.
 *
 * The actor is taken from the main-process session keyed to the calling renderer.
 * It used to be a `userId` argument supplied by the renderer, which meant every
 * gated channel could be called as any user — including the admin, whose id
 * `auth:getUsers` handed out before anyone logged in.
 */
export async function withPermission<T>(
  event: IpcMainInvokeEvent,
  permission: Permission,
  handler: () => T | Promise<T>
): Promise<T> {
  const session = requireSessionUser(event)

  // Re-read from the database on every call so a deactivation or role change
  // takes effect immediately rather than at next login.
  const user = getUserById(session.id)
  if (!user) throw new Error('User not found')
  if (!user.isActive) throw new Error('Account inactive')
  if (!hasPermission(user.role as 'admin' | 'manager' | 'cashier', permission)) {
    throw new Error(`Permission denied: requires "${permission}"`)
  }
  return handler()
}

/** The acting user's id, for audit entries and ownership checks. */
export function actingUserId(event: IpcMainInvokeEvent): string {
  return requireSessionUser(event).id
}
