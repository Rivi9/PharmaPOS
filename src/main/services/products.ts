import { getDatabase } from '../database'

export interface Product {
  id: string
  name: string
  generic_name: string | null
  barcode: string | null
  sku: string
  unit_price: number
  is_active: number
  total_stock?: number
  nearest_expiry?: string | null
}

/**
 * Search products by name, generic name, barcode, or SKU
 */
export function searchProducts(query: string): Product[] {
  const db = getDatabase()
  const searchTerm = `%${query}%`

  const results = db.prepare(`
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
  `).all(searchTerm, searchTerm, query, searchTerm) as Product[]

  return results
}

/**
 * Get product by exact barcode match
 */
export function getProductByBarcode(barcode: string): Product | null {
  const db = getDatabase()

  const result = db.prepare(`
    SELECT
      p.*,
      COALESCE(SUM(sb.quantity), 0) as total_stock,
      MIN(sb.expiry_date) as nearest_expiry
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1 AND p.barcode = ?
    GROUP BY p.id
  `).get(barcode) as Product | undefined

  return result || null
}

/**
 * Get top 8 quick items (best sellers from last 7 days)
 */
export function getQuickItems(): Product[] {
  const db = getDatabase()

  const results = db.prepare(`
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
  `).all() as Product[]

  return results
}

/**
 * Check stock availability for a product
 */
export function checkStockAvailability(productId: string): { available: number; batches: { id: string; quantity: number; expiry_date: string | null }[] } {
  const db = getDatabase()

  const batches = db.prepare(`
    SELECT id, quantity, expiry_date
    FROM stock_batches
    WHERE product_id = ? AND quantity > 0
    ORDER BY
      CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
      expiry_date ASC,
      received_date ASC
  `).all(productId) as { id: string; quantity: number; expiry_date: string | null }[]

  const available = batches.reduce((sum, batch) => sum + batch.quantity, 0)

  return { available, batches }
}
