import { test, expect, type Page } from '@playwright/test'
import { launchApp, ipc, ipcError, type LaunchedApp } from './helpers/app'
import { completeSetup, login, startShift, ADMIN } from './helpers/flows'
import { query, seedSaleForCustomer } from './helpers/seed'

let ctx: LaunchedApp

const CASHIER = { username: 'till1', password: 'tillpass123', fullName: 'Till Cashier' }

/** Signed in as the admin, with a shift of the admin's own open. */
async function adminWithOpenShift(): Promise<{ adminId: string; shiftId: string }> {
  await completeSetup(ctx.page)
  await login(ctx.page)
  expect(await ipc(ctx.page, `window.electron.startShift({ openingCash: 5000 })`)).toMatchObject({
    success: true
  })
  const [admin] = query<{ id: string }>(
    ctx.dbPath,
    'SELECT id FROM users WHERE username = ?',
    ADMIN.username
  )
  const [shift] = query<{ id: string }>(
    ctx.dbPath,
    "SELECT id FROM shifts WHERE user_id = ? AND status = 'active'",
    admin.id
  )
  return { adminId: admin.id, shiftId: shift.id }
}

/** The admin creates a cashier, then this renderer's session switches to them. */
async function switchToCashier(page: Page): Promise<string> {
  const created = await ipc(
    page,
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
    'SELECT id FROM users WHERE username = ?',
    CASHIER.username
  )
  await ipc(page, `window.electron.logout()`)
  const signedIn = await ipc(
    page,
    `window.electron.login({ userId: '${id}', password: '${CASHIER.password}' })`
  )
  expect(signedIn).toMatchObject({ success: true })
  return id
}

test.beforeEach(async () => {
  ctx = await launchApp()
})

test.afterEach(async () => {
  await ctx?.close()
})

/**
 * `setup:initialize` carries no session — there is nobody to sign in as on a
 * fresh install — and it never checked that it WAS a fresh install. Any renderer
 * (a cashier with devtools open) could create a new administrator and rewrite the
 * business settings at any time.
 */
test.describe('first-run channels only work on a first run', () => {
  test('setup:initialize is refused once setup is done, even for a signed-in cashier', async () => {
    await adminWithOpenShift()
    await switchToCashier(ctx.page)

    const attempt = await ipc(
      ctx.page,
      `window.electron.setup.initialize({ businessName: 'Hijacked', adminUsername: 'intruder', adminPassword: 'intruderpass1', adminFullName: 'Intruder', currency: 'XX' })`
    )
    expect(ipcError(attempt)).toMatch(/already been completed/i)

    expect(query(ctx.dbPath, "SELECT id FROM users WHERE username = 'intruder'")).toHaveLength(0)
    expect(query(ctx.dbPath, "SELECT id FROM users WHERE role = 'admin'")).toHaveLength(1)
    const settings = query<{ key: string; value: string }>(
      ctx.dbPath,
      "SELECT key, value FROM settings WHERE key IN ('business_name', 'currency_symbol')"
    )
    expect(settings.find((s) => s.key === 'business_name')?.value).toBe('E2E Test Pharmacy')
    expect(settings.find((s) => s.key === 'currency_symbol')?.value).not.toBe('XX')
  })

  test('setup:complete cannot skip the wizard before an admin exists', async () => {
    await expect(ctx.page.getByText('Welcome to PharmaPOS')).toBeVisible({ timeout: 30_000 })
    const early = await ipc(ctx.page, `window.electron.setup.complete()`)
    expect(ipcError(early)).toMatch(/not created an administrator/i)
    expect(await ipc(ctx.page, `window.electron.setup.isFirstRun()`)).toBe(true)
  })

  test('auth:createUser cannot mint an admin ahead of the wizard', async () => {
    await expect(ctx.page.getByText('Welcome to PharmaPOS')).toBeVisible({ timeout: 30_000 })
    const early = (await ipc(
      ctx.page,
      `window.electron.createUser({ username: 'sneaky', password: 'sneakypass1', fullName: 'Sneaky', role: 'admin' })`
    )) as { success: boolean; error?: string }
    expect(early).toMatchObject({ success: false })
    expect(early.error).toMatch(/setup wizard/i)
    expect(query(ctx.dbPath, 'SELECT id FROM users')).toHaveLength(0)
  })
})

/**
 * Cash in/out needed no login and took `userId` and `shiftId` from the payload,
 * so anyone could post a movement against any open shift in anyone's name.
 */
test.describe('cash in / out', () => {
  test('is recorded as the signed-in user, on their own shift, whatever ids are sent', async () => {
    const admin = await adminWithOpenShift()
    const cashierId = await switchToCashier(ctx.page)
    expect(await ipc(ctx.page, `window.electron.startShift({ openingCash: 1000 })`)).toMatchObject({
      success: true
    })

    const result = await ipc(
      ctx.page,
      `window.electron.shifts.recordCashMovement(${JSON.stringify({
        userId: admin.adminId,
        shiftId: admin.shiftId,
        type: 'out',
        amount: 500,
        reason: 'payout'
      })})`
    )
    expect(result).toMatchObject({ success: true })

    // Nothing landed on the admin's drawer...
    expect(
      query(ctx.dbPath, 'SELECT id FROM cash_movements WHERE shift_id = ?', admin.shiftId)
    ).toHaveLength(0)
    // ...it is the cashier's own movement on the cashier's own shift.
    const [row] = query<{ user_id: string; shift_id: string; amount: number }>(
      ctx.dbPath,
      'SELECT m.user_id, m.shift_id, m.amount FROM cash_movements m'
    )
    const [cashierShift] = query<{ id: string }>(
      ctx.dbPath,
      "SELECT id FROM shifts WHERE user_id = ? AND status = 'active'",
      cashierId
    )
    expect(row).toMatchObject({ user_id: cashierId, shift_id: cashierShift.id, amount: 500 })

    // And a cashier cannot read another cashier's drawer figures either.
    const others = await ipc(
      ctx.page,
      `window.electron.shifts.cashMovements(${JSON.stringify(admin.shiftId)})`
    )
    expect(ipcError(others)).toMatch(/your own shift/i)
  })

  test('is refused with nobody signed in', async () => {
    const admin = await adminWithOpenShift()
    await ipc(ctx.page, `window.electron.logout()`)

    const result = await ipc(
      ctx.page,
      `window.electron.shifts.recordCashMovement(${JSON.stringify({
        userId: admin.adminId,
        shiftId: admin.shiftId,
        type: 'in',
        amount: 100,
        reason: 'top-up'
      })})`
    )
    expect(ipcError(result)).toMatch(/Not signed in/)
    expect(query(ctx.dbPath, 'SELECT id FROM cash_movements')).toHaveLength(0)
  })

  test('is refused without an open shift', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page)
    const result = await ipc(
      ctx.page,
      `window.electron.shifts.recordCashMovement({ type: 'in', amount: 100, reason: 'top-up' })`
    )
    expect(ipcError(result)).toMatch(/Start a shift/i)
  })

  test('the Cash In / Out dialog still records against the open shift', async () => {
    await completeSetup(ctx.page)
    await login(ctx.page)
    await startShift(ctx.page, '5000')

    await ctx.page.getByRole('button', { name: /Cash In \/ Out/ }).click()
    const dialog = ctx.page.getByRole('dialog')
    await dialog.getByRole('button', { name: /Cash Out/ }).click()
    await dialog.getByLabel('Reason').fill('supplier payment')
    for (const digit of '250') {
      await dialog.getByRole('button', { name: digit, exact: true }).click()
    }
    await dialog.getByRole('button', { name: 'Record' }).click()
    await expect(dialog).toBeHidden({ timeout: 10_000 })

    const [row] = query<{ type: string; amount: number; reason: string; status: string }>(
      ctx.dbPath,
      `SELECT m.type, m.amount, m.reason, s.status
         FROM cash_movements m JOIN shifts s ON s.id = m.shift_id`
    )
    expect(row).toMatchObject({
      type: 'out',
      amount: 250,
      reason: 'supplier payment',
      status: 'active'
    })
    expect(ctx.errors).toEqual([])
  })
})

/**
 * Channels that answered any renderer, signed in or not. Each is now gated on the
 * session and the permission its screen implies.
 */
test.describe('previously ungated channels', () => {
  test('refuse a renderer with nobody signed in', async () => {
    const { shiftId } = await adminWithOpenShift()
    seedSaleForCustomer(ctx.dbPath, {
      saleId: 'gated-sale',
      shiftId,
      customerId: 'no-such-customer',
      customerName: 'Nimal Perera',
      customerPhone: '+94771234567'
    })
    await ipc(ctx.page, `window.electron.logout()`)

    const calls: Record<string, string> = {
      openDrawer: `window.electron.printer.openDrawer()`,
      saveConfig: `window.electron.printer.saveConfig({ type: 'epson', interface: 'network', ip: '10.6.6.6', port: 9100 })`,
      printerInit: `window.electron.printer.initialize({ type: 'epson', interface: 'network', ip: '10.6.6.6', port: 9100 })`,
      printReceipt: `window.electron.printer.printReceipt({})`,
      receipt: `window.electron.getReceipt('gated-sale')`,
      history: `window.electron.customers.purchaseHistory('no-such-customer')`,
      customerList: `window.electron.customers.list()`,
      customerByPhone: `window.electron.customers.getByPhone('0771234567')`,
      todayTotal: `window.electron.getTodaySalesTotal(${JSON.stringify(shiftId)})`,
      expectedCash: `window.electron.shifts.computeExpectedCash(${JSON.stringify(shiftId)})`,
      cashMovements: `window.electron.shifts.cashMovements(${JSON.stringify(shiftId)})`,
      displayConnect: `window.electron.display.connect('COM9', 2400)`,
      userStats: `window.electron.users.stats()`,
      // Last: on the old code this one really did quit and install.
      updatesInstall: `window.electron.updates.install()`
    }
    for (const [name, call] of Object.entries(calls)) {
      const result = await ipc(ctx.page, call)
      expect(`${name}: ${ipcError(result)}`).toMatch(new RegExp(`^${name}: .*Not signed in`))
    }

    // The printer config was not touched.
    expect(query(ctx.dbPath, "SELECT value FROM settings WHERE key = 'printer_ip'")).toHaveLength(0)
  })

  test('a cashier can use the till-side ones but not configure the printer or pole', async () => {
    const { shiftId } = await adminWithOpenShift()
    seedSaleForCustomer(ctx.dbPath, {
      saleId: 'cashier-sale',
      shiftId,
      customerId: 'no-such-customer',
      customerName: 'Nimal Perera',
      customerPhone: '+94771234567'
    })
    await switchToCashier(ctx.page)

    // Till-side: allowed (a missing printer is a printer error, not a refusal).
    const receipt = (await ipc(ctx.page, `window.electron.getReceipt('cashier-sale')`)) as {
      sale: { id: string }
    }
    expect(receipt.sale.id).toBe('cashier-sale')
    const history = (await ipc(
      ctx.page,
      `window.electron.customers.purchaseHistory('no-such-customer')`
    )) as { id: string }[]
    expect(history.map((h) => h.id)).toEqual(['cashier-sale'])
    const drawer = await ipc(ctx.page, `window.electron.printer.openDrawer()`)
    expect(ipcError(drawer)).not.toMatch(/Permission denied|Not signed in/)

    // Configuration: admin only.
    for (const call of [
      `window.electron.printer.saveConfig({ type: 'epson', interface: 'network', ip: '10.6.6.6', port: 9100 })`,
      `window.electron.printer.initialize({ type: 'epson', interface: 'network', ip: '10.6.6.6', port: 9100 })`,
      `window.electron.printer.test()`,
      `window.electron.display.connect('COM9', 2400)`
    ]) {
      expect(ipcError(await ipc(ctx.page, call))).toMatch(
        /Permission denied: requires "settings:update"/
      )
    }
    expect(query(ctx.dbPath, "SELECT value FROM settings WHERE key = 'printer_ip'")).toHaveLength(0)
    expect(
      query(ctx.dbPath, "SELECT value FROM settings WHERE key = 'display_port' AND value = 'COM9'")
    ).toHaveLength(0)
  })

  test('a cashier cannot install an update (it closes the till past the End-Shift guard)', async () => {
    await adminWithOpenShift()
    await switchToCashier(ctx.page)
    const result = await ipc(ctx.page, `window.electron.updates.install()`)
    expect(ipcError(result)).toMatch(/Permission denied: requires "settings:update"/)
  })

  test('dead and lockout-free channels are no longer exposed', async () => {
    await expect(ctx.page.getByText('Welcome to PharmaPOS')).toBeVisible({ timeout: 30_000 })
    const exposed = await ctx.page.evaluate(() => {
      const api = window.electron as unknown as Record<string, Record<string, unknown>>
      return {
        deductStock: typeof api.deductStock,
        verifyPin: typeof api.users.verifyPin,
        verifyPassword: typeof api.users.verifyPassword
      }
    })
    expect(exposed).toEqual({
      deductStock: 'undefined',
      verifyPin: 'undefined',
      verifyPassword: 'undefined'
    })
  })
})
