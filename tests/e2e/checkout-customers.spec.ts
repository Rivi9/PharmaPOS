import { test, expect } from '@playwright/test'
import { launchApp, ipc, type LaunchedApp } from './helpers/app'
import { completeSetup, login, startShift } from './helpers/flows'
import { seedProduct, seedSaleForCustomer, query } from './helpers/seed'

let ctx: LaunchedApp
let productId: string

test.beforeEach(async () => {
  ctx = await launchApp()
  await completeSetup(ctx.page)
  await login(ctx.page)
  productId = seedProduct(ctx.dbPath, { unitPrice: 25, quantity: 100 }).productId
  await startShift(ctx.page, '0')
})

test.afterEach(async () => {
  await ctx?.close()
})

/** Ring up `qty` × Rs. 25 through the real IPC channel, with the checkout customer fields. */
async function sell(customer: { phone?: string; name?: string }, qty = 1): Promise<string> {
  const total = 25 * qty
  const result = (await ipc(
    ctx.page,
    `window.electron.createSale(${JSON.stringify({
      items: [
        {
          product_id: productId,
          product_name: 'Paracetamol 500mg',
          quantity: qty,
          unit_price: 25,
          line_total: total
        }
      ],
      subtotal: total,
      discount_amount: 0,
      discount_type: null,
      discount_value: 0,
      tax_amount: 0,
      total,
      payment_method: 'cash',
      cash_received: total,
      card_received: 0,
      change_given: 0,
      customer_name: customer.name,
      customer_phone: customer.phone
    })})`
  )) as { sale_id: string } | string
  if (typeof result === 'string') throw new Error(result)
  return result.sale_id
}

interface CustomerRow {
  id: string
  name: string
  phone: string | null
  is_active: number
}
const customerRows = (): CustomerRow[] =>
  query<CustomerRow>(ctx.dbPath, 'SELECT id, name, phone, is_active FROM customers')
const saleRow = (id: string): { customer_id: string | null; customer_name: string | null } =>
  query<{ customer_id: string | null; customer_name: string | null }>(
    ctx.dbPath,
    'SELECT customer_id, customer_name FROM sales WHERE id = ?',
    id
  )[0]

interface ListedCustomer {
  id: string
  name: string
  visits: number
  total_spent: number
  last_visit: string | null
}
const listed = async (): Promise<ListedCustomer[]> =>
  (await ipc(ctx.page, `window.electron.customers.list()`)) as ListedCustomer[]

/**
 * A phone number typed at checkout used to link the sale only if someone had
 * already registered that customer in the Customers tab; otherwise the name
 * went on the receipt and nowhere else, and the tab stayed empty.
 */
test.describe('customers from checkout', () => {
  test('a new phone number creates the customer and links the sale', async () => {
    const saleId = await sell({ phone: '077 123 4567', name: 'Nimal Perera' })

    const rows = customerRows()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ name: 'Nimal Perera', phone: '0771234567', is_active: 1 })
    expect(saleRow(saleId).customer_id).toBe(rows[0].id)

    // It is the Customers tab's data, with the visit counted.
    const [c] = await listed()
    expect(c).toMatchObject({ id: rows[0].id, visits: 1, total_spent: 25 })
    expect(c.last_visit).toBeTruthy()

    // Audited, without the personal details (audit_log outlives an erasure).
    const audit = query<{ entity_id: string; details: string }>(
      ctx.dbPath,
      "SELECT entity_id, details FROM audit_log WHERE action = 'CUSTOMER_CREATED'"
    )
    expect(audit).toHaveLength(1)
    expect(audit[0].entity_id).toBe(rows[0].id)
    expect(audit[0].details).not.toContain('Nimal')
    expect(audit[0].details).not.toContain('0771234567')
  })

  test('a number with no name gets a placeholder, filled in by the first real name', async () => {
    await sell({ phone: '0712223333' })
    expect(customerRows()[0].name).toBe('Customer 3333')

    const second = await sell({ phone: '+94 71 222 3333', name: 'Kamala Silva' })
    expect(customerRows()).toHaveLength(1)
    expect(customerRows()[0].name).toBe('Kamala Silva')
    expect(saleRow(second).customer_id).toBe(customerRows()[0].id)

    // From here on the stored name is real, and the till never overwrites it.
    const third = await sell({ phone: '0712223333', name: 'K. Silva' })
    expect(customerRows()[0].name).toBe('Kamala Silva')
    expect(saleRow(third)).toMatchObject({
      customer_id: customerRows()[0].id,
      customer_name: 'K. Silva' // the receipt still prints what was typed
    })
  })

  test('an existing customer is linked and their name is not overwritten', async () => {
    const made = (await ipc(
      ctx.page,
      `window.electron.customers.create('ignored', ${JSON.stringify({ name: 'Nimal Perera', phone: '0771234567' })})`
    )) as { id: string }

    const saleId = await sell({ phone: '0771234567', name: 'Someone Else' })
    expect(customerRows()).toHaveLength(1)
    expect(customerRows()[0].name).toBe('Nimal Perera')
    expect(saleRow(saleId)).toMatchObject({ customer_id: made.id, customer_name: 'Someone Else' })
  })

  test('a name without a phone stays on the receipt only', async () => {
    const saleId = await sell({ name: 'Walk-in Person' })
    expect(customerRows()).toHaveLength(0)
    expect(saleRow(saleId)).toMatchObject({ customer_id: null, customer_name: 'Walk-in Person' })
  })

  test('an erased customer is not revived; the number starts a new record', async () => {
    const first = await sell({ phone: '0771234567', name: 'Nimal Perera' })
    const erasedId = customerRows()[0].id
    await ipc(ctx.page, `window.electron.customers.erase('ignored', ${JSON.stringify(erasedId)})`)

    const again = await sell({ phone: '0771234567', name: 'Nimal Perera' })

    // The erased record stays erased, and its scrubbed sale stays with it.
    const erased = customerRows().find((c) => c.id === erasedId)!
    expect(erased).toMatchObject({ name: 'Erased customer', phone: null, is_active: 0 })
    expect(saleRow(first)).toMatchObject({ customer_id: erasedId, customer_name: null })

    // The number given at this visit is a new, separate customer with only this sale.
    const fresh = customerRows().find((c) => c.id !== erasedId)!
    expect(fresh).toMatchObject({ name: 'Nimal Perera', phone: '0771234567', is_active: 1 })
    expect(saleRow(again).customer_id).toBe(fresh.id)
    expect((await listed()).find((c) => c.id === fresh.id)).toMatchObject({ visits: 1 })
  })

  test('a removed customer is neither re-linked nor duplicated', async () => {
    await sell({ phone: '0771234567', name: 'Nimal Perera' })
    const removedId = customerRows()[0].id
    await ipc(ctx.page, `window.electron.customers.delete('ignored', ${JSON.stringify(removedId)})`)

    const saleId = await sell({ phone: '0771234567', name: 'Nimal Perera' })
    expect(customerRows()).toHaveLength(1)
    expect(customerRows()[0].is_active).toBe(0)
    expect(saleRow(saleId).customer_id).toBeNull()
  })

  test('earlier unlinked sales under a number join the customer when they are registered', async () => {
    // A sale from before customers were saved at checkout: the number is on the
    // sale but nothing links it. Stored as typed, not normalised.
    const shift = (await ipc(ctx.page, `window.electron.getActiveShift()`)) as { id: string }
    seedSaleForCustomer(ctx.dbPath, {
      saleId: 'e2e-orphan-1',
      shiftId: shift.id,
      customerId: null,
      customerName: 'Nimal',
      customerPhone: '+94 77 123 4567',
      total: 40
    })

    const made = (await ipc(
      ctx.page,
      `window.electron.customers.create('ignored', ${JSON.stringify({ name: 'Nimal Perera', phone: '0771234567' })})`
    )) as { id: string }
    expect(saleRow('e2e-orphan-1').customer_id).toBe(made.id)
    expect((await listed())[0]).toMatchObject({ visits: 1, total_spent: 40 })
  })

  test('visits and spend leave out voids and refunds', async () => {
    const kept = await sell({ phone: '0771234567', name: 'Nimal Perera' }, 4) // 100
    const voided = await sell({ phone: '0771234567' }, 2) // 50, voided
    const refunded = await sell({ phone: '0771234567' }, 1) // 25, fully refunded

    await ipc(
      ctx.page,
      `window.electron.void(${JSON.stringify({ userId: 'ignored', saleId: voided, reason: 'mis-ring' })})`
    )
    const line = {
      product_id: productId,
      product_name: 'Paracetamol 500mg',
      unit_price: 25
    }
    // One unit back from the kept sale, and the whole of the refunded one.
    for (const [saleId, quantity] of [
      [kept, 1],
      [refunded, 1]
    ] as const) {
      const r = await ipc(
        ctx.page,
        `window.electron.refund(${JSON.stringify({
          userId: 'ignored',
          saleId,
          items: [{ ...line, quantity, line_total: 25 * quantity }],
          reason: 'returned',
          restock: true
        })})`
      )
      expect(String(r)).not.toMatch(/THREW/)
    }

    // 100 − 25 refunded; the void counts for nothing; the fully refunded sale is
    // a visit that adds nothing.
    const [c] = await listed()
    expect(c).toMatchObject({ visits: 2, total_spent: 75 })

    const history = (await ipc(
      ctx.page,
      `window.electron.customers.purchaseHistory(${JSON.stringify(c.id)})`
    )) as Array<{ id: string; status: string; refunded: number }>
    expect(history.map((h) => h.id).sort()).toEqual([kept, refunded].sort())
    expect(history.find((h) => h.id === kept)).toMatchObject({ status: 'completed', refunded: 25 })
    expect(history.find((h) => h.id === refunded)).toMatchObject({
      status: 'refunded',
      refunded: 25
    })
  })
})
