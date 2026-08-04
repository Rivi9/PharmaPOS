import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { eq, and, count } from 'drizzle-orm'
import { getDb } from '../../db/index'
import { users } from '../../db/schema'
import type { User } from '../../db/schema'

const SALT_ROUNDS = 10

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
  password?: string
  is_active?: number
}

const MIN_PASSWORD_LENGTH = 8

/**
 * Enforced in the service so every entry point inherits it. The change-password
 * dialog only rejected whitespace, and the setup wizard's "at least 8 characters"
 * copy was never actually checked — a one-character admin password was accepted.
 *
 * Exported because the first-run wizard creates the pharmacy's only admin
 * through its own INSERT (no authenticated user exists yet to pass RBAC), so it
 * cannot go through `createUser` and has to call this directly.
 */
export function assertPasswordStrength(password: string, username?: string): void {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  if (username && password.toLowerCase() === username.toLowerCase()) {
    throw new Error('Password must not be the same as the username')
  }
}

/** PINs are numeric and short by design; enforce the shape so 1-digit PINs cannot exist. */
function assertPinFormat(pin: string): void {
  if (!/^\d{4,6}$/.test(pin)) {
    throw new Error('PIN must be 4 to 6 digits')
  }
}

/**
 * List all users (without password hashes)
 */
export function listUsers(): User[] {
  return getDb().select().from(users).orderBy(users.fullName).all()
}

/**
 * Get user by ID
 */
export function getUserById(id: string): User | null {
  const user = getDb().select().from(users).where(eq(users.id, id)).get()
  return user ?? null
}

/**
 * Get user by username
 */
export function getUserByUsername(username: string): User | null {
  const user = getDb().select().from(users).where(eq(users.username, username)).get()
  return user ?? null
}

/**
 * Create new user
 */
export async function createUser(data: CreateUserData): Promise<{ id: string }> {
  // Check if username exists
  const existing = getUserByUsername(data.username)
  if (existing) {
    throw new Error('Username already exists')
  }

  // Validate role
  if (!['admin', 'manager', 'cashier'].includes(data.role)) {
    throw new Error('Invalid role')
  }

  assertPasswordStrength(data.password, data.username)
  if (data.pin_code) assertPinFormat(data.pin_code)

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS)

  // Hash PIN if provided
  const pinHash = data.pin_code ? await bcrypt.hash(data.pin_code, SALT_ROUNDS) : null

  // Generate ID
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  getDb()
    .insert(users)
    .values({
      id,
      username: data.username,
      passwordHash,
      pinCode: pinHash,
      fullName: data.full_name,
      role: data.role,
      isActive: 1,
      createdAt: now,
      updatedAt: now
    })
    .run()

  return { id }
}

/**
 * Update user
 */
export async function updateUser(id: string, data: UpdateUserData): Promise<void> {
  const user = getUserById(id)
  if (!user) {
    throw new Error('User not found')
  }

  const updates: Partial<typeof users.$inferInsert> = {}

  if (data.full_name !== undefined) {
    updates.fullName = data.full_name
  }

  if (data.role !== undefined) {
    if (!['admin', 'manager', 'cashier'].includes(data.role)) {
      throw new Error('Invalid role')
    }
    if (data.role !== 'admin') assertNotLastAdmin(id, 'role')
    updates.role = data.role
  }

  if (data.pin_code !== undefined) {
    if (data.pin_code) assertPinFormat(data.pin_code)
    updates.pinCode = data.pin_code ? await bcrypt.hash(data.pin_code, SALT_ROUNDS) : null
  }

  if (data.password !== undefined) {
    assertPasswordStrength(data.password)
    updates.passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS)
  }

  if (data.is_active !== undefined) {
    if (!data.is_active) assertNotLastAdmin(id, 'deactivate')
    updates.isActive = data.is_active
  }

  if (Object.keys(updates).length === 0) {
    return
  }

  updates.updatedAt = new Date().toISOString()

  getDb().update(users).set(updates).where(eq(users.id, id)).run()
}

/**
 * Change user password
 */
export async function changeUserPassword(id: string, newPassword: string): Promise<void> {
  const user = getUserById(id)
  if (!user) {
    throw new Error('User not found')
  }

  assertPasswordStrength(newPassword, user.username)

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

  getDb()
    .update(users)
    .set({ passwordHash, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .run()
}

/**
 * Verify user password
 */
export async function verifyUserPassword(username: string, password: string): Promise<User | null> {
  const user = getDb()
    .select()
    .from(users)
    .where(and(eq(users.username, username), eq(users.isActive, 1)))
    .get()

  if (!user) {
    return null
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    return null
  }

  return user
}

/**
 * Verify PIN code
 */
export async function verifyPinCode(pin: string): Promise<User | null> {
  const activeUsers = getDb().select().from(users).where(eq(users.isActive, 1)).all()

  for (const user of activeUsers) {
    if (user.pinCode && (await bcrypt.compare(pin, user.pinCode))) {
      return user
    }
  }

  return null
}

/**
 * Refuse any change that would leave the system with no active administrator.
 *
 * `deactivateUser` had this guard but `updateUser` did not, so demoting the only
 * admin to Cashier — or setting is_active = 0 through the update path — locked
 * everyone out permanently, with no way back in from inside the app.
 */
function assertNotLastAdmin(id: string, change: 'role' | 'deactivate'): void {
  const user = getUserById(id)
  if (!user || user.role !== 'admin' || !user.isActive) return

  const result = getDb()
    .select({ value: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), eq(users.isActive, 1)))
    .get()

  if ((result?.value ?? 0) <= 1) {
    throw new Error(
      change === 'role'
        ? 'Cannot change the role of the last admin — promote another user to admin first'
        : 'Cannot deactivate the last admin user'
    )
  }
}

/**
 * Deactivate user (soft delete)
 */
export async function deactivateUser(id: string): Promise<void> {
  const user = getUserById(id)
  if (!user) {
    throw new Error('User not found')
  }

  assertNotLastAdmin(id, 'deactivate')

  const now = new Date().toISOString()
  getDb().update(users).set({ isActive: 0, updatedAt: now }).where(eq(users.id, id)).run()
}

/**
 * Reactivate user
 */
export function reactivateUser(id: string): void {
  getDb()
    .update(users)
    .set({ isActive: 1, updatedAt: new Date().toISOString() })
    .where(eq(users.id, id))
    .run()
}

/**
 * Get user statistics
 */
export function getUserStats(): {
  total: number
  active: number
  byRole: Record<string, number>
} {
  const db = getDb()

  const totalResult = db.select({ value: count() }).from(users).get()
  const total = totalResult?.value ?? 0

  const activeResult = db.select({ value: count() }).from(users).where(eq(users.isActive, 1)).get()
  const active = activeResult?.value ?? 0

  const byRoleRows = db
    .select({ role: users.role, value: count() })
    .from(users)
    .groupBy(users.role)
    .all()

  const byRole = Object.fromEntries(byRoleRows.map((r) => [r.role, r.value]))

  return { total, active, byRole }
}
