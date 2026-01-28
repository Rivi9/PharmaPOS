import { getDatabase, generateId } from './database'

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

  const products = db
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

  return products
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

  const products = db
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

  return products
}
