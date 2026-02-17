import { sqliteTable, text, real, integer, primaryKey } from 'drizzle-orm/sqlite-core'

// ─── Users & Authentication ──────────────────────────────────────────────────

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').unique().notNull(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  role: text('role', { enum: ['admin', 'manager', 'cashier'] })
    .notNull()
    .default('cashier'),
  pinCode: text('pin_code'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

// ─── Categories ──────────────────────────────────────────────────────────────

export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').unique().notNull(),
  description: text('description'),
  parentId: text('parent_id').references((): ReturnType<typeof text> => categories.id),
  createdAt: text('created_at').notNull()
})

// ─── Suppliers ───────────────────────────────────────────────────────────────

export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  contactPerson: text('contact_person'),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  leadTimeDays: integer('lead_time_days').default(3),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull()
})

// ─── Products ────────────────────────────────────────────────────────────────

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  barcode: text('barcode').unique(),
  sku: text('sku').unique(),
  name: text('name').notNull(),
  genericName: text('generic_name'),
  categoryId: text('category_id').references(() => categories.id),
  supplierId: text('supplier_id').references(() => suppliers.id),
  costPrice: real('cost_price').notNull().default(0),
  unitPrice: real('unit_price').notNull(),
  taxRate: real('tax_rate').notNull().default(0),
  isTaxInclusive: integer('is_tax_inclusive').notNull().default(1),
  reorderLevel: integer('reorder_level').notNull().default(10),
  reorderQty: integer('reorder_qty').notNull().default(50),
  unit: text('unit').notNull().default('piece'),
  isActive: integer('is_active').notNull().default(1),
  trackExpiry: integer('track_expiry').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

// ─── Customers ───────────────────────────────────────────────────────────────

export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').unique(),
  email: text('email').unique(),
  address: text('address'),
  dateOfBirth: text('date_of_birth'),
  notes: text('notes'),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
})

// ─── Shifts ──────────────────────────────────────────────────────────────────

export const shifts = sqliteTable('shifts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  openingCash: real('opening_cash').notNull().default(0),
  closingCash: real('closing_cash'),
  notes: text('notes'),
  status: text('status', { enum: ['active', 'closed'] })
    .notNull()
    .default('active')
})

// ─── Stock Batches ───────────────────────────────────────────────────────────

export const stockBatches = sqliteTable('stock_batches', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  batchNumber: text('batch_number'),
  quantity: real('quantity').notNull().default(0),
  costPrice: real('cost_price').notNull(),
  expiryDate: text('expiry_date'),
  receivedDate: text('received_date').notNull(),
  supplierId: text('supplier_id').references(() => suppliers.id),
  createdAt: text('created_at').notNull()
})

// ─── Sales ───────────────────────────────────────────────────────────────────

export const sales = sqliteTable('sales', {
  id: text('id').primaryKey(),
  receiptNumber: text('receipt_number').unique().notNull(),
  shiftId: text('shift_id')
    .notNull()
    .references(() => shifts.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  customerId: text('customer_id').references(() => customers.id),
  subtotal: real('subtotal').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  discountAmount: real('discount_amount').notNull().default(0),
  discountType: text('discount_type', { enum: ['percentage', 'fixed'] }),
  discountValue: real('discount_value').default(0),
  total: real('total').notNull().default(0),
  paymentMethod: text('payment_method', { enum: ['cash', 'card', 'mixed'] }).notNull(),
  cashReceived: real('cash_received').default(0),
  cardReceived: real('card_received').default(0),
  changeGiven: real('change_given').default(0),
  status: text('status', { enum: ['completed', 'voided', 'refunded'] })
    .notNull()
    .default('completed'),
  voidReason: text('void_reason'),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone'),
  createdAt: text('created_at').notNull()
})

// ─── Sale Items ───────────────────────────────────────────────────────────────

export const saleItems = sqliteTable('sale_items', {
  id: text('id').primaryKey(),
  saleId: text('sale_id')
    .notNull()
    .references(() => sales.id, { onDelete: 'cascade' }),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  batchId: text('batch_id').references(() => stockBatches.id),
  quantity: integer('quantity').notNull(),
  unitPrice: real('unit_price').notNull(),
  costPrice: real('cost_price').notNull(),
  taxRate: real('tax_rate').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  discountAmount: real('discount_amount').notNull().default(0),
  lineTotal: real('line_total').notNull(),
  createdAt: text('created_at').notNull()
})

// ─── Inventory Adjustments ───────────────────────────────────────────────────

export const inventoryAdjustments = sqliteTable('inventory_adjustments', {
  id: text('id').primaryKey(),
  productId: text('product_id')
    .notNull()
    .references(() => products.id),
  batchId: text('batch_id').references(() => stockBatches.id),
  adjustmentType: text('adjustment_type', { enum: ['add', 'remove', 'correction'] }).notNull(),
  quantityChange: real('quantity_change').notNull(),
  reason: text('reason'),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').notNull()
})

// ─── Sale Refunds ────────────────────────────────────────────────────────────

export const saleRefunds = sqliteTable('sale_refunds', {
  id: text('id').primaryKey(),
  saleId: text('sale_id')
    .notNull()
    .references(() => sales.id),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  items: text('items').notNull(), // JSON array stored as TEXT
  totalRefunded: real('total_refunded').notNull(),
  restock: integer('restock').notNull().default(1),
  reason: text('reason'),
  createdAt: text('created_at').notNull()
})

// ─── Product Sales Daily ─────────────────────────────────────────────────────

export const productSalesDaily = sqliteTable(
  'product_sales_daily',
  {
    date: text('date').notNull(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id),
    quantitySold: integer('quantity_sold').notNull().default(0),
    revenue: real('revenue').notNull().default(0),
    cost: real('cost').notNull().default(0),
    profit: real('profit').notNull().default(0)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.date, t.productId] })
  })
)

// ─── Audit Log ───────────────────────────────────────────────────────────────

export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  timestamp: text('timestamp').notNull(),
  userId: text('user_id').references(() => users.id),
  userName: text('user_name'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id'),
  details: text('details'),
  ipAddress: text('ip_address')
})

// ─── Settings ────────────────────────────────────────────────────────────────

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull()
})

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Shift = typeof shifts.$inferSelect
export type Sale = typeof sales.$inferSelect
export type NewSale = typeof sales.$inferInsert
export type SaleItem = typeof saleItems.$inferSelect
export type NewSaleItem = typeof saleItems.$inferInsert
export type Product = typeof products.$inferSelect
export type NewProduct = typeof products.$inferInsert
export type Customer = typeof customers.$inferSelect
export type StockBatch = typeof stockBatches.$inferSelect
export type InventoryAdjustment = typeof inventoryAdjustments.$inferSelect
export type SaleRefund = typeof saleRefunds.$inferSelect
export type Category = typeof categories.$inferSelect
export type Supplier = typeof suppliers.$inferSelect
export type AuditLog = typeof auditLog.$inferSelect
