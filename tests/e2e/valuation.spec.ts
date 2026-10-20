import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './helpers/app'
import { completeSetup, login } from './helpers/flows'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
  await completeSetup(ctx.page)
  await login(ctx.page)
})

test.afterEach(async () => {
  await ctx?.close()
})

interface Valuation {
  total_value: number
  total_cost: number
  total_items: number
  expired_value: number
  expired_cost: number
  expired_units: number
  by_product: Array<{
    product_name: string
    quantity: number
    cost_per_unit: number
    unit_price: number
    total_cost: number
    total_value: number
  }>
}

/** Seed one product with several batches in known states. */
async function seedBatches(dbPath: string): Promise<void> {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(dbPath)
  try {
    const now = new Date().toISOString()
    const future = new Date(Date.now() + 300 * 864e5).toISOString().split('T')[0]

    // The report's own example: an antibiotic at Rs. 85 retail.
    db.prepare(
      `INSERT INTO products (id,name,barcode,unit_price,cost_price,reorder_level,reorder_qty,
                             tax_rate,is_tax_inclusive,is_active,created_at,updated_at)
       VALUES ('vp1','Amoxicillin 500mg','AMOX500',85,50,10,50,0,1,1,?,?)`
    ).run(now, now)

    const batch = (
      id: string,
      qty: number,
      cost: number,
      sell: number | null,
      expiry: string | null
    ): void => {
      db.prepare(
        `INSERT INTO stock_batches (id,product_id,batch_number,quantity,cost_price,selling_price,
                                    expiry_date,received_date,created_at)
         VALUES (?, 'vp1', ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, id, qty, cost, sell, expiry, now, now)
    }

    batch('vb-good', 100, 40, 80, future) // sellable, own prices
    batch('vb-expired', 500, 50, 85, '2020-01-01') // expired — the Rs. 42,500 the report cites
    batch('vb-empty', 0, 50, 85, future) // sold out
    batch('vb-noprice', 10, 60, null, future) // falls back to the product price
    batch('vb-blankexp', 20, 30, 70, '') // '' means "no expiry" (H8)
  } finally {
    db.close()
  }
}

/**
 * H28: the valuation counted every batch row — expired stock and batches already
 * sold to zero included — and valued all of it at the *product's* current prices
 * rather than the batch's own.
 */
test.describe('inventory valuation', () => {
  test('expired and depleted stock is excluded, and batches are valued at their own prices', async () => {
    await seedBatches(ctx.dbPath)

    const data = (await ctx.page.evaluate(() =>
      window.electron.analytics.reports.generateInventoryValuation('x')
    )) as Valuation

    // Sellable: 100 @ 80 + 10 @ 85 (product fallback) + 20 @ 70 = 8000 + 850 + 1400
    expect(data.total_value).toBe(10250)
    // Cost: 100 @ 40 + 10 @ 60 + 20 @ 30 = 4000 + 600 + 600
    expect(data.total_cost).toBe(5200)

    // The expired batch is reported, not silently folded into the asset value.
    expect(data.expired_units).toBe(500)
    expect(data.expired_value).toBe(42500) // 500 × 85 — exactly the figure the report cites
    expect(data.expired_cost).toBe(25000)

    // Had it been included, Total Stock Value would read 52,750.
    expect(data.total_value).toBeLessThan(52750)
  })

  test('per-product figures are weighted across the batches actually on the shelf', async () => {
    await seedBatches(ctx.dbPath)

    const data = (await ctx.page.evaluate(() =>
      window.electron.analytics.reports.generateInventoryValuation('x')
    )) as Valuation

    const row = data.by_product.find((p) => p.product_name === 'Amoxicillin 500mg')
    expect(row).toBeTruthy()
    // 100 + 10 + 20 sellable; the 500 expired and the 0-quantity batch excluded.
    expect(row!.quantity).toBe(130)
    expect(row!.total_value).toBe(10250)
    expect(row!.total_cost).toBe(5200)
    // Weighted average, not the product's current 50.00 cost price.
    expect(row!.cost_per_unit).toBe(40) // 5200 / 130
    expect(row!.unit_price).toBeCloseTo(78.85, 2) // 10250 / 130
  })

  test('a batch with no recorded cost is valued at the product cost, not at zero', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(ctx.dbPath)
    const now = new Date().toISOString()
    const future = new Date(Date.now() + 300 * 864e5).toISOString().split('T')[0]
    db.prepare(
      `INSERT INTO products (id,name,unit_price,cost_price,reorder_level,reorder_qty,
                             tax_rate,is_tax_inclusive,is_active,created_at,updated_at)
       VALUES ('vp3','Zero Cost Batch',100,60,10,50,0,1,1,?,?)`
    ).run(now, now)
    db.prepare(
      `INSERT INTO stock_batches (id,product_id,quantity,cost_price,expiry_date,received_date,created_at)
       VALUES ('vb3','vp3',10,0,?,?,?)`
    ).run(future, now, now)
    db.close()

    const data = (await ctx.page.evaluate(() =>
      window.electron.analytics.reports.generateInventoryValuation('x')
    )) as Valuation

    // COALESCE(0, 60) is 0: the batch's unrecorded cost made 10 units worth nothing.
    expect(data.total_cost).toBe(600)
  })

  test('a product whose only stock is expired does not count as an asset', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(ctx.dbPath)
    const now = new Date().toISOString()
    db.prepare(
      `INSERT INTO products (id,name,unit_price,cost_price,reorder_level,reorder_qty,
                             tax_rate,is_tax_inclusive,is_active,created_at,updated_at)
       VALUES ('vp2','Only Expired',100,60,10,50,0,1,1,?,?)`
    ).run(now, now)
    db.prepare(
      `INSERT INTO stock_batches (id,product_id,quantity,cost_price,expiry_date,received_date,created_at)
       VALUES ('vb2','vp2',7,60,'2019-05-31',?,?)`
    ).run(now, now)
    db.close()

    const data = (await ctx.page.evaluate(() =>
      window.electron.analytics.reports.generateInventoryValuation('x')
    )) as Valuation

    expect(data.total_value).toBe(0)
    expect(data.total_items).toBe(0)
    expect(data.by_product).toHaveLength(0)
    // Still visible as a write-off rather than vanishing from the report.
    expect(data.expired_units).toBe(7)
    expect(data.expired_cost).toBe(420)
  })
})
