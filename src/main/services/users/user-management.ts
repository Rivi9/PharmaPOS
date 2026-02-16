import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { getDatabase } from '../database'

const SALT_ROUNDS = 10

export interface User {
  id: string
  username: string
  full_name: string
  role: 'admin' | 'manager' | 'cashier'
  pin_code: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export interface CreateUserData {
  username: string
  password: string
  full_name: string
  role: 'admin' | 'manager' | 'cashier'
  pin_code?: string
}

export interface UpdateUserData {
  full_name?: string
  role?: 'admin' | 'manager' | 'cashier'
  pin_code?: string
  is_active?: number
}

/**
 * List all users (without password hashes)
 */
export function listUsers(): User[] {
  const db = getDatabase()
  const users = db
    .prepare(
      `
    SELECT id, username, full_name, role, pin_code, is_active, created_at, updated_at
    FROM users
    ORDER BY created_at DESC
  `
    )
    .all() as User[]

  return users
}

/**
 * Get user by ID
 */
export function getUserById(id: string): User | null {
  const db = getDatabase()
  const user = db
    .prepare(
      `
    SELECT id, username, full_name, role, pin_code, is_active, created_at, updated_at
    FROM users
    WHERE id = ?
  `
    )
    .get(id) as User | undefined

  return user || null
}

/**
 * Get user by username
 */
export function getUserByUsername(username: string): User | null {
  const db = getDatabase()
  const user = db
    .prepare(
      `
    SELECT id, username, full_name, role, pin_code, is_active, created_at, updated_at
    FROM users
    WHERE username = ?
  `
    )
    .get(username) as User | undefined

  return user || null
}

/**
 * Create new user
 */
export async function createUser(data: CreateUserData): Promise<{ id: string }> {
  const db = getDatabase()

  // Check if username exists
  const existing = getUserByUsername(data.username)
  if (existing) {
    throw new Error('Username already exists')
  }

  // Validate role
  if (!['admin', 'manager', 'cashier'].includes(data.role)) {
    throw new Error('Invalid role')
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS)

  // Generate ID
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(
    `
    INSERT INTO users (
      id, username, password_hash, full_name, role, pin_code, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `
  ).run(id, data.username, passwordHash, data.full_name, data.role, data.pin_code || null, now, now)

  return { id }
}

/**
 * Update user
 */
export function updateUser(id: string, data: UpdateUserData): void {
  const db = getDatabase()

  const user = getUserById(id)
  if (!user) {
    throw new Error('User not found')
  }

  const updates: string[] = []
  const values: any[] = []

  if (data.full_name !== undefined) {
    updates.push('full_name = ?')
    values.push(data.full_name)
  }

  if (data.role !== undefined) {
    if (!['admin', 'manager', 'cashier'].includes(data.role)) {
      throw new Error('Invalid role')
    }
    updates.push('role = ?')
    values.push(data.role)
  }

  if (data.pin_code !== undefined) {
    updates.push('pin_code = ?')
    values.push(data.pin_code || null)
  }

  if (data.is_active !== undefined) {
    updates.push('is_active = ?')
    values.push(data.is_active)
  }

  if (updates.length === 0) {
    return
  }

  updates.push('updated_at = ?')
  values.push(new Date().toISOString())

  values.push(id)

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values)
}

/**
 * Change user password
 */
export async function changeUserPassword(id: string, newPassword: string): Promise<void> {
  const db = getDatabase()

  const user = getUserById(id)
  if (!user) {
    throw new Error('User not found')
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    passwordHash,
    new Date().toISOString(),
    id
  )
}

/**
 * Verify user password
 */
export async function verifyUserPassword(username: string, password: string): Promise<User | null> {
  const db = getDatabase()

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
    .get(username) as (User & { password_hash: string }) | undefined

  if (!user) {
    return null
  }

  const isValid = await bcrypt.compare(password, user.password_hash)
  if (!isValid) {
    return null
  }

  // Return user without password hash
  const { password_hash, ...userWithoutPassword } = user
  return userWithoutPassword as User
}

/**
 * Verify PIN code
 */
export function verifyPinCode(pin: string): User | null {
  const db = getDatabase()

  const user = db
    .prepare(
      `
    SELECT id, username, full_name, role, pin_code, is_active, created_at, updated_at
    FROM users
    WHERE pin_code = ? AND is_active = 1
  `
    )
    .get(pin) as User | undefined

  return user || null
}

/**
 * Deactivate user (soft delete)
 */
export function deactivateUser(id: string): void {
  const db = getDatabase()

  // Don't allow deactivating the last admin
  const adminCount = db
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1")
    .get() as { count: number }

  const user = getUserById(id)
  if (user?.role === 'admin' && adminCount.count <= 1) {
    throw new Error('Cannot deactivate the last admin user')
  }

  db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  )
}

/**
 * Reactivate user
 */
export function reactivateUser(id: string): void {
  const db = getDatabase()

  db.prepare('UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  )
}

/**
 * Get user statistics
 */
export function getUserStats(): {
  total: number
  active: number
  byRole: Record<string, number>
} {
  const db = getDatabase()

  const total = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }

  const active = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get() as {
    count: number
  }

  const byRole = db.prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role').all() as Array<{
    role: string
    count: number
  }>

  return {
    total: total.count,
    active: active.count,
    byRole: Object.fromEntries(byRole.map((r) => [r.role, r.count]))
  }
}
