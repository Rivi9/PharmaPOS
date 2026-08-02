import { eq } from 'drizzle-orm'
import { getDb } from '../db/index'
import { getDatabase } from './database'
import { sales, saleItems, products, customers } from '../db/schema'
import type { Sale, SaleItem, SaleRefund } from '../db/schema'
import { round2, extractIncludedTax } from '../../shared/money'
import { logAudit } from './audit'
import { normalisePhone } from './customers'

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
  /** Batch's own selling price, or null to fall back to products.unit_price. */
  selling_price: number | null
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
    SELECT id, quantity, expiry_date, cost_price, selling_price
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
    selling_price: number | null
  }[]

  let remaining = quantityNeeded
  const deductions: BatchDeduction[] = []

  for (const batch of batches) {
    if (remaining <= 0) break

    const deductQty = Math.min(batch.quantity, remaining)
    deductions.push({
      batch_id: batch.id,
      quantity: deductQty,
      cost_price: batch.cost_price ?? 0,
      selling_price: batch.selling_price ?? null
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

    // Auto-link the customer by phone. Both sides go through normalisePhone so
    // "077 123 4567" typed at the till still matches "+94771234567" on file —
    // exact-equality matching silently dropped the sale from their history.
    const customerPhone = normalisePhone(saleData.customer_phone)
    let customerId: string | null = null
    if (customerPhone) {
      const customer = drizzleDb
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.phone, customerPhone))
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
        customerName: saleData.customer_name?.trim() || null,
        customerPhone: customerPhone,
        createdAt: now
      })
      .run()

    // One global VAT rate, read server-side so the renderer cannot disagree with it.
    const vatRate =
      parseFloat(
        (
          db.prepare('SELECT value FROM settings WHERE key = ?').get('vat_rate') as
            | { value: string }
            | undefined
        )?.value ?? '0'
      ) || 0
    let lineTaxTotal = 0

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
      // Single global rate, extracted from the tax-inclusive line total. The old
      // code used a per-product rate here while the cart used the global rate and
      // ADDED it, so sales.tax_amount and SUM(sale_items.tax_amount) never agreed
      // — a VAT return built from line items reported zero on VAT-charged sales.
      const taxRate = vatRate
      const taxAmount = extractIncludedTax(item.line_total, taxRate)
      lineTaxTotal = round2(lineTaxTotal + taxAmount)

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

      // R2: one row per batch this line actually drew from. sale_items keeps a
      // single batch_id, so a line spanning two batches lost the rest — a recall
      // could not tell which customers received an affected lot, and per-batch
      // margin was unanswerable.
      for (const batch of batches) {
        db.prepare(
          `INSERT INTO sale_item_batches
             (id, sale_id, sale_item_id, batch_id, product_id, quantity, cost_price, selling_price, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          crypto.randomUUID(),
          saleId,
          itemId,
          batch.batch_id,
          item.product_id,
          batch.quantity,
          batch.cost_price,
          // The price actually charged. The cart is quoted the price of the batch
          // FEFO picks first, so for a single-batch line these agree; when a line
          // spans batches the customer is charged the quoted price throughout and
          // that is what gets recorded.
          item.unit_price,
          now
        )
      }

      // FIX 3: product_sales_daily upsert using composite PK (date, product_id).
      // Revenue is NET of VAT — VAT is money owed to the revenue authority, not
      // income. Storing the gross line total made the P&L disagree with the
      // Sales Report by exactly the VAT for the period.
      const netRevenue = round2(item.line_total - taxAmount)
      const cost = round2(costPrice * item.quantity)
      const profit = round2(netRevenue - cost)

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
      ).run(today, item.product_id, item.quantity, netRevenue, cost, profit)
    }

    // The header VAT is the sum of the line VAT, so the two can never disagree
    // and a VAT return can be built from either.
    db.prepare('UPDATE sales SET tax_amount = ? WHERE id = ?').run(lineTaxTotal, saleId)

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
        `UPDATE sales SET status = 'voided', void_reason = ?, voided_by = ?, voided_at = ?
         WHERE id = ? AND status = 'completed'`
      )
      .run(reason.trim(), userId, new Date().toISOString(), saleId)

    logAudit({
      userId,
      action: 'SALE_VOIDED',
      entityType: 'sale',
      entityId: saleId,
      details: { receipt_number: sale.receipt_number, total: sale.total, reason: reason.trim() }
    })
  })()
}

/**
 * Compute expected cash in drawer for a shift.
 * opening_cash + sum of cash_received from completed sales.
 */
export function computeShiftExpectedCash(shiftId: string, openingCash: number): number {
  const db = getDatabase()

  // cash_received is what the customer HANDED OVER; change_given went back out.
  // Only the difference stays in the drawer. Summing cash_received alone
  // overstated the drawer by the whole day's change and reported every cashier short.
  const sales = db
    .prepare(
      `SELECT COALESCE(SUM(cash_received - COALESCE(change_given, 0)), 0) as total
       FROM sales WHERE shift_id = ? AND status = 'completed'`
    )
    .get(shiftId) as { total: number }

  // Mid-shift cash in/out — a float top-up or petty-cash payout is a real drawer
  // movement and must be part of the expectation.
  const movements = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'in'  THEN amount ELSE 0 END), 0) as cash_in,
         COALESCE(SUM(CASE WHEN type = 'out' THEN amount ELSE 0 END), 0) as cash_out
       FROM cash_movements WHERE shift_id = ?`
    )
    .get(shiftId) as { cash_in: number; cash_out: number }

  // Cash paid back out for refunds processed during this shift. Refunds were
  // invisible to the reconciliation, so the drawer expected money that had
  // already been handed back across the counter.
  const refunds = db
    .prepare(
      `SELECT COALESCE(SUM(total_refunded), 0) as total FROM sale_refunds WHERE shift_id = ?`
    )
    .get(shiftId) as { total: number }

  return round2(
    openingCash + sales.total + movements.cash_in - movements.cash_out - refunds.total
  )
}

/** Record a mid-shift cash movement. Amount is always positive; `type` gives direction. */
export function recordCashMovement(params: {
  shiftId: string
  userId: string
  type: 'in' | 'out'
  amount: number
  reason: string
}): { id: string } {
  const amount = round2(Math.abs(params.amount))
  if (!(amount > 0)) throw new Error('Amount must be greater than zero')
  if (!params.reason.trim()) throw new Error('A reason is required')

  const db = getDatabase()
  const shift = db
    .prepare(`SELECT status FROM shifts WHERE id = ?`)
    .get(params.shiftId) as { status: string } | undefined
  if (!shift) throw new Error('Shift not found')
  if (shift.status !== 'active') throw new Error('Cannot record cash against a closed shift')

  const id = crypto.randomUUID()
  db.prepare(
    `INSERT INTO cash_movements (id, shift_id, user_id, type, amount, reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, params.shiftId, params.userId, params.type, amount, params.reason.trim(), new Date().toISOString())

  logAudit({
    userId: params.userId,
    action: 'CASH_MOVEMENT',
    entityType: 'shift',
    entityId: params.shiftId,
    details: { direction: params.type, amount, reason: params.reason.trim() }
  })

  return { id }
}

/**
 * R2: the full life of one stock batch — what came in, what went out, at what
 * cost and price, and what remains. This is what makes per-batch margin
 * answerable and a manufacturer recall traceable to individual sales.
 */
export function getBatchLedger(batchId: string): {
  batch: {
    id: string
    batch_number: string | null
    product_name: string
    expiry_date: string | null
    received_date: string
    cost_price: number
    selling_price: number | null
    quantity_remaining: number
  } | null
  sold: Array<{
    sale_id: string
    receipt_number: string
    created_at: string
    quantity: number
    cost_price: number
    selling_price: number
    status: string
  }>
  totals: { quantitySold: number; revenue: number; cost: number; margin: number }
} {
  const db = getDatabase()

  const batch = db
    .prepare(
      `SELECT sb.id, sb.batch_number, p.name as product_name, sb.expiry_date,
              sb.received_date, sb.cost_price, sb.selling_price,
              sb.quantity as quantity_remaining
       FROM stock_batches sb JOIN products p ON p.id = sb.product_id
       WHERE sb.id = ?`
    )
    .get(batchId) as ReturnType<typeof getBatchLedger>['batch']

  const sold = db
    .prepare(
      `SELECT s.id as sale_id, s.receipt_number, s.created_at, s.status,
              sib.quantity, sib.cost_price, sib.selling_price
       FROM sale_item_batches sib
       JOIN sales s ON s.id = sib.sale_id
       WHERE sib.batch_id = ?
       ORDER BY s.created_at DESC`
    )
    .all(batchId) as ReturnType<typeof getBatchLedger>['sold']

  // Voided and refunded sales are excluded from the money, but stay in the list
  // so the recall trail is complete.
  const counted = sold.filter((r) => r.status === 'completed')
  const revenue = round2(counted.reduce((sum, r) => sum + r.selling_price * r.quantity, 0))
  const cost = round2(counted.reduce((sum, r) => sum + r.cost_price * r.quantity, 0))

  return {
    batch,
    sold,
    totals: {
      quantitySold: counted.reduce((sum, r) => sum + r.quantity, 0),
      revenue,
      cost,
      margin: round2(revenue - cost)
    }
  }
}

/** Cash paid in and out during a shift, for the end-of-shift summary. */
export function getShiftCashMovements(shiftId: string): {
  cashIn: number
  cashOut: number
  entries: Array<{ type: string; amount: number; reason: string; created_at: string }>
} {
  const db = getDatabase()
  const entries = db
    .prepare(
      `SELECT type, amount, reason, created_at FROM cash_movements
       WHERE shift_id = ? ORDER BY created_at ASC`
    )
    .all(shiftId) as Array<{ type: string; amount: number; reason: string; created_at: string }>

  return {
    cashIn: round2(entries.filter((e) => e.type === 'in').reduce((s, e) => s + e.amount, 0)),
    cashOut: round2(entries.filter((e) => e.type === 'out').reduce((s, e) => s + e.amount, 0)),
    entries
  }
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

  const rawDb = getDatabase()
  const refundId = crypto.randomUUID()
  const now = new Date().toISOString()

  return rawDb.transaction(() => {
    const sale = rawDb
      .prepare('SELECT status, subtotal, total, receipt_number, created_at FROM sales WHERE id = ?')
      .get(saleId) as
      | { status: string; subtotal: number; total: number; receipt_number: string; created_at: string }
      | undefined
    if (!sale) throw new Error('Sale not found')
    if (sale.status === 'voided') throw new Error('Cannot refund a voided sale')

    // What was actually sold, and what has already been sent back.
    const sold = rawDb
      .prepare(
        `SELECT product_id, batch_id, quantity, unit_price, line_total, tax_amount, cost_price
         FROM sale_items WHERE sale_id = ?`
      )
      .all(saleId) as Array<{
      product_id: string
      batch_id: string | null
      quantity: number
      unit_price: number
      line_total: number
      tax_amount: number
      cost_price: number
    }>

    const priorRefunds = rawDb
      .prepare('SELECT items FROM sale_refunds WHERE sale_id = ?')
      .all(saleId) as Array<{ items: string }>

    const alreadyRefunded = new Map<string, number>()
    for (const row of priorRefunds) {
      try {
        for (const i of JSON.parse(row.items) as RefundItemInput[]) {
          alreadyRefunded.set(i.product_id, (alreadyRefunded.get(i.product_id) ?? 0) + i.quantity)
        }
      } catch {
        /* a malformed historical row must not block a legitimate refund */
      }
    }

    // Validate against the original sale. The caller's items were previously
    // trusted verbatim, so a sale could be refunded repeatedly and for more
    // than was ever bought.
    let refundAmount = 0
    let taxRefunded = 0
    for (const item of items) {
      const soldLine = sold.find((s) => s.product_id === item.product_id)
      if (!soldLine) {
        throw new Error(`${item.product_name} was not part of this sale`)
      }
      const remaining = soldLine.quantity - (alreadyRefunded.get(item.product_id) ?? 0)
      if (item.quantity <= 0) throw new Error('Refund quantity must be greater than zero')
      if (item.quantity > remaining) {
        throw new Error(
          `Cannot refund ${item.quantity} of ${item.product_name} — only ${remaining} remain refundable`
        )
      }
      // Price the refund from the ORIGINAL sale, never from the caller's payload.
      const perUnit = soldLine.line_total / soldLine.quantity
      const perUnitTax = soldLine.tax_amount / soldLine.quantity
      refundAmount = round2(refundAmount + perUnit * item.quantity)
      taxRefunded = round2(taxRefunded + perUnitTax * item.quantity)
    }

    // A sale-level discount means the customer paid less than the sum of the
    // line totals, so the refund is scaled by the same ratio.
    if (sale.subtotal > 0 && sale.total !== sale.subtotal) {
      const ratio = sale.total / sale.subtotal
      refundAmount = round2(refundAmount * ratio)
      taxRefunded = round2(taxRefunded * ratio)
    }

    // The drawer that pays out is the one currently open, not the sale's shift.
    const activeShift = rawDb
      .prepare(`SELECT id FROM shifts WHERE user_id = ? AND status = 'active' LIMIT 1`)
      .get(userId) as { id: string } | undefined

    rawDb
      .prepare(
        `INSERT INTO sale_refunds
           (id, sale_id, user_id, items, total_refunded, tax_refunded, restock, reason, shift_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        refundId,
        saleId,
        userId,
        JSON.stringify(items),
        refundAmount,
        taxRefunded,
        restock ? 1 : 0,
        reason.trim() || null,
        activeShift?.id ?? null,
        now
      )

    const saleDate = sale.created_at.split('T')[0]

    for (const item of items) {
      const soldLine = sold.find((s) => s.product_id === item.product_id)!

      if (restock) {
        // Back into the batch it came from, so expiry tracking stays truthful.
        // The old code picked the most recently received batch instead, and then
        // wrote to products.stock_quantity — a column that does not exist, which
        // threw and rolled the entire refund back after cash had been handed over.
        if (soldLine.batch_id) {
          rawDb
            .prepare('UPDATE stock_batches SET quantity = quantity + ? WHERE id = ?')
            .run(item.quantity, soldLine.batch_id)
        }
      }

      // Reverse the daily rollup so reports stop counting refunded revenue.
      const perUnitNet = (soldLine.line_total - soldLine.tax_amount) / soldLine.quantity
      const netBack = round2(perUnitNet * item.quantity)
      const costBack = round2(soldLine.cost_price * item.quantity)
      rawDb
        .prepare(
          `UPDATE product_sales_daily
             SET quantity_sold = quantity_sold - ?,
                 revenue = revenue - ?,
                 cost = cost - ?,
                 profit = profit - ?
           WHERE date = ? AND product_id = ?`
        )
        .run(item.quantity, netBack, costBack, round2(netBack - costBack), saleDate, item.product_id)
    }

    // Mark the sale refunded once nothing remains refundable, so it stops being
    // counted as a completed sale. Previously the status was never updated, so
    // the same sale could be refunded without limit.
    const totalSoldQty = sold.reduce((s, l) => s + l.quantity, 0)
    const totalRefundedQty =
      [...alreadyRefunded.values()].reduce((s, q) => s + q, 0) +
      items.reduce((s, i) => s + i.quantity, 0)
    if (totalRefundedQty >= totalSoldQty) {
      rawDb.prepare(`UPDATE sales SET status = 'refunded' WHERE id = ?`).run(saleId)
    }

    logAudit({
      userId,
      action: 'SALE_REFUNDED',
      entityType: 'sale',
      entityId: saleId,
      details: {
        receipt_number: sale.receipt_number,
        refunded: refundAmount,
        tax_refunded: taxRefunded,
        restocked: restock,
        fully_refunded: totalRefundedQty >= totalSoldQty,
        reason: reason.trim() || null
      }
    })

    return { refund_id: refundId }
  })()
}
