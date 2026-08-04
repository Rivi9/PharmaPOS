import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDatabase, generateId } from '../database'
import bcrypt from 'bcryptjs'
import { assertPasswordStrength } from '../users/user-management'

const SETUP_COMPLETE_FLAG = path.join(app.getPath('userData'), '.setup-complete')

/**
 * Check if this is the first run
 */
export function isFirstRun(): boolean {
  return !fs.existsSync(SETUP_COMPLETE_FLAG)
}

/**
 * Mark setup as complete
 */
export function markSetupComplete(): void {
  fs.writeFileSync(SETUP_COMPLETE_FLAG, new Date().toISOString())
}

/**
 * Initialize database with default data
 */
export function initializeDatabase(data: {
  businessName: string
  businessAddress?: string
  businessPhone?: string
  currency?: string
  adminUsername: string
  adminPassword: string
  adminFullName: string
}): void {
  const db = getDatabase()

  // The wizard creates the pharmacy's ONLY admin through its own INSERT, because
  // no authenticated user exists yet to pass RBAC. That also meant it inherited
  // none of the account rules `createUser` enforces: the "at least 8 characters"
  // line on the screen was copy, never a check, so a one-character password on
  // the account that owns the whole till was accepted.
  const businessName = data.businessName?.trim()
  if (!businessName) throw new Error('Business name is required')

  const adminUsername = data.adminUsername?.trim()
  if (!adminUsername) throw new Error('Admin username is required')
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(adminUsername)) {
    throw new Error('Username must be 3–32 characters, letters, numbers, dot, dash or underscore')
  }

  const adminFullName = data.adminFullName?.trim()
  if (!adminFullName) throw new Error('Admin full name is required')

  assertPasswordStrength(data.adminPassword, adminUsername)

  // Update business settings
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(businessName, 'business_name')

  if (data.businessAddress) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      data.businessAddress,
      'business_address'
    )
  }

  if (data.businessPhone) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      data.businessPhone,
      'business_phone'
    )
  }

  if (data.currency) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(data.currency, 'currency_symbol')
  }

  // Create the first admin user (bypasses RBAC — no authenticated user exists yet)
  const passwordHash = bcrypt.hashSync(data.adminPassword, 10)
  const adminId = generateId()
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', 1, datetime('now'), datetime('now'))`
    )
    .run(adminId, adminUsername, passwordHash, adminFullName)

  // OR IGNORE swallows a username collision, so the wizard reported success and
  // then nobody could sign in with the credentials they had just chosen.
  if (result.changes === 0) {
    throw new Error(`The username "${adminUsername}" is already taken`)
  }
}

/**
 * Reset setup (for testing purposes)
 */
export function resetSetup(): void {
  if (fs.existsSync(SETUP_COMPLETE_FLAG)) {
    fs.unlinkSync(SETUP_COMPLETE_FLAG)
  }
}
