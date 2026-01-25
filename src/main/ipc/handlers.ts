import { ipcMain } from 'electron'
import { getDatabase, generateId } from '../services/database'
import { IPC_CHANNELS } from './channels'
import bcrypt from 'bcryptjs'
import { registerPOSHandlers } from './pos-handlers'

export function registerIpcHandlers(): void {
  // Register POS handlers
  registerPOSHandlers()
  // Get all users (for login dropdown)
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_USERS, () => {
    const db = getDatabase()
    const users = db
      .prepare(
        `
      SELECT id, username, full_name, role, is_active
      FROM users
      WHERE is_active = 1
    `
      )
      .all()
    return users
  })

  // Login with PIN or password
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_, { userId, pin, password }) => {
    const db = getDatabase()
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(userId) as any

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    // Check PIN
    if (pin && user.pin_code === pin) {
      const { password_hash, ...safeUser } = user
      return { success: true, user: safeUser }
    }

    // Check password
    if (password) {
      const valid = await bcrypt.compare(password, user.password_hash)
      if (valid) {
        const { password_hash, ...safeUser } = user
        return { success: true, user: safeUser }
      }
    }

    return { success: false, error: 'Invalid credentials' }
  })

  // Create user
  ipcMain.handle(
    IPC_CHANNELS.AUTH_CREATE_USER,
    async (_, { username, password, fullName, role, pin }) => {
      const db = getDatabase()
      const id = generateId()
      const passwordHash = await bcrypt.hash(password, 10)

      try {
        db.prepare(
          `
        INSERT INTO users (id, username, password_hash, full_name, role, pin_code)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        ).run(id, username, passwordHash, fullName, role, pin || null)

        return { success: true, id }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // Get settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_, key: string) => {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    return row?.value || null
  })

  // Set setting
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_, { key, value }) => {
    const db = getDatabase()
    db.prepare(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `
    ).run(key, value, value)
    return { success: true }
  })

  // Get all settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    const db = getDatabase()
    const rows = db.prepare('SELECT key, value FROM settings').all() as any[]
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  })

  // Start shift
  ipcMain.handle(IPC_CHANNELS.SHIFT_START, (_, { userId, openingCash }) => {
    const db = getDatabase()
    const id = generateId()

    db.prepare(
      `
      INSERT INTO shifts (id, user_id, opening_cash, status)
      VALUES (?, ?, ?, 'active')
    `
    ).run(id, userId, openingCash)

    return { success: true, shiftId: id }
  })

  // End shift
  ipcMain.handle(IPC_CHANNELS.SHIFT_END, (_, { shiftId, closingCash, notes }) => {
    const db = getDatabase()

    db.prepare(
      `
      UPDATE shifts
      SET ended_at = datetime('now'), closing_cash = ?, notes = ?, status = 'closed'
      WHERE id = ?
    `
    ).run(closingCash, notes || null, shiftId)

    return { success: true }
  })

  // Get active shift for user
  ipcMain.handle(IPC_CHANNELS.SHIFT_GET_ACTIVE, (_, userId: string) => {
    const db = getDatabase()
    const shift = db
      .prepare(
        `
      SELECT * FROM shifts
      WHERE user_id = ? AND status = 'active'
      ORDER BY started_at DESC LIMIT 1
    `
      )
      .get(userId)

    return shift || null
  })
}
