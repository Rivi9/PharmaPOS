import { test, expect, type Page } from '@playwright/test'
import { DatabaseSync } from 'node:sqlite'
import { launchApp, ipc, type LaunchedApp } from './helpers/app'
import { bootToPos, completeSetup, login, startShift } from './helpers/flows'
import { seedProduct, query, type SeededProduct } from './helpers/seed'
import { localDateString, localDateOffset } from '../../src/shared/dates'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
})

test.afterEach(async () => {
  await ctx?.close()
})

const today = (): string => localDateString()

/** A second, later-expiring batch, so FEFO has to split a line across two. */
function addLaterBatch(dbPath: string, productId: string, batchId: string, qty: number): void {
  const db = new DatabaseSync(dbPath)
  try {
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO stock_batches
         (id, product_id, batch_number, quantity, cost_price, expiry_date, received_date, created_at)
       VALUES (?, ?, 'E2E-B2', ?, ?, ?, ?, ?)`
    ).run(batchId, productId, qty, 40, localDateOffset(700), now, now)
  } finally {
    db.close()
  }
}

async function setVat(page: Page, rate: string): Promise<void> {
  expect(
    await ipc(page, `window.electron.setSetting('vat_rate', ${JSON.stringify(rate)})`)
  ).toMatchObject({ success: true })
}

/** Ring up `quantity` of a product through the real IPC channel. */
async function sell(
  page: Page,
  p: SeededProduct,
  quantity: number,
  opts: { discount?: number; method?: 'cash' | 'card' } = {}
): Promise<string> {
  const subtotal = p.unitPrice * quantity
  const discount = opts.discount ?? 0
  const total = subtotal - discount
  const method = opts.method ?? 'cash'
  const result = (await ipc(
    page,
    `window.electron.createSale(${JSON.stringify({
      items: [
        {
          product_id: p.productId,
          product_name: p.name,
          quantity,
          unit_price: p.unitPrice,
          line_total: subtotal
        }
      ],
      subtotal,
      discount_amount: discount,
      discount_type: discount > 0 ? 'fixed' : null,
      discount_value: discount,
      // Deliberately wrong: the server computes VAT itself.
      tax_amount: 0,
      total,
      payment_method: method,
      cash_received: method === 'cash' ? total : 0,
      card_received: method === 'card' ? total : 0,
      change_given: 0
    })})`
  )) as { sale_id?: string }
  expect(result, JSON.stringify(result)).toHaveProperty('sale_id')
  return result.sale_id!
}

async function refund(
  page: Page,
  saleId: string,
  p: SeededProduct,
  quantity: number
): Promise<unknown> {
  return ipc(
    page,
    `window.electron.refund(${JSON.stringify({
      userId: 'ignored',
      saleId,
      items: [
        {
          product_id: p.productId,
          product_name: p.name,
          quantity,
          unit_price: p.unitPrice,
          // Deliberately the undiscounted amount: the server prices the refund.
          line_total: p.unitPrice * quantity
        }
      ],
      reason: 'customer returned',
      restock: true
    })})`
  )
}

const batchQty = (id: string): number =>
  query<{ quantity: number }>(ctx.dbPath, 'SELECT quantity FROM stock_batches WHERE id = ?', id)[0]
    .quantity

const rollup = (): { quantity_sold: number; revenue: number; cost: number; profit: number } =>
  query<{ quantity_sold: number; revenue: number; cost: number; profit: number }>(
    ctx.dbPath,
    `SELECT COALESCE(SUM(quantity_sold),0) AS quantity_sold, ROUND(COALESCE(SUM(revenue),0),2) AS revenue,
            ROUND(COALESCE(SUM(cost),0),2) AS cost, ROUND(COALESCE(SUM(profit),0),2) AS profit
     FROM product_sales_daily`
  )[0]

async function reports(page: Page): Promise<{
  sales: {
    total_sales: number
    total_vat: number
    total_gross_sales: number
    total_items_sold: number
  }
  pl: { total_revenue: number }
  daily: { total_sales: number; transaction_count: number }
}> {
  const d = today()
  return page.evaluate(async (d) => {
    const a = window.electron.analytics
    return {
      sales: await a.reports.generateSalesReport('x', d, d),
      pl: await a.reports.generateProfitLossReport('x', d, d),
      daily: await a.getDailyMetrics('x', d)
    }
  }, d)
}

test.describe('VAT default', () => {
  test('a new install starts with VAT at 0%', async () => {
    await completeSetup(ctx.page)
    const [row] = query<{ value: string }>(
      ctx.dbPath,
      "SELECT value FROM settings WHERE key = 'vat_rate'"
    )
    expect(row.value).toBe('0')
  })
})

/**
 * The audit's example: Rs. 1000 basket, Rs. 100 off, 18% VAT, paid 900. The
 * server extracted VAT from the pre-discount 1000 and overwrote the header with
 * it (152.54), the P&L booked 847.46 and the Sales Report said 747.46.
 */
test.describe('sale-level discount', () => {
  test('VAT and revenue are on what was paid, and every report agrees', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page)
    const p = seedProduct(ctx.dbPath, { unitPrice: 100, costPrice: 40, quantity: 50 })
    await startShift(ctx.page, '0')
    await setVat(ctx.page, '18')

    const saleId = await sell(ctx.page, p, 10, { discount: 100 })

    const [sale] = query<{ tax_amount: number }>(
      ctx.dbPath,
      'SELECT tax_amount FROM sales WHERE id = ?',
      saleId
    )
    const [lines] = query<{ tax: number; discount: number }>(
      ctx.dbPath,
      'SELECT SUM(tax_amount) AS tax, SUM(discount_amount) AS discount FROM sale_items WHERE sale_id = ?',
      saleId
    )
    expect(sale.tax_amount).toBe(137.29)
    expect(lines.tax).toBe(137.29)
    expect(lines.discount).toBe(100)
    expect(rollup().revenue).toBe(762.71)

    const r = await reports(ctx.page)
    expect(r.pl.total_revenue).toBe(762.71)
    expect(r.sales.total_sales).toBe(762.71)
    expect(r.sales.total_vat).toBe(137.29)
    expect(r.sales.total_gross_sales).toBe(900)
    expect(r.daily.total_sales).toBe(762.71)
  })
})

test.describe('void', () => {
  test('restocks each batch it drew from and reverses exactly what the sale added', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page)
    const p = seedProduct(ctx.dbPath, { unitPrice: 100, costPrice: 40, quantity: 4 })
    addLaterBatch(ctx.dbPath, p.productId, 'e2e-batch-2', 20)
    await startShift(ctx.page, '0')
    await setVat(ctx.page, '18')

    const saleId = await sell(ctx.page, p, 10)
    expect(batchQty(p.batchId)).toBe(0)
    expect(batchQty('e2e-batch-2')).toBe(14)

    expect(
      await ipc(
        ctx.page,
        `window.electron.void({ userId: 'x', saleId: ${JSON.stringify(saleId)}, reason: 'wrong item' })`
      )
    ).toBe('OK')

    // 4 back to A and 6 to B — not all 10 into A.
    expect(batchQty(p.batchId)).toBe(4)
    expect(batchQty('e2e-batch-2')).toBe(20)
    // Reversing the gross left revenue at minus the VAT.
    expect(rollup()).toEqual({ quantity_sold: 0, revenue: 0, cost: 0, profit: 0 })
  })
})

test.describe('refunds', () => {
  test('partial refunds restock batch by batch, stay out of every report, and are audited once', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page)
    const p = seedProduct(ctx.dbPath, { unitPrice: 100, costPrice: 40, quantity: 4 })
    addLaterBatch(ctx.dbPath, p.productId, 'e2e-batch-2', 20)
    await startShift(ctx.page, '5000')
    await setVat(ctx.page, '18')

    const saleId = await sell(ctx.page, p, 10, { discount: 100 }) // paid 900, 90 a unit
    expect(await refund(ctx.page, saleId, p, 3)).toMatchObject({ refund_id: expect.any(String) })
    expect(await refund(ctx.page, saleId, p, 3)).toMatchObject({ refund_id: expect.any(String) })

    // Back in dispensing order: A (4 dispensed) takes the first 4, B the next 2.
    expect(batchQty(p.batchId)).toBe(4)
    expect(batchQty('e2e-batch-2')).toBe(16)

    const [refunds] = query<{ total: number }>(
      ctx.dbPath,
      'SELECT SUM(total_refunded) AS total FROM sale_refunds'
    )
    expect(refunds.total).toBe(540) // 6 × 90, not 6 × 100

    // 4 units kept: 360 paid, VAT 54.92 within it.
    const kept = { net: 305.08, vat: 54.92 }
    expect(rollup().quantity_sold).toBe(4)
    expect(rollup().revenue).toBeCloseTo(kept.net, 1)

    // Opening Analytics re-runs the aggregation. It used to rebuild the day from
    // completed lines only, putting the refunded 6 units back.
    await ipc(ctx.page, `window.electron.analytics.runAggregation('x')`)
    const r = await reports(ctx.page)
    expect(rollup().quantity_sold).toBe(4)
    expect(r.pl.total_revenue).toBe(rollup().revenue)
    expect(r.sales.total_sales).toBe(r.pl.total_revenue)
    expect(r.daily.total_sales).toBe(r.pl.total_revenue)
    expect(r.sales.total_items_sold).toBe(4)
    expect(r.sales.total_gross_sales).toBe(360)

    // One audit entry per refund, carrying the server's amount.
    const audits = query<{ details: string }>(
      ctx.dbPath,
      "SELECT details FROM audit_log WHERE action = 'SALE_REFUNDED'"
    )
    expect(audits).toHaveLength(2)
    for (const a of audits) expect(JSON.parse(a.details).refunded).toBe(270)

    // A cash refund leaves the drawer: 5000 + 900 - 540.
    const [{ shift_id }] = query<{ shift_id: string }>(
      ctx.dbPath,
      'SELECT shift_id FROM sales WHERE id = ?',
      saleId
    )
    expect(
      await ctx.page.evaluate(
        (id) => window.electron.shifts.computeExpectedCash(id, 5000),
        shift_id
      )
    ).toBe(5360)

    // A sale with refunds against it cannot also be voided.
    expect(
      String(
        await ipc(
          ctx.page,
          `window.electron.void({ userId: 'x', saleId: ${JSON.stringify(saleId)}, reason: 'x' })`
        )
      )
    ).toMatch(/refunds against it/i)
  })

  test('a card refund does not come out of the cash drawer', async () => {
    await bootToPos(ctx.page) // opening float 5000
    const p = seedProduct(ctx.dbPath, { unitPrice: 100, costPrice: 40, quantity: 10 })

    const saleId = await sell(ctx.page, p, 2, { method: 'card' })
    expect(await refund(ctx.page, saleId, p, 1)).toMatchObject({ refund_id: expect.any(String) })

    const [row] = query<{ shift_id: string; cash_refunded: number; total_refunded: number }>(
      ctx.dbPath,
      'SELECT shift_id, cash_refunded, total_refunded FROM sale_refunds'
    )
    expect(row.total_refunded).toBe(100)
    expect(row.cash_refunded).toBe(0)
    expect(
      await ctx.page.evaluate(
        (id) => window.electron.shifts.computeExpectedCash(id, 5000),
        row.shift_id
      )
    ).toBe(5000)
  })

  test('a refund needs an open shift, like a sale', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page) // signed in, no shift started
    const p = seedProduct(ctx.dbPath, { unitPrice: 100, costPrice: 40, quantity: 10 })

    // A sale from an earlier, already closed shift.
    const db = new DatabaseSync(ctx.dbPath)
    try {
      const [admin] = db.prepare('SELECT id FROM users LIMIT 1').all() as { id: string }[]
      const now = new Date().toISOString()
      db.prepare(
        `INSERT INTO shifts (id, user_id, opening_cash, status, started_at, ended_at)
         VALUES ('old-shift', ?, 0, 'closed', ?, ?)`
      ).run(admin.id, now, now)
      db.prepare(
        `INSERT INTO sales (id, receipt_number, shift_id, user_id, subtotal, tax_amount, discount_amount,
                            total, payment_method, cash_received, change_given, status, created_at)
         VALUES ('old-sale', 'R-OLD-1', 'old-shift', ?, 200, 0, 0, 200, 'cash', 200, 0, 'completed', ?)`
      ).run(admin.id, now)
      db.prepare(
        `INSERT INTO sale_items (id, sale_id, product_id, batch_id, quantity, unit_price, cost_price,
                                 line_total, created_at)
         VALUES ('old-item', 'old-sale', ?, ?, 2, 100, 40, 200, ?)`
      ).run(p.productId, p.batchId, now)
    } finally {
      db.close()
    }

    expect(String(await refund(ctx.page, 'old-sale', p, 1))).toMatch(/Start a shift/i)
    expect(query(ctx.dbPath, 'SELECT id FROM sale_refunds')).toHaveLength(0)
  })
})

/**
 * The shop is at UTC+5:30. A sale at 00:30 local is the previous day in UTC, so
 * the rollup and every `date(created_at)` report filed it under yesterday. (On a
 * machine running at UTC this cannot tell the two apart; it still has to pass.)
 */
test.describe('local dates', () => {
  test('a sale just after local midnight is reported on that local day', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page)
    const p = seedProduct(ctx.dbPath, { unitPrice: 100, costPrice: 40, quantity: 10 })

    const now = new Date()
    const justAfterMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 30)
    const db = new DatabaseSync(ctx.dbPath)
    try {
      const [admin] = db.prepare('SELECT id FROM users LIMIT 1').all() as { id: string }[]
      const at = justAfterMidnight.toISOString()
      db.prepare(
        `INSERT INTO shifts (id, user_id, opening_cash, status, started_at, ended_at)
         VALUES ('night-shift', ?, 0, 'closed', ?, ?)`
      ).run(admin.id, at, at)
      db.prepare(
        `INSERT INTO sales (id, receipt_number, shift_id, user_id, subtotal, tax_amount, discount_amount,
                            total, payment_method, cash_received, change_given, status, created_at)
         VALUES ('night-sale', 'R-NIGHT-1', 'night-shift', ?, 100, 0, 0, 100, 'cash', 100, 0, 'completed', ?)`
      ).run(admin.id, at)
      db.prepare(
        `INSERT INTO sale_items (id, sale_id, product_id, batch_id, quantity, unit_price, cost_price,
                                 line_total, created_at)
         VALUES ('night-item', 'night-sale', ?, ?, 1, 100, 40, 100, ?)`
      ).run(p.productId, p.batchId, at)
    } finally {
      db.close()
    }

    await ipc(ctx.page, `window.electron.analytics.runAggregation('x', ${JSON.stringify(today())})`)
    const r = await reports(ctx.page)
    expect(r.daily.transaction_count).toBe(1)
    expect(r.daily.total_sales).toBe(100)
    expect(r.sales.total_sales).toBe(100)
    expect(r.pl.total_revenue).toBe(100)
    const [row] = query<{ date: string }>(ctx.dbPath, 'SELECT date FROM product_sales_daily')
    expect(row.date).toBe(today())
  })
})
