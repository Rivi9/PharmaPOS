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

// =====================
// CATEGORIES
// =====================

export interface CategoryData {
  name: string
  description?: string
  parent_id?: string
}

export function listCategories(): any[] {
  const db = getDatabase()

  const categories = db
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

  return categories
}

export function createCategory(data: CategoryData): { id: string } {
  const db = getDatabase()
  const id = generateId()
  const now = new Date().toISOString()

  db.prepare(
    `
    INSERT INTO categories (
      id, name, description, parent_id, created_at
    ) VALUES (?, ?, ?, ?, ?)
  `
  ).run(id, data.name, data.description || null, data.parent_id || null, now)

  return { id }
}

export function updateCategory(id: string, data: Partial<CategoryData>): void {
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

export function deleteCategory(id: string): void {
  const db = getDatabase()

  // Check if category has products
  const count = db
    .prepare('SELECT COUNT(*) as count FROM products WHERE category_id = ?')
    .get(id) as { count: number }

  if (count.count > 0) {
    throw new Error('Cannot delete category with products')
  }

  // Check if category has child categories
  const childCount = db
    .prepare('SELECT COUNT(*) as count FROM categories WHERE parent_id = ?')
    .get(id) as { count: number }

  if (childCount.count > 0) {
    throw new Error('Cannot delete category with sub-categories')
  }

  db.prepare('DELETE FROM categories WHERE id = ?').run(id)
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

export function listSuppliers(): any[] {
  const db = getDatabase()

  const suppliers = db
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

  return suppliers
}

export function createSupplier(data: SupplierData): { id: string } {
  const db = getDatabase()
  const id = generateId()
  const now = new Date().toISOString()

  db.prepare(
    `
    INSERT INTO suppliers (
      id, name, contact_person, phone, email, address,
      lead_time_days, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    data.name,
    data.contact_person || null,
    data.phone || null,
    data.email || null,
    data.address || null,
    data.lead_time_days ?? 3,
    data.is_active ?? 1,
    now
  )

  return { id }
}

export function updateSupplier(id: string, data: Partial<SupplierData>): void {
  const db = getDatabase()

  const fields: string[] = []
  const values: any[] = []

  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.contact_person !== undefined) {
    fields.push('contact_person = ?')
    values.push(data.contact_person || null)
  }
  if (data.phone !== undefined) {
    fields.push('phone = ?')
    values.push(data.phone || null)
  }
  if (data.email !== undefined) {
    fields.push('email = ?')
    values.push(data.email || null)
  }
  if (data.address !== undefined) {
    fields.push('address = ?')
    values.push(data.address || null)
  }
  if (data.lead_time_days !== undefined) {
    fields.push('lead_time_days = ?')
    values.push(data.lead_time_days)
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?')
    values.push(data.is_active)
  }

  values.push(id)

  db.prepare(
    `
    UPDATE suppliers
    SET ${fields.join(', ')}
    WHERE id = ?
  `
  ).run(...values)
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
