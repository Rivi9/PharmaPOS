import { test, expect } from '@playwright/test'
import { launchApp, ipc, type LaunchedApp } from './helpers/app'
import { completeSetup, login, startShift } from './helpers/flows'
import { seedProduct, query } from './helpers/seed'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
  await completeSetup(ctx.page)
  await login(ctx.page)
})

test.afterEach(async () => {
  await ctx?.close()
})

/**
 * M9: `getReceipt` recovered product names by joining `products`, so renaming a
 * product retroactively rewrote every past receipt and deleting one blanked the
 * name on its history. A receipt is the dispensing record — it has to say what
 * was actually handed over.
 */
test.describe('receipts are a permanent record', () => {
  test('renaming a product does not rewrite past receipts', async () => {
    const product = seedProduct(ctx.dbPath, { name: 'Amoxil 500mg', unitPrice: 30 })
    await startShift(ctx.page, '0')

    const barcode = ctx.page.getByPlaceholder(/Scan a barcode/i)
    await barcode.fill(product.barcode)
    await barcode.press('Enter')
    await ctx.page.getByRole('button', { name: /^Pay /i }).click()
    await ctx.page.locator('#cash-received').fill('50')
    await ctx.page.getByRole('button', { name: /^Complete Sale$/ }).click()

    await expect
      .poll(() => query(ctx.dbPath, "SELECT id FROM sales WHERE status='completed'").length, {
        timeout: 20_000
      })
      .toBe(1)

    const [line] = query<{ product_name: string }>(
      ctx.dbPath,
      'SELECT product_name FROM sale_items'
    )
    expect(line.product_name).toBe('Amoxil 500mg')

    // The pharmacy renames it — a rebrand, or a correction to the strength shown.
    const renamed = await ipc(
      ctx.page,
      `window.electron.updateProduct('x', ${JSON.stringify(product.productId)}, { name: 'Amoxicillin 500mg (renamed)' })`
    )
    expect(renamed).toMatchObject({ success: true })

    const [sale] = query<{ id: string }>(ctx.dbPath, 'SELECT id FROM sales')
    const receipt = (await ipc(
      ctx.page,
      `window.electron.getReceipt(${JSON.stringify(sale.id)})`
    )) as { items: Array<{ product_name: string }> }

    // The receipt still says what was dispensed, not what the product is called now.
    expect(receipt.items[0].product_name).toBe('Amoxil 500mg')
  })

  test('discontinuing a product leaves its past receipts readable', async () => {
    const product = seedProduct(ctx.dbPath, { name: 'Ceftriaxone 1g', unitPrice: 400 })
    await startShift(ctx.page, '0')

    const barcode = ctx.page.getByPlaceholder(/Scan a barcode/i)
    await barcode.fill(product.barcode)
    await barcode.press('Enter')
    await ctx.page.getByRole('button', { name: /^Pay /i }).click()
    await ctx.page.locator('#cash-received').fill('500')
    await ctx.page.getByRole('button', { name: /^Complete Sale$/ }).click()

    await expect
      .poll(() => query(ctx.dbPath, "SELECT id FROM sales WHERE status='completed'").length, {
        timeout: 20_000
      })
      .toBe(1)

    await ipc(ctx.page, `window.electron.deleteProduct('x', ${JSON.stringify(product.productId)})`)

    const [sale] = query<{ id: string }>(ctx.dbPath, 'SELECT id FROM sales')
    const receipt = (await ipc(
      ctx.page,
      `window.electron.getReceipt(${JSON.stringify(sale.id)})`
    )) as { items: Array<{ product_name: string }> }

    expect(receipt.items[0].product_name).toBe('Ceftriaxone 1g')
  })
})
