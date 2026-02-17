import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDatabase, generateId } from '../database'
import bcrypt from 'bcryptjs'

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

  // Update business settings
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
    data.businessName,
    'business_name'
  )

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
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      data.currency,
      'currency_symbol'
    )
  }

  // Create the first admin user (bypasses RBAC — no authenticated user exists yet)
  const passwordHash = bcrypt.hashSync(data.adminPassword, 10)
  const adminId = generateId()
  db.prepare(
    `INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', 1, datetime('now'), datetime('now'))`
  ).run(adminId, data.adminUsername, passwordHash, data.adminFullName)
}

/**
 * Reset setup (for testing purposes)
 */
export function resetSetup(): void {
  if (fs.existsSync(SETUP_COMPLETE_FLAG)) {
    fs.unlinkSync(SETUP_COMPLETE_FLAG)
  }
}
