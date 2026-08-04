import { test, expect } from '@playwright/test'
import { launchApp, ipc, ipcError, type LaunchedApp } from './helpers/app'
import { completeSetup, login } from './helpers/flows'
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

const product = (over: Record<string, unknown> = {}): string =>
  `window.electron.createProduct('ignored', ${JSON.stringify({
    name: 'Amoxicillin 250mg',
    cost_price: 10,
    unit_price: 20,
    ...over
  })})`

const batch = (over: Record<string, unknown> = {}): string =>
  `window.electron.createStockBatch('ignored', ${JSON.stringify({
    product_id: 'e2e-product-1',
    quantity: 10,
    cost_price: 10,
    ...over
  })})`

/**
 * H14: nothing validated on the main-process side and the schema carries no CHECK
 * constraints, so a negative price or negative stock was storable through a
 * direct IPC call — and a negative unit price makes every total, VAT figure and
 * shift reconciliation downstream of it wrong.
 */
test.describe('inventory validation', () => {
  test('negative money is refused on products', async () => {
    expect(ipcError(await ipc(ctx.page, product({ unit_price: -5 })))).toMatch(
      /cannot be negative/i
    )
    expect(ipcError(await ipc(ctx.page, product({ cost_price: -1 })))).toMatch(
      /cannot be negative/i
    )
    expect(query(ctx.dbPath, 'SELECT id FROM products')).toHaveLength(0)
  })

  test('a blank product name is refused', async () => {
    expect(ipcError(await ipc(ctx.page, product({ name: '   ' })))).toMatch(/name is required/i)
    expect(query(ctx.dbPath, 'SELECT id FROM products')).toHaveLength(0)
  })

  test('a tax rate above 100% is refused', async () => {
    expect(ipcError(await ipc(ctx.page, product({ tax_rate: 150 })))).toMatch(/exceed 100/i)
  })

  test('a valid product is stored with amounts rounded to cents', async () => {
    const made = await ipc(ctx.page, product({ cost_price: 10.005, unit_price: 20.019 }))
    expect(made).toMatchObject({ success: true })

    const [row] = query<{ cost_price: number; unit_price: number; name: string }>(
      ctx.dbPath,
      'SELECT cost_price, unit_price, name FROM products'
    )
    // C4: nothing sub-cent reaches the database.
    expect(row.cost_price).toBe(10.01)
    expect(row.unit_price).toBe(20.02)
    expect(row.name).toBe('Amoxicillin 250mg')
  })

  test('negative and fractional stock quantities are refused', async () => {
    seedProduct(ctx.dbPath)
    expect(ipcError(await ipc(ctx.page, batch({ quantity: -10 })))).toMatch(/cannot be negative/i)
    expect(ipcError(await ipc(ctx.page, batch({ quantity: 2.5 })))).toMatch(/whole number/i)
  })

  /**
   * H12: expiry was never validated. A typo of 2025 for 2035 silently makes a
   * full batch unsellable, because FEFO excludes expired stock; `20265` sorts as
   * a far-future date and defeats every expiry alert the pharmacy relies on.
   */
  test('impossible expiry dates are refused', async () => {
    seedProduct(ctx.dbPath)
    expect(ipcError(await ipc(ctx.page, batch({ expiry_date: '20265-01-01' })))).toMatch(
      /YYYY-MM-DD|not a real date|too far/i
    )
    expect(ipcError(await ipc(ctx.page, batch({ expiry_date: '2027-13-45' })))).toMatch(
      /not a real date/i
    )
    expect(ipcError(await ipc(ctx.page, batch({ expiry_date: '01/01/2027' })))).toMatch(
      /YYYY-MM-DD/i
    )
    expect(ipcError(await ipc(ctx.page, batch({ expiry_date: '1985-01-01' })))).toMatch(/too far/i)
  })

  test('a past expiry IS accepted — stock does expire on the shelf', async () => {
    seedProduct(ctx.dbPath)
    const lastYear = new Date().getFullYear() - 1
    const made = await ipc(ctx.page, batch({ expiry_date: `${lastYear}-06-30` }))
    expect(made).toMatchObject({ success: true })

    // Recorded, but excluded from sellable stock rather than silently dispensed.
    const rows = query<{ expiry_date: string }>(
      ctx.dbPath,
      'SELECT expiry_date FROM stock_batches WHERE expiry_date = ?',
      `${lastYear}-06-30`
    )
    expect(rows).toHaveLength(1)
  })

  test('a blank expiry is stored as NULL, not an empty string', async () => {
    // H8: `''` sorts below every date comparison, which silently suppressed every
    // expiry warning for that product.
    seedProduct(ctx.dbPath)
    const made = await ipc(ctx.page, batch({ expiry_date: '' }))
    expect(made).toMatchObject({ success: true })
    expect(query(ctx.dbPath, "SELECT id FROM stock_batches WHERE expiry_date = ''")).toHaveLength(0)
  })
})
