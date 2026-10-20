import { eq, sql, asc } from 'drizzle-orm'
import { getDb } from '../db/index'
import { getDatabase, generateId } from './database'
import { categories, suppliers, stockBatches, products, inventoryAdjustments } from '../db/schema'
import type { Category, Supplier, StockBatch } from '../db/schema'
import { round2 } from '../../shared/money'
import { localDateString } from '../../shared/dates'
import { productSearchSql } from '../../shared/product-search'

// =====================
// PRODUCTS
// =====================

export interface ProductData {
  name: string
  generic_name?: string
  barcode?: string
  sku?: string
  category_id?: string
  supplier_id?: string
  cost_price: number
  unit_price: number
  reorder_level?: number
  reorder_qty?: number
  unit?: string
  track_expiry?: number
  is_active?: number
}

export function listProducts(): any[] {
  const db = getDatabase()

  const productList = db
    .prepare(
      `
    SELECT
      p.*,
      COALESCE((
        SELECT SUM(b.quantity) FROM stock_batches b
        WHERE b.product_id = p.id AND b.quantity > 0
          AND (b.expiry_date IS NULL OR b.expiry_date = '' OR b.expiry_date >= date('now','localtime'))
      ), 0) as total_stock,
      c.name as category_name,
      s.name as supplier_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    ORDER BY p.is_active DESC, p.name ASC
  `
    )
    .all()

  return productList
}

/**
 * Money and quantity validation, in the main process.
 *
 * H14: nothing validated on this side and the schema has no CHECK constraints,
 * so a negative price or negative stock was storable through a direct IPC call —
 * and a negative unit price makes every total, VAT figure and shift
 * reconciliation downstream of it wrong.
 */
function assertMoney(label: string, value: unknown, { required = true } = {}): number | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error(`${label} is required`)
    return null
  }
  const amount = Number(value)
  if (!Number.isFinite(amount)) throw new Error(`${label} must be a number`)
  if (amount < 0) throw new Error(`${label} cannot be negative`)
  // Beyond this the REAL column starts losing cents, and it is far past any real
  // pharmacy price — so it is a typo, not a transaction.
  if (amount > 100_000_000) throw new Error(`${label} is implausibly large`)
  return round2(amount)
}

function assertQuantity(label: string, value: unknown): number {
  const qty = Number(value)
  if (!Number.isFinite(qty)) throw new Error(`${label} must be a number`)
  if (qty < 0) throw new Error(`${label} cannot be negative`)
  if (!Number.isInteger(qty)) throw new Error(`${label} must be a whole number`)
  if (qty > 1_000_000) throw new Error(`${label} is implausibly large`)
  return qty
}

/**
 * H12: expiry was never validated anywhere. A typo of `2025` for `2035` silently
 * makes a full batch unsellable (FEFO excludes expired stock); `20265` sorts as a
 * far-future date and defeats every expiry alert the pharmacy relies on.
 *
 * An expiry already in the past is allowed on purpose — stock does expire while
 * it is on the shelf, and the operator has to be able to record what is really
 * there. What is rejected is a date that cannot be true.
 */
function assertExpiryDate(value: string | null | undefined): string | null {
  if (value === undefined || value === null || value.trim() === '') return null
  const text = value.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error('Expiry date must be in YYYY-MM-DD form')
  }
  const parsed = new Date(text + 'T00:00:00')
  if (Number.isNaN(parsed.getTime()) || !text.startsWith(String(parsed.getFullYear()))) {
    throw new Error(`"${text}" is not a real date`)
  }
  const year = parsed.getFullYear()
  const thisYear = new Date().getFullYear()
  if (year < thisYear - 20) throw new Error('Expiry date is too far in the past to be real')
  if (year > thisYear + 30) throw new Error('Expiry date is too far in the future to be real')
  return text
}

/** Names are the operator's only handle on a row; a blank one is unusable. */
function assertName(label: string, value: unknown): string {
  const name = String(value ?? '').trim()
  if (!name) throw new Error(`${label} is required`)
  if (name.length > 200) throw new Error(`${label} is too long`)
  return name
}

export interface PagedQuery {
  search?: string
  limit?: number
  offset?: number
  /** Include discontinued products — the Inventory page's "Discontinued" filter. */
  includeInactive?: boolean
}

export interface Page<T> {
  rows: T[]
  /** Total matching the search, so the UI can show "page 3 of 40". */
  total: number
}

/** Cap on one page, whatever the caller asks for. */
const MAX_PAGE = 200

/**
 * Strip LIKE wildcards. `%` in a search box would match everything and `_` any
 * character; neither is meaningful in a product name, SKU or barcode. Escaping
 * would need an ESCAPE clause, so they are removed.
 */
function likeTerm(search: string | undefined): string | null {
  const term = (search ?? '').replace(/[%_]/g, '').trim()
  return term ? `%${term}%` : null
}

/**
 * One page of products, searched and counted in SQL.
 *
 * H18: `listProducts()` had no LIMIT — it aggregated every product against every
 * batch and shipped the lot over IPC, and the Inventory page re-ran it (plus the
 * batch list) on every save. Measured on a 10,000-product catalogue with 20,000
 * batches: **4.2 MB of JSON and ~250 ms per call**, three calls per save. Search
 * was client-side, so the full fetch could not be avoided.
 *
 * The stock figure stays a correlated subquery rather than a JOIN: joining
 * products to batches multiplies the row set, which is the same fan-out that made
 * every analytics KPI wrong (C1).
 */
export function listProductsPage(query: PagedQuery = {}): Page<Record<string, unknown>> {
  const db = getDatabase()
  const limit = Math.min(Math.max(1, query.limit ?? 50), MAX_PAGE)
  const offset = Math.max(0, query.offset ?? 0)

  const where: string[] = []
  const params: unknown[] = []
  if (!query.includeInactive) where.push('p.is_active = 1')
  // Same multi-word matching and ranking as the till, so a product found on one
  // screen is found the same way on the other.
  const search = productSearchSql(query.search ?? '')
  if (search) {
    where.push(search.where)
    params.push(...search.whereParams)
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const rankSql = search ? `${search.rank} ASC,` : ''
  const rankParams = search ? search.rankParams : []

  const { total } = db
    .prepare(`SELECT COUNT(*) as total FROM products p ${whereSql}`)
    .get(...params) as { total: number }

  const rows = db
    .prepare(
      `
    SELECT
      p.*,
      COALESCE((
        SELECT SUM(b.quantity) FROM stock_batches b
        WHERE b.product_id = p.id AND b.quantity > 0
          AND (b.expiry_date IS NULL OR b.expiry_date = '' OR b.expiry_date >= date('now','localtime'))
      ), 0) as total_stock,
      c.name as category_name,
      s.name as supplier_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    ${whereSql}
    ORDER BY p.is_active DESC, ${rankSql} p.name ASC
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, ...rankParams, limit, offset) as Record<string, unknown>[]

  return { rows, total }
}

/** One page of stock batches, searched and counted in SQL. Same reasoning as above. */
export function listStockBatchesPage(query: PagedQuery = {}): Page<Record<string, unknown>> {
  const db = getDatabase()
  const term = likeTerm(query.search)
  const limit = Math.min(Math.max(1, query.limit ?? 50), MAX_PAGE)
  const offset = Math.max(0, query.offset ?? 0)

  const where = ['sb.quantity > 0', 'p.is_active = 1']
  const params: unknown[] = []
  if (term) {
    where.push('(p.name LIKE ? OR p.sku LIKE ? OR sb.batch_number LIKE ?)')
    params.push(term, term, term)
  }
  const whereSql = `WHERE ${where.join(' AND ')}`

  const { total } = db
    .prepare(
      `SELECT COUNT(*) as total FROM stock_batches sb
       JOIN products p ON sb.product_id = p.id ${whereSql}`
    )
    .get(...params) as { total: number }

  const rows = db
    .prepare(
      `
    SELECT
      sb.*,
      p.name as product_name,
      p.sku,
      s.name as supplier_name
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    LEFT JOIN suppliers s ON sb.supplier_id = s.id
    ${whereSql}
    ORDER BY sb.expiry_date ASC NULLS LAST, sb.received_date DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, limit, offset) as Record<string, unknown>[]

  return { rows, total }
}

/**
 * One product row in the database's own snake_case shape.
 *
 * `products.getProductById` returns the Drizzle camelCase model; audit entries
 * record column names, so the before/after diff reads the raw row instead of
 * translating field names in two places.
 */
export function getProductRow(id: string): Record<string, unknown> | undefined {
  return getDatabase().prepare('SELECT * FROM products WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined
}

export function createProduct(data: ProductData): { id: string } {
  const db = getDatabase()
  const id = generateId()
  const now = new Date().toISOString()

  const name = assertName('Product name', data.name)
  const costPrice = assertMoney('Cost price', data.cost_price) ?? 0
  const unitPrice = assertMoney('Selling price', data.unit_price) ?? 0
  const reorderLevel = assertQuantity('Reorder level', data.reorder_level ?? 10)
  const reorderQty = assertQuantity('Reorder quantity', data.reorder_qty ?? 50)

  db.prepare(
    `
    INSERT INTO products (
      id, name, generic_name, barcode, sku,
      category_id, supplier_id, cost_price, unit_price,
      tax_rate, is_tax_inclusive,
      reorder_level, reorder_qty, unit, track_expiry, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    name,
    data.generic_name?.trim() || null,
    data.barcode?.trim() || null,
    data.sku?.trim() || null,
    data.category_id || null,
    data.supplier_id || null,
    costPrice,
    unitPrice,
    // products.tax_rate is no longer used: VAT is one shop-wide rate (Settings →
    // vat_rate), read by createSale. The column stays so no migration has to
    // drop it; it is always written as 0 and never read.
    0,
    1,
    reorderLevel,
    reorderQty,
    data.unit || 'piece',
    data.track_expiry ?? 1,
    data.is_active ?? 1,
    now,
    now
  )

  return { id }
}

export function updateProduct(id: string, data: Partial<ProductData>): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  const fields: string[] = []
  const values: any[] = []

  // Same rules as createProduct: an edit is just as capable of storing a negative
  // price as a create, and only the create path was guarded.
  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(assertName('Product name', data.name))
  }
  if (data.generic_name !== undefined) {
    fields.push('generic_name = ?')
    values.push(data.generic_name?.trim() || null)
  }
  if (data.barcode !== undefined) {
    fields.push('barcode = ?')
    values.push(data.barcode || null)
  }
  if (data.sku !== undefined) {
    fields.push('sku = ?')
    values.push(data.sku || null)
  }
  if (data.category_id !== undefined) {
    fields.push('category_id = ?')
    values.push(data.category_id || null)
  }
  if (data.supplier_id !== undefined) {
    fields.push('supplier_id = ?')
    values.push(data.supplier_id || null)
  }
  if (data.cost_price !== undefined) {
    fields.push('cost_price = ?')
    values.push(assertMoney('Cost price', data.cost_price))
  }
  if (data.unit_price !== undefined) {
    fields.push('unit_price = ?')
    values.push(assertMoney('Selling price', data.unit_price))
  }
  if (data.reorder_level !== undefined) {
    fields.push('reorder_level = ?')
    values.push(assertQuantity('Reorder level', data.reorder_level))
  }
  if (data.reorder_qty !== undefined) {
    fields.push('reorder_qty = ?')
    values.push(assertQuantity('Reorder quantity', data.reorder_qty))
  }
  if (data.unit !== undefined) {
    fields.push('unit = ?')
    values.push(data.unit)
  }
  if (data.track_expiry !== undefined) {
    fields.push('track_expiry = ?')
    values.push(data.track_expiry)
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?')
    values.push(data.is_active)
  }

  fields.push('updated_at = ?')
  values.push(now)
  values.push(id)

  db.prepare(
    `
    UPDATE products
    SET ${fields.join(', ')}
    WHERE id = ?
  `
  ).run(...values)
}

/** Bring a soft-deleted product back. Delete is a flag flip, so nothing is lost. */
export function reactivateProduct(id: string): void {
  getDatabase()
    .prepare('UPDATE products SET is_active = 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id)
}

export function deleteProduct(id: string): void {
  const db = getDatabase()

  // Soft delete - set is_active to 0
  db.prepare(
    `
    UPDATE products
    SET is_active = 0, updated_at = ?
    WHERE id = ?
  `
  ).run(new Date().toISOString(), id)
}

export function getLowStockProducts(): any[] {
  const db = getDatabase()

  const lowStock = db
    .prepare(
      `
    SELECT
      p.*,
      COALESCE(SUM(sb.quantity), 0) as total_stock
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
    GROUP BY p.id
    HAVING total_stock <= p.reorder_level
    ORDER BY total_stock ASC, p.name ASC
  `
    )
    .all()

  return lowStock
}

// =====================
// CATEGORIES
// =====================

export interface CategoryData {
  name: string
  description?: string
  parent_id?: string
}

export function getCategories(): Category[] {
  const drizzleDb = getDb()
  return drizzleDb.select().from(categories).orderBy(asc(categories.name)).all()
}

export function getCategoryById(id: string): Category | undefined {
  const drizzleDb = getDb()
  return drizzleDb.select().from(categories).where(eq(categories.id, id)).get()
}

export function createCategory(data: CategoryData): { id: string } {
  const drizzleDb = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  drizzleDb
    .insert(categories)
    .values({
      id,
      name: data.name,
      description: data.description ?? null,
      parentId: data.parent_id ?? null,
      createdAt: now
    })
    .run()

  return { id }
}

export function updateCategory(id: string, data: Partial<CategoryData>): void {
  updateCategoryLegacy(id, data)
}

export function deleteCategory(id: string): void {
  const drizzleDb = getDb()

  // Check if any active products use this category
  const activeProducts = drizzleDb
    .select({ count: sql<number>`COUNT(*)` })
    .from(products)
    .where(eq(products.categoryId, id))
    .get()

  if (activeProducts && activeProducts.count > 0) {
    throw new Error('Cannot delete category with products')
  }

  drizzleDb.delete(categories).where(eq(categories.id, id)).run()
}

export function listCategories(): any[] {
  const db = getDatabase()

  const cats = db
    .prepare(
      `
    SELECT
      c.*,
      parent.name as parent_name,
      COUNT(DISTINCT p.id) as product_count
    FROM categories c
    LEFT JOIN categories parent ON c.parent_id = parent.id
    LEFT JOIN products p ON c.id = p.category_id
    GROUP BY c.id
    ORDER BY c.name ASC
  `
    )
    .all()

  return cats
}

export function updateCategoryLegacy(id: string, data: Partial<CategoryData>): void {
  const db = getDatabase()

  const fields: string[] = []
  const values: any[] = []

  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.description !== undefined) {
    fields.push('description = ?')
    values.push(data.description || null)
  }
  if (data.parent_id !== undefined) {
    fields.push('parent_id = ?')
    values.push(data.parent_id || null)
  }

  if (fields.length === 0) return
  values.push(id)

  db.prepare(
    `
    UPDATE categories
    SET ${fields.join(', ')}
    WHERE id = ?
  `
  ).run(...values)
}

// =====================
// SUPPLIERS
// =====================

export interface SupplierData {
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  lead_time_days?: number
  is_active?: number
}

export function getSuppliers(): Supplier[] {
  const drizzleDb = getDb()
  return drizzleDb.select().from(suppliers).orderBy(asc(suppliers.name)).all()
}

export function createSupplier(data: SupplierData): { id: string } {
  const drizzleDb = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  drizzleDb
    .insert(suppliers)
    .values({
      id,
      name: data.name,
      contactPerson: data.contact_person ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      address: data.address ?? null,
      leadTimeDays: data.lead_time_days ?? 3,
      isActive: data.is_active ?? 1,
      createdAt: now
    })
    .run()

  return { id }
}

export function updateSupplier(id: string, data: Partial<SupplierData>): void {
  const drizzleDb = getDb()

  const updates: Partial<{
    name: string
    contactPerson: string | null
    phone: string | null
    email: string | null
    address: string | null
    leadTimeDays: number
    isActive: number
  }> = {}

  if (data.name !== undefined) updates.name = data.name
  if (data.contact_person !== undefined) updates.contactPerson = data.contact_person ?? null
  if (data.phone !== undefined) updates.phone = data.phone ?? null
  if (data.email !== undefined) updates.email = data.email ?? null
  if (data.address !== undefined) updates.address = data.address ?? null
  if (data.lead_time_days !== undefined) updates.leadTimeDays = data.lead_time_days
  if (data.is_active !== undefined) updates.isActive = data.is_active

  drizzleDb.update(suppliers).set(updates).where(eq(suppliers.id, id)).run()
}

export function listSuppliers(): any[] {
  const db = getDatabase()

  const supplierList = db
    .prepare(
      `
    SELECT
      s.*,
      COUNT(DISTINCT p.id) as product_count,
      COUNT(DISTINCT sb.id) as batch_count
    FROM suppliers s
    LEFT JOIN products p ON s.id = p.supplier_id
    LEFT JOIN stock_batches sb ON s.id = sb.supplier_id
    GROUP BY s.id
    ORDER BY s.name ASC
  `
    )
    .all()

  return supplierList
}

export function deleteSupplier(id: string): void {
  const db = getDatabase()

  // Soft delete - set is_active to 0
  db.prepare(
    `
    UPDATE suppliers
    SET is_active = 0
    WHERE id = ?
  `
  ).run(id)
}

// =====================
// STOCK BATCHES
// =====================

export interface StockBatchData {
  product_id: string
  batch_number?: string
  quantity: number
  cost_price: number
  /** Optional per-batch selling price; falls back to the product price. */
  selling_price?: number | null
  expiry_date?: string
  received_date?: string
  supplier_id?: string
}

export function getStockBatches(productId: string): StockBatch[] {
  const drizzleDb = getDb()
  return drizzleDb
    .select()
    .from(stockBatches)
    .where(eq(stockBatches.productId, productId))
    .orderBy(asc(stockBatches.expiryDate))
    .all()
}

export function getStockBatchById(id: string): StockBatch | undefined {
  const drizzleDb = getDb()
  return drizzleDb.select().from(stockBatches).where(eq(stockBatches.id, id)).get()
}

export function createStockBatch(data: StockBatchData): { id: string } {
  const drizzleDb = getDb()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  // Local calendar date: UTC dated stock received before 05:30 local to the
  // previous day (M21).
  const receivedDate = data.received_date || localDateString()

  const quantity = assertQuantity('Quantity', data.quantity)
  const costPrice = assertMoney('Cost price', data.cost_price) ?? 0
  const sellingPrice = assertMoney('Selling price', data.selling_price, { required: false })
  const expiryDate = assertExpiryDate(data.expiry_date)

  drizzleDb
    .insert(stockBatches)
    .values({
      id,
      productId: data.product_id,
      batchNumber: data.batch_number?.trim() || null,
      quantity,
      costPrice,
      sellingPrice,
      expiryDate,
      receivedDate,
      supplierId: data.supplier_id ?? null,
      createdAt: now
    })
    .run()

  return { id }
}

export function listStockBatches(): any[] {
  const db = getDatabase()

  const batches = db
    .prepare(
      `
    SELECT
      sb.*,
      p.name as product_name,
      p.sku,
      s.name as supplier_name
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    LEFT JOIN suppliers s ON sb.supplier_id = s.id
    -- Batches of a soft-deleted product used to stay listed, and could still
    -- receive new stock via the Receive Stock combobox.
    WHERE sb.quantity > 0 AND p.is_active = 1
    ORDER BY sb.expiry_date ASC NULLS LAST, sb.received_date DESC
  `
    )
    .all()

  return batches
}

export function updateStockBatch(id: string, data: Partial<StockBatchData>): void {
  const db = getDatabase()

  const fields: string[] = []
  const values: any[] = []

  if (data.batch_number !== undefined) {
    fields.push('batch_number = ?')
    values.push(data.batch_number?.trim() || null)
  }
  if (data.quantity !== undefined) {
    // Deliberately refused. An absolute `SET quantity = ?` leaves no
    // `inventory_adjustments` row, so a batch could go 5 → 500 → 5 with nothing
    // to attribute the shrinkage to. Quantity moves through `adjustStockBatch`,
    // which records the delta, the reason and who did it (H13).
    throw new Error(
      'Stock quantity cannot be set directly — use a stock adjustment so the change is recorded'
    )
  }
  if (data.cost_price !== undefined) {
    fields.push('cost_price = ?')
    values.push(assertMoney('Cost price', data.cost_price))
  }
  if (data.selling_price !== undefined) {
    fields.push('selling_price = ?')
    values.push(assertMoney('Selling price', data.selling_price, { required: false }))
  }
  if (data.expiry_date !== undefined) {
    fields.push('expiry_date = ?')
    // NULL, never '': an empty string sorts below every date comparison, which
    // silently suppressed every expiry warning for that batch (H8).
    values.push(assertExpiryDate(data.expiry_date))
  }
  if (data.supplier_id !== undefined) {
    fields.push('supplier_id = ?')
    values.push(data.supplier_id || null)
  }
  // M18: `received_date` was silently dropped, so correcting a mis-keyed receipt
  // date appeared to succeed and changed nothing. `product_id` is deliberately
  // still not updatable — moving a batch to a different product would rewrite the
  // stock history of both, and re-receiving it is the honest correction.
  if (data.received_date !== undefined) {
    const received = assertExpiryDate(data.received_date)
    if (!received) throw new Error('Received date is required')
    fields.push('received_date = ?')
    values.push(received)
  }

  // An UPDATE with no SET clause is a syntax error, so an all-undefined payload
  // used to throw raw SQL at the operator.
  if (fields.length === 0) return

  values.push(id)

  db.prepare(
    `
    UPDATE stock_batches
    SET ${fields.join(', ')}
    WHERE id = ?
  `
  ).run(...values)
}

export function deleteStockBatch(id: string): void {
  const drizzleDb = getDb()

  const batch = drizzleDb.select().from(stockBatches).where(eq(stockBatches.id, id)).get()

  if (!batch) {
    throw new Error('Stock batch not found')
  }

  if (batch.quantity > 0) {
    throw new Error('Cannot delete batch with remaining stock')
  }

  drizzleDb.delete(stockBatches).where(eq(stockBatches.id, id)).run()
}

export function adjustStockBatch(params: {
  batchId: string
  productId: string
  adjustmentType: 'add' | 'remove' | 'correction'
  quantityChange: number
  reason?: string
  userId: string
}): void {
  const db = getDatabase()
  const drizzleDb = getDb()
  const now = new Date().toISOString()

  db.transaction(() => {
    // Update the batch quantity
    drizzleDb
      .update(stockBatches)
      .set({ quantity: sql`quantity + ${params.quantityChange}` })
      .where(eq(stockBatches.id, params.batchId))
      .run()

    // Record the adjustment (NO try/catch — let it fail loudly)
    drizzleDb
      .insert(inventoryAdjustments)
      .values({
        id: crypto.randomUUID(),
        productId: params.productId,
        batchId: params.batchId,
        adjustmentType: params.adjustmentType,
        quantityChange: params.quantityChange,
        reason: params.reason ?? null,
        userId: params.userId,
        createdAt: now
      })
      .run()
  })()
}

// =====================
// CSV EXPORT
// =====================

/**
 * Escape one CSV cell.
 *
 * Wrapping in quotes is not enough on its own: an embedded quote ends the field
 * early and shifts every column after it (a product literally named `6" Crepe
 * Bandage` corrupted its whole row), and Excel evaluates a leading =, +, - or @
 * as a formula when the file is opened.
 */
function csvCell(value: unknown): string {
  const raw = String(value ?? '')
  const risky = ['=', '+', '-', '@', '\t', '\r']
  const safe = risky.includes(raw.charAt(0)) ? `'${raw}` : raw
  return `"${safe.replace(/"/g, '""')}"`
}

export function exportProductsToCSV(): string {
  const prods = listProducts()

  // Create CSV header
  const headers = [
    'SKU',
    'Name',
    'Generic Name',
    'Barcode',
    'Category',
    'Supplier',
    'Cost Price',
    'Unit Price',
    'Stock',
    'Unit',
    'Reorder Level',
    'Status'
  ]

  // Create CSV rows
  const rows = prods.map((p) => [
    p.sku || '',
    p.name,
    p.generic_name || '',
    p.barcode || '',
    p.category_name || '',
    p.supplier_name || '',
    p.cost_price.toString(),
    p.unit_price.toString(),
    (p.total_stock || 0).toString(),
    p.unit,
    p.reorder_level.toString(),
    p.is_active ? 'Active' : 'Inactive'
  ])

  // Combine headers and rows
  const csvContent = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')

  return csvContent
}
