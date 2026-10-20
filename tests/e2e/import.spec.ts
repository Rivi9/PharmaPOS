import { test, expect } from '@playwright/test'
import { launchApp, ipc, type LaunchedApp } from './helpers/app'
import { completeSetup, login, startShift } from './helpers/flows'
import { query, seedProduct } from './helpers/seed'
import { writeXlsx } from './helpers/xlsx'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
  await completeSetup(ctx.page)
  await login(ctx.page)
})

test.afterEach(async () => {
  await ctx?.close()
})

/** Answer the next "Import Products from Excel" file dialog with `file`. */
async function pickFile(file: string): Promise<void> {
  await ctx.app.evaluate(({ dialog }, picked) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [picked] })) as never
  }, file)
}

const FUTURE = new Date(Date.now() + 365 * 864e5).toISOString().split('T')[0]

/**
 * Re-importing a supplier sheet that contains products already in the
 * catalogue. Barcode and SKU are UNIQUE, so the first such row failed inside the
 * write transaction with a raw "UNIQUE constraint failed" and rolled back the
 * whole file. Matching rows are now skipped and listed; the rest imports.
 */
test.describe('Excel import', () => {
  test('rows matching an existing product are skipped and listed; the rest imports', async () => {
    const existing = seedProduct(ctx.dbPath, { unitPrice: 25, costPrice: 15, quantity: 100 })
    const bySku = await ipc(
      ctx.page,
      `window.electron.createProduct('x', ${JSON.stringify({
        name: 'Cough Syrup 100ml',
        sku: 'SYR01',
        cost_price: 40,
        unit_price: 90
      })})`
    )
    expect(bySku).toMatchObject({ success: true })

    const file = writeXlsx([
      ['Name', 'Barcode', 'SKU', 'Cost Price', 'Unit Price', 'Current Stock', 'Expiry Date'],
      // Same barcode, different figures: must not touch the existing product.
      [existing.name, existing.barcode, null, 99, 999, 50, FUTURE],
      ['Loratadine 10mg', 'LORA10', 'LOR10', 6, 12, 30, FUTURE],
      ['Cough Syrup (new label)', null, 'SYR01', 41, 95, 10, FUTURE]
    ])
    await pickFile(file)

    await startShift(ctx.page, '0')
    await ctx.page.getByRole('button', { name: /^Inventory$/ }).click()
    await ctx.page.getByRole('button', { name: /Import Excel/i }).click()

    const dialog = ctx.page.getByRole('dialog', { name: /Excel Import Complete/i })
    await expect(dialog).toBeVisible({ timeout: 20_000 })
    await expect(dialog.getByText(/1 product imported/i)).toBeVisible()
    await expect(dialog.getByText(/2 rows skipped/i)).toBeVisible()
    const skipped = dialog.getByRole('list', { name: 'Skipped rows' })
    await expect(
      skipped.getByText(`Skipped — already exists (row 2, ${existing.name}, barcode PARA500)`)
    ).toBeVisible()
    await expect(skipped.getByText(/row 4, Cough Syrup \(new label\), SKU SYR01/)).toBeVisible()

    // The existing products are untouched and got no extra stock.
    const [para] = query<{ unit_price: number; cost_price: number }>(
      ctx.dbPath,
      'SELECT unit_price, cost_price FROM products WHERE id = ?',
      existing.productId
    )
    expect(para).toEqual({ unit_price: 25, cost_price: 15 })
    expect(
      query(ctx.dbPath, 'SELECT id FROM stock_batches WHERE product_id = ?', existing.productId)
    ).toHaveLength(1)
    expect(
      query<{ unit_price: number; name: string }>(
        ctx.dbPath,
        "SELECT name, unit_price FROM products WHERE sku = 'SYR01'"
      )
    ).toEqual([{ name: 'Cough Syrup 100ml', unit_price: 90 }])

    // The new row imported normally, with its opening stock and cost.
    const [lora] = query<{ id: string; cost_price: number }>(
      ctx.dbPath,
      "SELECT id, cost_price FROM products WHERE barcode = 'LORA10'"
    )
    expect(lora.cost_price).toBe(6)
    expect(
      query<{ quantity: number; cost_price: number }>(
        ctx.dbPath,
        'SELECT quantity, cost_price FROM stock_batches WHERE product_id = ?',
        lora.id
      )
    ).toEqual([{ quantity: 30, cost_price: 6 }])

    expect(ctx.errors).toEqual([])
  })
})
