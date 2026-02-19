import { ipcMain } from 'electron'
import { getDatabase, generateId } from '../services/database'
import { IPC_CHANNELS } from './channels'
import bcrypt from 'bcryptjs'
import { logAudit } from '../services/audit'
import { registerPOSHandlers } from './pos-handlers'
import { registerInventoryHandlers } from './inventory-handlers'
import { registerAnalyticsHandlers } from './analytics-handlers'
import { registerAIHandlers } from './ai-handlers'
import { registerBackupHandlers } from './backup-handlers'
import { registerUserHandlers } from './user-handlers'
import { registerPrinterHandlers } from './printer-handlers'
import { registerSetupHandlers } from './setup-handlers'
import { registerUpdateHandlers } from './update-handlers'
import { registerAuditHandlers } from './audit-handlers'
import { registerCustomerHandlers } from './customer-handlers'
import { computeShiftExpectedCash } from '../services/sales'

export function registerIpcHandlers(): void {
  // Register POS handlers
  registerPOSHandlers()

  // Register Inventory handlers
  registerInventoryHandlers()

  // Register Analytics handlers
  registerAnalyticsHandlers()

  // Register AI handlers
  registerAIHandlers()

  // Register Backup handlers
  registerBackupHandlers()

  // Register User handlers
  registerUserHandlers()

  // Register Printer handlers
  registerPrinterHandlers()

  // Register Setup handlers
  registerSetupHandlers()

  // Register Update handlers
  registerUpdateHandlers()

  // Register Audit handlers
  registerAuditHandlers()

  // Register Customer handlers
  registerCustomerHandlers()

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

    // Check PIN (bcrypt-compare; also handles legacy plain-text PINs via startsWith guard)
    if (pin && user.pin_code) {
      const isBcryptHash = user.pin_code.startsWith('$2')
      const pinValid = isBcryptHash
        ? await bcrypt.compare(pin, user.pin_code)
        : user.pin_code === pin
      if (pinValid) {
        const { password_hash, ...safeUser } = user
        const activeShift = db
          .prepare(`SELECT opening_cash FROM shifts WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`)
          .get(user.id) as { opening_cash: number } | undefined
        logAudit({
          userId: user.id,
          userName: user.full_name,
          action: 'USER_LOGIN',
          entityType: 'user',
          entityId: user.id,
          details: activeShift ? { opening_cash: activeShift.opening_cash } : undefined
        })
        return { success: true, user: safeUser }
      }
    }

    // Check password
    if (password) {
      const valid = await bcrypt.compare(password, user.password_hash)
      if (valid) {
        const { password_hash, ...safeUser } = user
        const activeShift = db
          .prepare(`SELECT opening_cash FROM shifts WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`)
          .get(user.id) as { opening_cash: number } | undefined
        logAudit({
          userId: user.id,
          userName: user.full_name,
          action: 'USER_LOGIN',
          entityType: 'user',
          entityId: user.id,
          details: activeShift ? { opening_cash: activeShift.opening_cash } : undefined
        })
        return { success: true, user: safeUser }
      }
    }

    return { success: false, error: 'Invalid credentials' }
  })

  // Create user (legacy auth route — used by LoginPage first-run fallback)
  ipcMain.handle(
    IPC_CHANNELS.AUTH_CREATE_USER,
    async (_, { username, password, fullName, role, pin }) => {
      const db = getDatabase()
      const id = generateId()
      const passwordHash = await bcrypt.hash(password, 10)
      const pinHash = pin ? await bcrypt.hash(pin, 10) : null

      try {
        db.prepare(
          `
        INSERT INTO users (id, username, password_hash, full_name, role, pin_code)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        ).run(id, username, passwordHash, fullName, role, pinHash)

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
      INSERT INTO shifts (id, user_id, opening_cash, status, started_at)
      VALUES (?, ?, ?, 'active', datetime('now'))
    `
    ).run(id, userId, openingCash)

    const user = db.prepare('SELECT id, full_name FROM users WHERE id = ?').get(userId) as
      | { id: string; full_name: string }
      | undefined

    logAudit({
      userId,
      userName: user?.full_name,
      action: 'SHIFT_STARTED',
      entityType: 'shift',
      entityId: id,
      details: { opening_cash: openingCash }
    })

    return { success: true, shiftId: id }
  })

  // End shift
  ipcMain.handle(IPC_CHANNELS.SHIFT_END, (_, { shiftId, closingCash, notes }) => {
    const db = getDatabase()
    const shift = db
      .prepare(
        `
        SELECT s.id, s.user_id, s.opening_cash, u.full_name as user_name
        FROM shifts s
        JOIN users u ON s.user_id = u.id
        WHERE s.id = ?
      `
      )
      .get(shiftId) as { id: string; user_id: string; opening_cash: number; user_name: string } | undefined

    const openingCash = shift?.opening_cash ?? 0
    const expectedCash = computeShiftExpectedCash(shiftId, openingCash)
    const cashDifference = closingCash - expectedCash

    db.prepare(
      `
      UPDATE shifts
      SET ended_at = datetime('now'), closing_cash = ?, notes = ?, status = 'closed'
      WHERE id = ?
    `
    ).run(closingCash, notes || null, shiftId)

    if (shift) {
      const cashDetails = {
        opening_cash: openingCash,
        expected_cash: expectedCash,
        closing_cash: closingCash,
        cash_difference: cashDifference,
        notes: notes || null
      }

      logAudit({
        userId: shift.user_id,
        userName: shift.user_name,
        action: 'SHIFT_ENDED',
        entityType: 'shift',
        entityId: shiftId,
        details: cashDetails
      })

      logAudit({
        userId: shift.user_id,
        userName: shift.user_name,
        action: 'USER_LOGOUT',
        entityType: 'user',
        entityId: shift.user_id,
        details: { shift_id: shiftId, ...cashDetails }
      })
    }

    return { success: true }
  })

  // Get active shift for user
  ipcMain.handle(IPC_CHANNELS.SHIFT_GET_ACTIVE, (_, userId: string) => {
    const db = getDatabase()
    const shift = db
      .prepare(
        `
      SELECT s.*, u.full_name as user_name FROM shifts s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id = ? AND s.status = 'active'
      ORDER BY s.started_at DESC LIMIT 1
    `
      )
      .get(userId)

    return shift || null
  })
}
