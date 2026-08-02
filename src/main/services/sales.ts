import { eq } from 'drizzle-orm'
import { getDb } from '../db/index'
import { getDatabase } from './database'
import { sales, saleItems, products, customers, saleRefunds } from '../db/schema'
import type { Sale, SaleItem, SaleRefund } from '../db/schema'
import { round2 } from '../../shared/money'
import { logAudit } from './audit'

// Re-export types that may be consumed by other modules
export type { Sale, SaleItem, SaleRefund }

interface SaleItemInput {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

interface SaleData {
  shift_id: string
  user_id: string
  items: SaleItemInput[]
  subtotal: number
  discount_amount: number
  discount_type: 'percentage' | 'fixed' | null
  discount_value: number
  tax_amount: number
  total: number
  payment_method: 'cash' | 'card' | 'mixed'
  cash_received: number
  card_received: number
  change_given: number
  customer_name?: string
  customer_phone?: string
}

interface BatchDeduction {
  batch_id: string
  quantity: number
  /** Cost of THIS batch — the correct COGS basis, not products.cost_price. */
  cost_price: number
}

/**
 * Generate next receipt number for current year
 */
function generateReceiptNumber(): string {
  const db = getDatabase()
  const currentYear = new Date().getFullYear()

  const lastReceipt = db
    .prepare(
      `
    SELECT receipt_number
    FROM sales
    WHERE receipt_number LIKE ?
    ORDER BY receipt_number DESC
    LIMIT 1
  `
    )
    .get(`R-${currentYear}-%`) as { receipt_number: string } | undefined

  let nextNumber = 1
  if (lastReceipt) {
    const parts = lastReceipt.receipt_number.split('-')
    nextNumber = parseInt(parts[2] || '0') + 1
  }

  return `R-${currentYear}-${nextNumber.toString().padStart(6, '0')}`
}

/**
 * Deduct stock using FEFO (First Expiry First Out) strategy.
 * Called inside a transaction so raw SQL is intentional.
 */
function deductStockFEFO(productId: string, quantityNeeded: number): BatchDeduction[] {
  const db = getDatabase()

  const batches = db
    .prepare(
      `
    SELECT id, quantity, expiry_date, cost_price
    FROM stock_batches
    WHERE product_id = ? AND quantity > 0
      -- Expired stock must never be dispensed. FEFO orders by expiry ascending,
      -- so without this filter an expired batch was preferentially sold first.
      AND (expiry_date IS NULL OR expiry_date = '' OR expiry_date >= date('now','localtime'))
    ORDER BY
      CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
      expiry_date ASC,
      received_date ASC
  `
    )
    .all(productId) as {
    id: string
    quantity: number
    expiry_date: string | null
    cost_price: number
  }[]

  let remaining = quantityNeeded
  const deductions: BatchDeduction[] = []

  for (const batch of batches) {
    if (remaining <= 0) break

    const deductQty = Math.min(batch.quantity, remaining)
    deductions.push({
      batch_id: batch.id,
      quantity: deductQty,
      cost_price: batch.cost_price ?? 0
    })
    remaining -= deductQty
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient sellable stock for product ${productId}. Need ${quantityNeeded}, available ${quantityNeeded - remaining} (expired batches are excluded)`
    )
  }

  for (const deduction of deductions) {
    db.prepare(
      `
      UPDATE stock_batches
      SET quantity = quantity - ?
      WHERE id = ?
    `
    ).run(deduction.quantity, deduction.batch_id)
  }

  return deductions
}

/**
 * Create a complete sale with stock deduction.
 * FIX 1: Auto-links customer by phone.
 * FIX 2: Calculates per-item tax amount.
 * FIX 3: Uses ON CONFLICT upsert for product_sales_daily.
 * FIX 4: No longer updates shifts.expected_cash (computed at shift-end).
 */
export function createSale(saleData: SaleData): { sale_id: string; receipt_number: string } {
  const db = getDatabase()
  const drizzleDb = getDb()

  // Enforced here as well as in the UI — the renderer can be bypassed.
  if (saleData.payment_method !== 'cash') {
    const cardEnabled =
      (
        db.prepare('SELECT value FROM settings WHERE key = ?').get('card_payment_enabled') as
          | { value: string }
          | undefined
      )?.value !== '0'
    if (!cardEnabled) {
      throw new Error('Card payments are disabled for this pharmacy')
    }
  }

  return db.transaction(() => {
    const saleId = crypto.randomUUID()
    const receiptNumber = generateReceiptNumber()
    const now = new Date().toISOString()
    const today = now.split('T')[0]

    // FIX 1: Auto-link customer by phone
    let customerId: string | null = null
    if (saleData.customer_phone) {
      const customer = drizzleDb
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.phone, saleData.customer_phone))
        .get()
      customerId = customer?.id ?? null
    }

    // Insert sale header using Drizzle
    drizzleDb
      .insert(sales)
      .values({
        id: saleId,
        receiptNumber,
        shiftId: saleData.shift_id,
        userId: saleData.user_id,
        customerId,
        subtotal: saleData.subtotal,
        taxAmount: saleData.tax_amount,
        discountAmount: saleData.discount_amount,
        discountType: saleData.discount_type,
        discountValue: saleData.discount_value,
        total: saleData.total,
        paymentMethod: saleData.payment_method,
        cashReceived: saleData.cash_received,
        cardReceived: saleData.card_received,
        changeGiven: saleData.change_given,
        status: 'completed',
        customerName: saleData.customer_name ?? null,
        customerPhone: saleData.customer_phone ?? null,
        createdAt: now
      })
      .run()

    // Insert sale items with per-item tax
    for (const item of saleData.items) {
      const itemId = crypto.randomUUID()
      const batches = deductStockFEFO(item.product_id, item.quantity)

      // Get product for cost_price and tax info
      const product = drizzleDb
        .select({
          costPrice: products.costPrice,
          taxRate: products.taxRate,
          isTaxInclusive: products.isTaxInclusive
        })
        .from(products)
        .where(eq(products.id, item.product_id))
        .get()

      // Cost comes from the batches actually dispensed, weighted by quantity.
      // Reading products.cost_price instead reported 100% margin on every sale,
      // because cost is captured per batch when stock is received and the product
      // column is left at its 0 default.
      const batchCostTotal = batches.reduce((sum, b) => sum + b.cost_price * b.quantity, 0)
      const batchQty = batches.reduce((sum, b) => sum + b.quantity, 0)
      const costPrice =
        batchQty > 0 && batchCostTotal > 0
          ? round2(batchCostTotal / batchQty)
          : (product?.costPrice ?? 0)
      const taxRate = product?.taxRate ?? 0

      // FIX 2: Calculate per-item tax amount
      let taxAmount = 0
      if (taxRate > 0) {
        if (product?.isTaxInclusive) {
          taxAmount = item.line_total - item.line_total / (1 + taxRate / 100)
        } else {
          taxAmount = (item.line_total * taxRate) / 100
        }
      }

      drizzleDb
        .insert(saleItems)
        .values({
          id: itemId,
          saleId,
          productId: item.product_id,
          batchId: batches[0].batch_id,
          quantity: item.quantity,
          unitPrice: item.unit_price,
          costPrice,
          taxRate,
          taxAmount,
          discountAmount: 0,
          lineTotal: item.line_total,
          createdAt: now
        })
        .run()

      // FIX 3: product_sales_daily upsert using composite PK (date, product_id)
      const cost = round2(costPrice * item.quantity)
      const profit = round2(item.line_total - cost)

      db.prepare(
        `
        INSERT INTO product_sales_daily (date, product_id, quantity_sold, revenue, cost, profit)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(date, product_id) DO UPDATE SET
          quantity_sold = quantity_sold + excluded.quantity_sold,
          revenue = revenue + excluded.revenue,
          cost = cost + excluded.cost,
          profit = profit + excluded.profit
      `
      ).run(today, item.product_id, item.quantity, item.line_total, cost, profit)
    }

    // FIX 4: REMOVED — do NOT update shifts.expected_cash here
    // expected_cash is computed at shift-end from actual sales

    return { sale_id: saleId, receipt_number: receiptNumber }
  })()
}

/**
 * Void a completed sale. Requires a non-empty reason.
 */
export function voidSale(saleId: string, userId: string, reason: string): void {
  if (!reason.trim()) throw new Error('Void reason is required')

  const raw = getDatabase()

  raw.transaction(() => {
    const sale = raw
      .prepare('SELECT status, total, receipt_number FROM sales WHERE id = ?')
      .get(saleId) as { status: string; total: number; receipt_number: string } | undefined
    if (!sale) throw new Error('Sale not found')
    if (sale.status !== 'completed') throw new Error(`Cannot void a ${sale.status} sale`)

    const items = raw
      .prepare(
        `SELECT product_id, batch_id, quantity, cost_price, line_total
         FROM sale_items WHERE sale_id = ?`
      )
      .all(saleId) as {
      product_id: string
      batch_id: string | null
      quantity: number
      cost_price: number
      line_total: number
    }[]

    const saleDate = (
      raw.prepare('SELECT created_at FROM sales WHERE id = ?').get(saleId) as {
        created_at: string
      }
    ).created_at.split('T')[0]

    for (const item of items) {
      // Put the stock back where it came from, so expiry tracking stays truthful.
      if (item.batch_id) {
        raw
          .prepare('UPDATE stock_batches SET quantity = quantity + ? WHERE id = ?')
          .run(item.quantity, item.batch_id)
      }

      // Reverse the daily rollup. Without this the P&L and dashboard kept counting
      // the voided sale forever, because product_sales_daily has no status column.
      const cost = round2(item.cost_price * item.quantity)
      raw
        .prepare(
          `UPDATE product_sales_daily
             SET quantity_sold = quantity_sold - ?,
                 revenue = revenue - ?,
                 cost = cost - ?,
                 profit = profit - ?
           WHERE date = ? AND product_id = ?`
        )
        .run(item.quantity, item.line_total, cost, round2(item.line_total - cost), saleDate, item.product_id)
    }

    raw
      .prepare(
        `UPDATE sales SET status = 'voided', void_reason = ? WHERE id = ? AND status = 'completed'`
      )
      .run(reason.trim(), saleId)

    // There are no voided_by / voided_at columns yet (adding them needs the
    // migration runner). Until then the audit entry is the record of who voided
    // what and when — previously voiding left no trace at all.
    logAudit({
      userId,
      action: 'SALE_VOIDED',
      entityType: 'sale',
      entityId: saleId,
      details: {
        receipt_number: sale.receipt_number,
        total: sale.total,
        reason: reason.trim(),
        voided_at: new Date().toISOString()
      }
    })
  })()
}

/**
 * Compute expected cash in drawer for a shift.
 * opening_cash + sum of cash_received from completed sales.
 */
export function computeShiftExpectedCash(shiftId: string, openingCash: number): number {
  // cash_received is what the customer HANDED OVER; change_given went back out.
  // Only the difference stays in the drawer. Summing cash_received alone
  // overstated the drawer by the whole day's change and reported every cashier short.
  const result = getDatabase()
    .prepare(
      `SELECT COALESCE(SUM(cash_received - COALESCE(change_given, 0)), 0) as total
       FROM sales WHERE shift_id = ? AND status = 'completed'`
    )
    .get(shiftId) as { total: number }
  return round2(openingCash + result.total)
}

/** Cash actually taken during a shift, i.e. excluding the opening float. */
export function computeShiftCashSales(shiftId: string): number {
  const result = getDatabase()
    .prepare(
      `SELECT COALESCE(SUM(cash_received - COALESCE(change_given, 0)), 0) as total
       FROM sales WHERE shift_id = ? AND status = 'completed' AND payment_method IN ('cash','mixed')`
    )
    .get(shiftId) as { total: number }
  return round2(result.total)
}

/**
 * Get receipt data for display
 */
export function getReceipt(saleId: string) {
  const db = getDatabase()

  const sale = db
    .prepare(
      `
    SELECT s.*, u.full_name as cashier_name
    FROM sales s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `
    )
    .get(saleId)

  const items = db
    .prepare(
      `
    SELECT si.*, p.name as product_name
    FROM sale_items si
    LEFT JOIN products p ON si.product_id = p.id
    WHERE si.sale_id = ?
  `
    )
    .all(saleId)

  return { sale, items }
}

/**
 * Get today's sales total for a shift
 */
export function getTodaySalesTotal(shiftId: string): number {
  const db = getDatabase()

  const result = db
    .prepare(
      `
    SELECT COALESCE(SUM(total), 0) as total
    FROM sales
    WHERE shift_id = ?
      -- Scoped to the shift, not the calendar day: an overnight shift used to
      -- report zero after the UTC date rolled over mid-shift. Voided sales are
      -- excluded, which they previously were not.
      AND status = 'completed'
  `
    )
    .get(shiftId) as { total: number }

  return result.total
}

interface RefundItemInput {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

/**
 * Create a partial or full refund for a completed sale.
 * Optionally restores stock back to batches (restock=true).
 */
export function createRefund(
  saleId: string,
  userId: string,
  items: RefundItemInput[],
  reason: string,
  restock: boolean
): { refund_id: string } {
  if (!items.length) throw new Error('Refund must include at least one item')

  const db = getDb()
  const rawDb = getDatabase()

  const sale = db.select({ status: sales.status }).from(sales).where(eq(sales.id, saleId)).get()
  if (!sale) throw new Error('Sale not found')
  if (sale.status !== 'completed') throw new Error(`Cannot refund a ${sale.status} sale`)

  const totalRefunded = items.reduce((sum, i) => sum + i.line_total, 0)
  const refundId = crypto.randomUUID()
  const now = new Date().toISOString()

  rawDb.transaction(() => {
    db.insert(saleRefunds)
      .values({
        id: refundId,
        saleId,
        userId,
        items: JSON.stringify(items),
        totalRefunded,
        restock: restock ? 1 : 0,
        reason: reason.trim() || null,
        createdAt: now
      })
      .run()

    if (restock) {
      for (const item of items) {
        // Return stock to the most recent active batch for this product,
        // or create an adjustment batch if none exists.
        const batch = rawDb
          .prepare(
            `SELECT id FROM stock_batches WHERE product_id = ? ORDER BY received_date DESC LIMIT 1`
          )
          .get(item.product_id) as { id: string } | undefined

        if (batch) {
          rawDb
            .prepare(`UPDATE stock_batches SET quantity = quantity + ? WHERE id = ?`)
            .run(item.quantity, batch.id)
        }

        // Update the product's total stock level
        rawDb
          .prepare(`UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?`)
          .run(item.quantity, item.product_id)
      }
    }
  })()

  return { refund_id: refundId }
}
