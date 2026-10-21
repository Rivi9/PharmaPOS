import { test, expect, type Locator, type Page } from '@playwright/test'
import { DatabaseSync } from 'node:sqlite'
import { launchApp, ipc, ipcError, type LaunchedApp } from './helpers/app'
import { bootToPos } from './helpers/flows'
import { seedProduct, query, type SeededProduct } from './helpers/seed'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
})

test.afterEach(async () => {
  await ctx?.close()
})

/**
 * The Sales screen: there was no UI for void or refund at all, so a mis-ring
 * or a returned item could only be fixed by someone calling IPC by hand.
 */

/** Ring up `quantity` of a product through the real IPC channel. */
async function sell(
  page: Page,
  p: SeededProduct,
  quantity: number,
  opts: { discount?: number; method?: 'cash' | 'card'; phone?: string } = {}
): Promise<{ sale_id: string; receipt_number: string }> {
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
      tax_amount: 0,
      total,
      payment_method: method,
      cash_received: method === 'cash' ? total : 0,
      card_received: method === 'card' ? total : 0,
      change_given: 0,
      customer_phone: opts.phone
    })})`
  )) as { sale_id?: string; receipt_number?: string }
  expect(result, JSON.stringify(result)).toHaveProperty('sale_id')
  return result as { sale_id: string; receipt_number: string }
}

const batchQty = (id: string): number =>
  query<{ quantity: number }>(ctx.dbPath, 'SELECT quantity FROM stock_batches WHERE id = ?', id)[0]
    .quantity

const shiftId = (): string =>
  query<{ id: string }>(ctx.dbPath, "SELECT id FROM shifts WHERE status = 'active'")[0].id

const expectedCash = (page: Page): Promise<number> =>
  page.evaluate((id) => window.electron.shifts.computeExpectedCash(id), shiftId())

/** The header reads the shift's takings at sign-in; a reload re-reads them (L7). */
async function reloadToPos(page: Page): Promise<void> {
  await page.reload()
  await expect(page.getByPlaceholder(/Scan a barcode/i)).toBeVisible({ timeout: 20_000 })
}

async function openSalesPage(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sales', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sales', exact: true })).toBeVisible()
}

const saleRow = (page: Page, receipt: string): Locator =>
  page.getByRole('row').filter({ hasText: receipt })

const header = (page: Page): Locator => page.locator('header')

/** The detail sheet is modal: the list behind it is hidden from the a11y tree. */
async function closeSheet(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test.describe('Sales screen', () => {
  test('lists sales and finds one by receipt number or customer phone', async () => {
    await bootToPos(ctx.page)
    const p = seedProduct(ctx.dbPath, { unitPrice: 25, quantity: 100 })
    const a = await sell(ctx.page, p, 2)
    const b = await sell(ctx.page, p, 1, { phone: '077 123 4567' })
    const c = await sell(ctx.page, p, 3, { method: 'card' })

    await openSalesPage(ctx.page)
    for (const s of [a, b, c]) await expect(saleRow(ctx.page, s.receipt_number)).toBeVisible()
    await expect(ctx.page.getByText('3 sales')).toBeVisible()
    await expect(saleRow(ctx.page, c.receipt_number)).toContainText('Card')
    await expect(saleRow(ctx.page, c.receipt_number)).toContainText('Rs. 75.00')
    await expect(saleRow(ctx.page, a.receipt_number)).toContainText('Completed')

    const search = ctx.page.getByRole('searchbox', { name: 'Search sales' })
    await search.fill(b.receipt_number)
    await expect(ctx.page.getByText('1 sale', { exact: true })).toBeVisible()
    await expect(saleRow(ctx.page, b.receipt_number)).toBeVisible()
    await expect(saleRow(ctx.page, a.receipt_number)).toHaveCount(0)

    // The phone as typed at the counter, in another format than it is stored.
    await search.fill('+94 77 123 4567')
    await expect(ctx.page.getByText('1 sale', { exact: true })).toBeVisible()
    await expect(saleRow(ctx.page, b.receipt_number)).toBeVisible()

    await search.fill('')
    await ctx.page.getByRole('combobox', { name: 'Filter by status' }).click()
    await ctx.page.getByRole('option', { name: 'Voided' }).click()
    await expect(ctx.page.getByText('No sales found')).toBeVisible()
    expect(ctx.errors).toEqual([])
  })

  test('voiding a same-day sale updates its status, the stock and the Today total', async () => {
    await bootToPos(ctx.page)
    const p = seedProduct(ctx.dbPath, { unitPrice: 25, quantity: 100 })
    await sell(ctx.page, p, 2) // 50, kept
    const sale = await sell(ctx.page, p, 4) // 100, voided
    expect(batchQty(p.batchId)).toBe(94)
    await reloadToPos(ctx.page)
    await expect(header(ctx.page)).toContainText('Today Rs. 150.00')

    await openSalesPage(ctx.page)
    await saleRow(ctx.page, sale.receipt_number).click()
    const sheet = ctx.page.getByRole('dialog', { name: sale.receipt_number })
    await expect(sheet.getByText('Paracetamol 500mg')).toBeVisible()
    await sheet.getByRole('button', { name: 'Void', exact: true }).click()

    const confirm = ctx.page.getByRole('dialog', { name: `Void ${sale.receipt_number}?` })
    // A reason is required.
    await confirm.getByRole('button', { name: 'Void sale' }).click()
    await expect(confirm.getByText(/why the sale is being voided/i)).toBeVisible()
    await confirm.getByLabel('Reason').fill('Rang up the wrong item')
    await confirm.getByRole('button', { name: 'Void sale' }).click()

    await expect(ctx.page.getByText(`${sale.receipt_number} voided`)).toBeVisible()
    await expect(sheet.getByText('Rang up the wrong item')).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Void', exact: true })).toBeDisabled()
    await expect(sheet.getByRole('button', { name: 'Reprint' })).toBeDisabled()
    await closeSheet(ctx.page)
    await expect(saleRow(ctx.page, sale.receipt_number)).toContainText('Voided')

    expect(batchQty(p.batchId)).toBe(98)
    await expect(header(ctx.page)).toContainText('Today Rs. 50.00')
    expect(await expectedCash(ctx.page)).toBe(5050)
    expect(ctx.errors).toEqual([])
  })

  test('a partial refund through the UI is priced by the server and shows on the line', async () => {
    await bootToPos(ctx.page)
    const p = seedProduct(ctx.dbPath, { unitPrice: 100, costPrice: 40, quantity: 50 })
    expect(await ipc(ctx.page, `window.electron.setSetting('vat_rate', '18')`)).toMatchObject({
      success: true
    })
    // Rs. 1000 less 100: 90 a unit was paid, not the 100 on the shelf.
    const sale = await sell(ctx.page, p, 10, { discount: 100 })
    await reloadToPos(ctx.page)
    await expect(header(ctx.page)).toContainText('Today Rs. 900.00')

    await openSalesPage(ctx.page)
    await saleRow(ctx.page, sale.receipt_number).click()
    const sheet = ctx.page.getByRole('dialog', { name: sale.receipt_number })
    await expect(sheet.getByText('VAT (18%) included')).toBeVisible()
    await sheet.getByRole('button', { name: 'Refund', exact: true }).click()

    const dialog = ctx.page.getByRole('dialog', { name: `Refund ${sale.receipt_number}` })
    const stepper = dialog.getByRole('textbox', { name: 'Refund quantity for Paracetamol 500mg' })
    await expect(stepper).toHaveValue('0')
    await dialog.getByRole('button', { name: 'Increase' }).click()
    await dialog.getByRole('button', { name: 'Increase' }).click()
    await dialog.getByRole('button', { name: 'Increase' }).click()
    await expect(dialog.getByTestId('refund-amount')).toHaveText('Rs. 270.00')
    // Capped at what is left on the sale.
    await stepper.fill('99')
    await stepper.blur()
    await expect(stepper).toHaveValue('10')
    await stepper.fill('3')
    await stepper.blur()
    await expect(dialog.getByTestId('refund-amount')).toHaveText('Rs. 270.00')
    await dialog.getByLabel('Reason').fill('Customer returned unopened')
    await dialog.getByRole('button', { name: 'Refund Rs. 270.00' }).click()

    await expect(ctx.page.getByText('Refunded Rs. 270.00')).toBeVisible()
    await expect(sheet.getByText('Part refunded')).toBeVisible()
    await expect(sheet.getByText('3 refunded')).toBeVisible()
    await expect(sheet.getByText('Customer returned unopened')).toBeVisible()
    // Part refunded: void is refused, the rest can still be refunded.
    await expect(sheet.getByRole('button', { name: 'Void', exact: true })).toBeDisabled()
    await expect(sheet.getByTestId('sale-action-hint')).toContainText(/refunds against it/)

    const [refund] = query<{ total_refunded: number; cash_refunded: number; reason: string }>(
      ctx.dbPath,
      'SELECT total_refunded, cash_refunded, reason FROM sale_refunds'
    )
    expect(refund).toEqual({
      total_refunded: 270,
      cash_refunded: 270,
      reason: 'Customer returned unopened'
    })
    expect(batchQty(p.batchId)).toBe(43)
    // The header used to ignore a partial refund: the sale stays 'completed'.
    await expect(header(ctx.page)).toContainText('Today Rs. 630.00')
    expect(await expectedCash(ctx.page)).toBe(5630)

    await closeSheet(ctx.page)
    await expect(saleRow(ctx.page, sale.receipt_number)).toContainText('Part refunded')

    // The rest, in one tap. The sale becomes Refunded, and the drawer expects
    // exactly the float again — it used to drop the refunded sale AND subtract
    // its refunds, expecting 900 less than it held.
    await saleRow(ctx.page, sale.receipt_number).click()
    await sheet.getByRole('button', { name: 'Refund', exact: true }).click()
    await dialog.getByRole('button', { name: 'Refund everything left' }).click()
    await expect(dialog.getByTestId('refund-amount')).toHaveText('Rs. 630.00')
    await dialog.getByRole('button', { name: 'Refund Rs. 630.00' }).click()
    await expect(sheet.getByText('Refunded', { exact: true }).first()).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Refund', exact: true })).toBeDisabled()
    await closeSheet(ctx.page)
    await expect(saleRow(ctx.page, sale.receipt_number)).toContainText('Refunded')
    await expect(header(ctx.page)).toContainText('Today Rs. 0.00')
    expect(await expectedCash(ctx.page)).toBe(5000)
    expect(ctx.errors).toEqual([])
  })

  test('an earlier day’s sale can be refunded but not voided', async () => {
    await bootToPos(ctx.page)
    const p = seedProduct(ctx.dbPath, { unitPrice: 25, quantity: 100 })
    const sale = await sell(ctx.page, p, 2)
    const db = new DatabaseSync(ctx.dbPath)
    try {
      const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString()
      db.prepare('UPDATE sales SET created_at = ? WHERE id = ?').run(yesterday, sale.sale_id)
    } finally {
      db.close()
    }

    // The main process refuses it, not just the button.
    const voided = await ipc(
      ctx.page,
      `window.electron.void(${JSON.stringify({ userId: '', saleId: sale.sale_id, reason: 'late' })})`
    )
    expect(ipcError(voided)).toMatch(/Only today’s sales can be voided/)
    expect(query(ctx.dbPath, "SELECT id FROM sales WHERE status = 'voided'")).toHaveLength(0)

    await openSalesPage(ctx.page)
    await saleRow(ctx.page, sale.receipt_number).click()
    const sheet = ctx.page.getByRole('dialog', { name: sale.receipt_number })
    await expect(sheet.getByRole('button', { name: 'Void', exact: true })).toBeDisabled()
    await expect(sheet.getByTestId('sale-action-hint')).toContainText(/Only today/)
    await expect(sheet.getByRole('button', { name: 'Refund', exact: true })).toBeEnabled()
  })
})

test.describe('Sales screen for a cashier', () => {
  test('a cashier can look sales up and reprint, but not void or refund', async () => {
    await bootToPos(ctx.page)
    const p = seedProduct(ctx.dbPath, { unitPrice: 25, quantity: 100 })
    const sale = await sell(ctx.page, p, 2)

    // The admin creates a cashier, then the session switches to them.
    const created = await ipc(
      ctx.page,
      `window.electron.users.create('', ${JSON.stringify({
        username: 'till1',
        password: 'tillpass123',
        full_name: 'Till Cashier',
        role: 'cashier'
      })})`
    )
    expect(String(created)).not.toMatch(/THREW/)
    const [{ id }] = query<{ id: string }>(
      ctx.dbPath,
      "SELECT id FROM users WHERE username = 'till1'"
    )
    await ipc(ctx.page, `window.electron.logout()`)
    expect(
      String(
        await ipc(ctx.page, `window.electron.login({ userId: '${id}', password: 'tillpass123' })`)
      )
    ).not.toMatch(/THREW/)
    await ipc(ctx.page, `window.electron.startShift({ openingCash: 1000 })`)
    await reloadToPos(ctx.page)

    await openSalesPage(ctx.page)
    await saleRow(ctx.page, sale.receipt_number).click()
    const sheet = ctx.page.getByRole('dialog', { name: sale.receipt_number })
    await expect(sheet.getByRole('button', { name: 'Reprint' })).toBeEnabled()
    await expect(sheet.getByRole('button', { name: 'Void', exact: true })).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: 'Refund', exact: true })).toHaveCount(0)

    // And the channels behind those buttons refuse them.
    const preview = await ipc(
      ctx.page,
      `window.electron.sales.refundPreview(${JSON.stringify({ saleId: sale.sale_id, items: [] })})`
    )
    expect(ipcError(preview)).toMatch(/Permission denied: requires "sales:refund"/)
    const voided = await ipc(
      ctx.page,
      `window.electron.void(${JSON.stringify({ userId: '', saleId: sale.sale_id, reason: 'x' })})`
    )
    expect(ipcError(voided)).toMatch(/Permission denied: requires "sales:void"/)
  })
})
