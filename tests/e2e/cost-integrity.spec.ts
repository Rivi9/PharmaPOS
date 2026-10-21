import { test, expect, type Page } from '@playwright/test'
import { launchApp, ipc, ipcError, type LaunchedApp } from './helpers/app'
import { completeSetup, login, startShift } from './helpers/flows'
import { query, seedProduct } from './helpers/seed'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
  await completeSetup(ctx.page)
  await login(ctx.page)
})

test.afterEach(async () => {
  await ctx?.close()
})

const FUTURE = new Date(Date.now() + 365 * 864e5).toISOString().split('T')[0]

/** Book a cash sale through the real IPC channel. Opens a shift first. */
async function sell(
  page: Page,
  lines: Array<{ productId: string; quantity: number; unitPrice: number }>
): Promise<void> {
  await ipc(page, `window.electron.startShift({ openingCash: 0 })`)
  const items = lines.map((l) => ({
    product_id: l.productId,
    product_name: l.productId,
    quantity: l.quantity,
    unit_price: l.unitPrice,
    line_total: l.quantity * l.unitPrice
  }))
  const total = items.reduce((sum, i) => sum + i.line_total, 0)
  const result = await ipc(
    page,
    `window.electron.createSale(${JSON.stringify({
      items,
      subtotal: total,
      discount_amount: 0,
      discount_type: null,
      discount_value: 0,
      tax_amount: 0,
      total,
      payment_method: 'cash',
      cash_received: total,
      card_received: 0,
      change_given: 0
    })})`
  )
  expect(String(result)).not.toMatch(/^THREW/)
}

/** The Cost Price cell of one product's row in the CSV export. */
async function exportedCost(page: Page, productName: string): Promise<string> {
  const result = (await ipc(page, `window.electron.exportProductsCSV('x')`)) as {
    success: boolean
    data: string
  }
  expect(result.success).toBe(true)
  const rows = result.data.split('\n').map((line) =>
    // Every cell is quoted and none of these contain a comma.
    line.split(',').map((cell) => cell.replace(/^"|"$/g, ''))
  )
  const costColumn = rows[0].indexOf('Cost Price')
  const row = rows.find((r) => r[1] === productName)
  expect(row, `${productName} in the export`).toBeTruthy()
  return row![costColumn]
}

/** Insert products and batches straight into the database. */
async function seedRaw(
  dbPath: string,
  products: Array<{ id: string; name: string; cost: number; price?: number; reorder?: number }>,
  batches: Array<{
    id: string
    productId: string
    qty: number
    cost: number
    received: string
    expiry?: string | null
  }>
): Promise<void> {
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(dbPath)
  try {
    const now = new Date().toISOString()
    for (const p of products) {
      db.prepare(
        `INSERT INTO products (id,name,unit_price,cost_price,reorder_level,reorder_qty,
                               tax_rate,is_tax_inclusive,is_active,created_at,updated_at)
         VALUES (?, ?, ?, ?, ?, 50, 0, 1, 1, ?, ?)`
      ).run(p.id, p.name, p.price ?? 50, p.cost, p.reorder ?? 10, now, now)
    }
    for (const b of batches) {
      db.prepare(
        `INSERT INTO stock_batches (id,product_id,batch_number,quantity,cost_price,
                                    expiry_date,received_date,created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        b.id,
        b.productId,
        b.id,
        b.qty,
        b.cost,
        b.expiry === undefined ? FUTURE : b.expiry,
        b.received,
        now
      )
    }
  } finally {
    db.close()
  }
}

const productCost = (id: string): number =>
  query<{ cost_price: number }>(ctx.dbPath, 'SELECT cost_price FROM products WHERE id = ?', id)[0]
    .cost_price

/**
 * The report: "cost price turns to 0 when out of stock, and it messes up
 * reports". Cost of goods sold already came from the batch dispensed, but the
 * product itself carried no cost of its own — `products.cost_price` was only what
 * was typed on the form (0 for every imported product) and nothing updated it
 * from received stock — and a sold-out batch, the only place the real cost
 * lived, disappeared from every list.
 */
test.describe('last known cost', () => {
  test('receiving stock sets the product cost, and selling out does not reset it', async () => {
    const made = await ipc(
      ctx.page,
      `window.electron.createProduct('x', ${JSON.stringify({
        name: 'Cetirizine 10mg',
        cost_price: 0,
        unit_price: 20
      })})`
    )
    expect(made).toMatchObject({ success: true })
    const productId = (made as { data: { id: string } }).data.id

    const received = await ipc(
      ctx.page,
      `window.electron.createStockBatch('x', ${JSON.stringify({
        product_id: productId,
        quantity: 2,
        cost_price: 12,
        expiry_date: FUTURE
      })})`
    )
    expect(received).toMatchObject({ success: true })
    const batchId = (received as { data: { id: string } }).data.id
    expect(productCost(productId)).toBe(12)

    await sell(ctx.page, [{ productId, quantity: 2, unitPrice: 20 }])

    // Sold out — and the cost is still known everywhere it is read.
    expect(
      query<{ quantity: number }>(
        ctx.dbPath,
        'SELECT quantity FROM stock_batches WHERE id = ?',
        batchId
      )[0].quantity
    ).toBe(0)
    expect(productCost(productId)).toBe(12)
    expect(
      query<{ cost_price: number }>(ctx.dbPath, 'SELECT cost_price FROM sale_items')[0].cost_price
    ).toBe(12)
    expect(await exportedCost(ctx.page, 'Cetirizine 10mg')).toBe('12')

    // The depleted batch is hidden by default, but listable — its cost and its
    // ledger are the recall trail.
    const listed = async (includeSoldOut?: boolean): Promise<Array<Record<string, unknown>>> =>
      (
        (await ipc(
          ctx.page,
          `window.electron.listStockBatchesPage('x', ${JSON.stringify({ includeSoldOut })})`
        )) as { data: { rows: Array<Record<string, unknown>> } }
      ).data.rows
    expect((await listed()).map((b) => b.id)).not.toContain(batchId)
    expect(await listed(true)).toContainEqual(
      expect.objectContaining({ id: batchId, quantity: 0, cost_price: 12 })
    )

    // And it cannot be deleted out from under that trail — with a sentence, not
    // the raw "FOREIGN KEY constraint failed".
    const deleted = await ipc(
      ctx.page,
      `window.electron.deleteStockBatch('x', ${JSON.stringify(batchId)})`
    )
    expect(ipcError(deleted)).toMatch(/kept as part of the stock history/i)
  })

  test('the latest receipt sets the cost; a back-dated one or an edit of the latest is respected', async () => {
    const p = seedProduct(ctx.dbPath, { costPrice: 15, quantity: 10 })
    const batch = (over: Record<string, unknown>): Promise<unknown> =>
      ipc(
        ctx.page,
        `window.electron.createStockBatch('x', ${JSON.stringify({
          product_id: p.productId,
          quantity: 5,
          expiry_date: FUTURE,
          ...over
        })})`
      )

    const latest = (await batch({ cost_price: 18, received_date: '2099-01-02' })) as {
      data: { id: string }
    }
    expect(productCost(p.productId)).toBe(18)

    // Entered later but received earlier: not the latest purchase cost.
    await batch({ cost_price: 9, received_date: '2099-01-01' })
    expect(productCost(p.productId)).toBe(18)

    // Correcting the latest batch's cost carries through.
    const edited = await ipc(
      ctx.page,
      `window.electron.updateStockBatch('x', ${JSON.stringify(latest.data.id)}, { cost_price: 19.5 })`
    )
    expect(edited).toMatchObject({ success: true })
    expect(productCost(p.productId)).toBe(19.5)
  })

  test('a legacy product with cost 0 exports its last batch cost', async () => {
    await seedRaw(
      ctx.dbPath,
      [{ id: 'legacy', name: 'Imported Item', cost: 0 }],
      [{ id: 'lb1', productId: 'legacy', qty: 0, cost: 22, received: '2026-01-01' }]
    )
    expect(await exportedCost(ctx.page, 'Imported Item')).toBe('22')
  })
})

/**
 * Sale cost fallback. A dispensed batch with cost 0 fell straight back to
 * `products.cost_price` — itself 0 on imported products — so the sale reported a
 * 100% margin. Order now: the product's last non-zero batch cost, then the
 * product's own cost.
 */
test.describe('sale cost fallback', () => {
  test('an uncosted batch is costed at the last batch cost, then the product cost', async () => {
    await seedRaw(
      ctx.dbPath,
      [
        // The typed product cost (5) is stale; the last purchase cost was 30.
        { id: 'fa', name: 'Fallback A', cost: 5 },
        // No costed batch at all: the product cost is all there is.
        { id: 'fb', name: 'Fallback B', cost: 7 },
        // A line spanning an uncosted batch and a costed one.
        { id: 'fc', name: 'Fallback C', cost: 0 }
      ],
      [
        { id: 'fa-old', productId: 'fa', qty: 0, cost: 30, received: '2026-01-01' },
        { id: 'fa-zero', productId: 'fa', qty: 10, cost: 0, received: '2026-02-01' },
        { id: 'fb-zero', productId: 'fb', qty: 10, cost: 0, received: '2026-02-01' },
        {
          id: 'fc-zero',
          productId: 'fc',
          qty: 1,
          cost: 0,
          received: '2026-02-01',
          expiry: '2098-01-01'
        },
        {
          id: 'fc-costed',
          productId: 'fc',
          qty: 5,
          cost: 20,
          received: '2026-01-01',
          expiry: '2099-01-01'
        }
      ]
    )

    await sell(ctx.page, [
      { productId: 'fa', quantity: 1, unitPrice: 50 },
      { productId: 'fb', quantity: 1, unitPrice: 50 },
      { productId: 'fc', quantity: 2, unitPrice: 50 }
    ])

    const lineCost = (productId: string): number =>
      query<{ cost_price: number }>(
        ctx.dbPath,
        'SELECT cost_price FROM sale_items WHERE product_id = ?',
        productId
      )[0].cost_price
    expect(lineCost('fa')).toBe(30)
    expect(lineCost('fb')).toBe(7)
    // 1 from the uncosted batch at 20 (the last costed one) + 1 at 20, not 10.
    expect(lineCost('fc')).toBe(20)

    // The per-batch record carries the resolved cost too, never 0.
    const zeroCosted = query(
      ctx.dbPath,
      'SELECT batch_id FROM sale_item_batches WHERE cost_price <= 0'
    )
    expect(zeroCosted).toHaveLength(0)
  })
})

test.describe('a zero cost is not stored silently', () => {
  test('a batch with cost 0 is refused, on receive and on edit', async () => {
    const p = seedProduct(ctx.dbPath)
    const created = await ipc(
      ctx.page,
      `window.electron.createStockBatch('x', ${JSON.stringify({
        product_id: p.productId,
        quantity: 10,
        cost_price: 0,
        expiry_date: FUTURE
      })})`
    )
    expect(ipcError(created)).toMatch(/more than 0/i)
    expect(query(ctx.dbPath, 'SELECT id FROM stock_batches')).toHaveLength(1) // the seed only

    const edited = await ipc(
      ctx.page,
      `window.electron.updateStockBatch('x', ${JSON.stringify(p.batchId)}, { cost_price: 0 })`
    )
    expect(ipcError(edited)).toMatch(/more than 0/i)
    expect(
      query<{ cost_price: number }>(
        ctx.dbPath,
        'SELECT cost_price FROM stock_batches WHERE id = ?',
        p.batchId
      )[0].cost_price
    ).toBe(p.costPrice)
  })
})

/**
 * The Inventory page's low-stock banner summed every batch, expired ones
 * included, and counted never-stocked products; the dashboard used sellable
 * stock of stocked products only. 500 expired units kept a product off one list
 * while the other flagged it.
 */
test.describe('low stock', () => {
  test('the inventory banner and the dashboard agree, on sellable stock', async () => {
    await seedRaw(
      ctx.dbPath,
      [
        { id: 'ls-expired', name: 'Mostly Expired', cost: 10, reorder: 10 },
        { id: 'ls-never', name: 'Never Stocked', cost: 10, reorder: 10 },
        { id: 'ls-fine', name: 'Well Stocked', cost: 10, reorder: 10 }
      ],
      [
        {
          id: 'lse-1',
          productId: 'ls-expired',
          qty: 500,
          cost: 10,
          received: '2019-01-01',
          expiry: '2020-01-01'
        },
        { id: 'lse-2', productId: 'ls-expired', qty: 5, cost: 10, received: '2026-01-01' },
        { id: 'lsf-1', productId: 'ls-fine', qty: 50, cost: 10, received: '2026-01-01' }
      ]
    )

    const inventory = (await ipc(ctx.page, `window.electron.getLowStockProducts('x')`)) as {
      data: Array<{ id: string; total_stock: number }>
    }
    const dashboard = (await ipc(
      ctx.page,
      `window.electron.analytics.getLowStockAlerts('x')`
    )) as Array<{ product_id: string; current_stock: number }>

    expect(inventory.data.map((p) => p.id)).toEqual(['ls-expired'])
    expect(dashboard.map((a) => a.product_id)).toEqual(['ls-expired'])
    expect(inventory.data[0].total_stock).toBe(5)
    expect(dashboard[0].current_stock).toBe(5)
  })
})

test.describe('stock batches tab', () => {
  test('"Show sold out" lists depleted batches, marked as sold out', async () => {
    await seedRaw(
      ctx.dbPath,
      [{ id: 'so', name: 'Loratadine 10mg', cost: 8 }],
      [
        { id: 'so-live', productId: 'so', qty: 4, cost: 8, received: '2026-02-01' },
        { id: 'so-empty', productId: 'so', qty: 0, cost: 8, received: '2026-01-01' }
      ]
    )
    await startShift(ctx.page, '0')
    await ctx.page.getByRole('button', { name: /^Inventory$/ }).click()
    await ctx.page.getByRole('tab', { name: /Stock Batches/i }).click()

    const table = ctx.page.getByRole('table')
    await expect(table.getByText('so-live')).toBeVisible()
    await expect(table.getByText('so-empty')).toHaveCount(0)

    await ctx.page.getByLabel('Show sold out').click()
    const soldOutRow = table.getByRole('row').filter({ hasText: 'so-empty' })
    await expect(soldOutRow).toBeVisible()
    await expect(soldOutRow.getByText('Sold out')).toBeVisible()
    await expect(
      table.getByRole('row').filter({ hasText: 'so-live' }).getByText('Sold out')
    ).toHaveCount(0)

    expect(ctx.errors).toEqual([])
  })
})
