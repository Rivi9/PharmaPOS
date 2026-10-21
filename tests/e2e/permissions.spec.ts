import { test, expect } from '@playwright/test'
import { launchApp, ipc, ipcError, type LaunchedApp } from './helpers/app'
import { completeSetup, login } from './helpers/flows'
import { seedProduct, query } from './helpers/seed'

let ctx: LaunchedApp

const CASHIER = { username: 'till1', password: 'tillpass123', fullName: 'Till Cashier' }

test.beforeEach(async () => {
  ctx = await launchApp()
  await completeSetup(ctx.page)
  await login(ctx.page)
  // The admin creates a cashier, then the session switches to that cashier.
  const created = await ipc(
    ctx.page,
    `window.electron.users.create('', ${JSON.stringify({
      username: CASHIER.username,
      password: CASHIER.password,
      full_name: CASHIER.fullName,
      role: 'cashier'
    })})`
  )
  expect(String(created)).not.toMatch(/THREW/)
  const [{ id }] = query<{ id: string }>(
    ctx.dbPath,
    `SELECT id FROM users WHERE username = '${CASHIER.username}'`
  )
  await ipc(ctx.page, `window.electron.logout()`)
  const signedIn = await ipc(
    ctx.page,
    `window.electron.login({ userId: '${id}', password: '${CASHIER.password}' })`
  )
  expect(String(signedIn)).not.toMatch(/THREW/)
})

test.afterEach(async () => {
  await ctx?.close()
})

/**
 * Cashiers sell; they do not manage stock or settings. The Inventory and
 * Settings screens are hidden from them, and the main process refuses the
 * inventory reads those screens use, so hiding the buttons is not the only
 * thing standing in the way.
 */
test.describe('cashier permissions', () => {
  test('inventory lists are refused, but the till can still find and price products', async () => {
    const product = seedProduct(ctx.dbPath)

    const page = await ipc(ctx.page, `window.electron.listProductsPage('', {})`)
    expect(ipcError(page)).toMatch(/Permission denied: requires "inventory:view"/)

    const batches = await ipc(ctx.page, `window.electron.listStockBatchesPage('', {})`)
    expect(ipcError(batches)).toMatch(/Permission denied/)

    const found = (await ipc(ctx.page, `window.electron.searchProducts('para 500')`)) as {
      id: string
    }[]
    expect(found.map((p) => p.id)).toContain(product.productId)

    const scanned = (await ipc(
      ctx.page,
      `window.electron.getProductByBarcode('${product.barcode}')`
    )) as { id: string } | null
    expect(scanned?.id).toBe(product.productId)
  })

  test('the sidebar and header offer neither Inventory nor Settings', async () => {
    await ipc(ctx.page, `window.electron.startShift({ openingCash: 1000 })`)
    // The renderer recovers the cashier's session and open shift on reload (L7).
    await ctx.page.reload()
    await expect(ctx.page.getByPlaceholder(/Scan a barcode/i)).toBeVisible({ timeout: 20_000 })

    await expect(ctx.page.getByRole('button', { name: 'POS', exact: true })).toBeVisible()
    await expect(ctx.page.getByRole('button', { name: 'Customers', exact: true })).toBeVisible()
    await expect(ctx.page.getByRole('button', { name: 'Inventory', exact: true })).toHaveCount(0)
    await expect(ctx.page.getByRole('button', { name: 'Settings', exact: true })).toHaveCount(0)
  })
})
