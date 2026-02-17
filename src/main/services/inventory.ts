import { eq, sql, asc } from 'drizzle-orm'
import { getDb } from '../db/index'
import { getDatabase, generateId } from './database'
import {
  categories,
  suppliers,
  stockBatches,
  products,
  inventoryAdjustments
} from '../db/schema'
import type { Category, Supplier, StockBatch } from '../db/schema'

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
  tax_rate?: number
  is_tax_inclusive?: number
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
      COALESCE(SUM(sb.quantity), 0) as total_stock,
      c.name as category_name,
      s.name as supplier_name
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    GROUP BY p.id
    ORDER BY p.name ASC
  `
    )
    .all()

  return productList
}

export function createProduct(data: ProductData): { id: string } {
  const db = getDatabase()
  const id = generateId()
  const now = new Date().toISOString()

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
    data.name,
    data.generic_name || null,
    data.barcode || null,
    data.sku || null,
    data.category_id || null,
    data.supplier_id || null,
    data.cost_price,
    data.unit_price,
    data.tax_rate ?? 0,
    data.is_tax_inclusive ?? 1,
    data.reorder_level ?? 10,
    data.reorder_qty ?? 50,
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

  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.generic_name !== undefined) {
    fields.push('generic_name = ?')
    values.push(data.generic_name || null)
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
    values.push(data.cost_price)
  }
  if (data.unit_price !== undefined) {
    fields.push('unit_price = ?')
    values.push(data.unit_price)
  }
  if (data.tax_rate !== undefined) {
    fields.push('tax_rate = ?')
    values.push(data.tax_rate)
  }
  if (data.is_tax_inclusive !== undefined) {
    fields.push('is_tax_inclusive = ?')
    values.push(data.is_tax_inclusive)
  }
  if (data.reorder_level !== undefined) {
    fields.push('reorder_level = ?')
    values.push(data.reorder_level)
  }
  if (data.reorder_qty !== undefined) {
    fields.push('reorder_qty = ?')
    values.push(data.reorder_qty)
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

export function updateCategory(id: string, name: string, description?: string): void {
  const drizzleDb = getDb()

  drizzleDb
    .update(categories)
    .set({
      name,
      description: description ?? null
    })
    .where(eq(categories.id, id))
    .run()
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
  const receivedDate = data.received_date || new Date().toISOString().split('T')[0]

  drizzleDb
    .insert(stockBatches)
    .values({
      id,
      productId: data.product_id,
      batchNumber: data.batch_number ?? null,
      quantity: data.quantity,
      costPrice: data.cost_price,
      expiryDate: data.expiry_date ?? null,
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
    WHERE sb.quantity > 0
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
    values.push(data.batch_number || null)
  }
  if (data.quantity !== undefined) {
    fields.push('quantity = ?')
    values.push(data.quantity)
  }
  if (data.cost_price !== undefined) {
    fields.push('cost_price = ?')
    values.push(data.cost_price)
  }
  if (data.expiry_date !== undefined) {
    fields.push('expiry_date = ?')
    values.push(data.expiry_date || null)
  }
  if (data.supplier_id !== undefined) {
    fields.push('supplier_id = ?')
    values.push(data.supplier_id || null)
  }

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
    'Tax Rate',
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
    p.tax_rate.toString(),
    (p.total_stock || 0).toString(),
    p.unit,
    p.reorder_level.toString(),
    p.is_active ? 'Active' : 'Inactive'
  ])

  // Combine headers and rows
  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell}"`).join(','))
    .join('\n')

  return csvContent
}
