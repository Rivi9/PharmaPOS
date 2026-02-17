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
    updates.role = data.role
  }

  if (data.pin_code !== undefined) {
    updates.pinCode = data.pin_code ? await bcrypt.hash(data.pin_code, SALT_ROUNDS) : null
  }

  if (data.password !== undefined) {
    updates.passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS)
  }

  if (data.is_active !== undefined) {
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
 * Deactivate user (soft delete)
 */
export async function deactivateUser(id: string): Promise<void> {
  const user = getUserById(id)
  if (!user) {
    throw new Error('User not found')
  }

  if (user.role === 'admin') {
    const result = getDb()
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.isActive, 1)))
      .get()

    const adminCount = result?.value ?? 0
    if (adminCount <= 1) {
      throw new Error('Cannot deactivate the last admin user')
    }
  }

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
