import { getDatabase, generateId } from './database'

export interface CustomerData {
  name: string
  phone?: string
  email?: string
  address?: string
  date_of_birth?: string
  notes?: string
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  date_of_birth: string | null
  loyalty_points: number
  notes: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export function listCustomers(search?: string): Customer[] {
  const db = getDatabase()

  if (search && search.trim()) {
    const q = `%${search.trim()}%`
    return db
      .prepare(
        `SELECT * FROM customers
         WHERE is_active = 1 AND (name LIKE ? OR phone LIKE ?)
         ORDER BY name ASC LIMIT 100`
      )
      .all(q, q) as Customer[]
  }

  return db
    .prepare(`SELECT * FROM customers WHERE is_active = 1 ORDER BY name ASC LIMIT 200`)
    .all() as Customer[]
}

export function getCustomer(id: string): Customer | null {
  const db = getDatabase()
  return (db.prepare(`SELECT * FROM customers WHERE id = ?`).get(id) as Customer) ?? null
}

export function getCustomerByPhone(phone: string): Customer | null {
  const db = getDatabase()
  return (
    (db.prepare(`SELECT * FROM customers WHERE phone = ?`).get(phone) as Customer) ?? null
  )
}

export function createCustomer(data: CustomerData): Customer {
  const db = getDatabase()
  const id = generateId()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO customers (id, name, phone, email, address, date_of_birth, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.name,
    data.phone ?? null,
    data.email ?? null,
    data.address ?? null,
    data.date_of_birth ?? null,
    data.notes ?? null,
    now,
    now
  )

  return getCustomer(id)!
}

export function updateCustomer(id: string, data: Partial<CustomerData>): Customer | null {
  const db = getDatabase()
  const now = new Date().toISOString()

  const fields: string[] = []
  const values: unknown[] = []

  if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name) }
  if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone) }
  if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email) }
  if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address) }
  if (data.date_of_birth !== undefined) { fields.push('date_of_birth = ?'); values.push(data.date_of_birth) }
  if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes) }

  if (fields.length === 0) return getCustomer(id)

  fields.push('updated_at = ?')
  values.push(now)
  values.push(id)

  db.prepare(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return getCustomer(id)
}

export function deleteCustomer(id: string): void {
  const db = getDatabase()
  db.prepare(`UPDATE customers SET is_active = 0, updated_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    id
  )
}

export function getCustomerPurchaseHistory(
  customerId: string,
  limit = 20
): { sales: unknown[]; total_spent: number; visit_count: number } {
  const db = getDatabase()

  const sales = db
    .prepare(
      `SELECT s.id, s.receipt_number, s.total, s.payment_method, s.created_at,
              COUNT(si.id) as item_count
       FROM sales s
       LEFT JOIN sale_items si ON s.id = si.sale_id
       WHERE s.customer_id = ?
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT ?`
    )
    .all(customerId, limit)

  const stats = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) as total_spent, COUNT(*) as visit_count
       FROM sales WHERE customer_id = ?`
    )
    .get(customerId) as { total_spent: number; visit_count: number }

  return { sales, total_spent: stats.total_spent, visit_count: stats.visit_count }
}

export function addLoyaltyPoints(customerId: string, points: number): void {
  const db = getDatabase()
  db.prepare(
    `UPDATE customers SET loyalty_points = loyalty_points + ?, updated_at = ? WHERE id = ?`
  ).run(points, new Date().toISOString(), customerId)
}
