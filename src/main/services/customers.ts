import { eq, and, like, or, desc } from 'drizzle-orm'
import { getDb } from '../db/index'
import { customers, sales, saleItems, products } from '../db/schema'
import type { Customer } from '../db/schema'

export type { Customer }

export interface CustomerData {
  name: string
  phone?: string
  email?: string
  address?: string
  date_of_birth?: string
  notes?: string
}

export interface PurchaseHistoryEntry {
  id: string
  receiptNumber: string
  total: number
  paymentMethod: string
  createdAt: string
  items: { productName: string; quantity: number; lineTotal: number }[]
}

export function getCustomers(): Customer[] {
  return getDb()
    .select()
    .from(customers)
    .where(eq(customers.isActive, 1))
    .orderBy(customers.name)
    .all()
}

export function getCustomerById(id: string): Customer | null {
  return getDb().select().from(customers).where(eq(customers.id, id)).get() ?? null
}

export function getCustomerByPhone(phone: string): Customer | null {
  const normalised = normalisePhone(phone)
  if (!normalised) return null
  return getDb().select().from(customers).where(eq(customers.phone, normalised)).get() ?? null
}

/**
 * Sri Lankan mobile/landline numbers, reduced to a single canonical form.
 *
 * Numbers were stored exactly as typed, so `0771234567`, `+94771234567` and
 * `077 123 4567` were three distinct customers as far as the UNIQUE index was
 * concerned — and `createSale` links by exact equality, so a differently
 * formatted entry silently failed to attach the sale to the customer's history.
 */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null
  let digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('+94')) digits = '0' + digits.slice(3)
  else if (digits.startsWith('0094')) digits = '0' + digits.slice(4)
  else if (digits.startsWith('94') && digits.length === 11) digits = '0' + digits.slice(2)
  digits = digits.replace(/\D/g, '')
  if (digits.length === 9 && !digits.startsWith('0')) digits = '0' + digits
  return digits || null
}

/**
 * Strip LIKE wildcards from a user's search term.
 *
 * `%` matched every customer and `_` matched any single character. Escaping
 * them would need an `ESCAPE` clause that Drizzle's `like()` does not emit, and
 * neither character is meaningful in a name or phone number, so they are simply
 * removed.
 */
function sanitiseSearch(value: string): string {
  return value.replace(/[%_]/g, '')
}

export function searchCustomers(query: string): Customer[] {
  const q = `%${sanitiseSearch(query)}%`
  return getDb()
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.isActive, 1),
        or(like(customers.name, q), like(customers.phone, q), like(customers.email, q))
      )
    )
    .orderBy(customers.name)
    .all()
}

/**
 * Server-side validation. Trimming and the non-empty check lived only in the
 * renderer, so a direct IPC call could create a customer named "   ".
 */
function validateCustomer(data: CustomerData): {
  name: string
  phone: string | null
  email: string | null
} {
  const name = (data.name ?? '').trim()
  if (!name) throw new Error('Customer name is required')
  if (name.length > 120) throw new Error('Customer name is too long')

  const phone = normalisePhone(data.phone)
  if (data.phone && !phone) throw new Error('Enter a valid phone number')
  if (phone && !/^0\d{9}$/.test(phone)) {
    throw new Error('Phone number should be 10 digits starting with 0')
  }

  const email = data.email?.trim() || null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Enter a valid email address')
  }

  return { name, phone, email }
}

export function createCustomer(data: CustomerData): Customer {
  const clean = validateCustomer(data)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  getDb()
    .insert(customers)
    .values({
      id,
      name: clean.name,
      phone: clean.phone,
      email: clean.email,
      address: data.address?.trim() || null,
      dateOfBirth: data.date_of_birth ?? null,
      notes: data.notes?.trim() || null,
      isActive: 1,
      createdAt: now,
      updatedAt: now
    })
    .run()
  return getCustomerById(id)!
}

export function updateCustomer(id: string, data: Partial<CustomerData>): Customer | null {
  const updateObj: Partial<{
    name: string
    phone: string | null
    email: string | null
    address: string | null
    dateOfBirth: string | null
    notes: string | null
    updatedAt: string
  }> = {}

  const existing = getCustomerById(id)
  if (!existing) return null

  // Only validate when one of the validated fields is actually being changed.
  // Rows imported before validation existed may hold a phone number this would
  // now reject, and editing only the notes on such a row must still work.
  if (data.name !== undefined || data.phone !== undefined || data.email !== undefined) {
    const clean = validateCustomer({
      name: data.name !== undefined ? data.name : existing.name,
      phone: data.phone !== undefined ? data.phone : undefined,
      email: data.email !== undefined ? data.email : undefined
    })
    if (data.name !== undefined) updateObj.name = clean.name
    if (data.phone !== undefined) updateObj.phone = clean.phone
    if (data.email !== undefined) updateObj.email = clean.email
  }

  if (data.address !== undefined) updateObj.address = data.address?.trim() || null
  if (data.date_of_birth !== undefined) updateObj.dateOfBirth = data.date_of_birth ?? null
  if (data.notes !== undefined) updateObj.notes = data.notes?.trim() || null

  if (Object.keys(updateObj).length === 0) return getCustomerById(id)

  updateObj.updatedAt = new Date().toISOString()

  getDb().update(customers).set(updateObj).where(eq(customers.id, id)).run()
  return getCustomerById(id)
}

export function deactivateCustomer(id: string): void {
  getDb()
    .update(customers)
    .set({ isActive: 0, updatedAt: new Date().toISOString() })
    .where(eq(customers.id, id))
    .run()
}

export function getCustomerPurchaseHistory(customerId: string, limit = 10): PurchaseHistoryEntry[] {
  const db = getDb()

  const recentSales = db
    .select({
      id: sales.id,
      receiptNumber: sales.receiptNumber,
      total: sales.total,
      paymentMethod: sales.paymentMethod,
      createdAt: sales.createdAt
    })
    .from(sales)
    .where(and(eq(sales.customerId, customerId), eq(sales.status, 'completed')))
    .orderBy(desc(sales.createdAt))
    .limit(limit)
    .all()

  return recentSales.map((sale) => {
    const items = db
      .select({
        productName: products.name,
        quantity: saleItems.quantity,
        lineTotal: saleItems.lineTotal
      })
      .from(saleItems)
      .innerJoin(products, eq(saleItems.productId, products.id))
      .where(eq(saleItems.saleId, sale.id))
      .all()

    return { ...sale, items }
  })
}

// Backwards-compatible aliases for IPC handlers that reference old function names
export function listCustomers(search?: string): Customer[] {
  if (search && search.trim()) return searchCustomers(search.trim())
  return getCustomers()
}
export const getCustomer = getCustomerById
export const deleteCustomer = deactivateCustomer
