import { webContents, type IpcMainInvokeEvent } from 'electron'
import { logInfo, logWarning } from '../services/logging/logger'

export interface SessionUser {
  id: string
  username: string
  fullName: string
  role: 'admin' | 'manager' | 'cashier'
}

/**
 * Authenticated users, keyed by the renderer that logged in.
 *
 * Authorisation used to trust a `userId` sent up from the renderer, and
 * `auth:getUsers` handed out every user's id and role before login — so any
 * renderer code could act as the admin. The acting user is now resolved here,
 * in the main process, and the renderer cannot influence it.
 */
const sessions = new Map<number, SessionUser>()

export function setSession(event: IpcMainInvokeEvent, user: SessionUser): void {
  sessions.set(event.sender.id, user)
  logInfo('Session established', { username: user.username, role: user.role })
}

export function clearSession(event: IpcMainInvokeEvent): void {
  sessions.delete(event.sender.id)
}

/** The authenticated user for this IPC call, or null if not signed in. */
export function getSessionUser(event: IpcMainInvokeEvent): SessionUser | null {
  return sessions.get(event.sender.id) ?? null
}

/** The authenticated user, or throw. Use in any handler that mutates data. */
export function requireSessionUser(event: IpcMainInvokeEvent): SessionUser {
  const user = getSessionUser(event)
  if (!user) {
    logWarning('Rejected an IPC call with no authenticated session')
    throw new Error('Not signed in')
  }
  return user
}

/**
 * Drop sessions for renderers that no longer exist — a reload or crash would
 * otherwise leave an authenticated session bound to a dead webContents id that
 * a later renderer could be assigned.
 */
export function pruneDeadSessions(): void {
  const live = new Set(webContents.getAllWebContents().map((wc) => wc.id))
  for (const id of sessions.keys()) {
    if (!live.has(id)) sessions.delete(id)
  }
}
