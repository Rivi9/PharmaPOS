import { eq } from 'drizzle-orm'
import { getDb } from '../db/index'
import { getDatabase } from './database'
import { sales, saleItems, products, customers } from '../db/schema'
import type { Sale, SaleItem, SaleRefund } from '../db/schema'

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

  let remaining = quantityNeeded
  const deductions: BatchDeduction[] = []

  for (const batch of batches) {
    if (remaining <= 0) break

    const deductQty = Math.min(batch.quantity, remaining)
    deductions.push({ batch_id: batch.id, quantity: deductQty })
    remaining -= deductQty
  }

  if (remaining > 0) {
    throw new Error(
      `Insufficient stock for product ${productId}. Need ${quantityNeeded}, available ${quantityNeeded - remaining}`
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

      const costPrice = product?.costPrice ?? 0
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
      const cost = costPrice * item.quantity
      const profit = item.line_total - cost

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
export function voidSale(saleId: string, _userId: string, reason: string): void {
  if (!reason.trim()) throw new Error('Void reason is required')

  const db = getDb()
  const sale = db.select({ status: sales.status }).from(sales).where(eq(sales.id, saleId)).get()
  if (!sale) throw new Error('Sale not found')
  if (sale.status !== 'completed') throw new Error(`Cannot void a ${sale.status} sale`)

  db.update(sales)
    .set({
      status: 'voided',
      voidReason: reason.trim()
    })
    .where(eq(sales.id, saleId))
    .run()
}

/**
 * Compute expected cash in drawer for a shift.
 * opening_cash + sum of cash_received from completed sales.
 */
export function computeShiftExpectedCash(shiftId: string, openingCash: number): number {
  const result = getDatabase()
    .prepare(
      `SELECT COALESCE(SUM(cash_received), 0) as total FROM sales WHERE shift_id = ? AND status = 'completed'`
    )
    .get(shiftId) as { total: number }
  return openingCash + result.total
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
    SELECT * FROM sale_items WHERE sale_id = ?
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
      AND date(created_at) = date('now')
  `
    )
    .get(shiftId) as { total: number }

  return result.total
}
