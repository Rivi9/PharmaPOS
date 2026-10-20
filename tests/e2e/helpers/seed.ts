// node:sqlite, not better-sqlite3: the project's copy is compiled against
// Electron's ABI, so requiring it from the Playwright process (system Node)
// fails with "was compiled against a different Node.js version". node:sqlite
// ships with the runtime, needs no rebuild, and is enough for fixtures.
import { DatabaseSync } from 'node:sqlite'

export interface SeededProduct {
  productId: string
  batchId: string
  barcode: string
  name: string
  unitPrice: number
  costPrice: number
  quantity: number
}

/**
 * Insert a sellable product straight into the running instance's database.
 *
 * Written from the test process while the app holds its own connection — safe
 * because the database runs in WAL mode, and the renderer queries on demand
 * rather than caching a catalogue. Seeding through the UI instead would mean
 * driving the whole inventory form for every sale test.
 *
 * The batch matters as much as the product: `deductStockFEFO` sells from
 * `stock_batches`, so a product with no batch is not sellable and the sale would
 * fail with "Insufficient sellable stock" rather than the thing under test.
 */
export function seedProduct(dbPath: string, overrides: Partial<SeededProduct> = {}): SeededProduct {
  const p: SeededProduct = {
    productId: overrides.productId ?? 'e2e-product-1',
    batchId: overrides.batchId ?? 'e2e-batch-1',
    barcode: overrides.barcode ?? 'PARA500',
    name: overrides.name ?? 'Paracetamol 500mg',
    unitPrice: overrides.unitPrice ?? 25,
    costPrice: overrides.costPrice ?? 15,
    quantity: overrides.quantity ?? 100
  }

  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA journal_mode = WAL')
    const now = new Date().toISOString()

    db.prepare(
      `INSERT OR REPLACE INTO products
         (id, name, barcode, unit_price, cost_price, reorder_level, reorder_qty,
          tax_rate, is_tax_inclusive, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 10, 50, 0, 1, 1, ?, ?)`
    ).run(p.productId, p.name, p.barcode, p.unitPrice, p.costPrice, now, now)

    // Expiry a year out: an expired batch is deliberately excluded from FEFO, so
    // a near-dated fixture would make the sale fail for the wrong reason.
    const expiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    db.prepare(
      `INSERT OR REPLACE INTO stock_batches
         (id, product_id, batch_number, quantity, cost_price, expiry_date, received_date, created_at)
       VALUES (?, ?, 'E2E-B1', ?, ?, ?, ?, ?)`
    ).run(p.batchId, p.productId, p.quantity, p.costPrice, expiry, now, now)
  } finally {
    db.close()
  }

  return p
}

/** Back-date a batch so FEFO must refuse to dispense from it. */
export function expireBatch(dbPath: string, batchId: string, date = '2020-01-01'): void {
  const db = new DatabaseSync(dbPath)
  try {
    db.prepare('UPDATE stock_batches SET expiry_date = ? WHERE id = ?').run(date, batchId)
  } finally {
    db.close()
  }
}

/**
 * A completed sale attached to a customer, carrying the denormalised name and
 * phone that `sales` keeps on every row — the copies a flag-flip "delete" left
 * fully readable, and the reason erasure has to touch this table too.
 */
export function seedSaleForCustomer(
  dbPath: string,
  opts: {
    saleId: string
    shiftId: string
    /** null for a sale that carries a number but was never linked to anyone. */
    customerId: string | null
    customerName: string
    customerPhone: string
    total?: number
  }
): void {
  const db = new DatabaseSync(dbPath)
  try {
    const [admin] = db.prepare('SELECT id FROM users LIMIT 1').all() as { id: string }[]
    db.prepare(
      `INSERT INTO sales (id, receipt_number, shift_id, user_id, customer_id, subtotal, tax_amount,
                          discount_amount, total, payment_method, status, customer_name,
                          customer_phone, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, 'cash', 'completed', ?, ?, datetime('now'))`
    ).run(
      opts.saleId,
      'R-TEST-' + opts.saleId,
      opts.shiftId,
      admin.id,
      opts.customerId,
      opts.total ?? 100,
      opts.total ?? 100,
      opts.customerName,
      opts.customerPhone
    )
  } finally {
    db.close()
  }
}

/** Read rows back out for assertions the UI cannot show. */
export function query<T = Record<string, unknown>>(
  dbPath: string,
  sql: string,
  ...params: (string | number | null)[]
): T[] {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return db.prepare(sql).all(...params) as T[]
  } finally {
    db.close()
  }
}
