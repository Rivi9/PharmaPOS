import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './helpers/app'
import { completeSetup, login, startShift } from './helpers/flows'
import { seedProduct, expireBatch, query } from './helpers/seed'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
})

test.afterEach(async () => {
  await ctx?.close()
})

/**
 * The sale-to-receipt path. This is the test the report called "worth more than
 * any other single change" — every money defect in the Critical list lived
 * somewhere along this line, and nothing was covering it.
 */
test.describe('cash sale, end to end', () => {
  test('scan → cart → tender → receipt, with stock and money reconciled', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page)

    // Seed after the DB exists (the app creates and migrates it) but before the
    // shift, so the catalogue is present the first time the POS queries it.
    const product = seedProduct(ctx.dbPath, { unitPrice: 25, costPrice: 15, quantity: 100 })

    await startShift(ctx.page, '5000')

    const barcode = ctx.page.getByPlaceholder(/Scan a barcode/i)
    await barcode.fill(product.barcode)
    await barcode.press('Enter')

    await expect(ctx.page.getByText(product.name).first()).toBeVisible({ timeout: 15_000 })

    // `Pay Now` on the cart opens the payment modal; `Complete Sale` lives INSIDE
    // it (and also in its title, hence the button-role match).
    await ctx.page.getByRole('button', { name: /^Pay /i }).click()
    await ctx.page.locator('#cash-received').fill('100')
    await ctx.page.getByRole('button', { name: /^Complete Sale$/ }).click()

    // The sale must actually be committed, not merely appear to be.
    await expect
      .poll(() => query(ctx.dbPath, "SELECT id FROM sales WHERE status = 'completed'").length, {
        timeout: 20_000
      })
      .toBe(1)

    const [sale] = query<{
      id: string
      receipt_number: string
      subtotal: number
      total: number
      cash_received: number
      change_given: number
      shift_id: string
      user_id: string
    }>(ctx.dbPath, 'SELECT * FROM sales')

    expect(sale.receipt_number).toMatch(/^R-\d{4}-\d{6}$/)
    expect(sale.total).toBe(25)
    expect(sale.cash_received).toBe(100)
    expect(sale.change_given).toBe(75)
    // H22: both are resolved server-side from the session, never the payload.
    expect(sale.shift_id).toBeTruthy()
    expect(sale.user_id).toBeTruthy()

    // C4: nothing sub-cent is ever stored.
    for (const amount of [sale.subtotal, sale.total, sale.cash_received, sale.change_given]) {
      expect(Math.round(amount * 100) / 100).toBe(amount)
    }

    // Stock came out of the batch that was actually dispensed (H4/C10).
    const [batch] = query<{ quantity: number }>(
      ctx.dbPath,
      'SELECT quantity FROM stock_batches WHERE id = ?',
      product.batchId
    )
    expect(batch.quantity).toBe(99)

    const [item] = query<{ quantity: number; cost_price: number; batch_id: string }>(
      ctx.dbPath,
      'SELECT quantity, cost_price, batch_id FROM sale_items'
    )
    expect(item.quantity).toBe(1)
    // C5: COGS is the batch's cost, not zero and not the retail price.
    expect(item.cost_price).toBe(15)

    // C2: the drawer expects cash retained, not cash tendered.
    const expected = await ctx.page.evaluate(
      (shiftId) => window.electron.shifts.computeExpectedCash(shiftId),
      sale.shift_id
    )
    expect(expected).toBe(5025)

    expect(ctx.errors).toEqual([])
  })

  test('a phone number at checkout saves the customer, and says so first', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page)
    const product = seedProduct(ctx.dbPath, { unitPrice: 25, quantity: 100 })
    await startShift(ctx.page, '0')

    const ringUp = async (): Promise<void> => {
      const barcode = ctx.page.getByPlaceholder(/Scan a barcode/i)
      await barcode.fill(product.barcode)
      await barcode.press('Enter')
      await expect(ctx.page.getByText(product.name).first()).toBeVisible({ timeout: 15_000 })
      await ctx.page.getByRole('button', { name: /^Pay /i }).click()
    }
    const complete = async (sales: number): Promise<void> => {
      await ctx.page.locator('#cash-received').fill('100')
      await ctx.page.getByRole('button', { name: /^Complete Sale$/ }).click()
      await expect
        .poll(() => query(ctx.dbPath, "SELECT id FROM sales WHERE status='completed'").length, {
          timeout: 20_000
        })
        .toBe(sales)
      // Back to the till for the next customer.
      await ctx.page.keyboard.press('Escape')
    }

    await ringUp()
    await ctx.page.locator('#customer-phone').fill('077 123 4567')
    await ctx.page.locator('#customer-name').fill('Nimal Perera')
    // The cashier is told before committing that this creates a record.
    await expect(ctx.page.getByText('New customer — will be saved')).toBeVisible()
    await complete(1)

    const customers = query<{ id: string; name: string; phone: string }>(
      ctx.dbPath,
      'SELECT id, name, phone FROM customers'
    )
    expect(customers).toEqual([
      expect.objectContaining({ name: 'Nimal Perera', phone: '0771234567' })
    ])
    const [sale] = query<{ customer_id: string }>(ctx.dbPath, 'SELECT customer_id FROM sales')
    expect(sale.customer_id).toBe(customers[0].id)

    // Next visit: recognised, and the name filled in from the record.
    await ringUp()
    await ctx.page.locator('#customer-phone').fill('0771234567')
    await expect(ctx.page.getByText(/Returning customer/)).toBeVisible()
    await expect(ctx.page.locator('#customer-name')).toHaveValue('Nimal Perera')
    await complete(2)
    expect(
      query(ctx.dbPath, 'SELECT id FROM sales WHERE customer_id = ?', customers[0].id)
    ).toHaveLength(2)

    expect(ctx.errors).toEqual([])
  })

  test('a sale cannot be booked without an open shift', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page)

    const result = await ctx.page.evaluate(() =>
      window.electron
        .createSale({
          items: [],
          subtotal: 0,
          discount_amount: 0,
          discount_type: null,
          discount_value: 0,
          tax_amount: 0,
          total: 0,
          payment_method: 'cash',
          cash_received: 0,
          card_received: 0,
          change_given: 0
        })
        .then(() => 'RESOLVED')
        .catch((e: Error) => 'THREW: ' + e.message)
    )
    expect(String(result)).toMatch(/Start a shift/i)
    expect(query(ctx.dbPath, 'SELECT id FROM sales')).toHaveLength(0)
  })

  test('expired stock is never dispensed', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page)

    // Only batch is expired — FEFO orders by expiry ascending, so without the
    // exclusion this is the batch it would reach for first.
    const p = seedProduct(ctx.dbPath, { quantity: 50 })
    expireBatch(ctx.dbPath, p.batchId)

    await startShift(ctx.page, '0')

    const result = await ctx.page.evaluate(
      (pid) =>
        window.electron
          .createSale({
            items: [
              {
                product_id: pid,
                product_name: 'Paracetamol 500mg',
                quantity: 1,
                unit_price: 25,
                line_total: 25
              }
            ],
            subtotal: 25,
            discount_amount: 0,
            discount_type: null,
            discount_value: 0,
            tax_amount: 0,
            total: 25,
            payment_method: 'cash',
            cash_received: 25,
            card_received: 0,
            change_given: 0
          })
          .then(() => 'RESOLVED')
          .catch((e: Error) => 'THREW: ' + e.message),
      p.productId
    )
    expect(String(result)).toMatch(/Insufficient sellable stock|expired/i)
    expect(query(ctx.dbPath, "SELECT id FROM sales WHERE status='completed'")).toHaveLength(0)
  })
})
