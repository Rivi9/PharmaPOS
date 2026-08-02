import { ipcMain } from 'electron'
import { getDatabase, generateId } from '../services/database'
import { IPC_CHANNELS } from './channels'
import { setSession, clearSession, getSessionUser } from './session'
import { withPermission, actingUserId } from './middleware'
import bcrypt from 'bcryptjs'
import { logAudit } from '../services/audit'
import { registerPOSHandlers } from './pos-handlers'
import { registerInventoryHandlers } from './inventory-handlers'
import { registerAnalyticsHandlers } from './analytics-handlers'
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

  /**
   * Escalating lockout. A 4-digit PIN is only 10,000 candidates, so without a
   * throttle the entire space could be walked from the login screen — and
   * because failures were never audited, it would leave no trace at all.
   */
  const lockoutFor = (attempts: number): number => {
    if (attempts >= 8) return 15 * 60_000
    if (attempts >= 5) return 2 * 60_000
    if (attempts >= 3) return 30_000
    return 0
  }

  // Login with PIN or password
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (event, { userId, pin, password }) => {
    const db = getDatabase()
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(userId) as any

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    if (user.locked_until) {
      const until = new Date(user.locked_until).getTime()
      if (Number.isFinite(until) && until > Date.now()) {
        const seconds = Math.ceil((until - Date.now()) / 1000)
        return {
          success: false,
          error:
            seconds > 60
              ? `Too many failed attempts. Try again in ${Math.ceil(seconds / 60)} minutes.`
              : `Too many failed attempts. Try again in ${seconds} seconds.`
        }
      }
    }

    const onSuccess = (): void => {
      db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = ?').run(
        user.id
      )
    }

    const onFailure = (method: 'pin' | 'password'): void => {
      const attempts = (user.failed_attempts ?? 0) + 1
      const lockMs = lockoutFor(attempts)
      const lockedUntil = lockMs > 0 ? new Date(Date.now() + lockMs).toISOString() : null
      db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?').run(
        attempts,
        lockedUntil,
        user.id
      )
      logAudit({
        userId: user.id,
        userName: user.full_name,
        action: lockedUntil ? 'USER_LOCKED_OUT' : 'USER_LOGIN_FAILED',
        entityType: 'user',
        entityId: user.id,
        details: { method, attempts, locked_until: lockedUntil }
      })
    }

    // PIN is always bcrypt-compared. The old fallback branch did a plain `===`
    // against the stored column when it did not look like a hash — non
    // constant-time, and it would have accepted an unhashed PIN outright.
    if (pin && user.pin_code) {
      const pinValid = await bcrypt.compare(pin, user.pin_code)
      if (pinValid) {
        const { password_hash, pin_code, ...rest } = user
        const safeUser = { ...rest, pin_set: Boolean(pin_code) }
        const activeShift = db
          .prepare(
            `SELECT opening_cash FROM shifts WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`
          )
          .get(user.id) as { opening_cash: number } | undefined
        logAudit({
          userId: user.id,
          userName: user.full_name,
          action: 'USER_LOGIN',
          entityType: 'user',
          entityId: user.id,
          details: activeShift ? { opening_cash: activeShift.opening_cash } : undefined
        })
        onSuccess()
        setSession(event, {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role
        })
        return { success: true, user: safeUser }
      }
    }

    // Check password
    if (password) {
      const valid = await bcrypt.compare(password, user.password_hash)
      if (valid) {
        const { password_hash, pin_code, ...rest } = user
        const safeUser = { ...rest, pin_set: Boolean(pin_code) }
        const activeShift = db
          .prepare(
            `SELECT opening_cash FROM shifts WHERE user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`
          )
          .get(user.id) as { opening_cash: number } | undefined
        logAudit({
          userId: user.id,
          userName: user.full_name,
          action: 'USER_LOGIN',
          entityType: 'user',
          entityId: user.id,
          details: activeShift ? { opening_cash: activeShift.opening_cash } : undefined
        })
        onSuccess()
        setSession(event, {
          id: user.id,
          username: user.username,
          fullName: user.full_name,
          role: user.role
        })
        return { success: true, user: safeUser }
      }
    }

    onFailure(pin ? 'pin' : 'password')
    const remaining = Math.max(0, 3 - ((user.failed_attempts ?? 0) + 1))
    return {
      success: false,
      error:
        remaining > 0
          ? 'Invalid credentials'
          : 'Invalid credentials. The account will be locked after further attempts.'
    }
  })

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, (event) => {
    const session = getSessionUser(event)
    if (session) {
      logAudit({
        userId: session.id,
        userName: session.fullName,
        action: 'USER_LOGOUT',
        entityType: 'user',
        entityId: session.id
      })
    }
    clearSession(event)
    return { success: true }
  })

  /**
   * First-run bootstrap only. This channel used to accept any role and create an
   * admin at any time with no permission check — one console call was enough to
   * mint an administrator. It now refuses once any user exists.
   */
  ipcMain.handle(
    IPC_CHANNELS.AUTH_CREATE_USER,
    async (_event, { username, password, fullName, pin }) => {
      const db = getDatabase()
      const { count } = db.prepare('SELECT COUNT(*) as count FROM users').get() as {
        count: number
      }
      if (count > 0) {
        return { success: false, error: 'Setup has already been completed' }
      }

      const id = generateId()
      const passwordHash = await bcrypt.hash(password, 10)
      const pinHash = pin ? await bcrypt.hash(pin, 10) : null

      try {
        db.prepare(
          `INSERT INTO users (id, username, password_hash, full_name, role, pin_code)
           VALUES (?, ?, ?, ?, 'admin', ?)`
        ).run(id, username, passwordHash, fullName, pinHash)

        logAudit({
          userId: id,
          userName: fullName,
          action: 'USER_CREATED',
          entityType: 'user',
          entityId: id,
          details: { bootstrap: true, role: 'admin' }
        })
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

  /**
   * Settings writes are permission-gated and whitelisted.
   *
   * This channel had no check at all: `setSetting('vat_rate','0')` from any
   * renderer context changed the tax on every subsequent sale immediately,
   * because the live cart reads the value.
   */
  const WRITABLE_SETTINGS = new Set([
    'business_name',
    'business_address',
    'business_phone',
    'vat_rate',
    'currency_symbol',
    'receipt_footer',
    'card_payment_enabled',
    'printer_width',
    'display_port',
    'display_baud_rate',
    'backup_enabled',
    'backup_frequency',
    'backup_time'
  ])

  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, async (event, { key, value }) => {
    return withPermission(event, 'settings:update', () => {
      if (!WRITABLE_SETTINGS.has(key)) {
        throw new Error(`"${key}" is not a writable setting`)
      }
      if (key === 'vat_rate') {
        const rate = parseFloat(value)
        if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
          throw new Error('VAT rate must be between 0 and 100')
        }
      }

      const previous = (
        getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
          | { value: string }
          | undefined
      )?.value

      writeSetting(key, value)

      logAudit({
        userId: actingUserId(event),
        action: 'SETTINGS_UPDATED',
        entityType: 'setting',
        entityId: key,
        details: { from: previous ?? null, to: value }
      })
      return { success: true }
    })
  })

  function writeSetting(key: string, value: string): void {
    const db = getDatabase()
    db.prepare(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `
    ).run(key, value, value)
  }

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
      .get(shiftId) as
      | { id: string; user_id: string; opening_cash: number; user_name: string }
      | undefined

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
