import { test, expect } from '@playwright/test'
import { launchApp, ipc, type LaunchedApp } from './helpers/app'
import { completeSetup, login } from './helpers/flows'
import { query, seedSaleForCustomer } from './helpers/seed'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
  await completeSetup(ctx.page)
  await login(ctx.page)
})

test.afterEach(async () => {
  await ctx?.close()
})

const create = (name: string, phone?: string, email?: string): string =>
  `window.electron.customers.create('ignored', ${JSON.stringify({ name, phone, email })})`

/** H38/H39. */
test.describe('customers', () => {
  test('phone numbers are stored in one canonical form', async () => {
    const made = (await ipc(ctx.page, create('  Nimal Perera ', '+94 77 123 4567'))) as {
      id: string
      name: string
      phone: string
    }
    expect(made.phone).toBe('0771234567')
    expect(made.name).toBe('Nimal Perera')

    // Every equivalent spelling must find the same person — a sale rung up with
    // the number written differently used to fail to link, silently leaving the
    // purchase history a pharmacist reads before dispensing incomplete.
    for (const spelling of ['077 123 4567', '+94771234567', '0094771234567', '077-123-4567']) {
      const found = (await ipc(
        ctx.page,
        `window.electron.customers.getByPhone(${JSON.stringify(spelling)})`
      )) as { id: string } | null
      expect(found?.id, `lookup by ${spelling}`).toBe(made.id)
    }
  })

  test('a duplicate number in a different format is rejected', async () => {
    await ipc(ctx.page, create('First Person', '0771234567'))
    const dupe = await ipc(ctx.page, create('Second Person', '+94 77 123 4567'))
    expect(String(dupe)).toMatch(/UNIQUE|already/i)
    expect(query(ctx.dbPath, 'SELECT id FROM customers')).toHaveLength(1)
  })

  test('validation is server-side, not only in the dialog', async () => {
    expect(String(await ipc(ctx.page, create('   ')))).toMatch(/name is required/i)
    expect(String(await ipc(ctx.page, create('Bad Email', undefined, 'not-an-email')))).toMatch(
      /valid email/i
    )
    expect(query(ctx.dbPath, 'SELECT id FROM customers')).toHaveLength(0)
  })

  test('wildcards in a search term do not widen the search', async () => {
    await ipc(ctx.page, create('Nimal Perera', '0771234567'))
    await ipc(ctx.page, create('Kamala Silva', '0712223333'))

    // A fragment containing `%` must not match rows nobody typed.
    expect(await ipc(ctx.page, `window.electron.customers.list('Nim%ra')`)).toHaveLength(0)
    // An all-wildcard term shows no more than the empty box already does.
    const all = (await ipc(ctx.page, `window.electron.customers.list()`)) as unknown[]
    expect(await ipc(ctx.page, `window.electron.customers.list('%')`)).toHaveLength(all.length)
  })

  test('erasing destroys personal details but keeps the sale record', async () => {
    const made = (await ipc(ctx.page, create('Nimal Perera', '0771234567', 'n@example.com'))) as {
      id: string
    }

    // A sale carrying its own denormalised copy of the name and phone — the part
    // a flag-flip "delete" left fully readable.
    await ipc(ctx.page, `window.electron.startShift({ openingCash: 0 })`)
    const shift = (await ipc(ctx.page, `window.electron.getActiveShift()`)) as { id: string }

    seedSaleForCustomer(ctx.dbPath, {
      saleId: 'e2e-sale-1',
      shiftId: shift.id,
      customerId: made.id,
      customerName: 'Nimal Perera',
      customerPhone: '0771234567'
    })

    const erased = await ipc(
      ctx.page,
      `window.electron.customers.erase('ignored', ${JSON.stringify(made.id)})`
    )
    expect(erased).toMatchObject({ success: true })

    const [customer] = query<{
      name: string
      phone: string | null
      email: string | null
      is_active: number
    }>(ctx.dbPath, 'SELECT name, phone, email, is_active FROM customers WHERE id = ?', made.id)
    expect(customer).toMatchObject({
      name: 'Erased customer',
      phone: null,
      email: null,
      is_active: 0
    })

    // The sale survives, with the identifying fields gone and the money intact.
    const [sale] = query<{
      customer_name: string | null
      customer_phone: string | null
      total: number
      status: string
    }>(
      ctx.dbPath,
      'SELECT customer_name, customer_phone, total, status FROM sales WHERE id = ?',
      'e2e-sale-1'
    )
    expect(sale).toMatchObject({
      customer_name: null,
      customer_phone: null,
      total: 100,
      status: 'completed'
    })

    // And they no longer auto-link to a new sale.
    const relink = await ipc(ctx.page, `window.electron.customers.getByPhone('0771234567')`)
    expect(relink).toBeNull()
  })
})
