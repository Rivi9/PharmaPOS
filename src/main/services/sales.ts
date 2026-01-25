import { getDatabase } from './database'

interface SaleItem {
  product_id: string
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

interface SaleData {
  shift_id: string
  user_id: string
  items: SaleItem[]
  subtotal: number
  discount_amount: number
  discount_type: 'percentage' | 'fixed' | null
  discount_value: number
  tax_amount: number
  total: number
  payment_method: 'cash' | 'card' | 'mixed'
  cash_received: number
  card_amount: number
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

  // Get last receipt number for this year
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
 * Deduct stock using FEFO (First Expiry First Out) strategy
 */
function deductStockFEFO(productId: string, quantityNeeded: number): BatchDeduction[] {
  const db = getDatabase()

  // Get batches in FEFO order
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

  // Apply deductions
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
 * Create a complete sale with stock deduction and shift update
 */
export function createSale(saleData: SaleData): { sale_id: string; receipt_number: string } {
  const db = getDatabase()

  return db.transaction(() => {
    const saleId = crypto.randomUUID()
    const receiptNumber = generateReceiptNumber()
    const now = new Date().toISOString()

    // 1. Insert sale header
    db.prepare(
      `
      INSERT INTO sales (
        id, receipt_number, shift_id, user_id,
        subtotal, discount_amount, discount_type, discount_value,
        tax_amount, total,
        payment_method, cash_received, card_amount, change_given,
        customer_name, customer_phone,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      saleId,
      receiptNumber,
      saleData.shift_id,
      saleData.user_id,
      saleData.subtotal,
      saleData.discount_amount,
      saleData.discount_type,
      saleData.discount_value,
      saleData.tax_amount,
      saleData.total,
      saleData.payment_method,
      saleData.cash_received,
      saleData.card_amount,
      saleData.change_given,
      saleData.customer_name || null,
      saleData.customer_phone || null,
      now,
      now
    )

    // 2. Insert sale items and deduct stock
    for (const item of saleData.items) {
      const itemId = crypto.randomUUID()

      // Deduct stock using FEFO
      const batches = deductStockFEFO(item.product_id, item.quantity)

      // Insert sale item (record first batch used)
      db.prepare(
        `
        INSERT INTO sale_items (
          id, sale_id, product_id, product_name,
          quantity, unit_price, line_total,
          batch_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        itemId,
        saleId,
        item.product_id,
        item.product_name,
        item.quantity,
        item.unit_price,
        item.line_total,
        batches[0].batch_id
      )

      // Update product_sales_daily
      const today = new Date().toISOString().split('T')[0]
      const existing = db
        .prepare(
          `
        SELECT id FROM product_sales_daily
        WHERE product_id = ? AND date = ?
      `
        )
        .get(item.product_id, today) as { id: string } | undefined

      if (existing) {
        db.prepare(
          `
          UPDATE product_sales_daily
          SET quantity_sold = quantity_sold + ?,
              revenue = revenue + ?
          WHERE product_id = ? AND date = ?
        `
        ).run(item.quantity, item.line_total, item.product_id, today)
      } else {
        db.prepare(
          `
          INSERT INTO product_sales_daily (
            id, product_id, date, quantity_sold, revenue
          ) VALUES (?, ?, ?, ?, ?)
        `
        ).run(crypto.randomUUID(), item.product_id, today, item.quantity, item.line_total)
      }
    }

    // 3. Update shift totals
    db.prepare(
      `
      UPDATE shifts
      SET expected_cash = expected_cash + ?
      WHERE id = ?
    `
    ).run(saleData.cash_received, saleData.shift_id)

    return { sale_id: saleId, receipt_number: receiptNumber }
  })()
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
