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
  return getDb().select().from(customers).where(eq(customers.phone, phone)).get() ?? null
}

export function searchCustomers(query: string): Customer[] {
  const q = `%${query}%`
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

export function createCustomer(data: CustomerData): Customer {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  getDb()
    .insert(customers)
    .values({
      id,
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      dateOfBirth: data.date_of_birth ?? null,
      notes: data.notes ?? null,
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

  if (data.name !== undefined) updateObj.name = data.name
  if (data.phone !== undefined) updateObj.phone = data.phone ?? null
  if (data.email !== undefined) updateObj.email = data.email ?? null
  if (data.address !== undefined) updateObj.address = data.address ?? null
  if (data.date_of_birth !== undefined) updateObj.dateOfBirth = data.date_of_birth ?? null
  if (data.notes !== undefined) updateObj.notes = data.notes ?? null

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
