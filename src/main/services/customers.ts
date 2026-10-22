import { eq, and, like, or, sql } from 'drizzle-orm'
import { getDb } from '../db/index'
import { getDatabase } from './database'
import { customers, sales, saleItems, products } from '../db/schema'
import type { Customer } from '../db/schema'
import { round2 } from '../../shared/money'
import { normalisePhone, isValidCustomerPhone, CUSTOMER_NAME_MAX } from '../../shared/customers'

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
  status: 'completed' | 'refunded'
  /** Total refunded against this sale so far; 0 when nothing went back. */
  refunded: number
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

/**
 * Deactivated customers are deliberately excluded: this is the lookup the till
 * uses to attach a sale, and a customer someone removed must not silently start
 * collecting purchase history again. `getCustomerById` stays unfiltered so an
 * old sale can still resolve the name it was rung up against.
 */
export function getCustomerByPhone(phone: string): Customer | null {
  const normalised = normalisePhone(phone)
  if (!normalised) return null
  return (
    getDb()
      .select()
      .from(customers)
      .where(and(eq(customers.phone, normalised), eq(customers.isActive, 1)))
      .get() ?? null
  )
}

/**
 * Everything `planCheckoutCustomer` needs to know about a number: the active
 * customer holding it, and whether a Removed one still does. Erased customers
 * have no phone left, so they are invisible here by construction.
 */
export function findCheckoutCustomer(phone: string | null | undefined): {
  active: Customer | null
  heldByRemoved: boolean
} {
  const normalised = normalisePhone(phone)
  if (!normalised) return { active: null, heldByRemoved: false }
  const holder =
    getDb().select().from(customers).where(eq(customers.phone, normalised)).get() ?? null
  if (!holder) return { active: null, heldByRemoved: false }
  return holder.isActive === 1
    ? { active: holder, heldByRemoved: false }
    : { active: null, heldByRemoved: true }
}

// Moved to src/shared so the till can apply the same rules before the sale is
// sent; re-exported because the services and IPC handlers import it from here.
export { normalisePhone }

/**
 * Strip LIKE wildcards from a user's search term.
 *
 * `%` and `_` were passed straight into `like()`, so searching for `Nim%la`
 * matched names the operator never typed. Escaping them would need an `ESCAPE`
 * clause that Drizzle's `like()` does not emit, and neither character is
 * meaningful in a name or a phone number, so they are simply removed.
 *
 * A term made up entirely of wildcards therefore sanitises to nothing, which is
 * treated as "no filter" — the same as an empty search box. That is deliberate:
 * the alternative is a search that silently returns zero rows for input the
 * operator can see in the box.
 */
function sanitiseSearch(value: string): string {
  return value.replace(/[%_]/g, '')
}

export function searchCustomers(query: string): Customer[] {
  const term = sanitiseSearch(query).trim()
  if (!term) return getCustomers()

  const q = `%${term}%`
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
  if (name.length > CUSTOMER_NAME_MAX) throw new Error('Customer name is too long')

  const phone = normalisePhone(data.phone)
  if (data.phone && !phone) throw new Error('Enter a valid phone number')
  if (phone && !isValidCustomerPhone(phone)) {
    throw new Error('Phone number should be 10 digits starting with 0')
  }

  const email = data.email?.trim() || null
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error('Enter a valid email address')
  }

  return { name, phone, email }
}

/**
 * Attach earlier, unlinked sales rung up under this number to the customer.
 *
 * Every sale keeps the number typed at the till, but `customer_id` was only set
 * when the customer already existed — so registering someone (or correcting
 * their number) started their history from zero while their earlier purchases
 * sat in the sales table under the same phone. Only sales with no customer are
 * touched: one already linked to someone else stays theirs. Erased customers
 * cannot be reached this way, because erasure clears the phone on their old
 * sales as well as on the record.
 *
 * Compared after normalising, because sales from before `normalisePhone`
 * existed hold the number exactly as it was typed.
 */
export function linkEarlierSales(customerId: string, phone: string | null): number {
  const normalised = normalisePhone(phone)
  if (!normalised) return 0
  const raw = getDatabase()
  const candidates = raw
    .prepare(
      `SELECT id, customer_phone FROM sales
       WHERE customer_id IS NULL AND customer_phone IS NOT NULL AND customer_phone != ''`
    )
    .all() as { id: string; customer_phone: string }[]
  const link = raw.prepare('UPDATE sales SET customer_id = ? WHERE id = ? AND customer_id IS NULL')
  let linked = 0
  for (const sale of candidates) {
    if (normalisePhone(sale.customer_phone) === normalised) {
      linked += link.run(customerId, sale.id).changes
    }
  }
  return linked
}

export function createCustomer(data: CustomerData): Customer {
  const clean = validateCustomer(data)
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  getDatabase().transaction(() => {
    insertCustomer(id, clean, data, now)
    linkEarlierSales(id, clean.phone)
  })()
  return getCustomerById(id)!
}

function insertCustomer(
  id: string,
  clean: ReturnType<typeof validateCustomer>,
  data: CustomerData,
  now: string
): void {
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

  getDatabase().transaction(() => {
    getDb().update(customers).set(updateObj).where(eq(customers.id, id)).run()
    // A corrected number brings that number's earlier sales with it. A Removed
    // customer is not collecting history, so their edits link nothing.
    if (updateObj.phone && existing.isActive === 1) linkEarlierSales(id, updateObj.phone)
  })()
  return getCustomerById(id)
}

/**
 * Destroy a customer's personal details while keeping the sales themselves.
 *
 * `deactivateCustomer` only flips a flag — the name, phone, email and address
 * all stay in the file, and `sales` holds its own denormalised copy of the name
 * and phone on every transaction, so a customer who asks to be removed is still
 * fully readable in the sales table and in every backup taken since.
 *
 * The sale rows are kept and re-pointed at a placeholder rather than deleted:
 * they are accounting records, and the stock, VAT and shift totals all depend
 * on them. Only the identifying fields go.
 */
export function eraseCustomer(id: string): { salesScrubbed: number } {
  const db = getDb()
  const existing = getCustomerById(id)
  if (!existing) throw new Error('Customer not found')

  const now = new Date().toISOString()
  let salesScrubbed = 0

  getDatabase().transaction(() => {
    const result = db
      .update(sales)
      .set({ customerName: null, customerPhone: null })
      .where(eq(sales.customerId, id))
      .run()
    salesScrubbed = result.changes

    // Sales rung up under the same number before the customer record existed
    // carry the phone without a customer_id, so they need clearing too.
    if (existing.phone) {
      const orphans = db
        .update(sales)
        .set({ customerName: null, customerPhone: null })
        .where(eq(sales.customerPhone, existing.phone))
        .run()
      salesScrubbed += orphans.changes
    }

    db.update(customers)
      .set({
        name: 'Erased customer',
        phone: null,
        email: null,
        address: null,
        dateOfBirth: null,
        notes: null,
        isActive: 0,
        updatedAt: now
      })
      .where(eq(customers.id, id))
      .run()
  })()

  return { salesScrubbed }
}

export function deactivateCustomer(id: string): void {
  getDb()
    .update(customers)
    .set({ isActive: 0, updatedAt: new Date().toISOString() })
    .where(eq(customers.id, id))
    .run()
}

/**
 * The most recent visits, newest first. Refunded sales are listed (with what
 * went back) so the history matches the totals in `getCustomerStats`; voided
 * sales are not — a void is a mis-ring, not something the customer bought.
 */
export function getCustomerPurchaseHistory(customerId: string, limit = 10): PurchaseHistoryEntry[] {
  const db = getDb()

  const recentSales = getDatabase()
    .prepare(
      `SELECT s.id, s.receipt_number AS receiptNumber, s.total, s.payment_method AS paymentMethod,
              s.created_at AS createdAt, s.status,
              COALESCE((SELECT SUM(r.total_refunded) FROM sale_refunds r WHERE r.sale_id = s.id), 0)
                AS refunded
       FROM sales s
       WHERE s.customer_id = ? AND s.status IN ('completed', 'refunded')
       ORDER BY s.created_at DESC
       LIMIT ?`
    )
    .all(customerId, limit) as Omit<PurchaseHistoryEntry, 'items'>[]

  return recentSales.map((sale) => {
    const items = db
      .select({
        // The name as dispensed (M9), the catalogue only for rows that predate it.
        productName: sql<string>`COALESCE(${saleItems.productName}, ${products.name}, '(deleted product)')`,
        quantity: saleItems.quantity,
        lineTotal: saleItems.lineTotal
      })
      .from(saleItems)
      .leftJoin(products, eq(saleItems.productId, products.id))
      .where(eq(saleItems.saleId, sale.id))
      .all()

    return { ...sale, refunded: round2(sale.refunded), items }
  })
}

export interface CustomerStats {
  visits: number
  /** What the customer actually paid and kept: sale totals less refunds. */
  totalSpent: number
  lastVisit: string | null
}

/**
 * Visits, spend and last visit for one customer, or for everyone when no id is
 * given (the list view), computed from the linked sales rather than the
 * ten-row history the detail panel used to sum.
 *
 * - Voided sales count for nothing: a void reverses the whole sale.
 * - Refunds come off the spend, partial or full. A fully refunded sale (status
 *   `refunded`) still counts as a visit — they came in — but adds nothing.
 * - Refunds are summed per sale first, then joined, so a sale with several
 *   partial refunds is not counted once per refund.
 */
function customerStatsRows(customerId?: string): Array<CustomerStats & { customerId: string }> {
  return getDatabase()
    .prepare(
      `SELECT s.customer_id AS customerId,
              COUNT(*) AS visits,
              COALESCE(SUM(s.total), 0) - COALESCE(SUM(r.refunded), 0) AS totalSpent,
              MAX(s.created_at) AS lastVisit
       FROM sales s
       LEFT JOIN (SELECT sale_id, SUM(total_refunded) AS refunded FROM sale_refunds GROUP BY sale_id) r
         ON r.sale_id = s.id
       WHERE s.customer_id IS NOT NULL
         AND s.status IN ('completed', 'refunded')
         ${customerId ? 'AND s.customer_id = ?' : ''}
       GROUP BY s.customer_id`
    )
    .all(...(customerId ? [customerId] : [])) as Array<CustomerStats & { customerId: string }>
}

const NO_VISITS: CustomerStats = { visits: 0, totalSpent: 0, lastVisit: null }

export function getCustomerStats(customerId: string): CustomerStats {
  const [row] = customerStatsRows(customerId)
  return row
    ? { visits: row.visits, totalSpent: round2(row.totalSpent), lastVisit: row.lastVisit }
    : NO_VISITS
}

export function getAllCustomerStats(): Map<string, CustomerStats> {
  return new Map(
    customerStatsRows().map((r) => [
      r.customerId,
      { visits: r.visits, totalSpent: round2(r.totalSpent), lastVisit: r.lastVisit }
    ])
  )
}

export function customerStatsFor(stats: Map<string, CustomerStats>, id: string): CustomerStats {
  return stats.get(id) ?? NO_VISITS
}

// Backwards-compatible aliases for IPC handlers that reference old function names
export function listCustomers(search?: string): Customer[] {
  if (search && search.trim()) return searchCustomers(search.trim())
  return getCustomers()
}
export const getCustomer = getCustomerById
export const deleteCustomer = deactivateCustomer
