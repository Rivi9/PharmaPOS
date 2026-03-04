import { eq, and, sql, asc } from 'drizzle-orm'
import { getDb } from '../db/index'
import { getDatabase } from './database'
import { products } from '../db/schema'
import type { Product, NewProduct } from '../db/schema'

export type { Product, NewProduct }

/**
 * Get all active products ordered by name
 */
export function getProducts(): Product[] {
  return getDb()
    .select()
    .from(products)
    .where(eq(products.isActive, 1))
    .orderBy(asc(products.name))
    .all()
}

/**
 * Search products by name, generic name, barcode, or SKU
 */
export function searchProducts(
  query: string
): (Product & { total_stock: number; nearest_expiry: string | null })[] {
  const q = query.trim()
  const db = getDatabase()
  const searchTerm = `%${q}%`

  const results = db
    .prepare(
      `
    SELECT
      p.*,
      COALESCE(SUM(sb.quantity), 0) as total_stock,
      MIN(sb.expiry_date) as nearest_expiry
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
      AND (
        p.name LIKE ? OR
        p.generic_name LIKE ? OR
        p.barcode = ? OR
        p.sku LIKE ?
      )
    GROUP BY p.id
    ORDER BY p.name ASC
    LIMIT 20
  `
    )
    .all(searchTerm, searchTerm, q, searchTerm) as (Product & {
    total_stock: number
    nearest_expiry: string | null
  })[]

  return results
}

/**
 * Get product by ID
 */
export function getProductById(id: string): Product | null {
  const result = getDb().select().from(products).where(eq(products.id, id)).get()
  return result ?? null
}

/**
 * Get product by exact barcode match
 */
export function getProductByBarcode(
  barcode: string
): (Product & { total_stock: number; nearest_expiry: string | null }) | null {
  const db = getDatabase()

  const result = db
    .prepare(
      `
    SELECT
      p.*,
      COALESCE(SUM(sb.quantity), 0) as total_stock,
      MIN(sb.expiry_date) as nearest_expiry
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1 AND p.barcode = ?
    GROUP BY p.id
  `
    )
    .get(barcode) as (Product & { total_stock: number; nearest_expiry: string | null }) | undefined

  return result ?? null
}

/**
 * Create a new product
 */
export function createProduct(data: Omit<NewProduct, 'id' | 'createdAt' | 'updatedAt'>): Product {
  const now = new Date().toISOString()
  const id = crypto.randomUUID()

  getDb()
    .insert(products)
    .values({ ...data, id, createdAt: now, updatedAt: now })
    .run()

  const created = getProductById(id)
  if (!created) throw new Error('Failed to retrieve created product')
  return created
}

/**
 * Update an existing product
 */
export function updateProduct(
  id: string,
  data: Partial<Omit<NewProduct, 'id' | 'createdAt'>>
): Product {
  const now = new Date().toISOString()

  getDb()
    .update(products)
    .set({ ...data, updatedAt: now })
    .where(eq(products.id, id))
    .run()

  const updated = getProductById(id)
  if (!updated) throw new Error('Failed to retrieve updated product')
  return updated
}

/**
 * Soft-delete a product (set is_active = 0)
 */
export function deleteProduct(id: string): void {
  const now = new Date().toISOString()

  getDb().update(products).set({ isActive: 0, updatedAt: now }).where(eq(products.id, id)).run()
}

/**
 * Get products where current stock is at or below the reorder level
 */
export function getLowStockProducts(): {
  id: string
  name: string
  reorderLevel: number
  currentStock: number
}[] {
  return getDb()
    .select({
      id: products.id,
      name: products.name,
      reorderLevel: products.reorderLevel,
      currentStock: sql<number>`COALESCE((SELECT SUM(quantity) FROM stock_batches WHERE product_id = ${products.id} AND quantity > 0), 0)`
    })
    .from(products)
    .where(
      and(
        eq(products.isActive, 1),
        sql`COALESCE((SELECT SUM(quantity) FROM stock_batches WHERE product_id = ${products.id} AND quantity > 0), 0) <= ${products.reorderLevel}`
      )
    )
    .all()
}

/**
 * Get top 8 quick items (best sellers from last 7 days)
 */
export function getQuickItems(): (Product & {
  total_stock: number
  nearest_expiry: string | null
  sales_7d: number
})[] {
  const db = getDatabase()

  const results = db
    .prepare(
      `
    SELECT
      p.*,
      COALESCE(SUM(sb.quantity), 0) as total_stock,
      MIN(sb.expiry_date) as nearest_expiry,
      COALESCE(SUM(psd.quantity_sold), 0) as sales_7d
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    LEFT JOIN product_sales_daily psd
      ON p.id = psd.product_id
      AND psd.date >= date('now', '-7 days')
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY sales_7d DESC, p.name ASC
    LIMIT 8
  `
    )
    .all() as (Product & { total_stock: number; nearest_expiry: string | null; sales_7d: number })[]

  return results
}

/**
 * Get products with their total stock quantity (for inventory views)
 */
export function getProductsWithStock(): (Product & {
  total_stock: number
  nearest_expiry: string | null
})[] {
  const db = getDatabase()

  return db
    .prepare(
      `
    SELECT
      p.*,
      COALESCE(SUM(sb.quantity), 0) as total_stock,
      MIN(sb.expiry_date) as nearest_expiry
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id AND sb.quantity > 0
    WHERE p.is_active = 1
    GROUP BY p.id
    ORDER BY p.name ASC
  `
    )
    .all() as (Product & { total_stock: number; nearest_expiry: string | null })[]
}

/**
 * Check stock availability for a product
 */
export function checkStockAvailability(productId: string): {
  available: number
  batches: { id: string; quantity: number; expiry_date: string | null }[]
} {
  const db = getDatabase()

  const batches = db
    .prepare(
      `
    SELECT id, quantity, expiry_date
    FROM stock_batches
    WHERE product_id = ? AND quantity > 0
    ORDER BY
      CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
      expiry_date ASC,
      received_date ASC
  `
    )
    .all(productId) as { id: string; quantity: number; expiry_date: string | null }[]

  const available = batches.reduce((sum, batch) => sum + batch.quantity, 0)

  return { available, batches }
}
