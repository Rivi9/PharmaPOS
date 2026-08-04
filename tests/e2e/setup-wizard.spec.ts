import { test, expect } from '@playwright/test'
import { launchApp, ipc, type LaunchedApp } from './helpers/app'
import { fillField, completeSetup, ADMIN } from './helpers/flows'
import { query } from './helpers/seed'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
})

test.afterEach(async () => {
  await ctx?.close()
})

test.describe('first-run setup wizard', () => {
  test('a fresh install opens the wizard, not the till', async () => {
    await expect(ctx.page.getByText('Welcome to PharmaPOS')).toBeVisible({ timeout: 30_000 })
    expect(ctx.errors).toEqual([])
  })

  test('the admin password rule is enforced, not just described', async () => {
    // Regression: the "at least 8 characters" line under the field was copy.
    // Nothing checked it — not the wizard, and not `initializeDatabase`, which
    // creates the pharmacy's only admin through its own INSERT and so inherited
    // none of the rules `createUser` enforces. A one-character password on the
    // account that owns the whole till was accepted.
    await expect(ctx.page.getByText('Welcome to PharmaPOS')).toBeVisible({ timeout: 30_000 })
    await fillField(ctx.page, 'Business Name', 'Rule Check Pharmacy')
    await ctx.page.getByRole('button', { name: 'Next' }).click()

    await fillField(ctx.page, 'Full Name', 'Short Password Admin')
    await fillField(ctx.page, 'Username', 'shorty')
    await fillField(ctx.page, 'Password', 'abc')

    await expect(ctx.page.getByText(/at least 8 characters/i)).toBeVisible()
    await expect(ctx.page.getByRole('button', { name: 'Next' })).toBeDisabled()

    // And the main process refuses it even if the renderer is bypassed.
    const direct = await ipc(
      ctx.page,
      `window.electron.setup.initialize({ businessName: 'X', adminUsername: 'shorty', adminPassword: 'abc', adminFullName: 'Short Password Admin' })`
    )
    expect(String(direct)).toMatch(/at least 8 characters/i)

    expect(query(ctx.dbPath, 'SELECT id FROM users')).toHaveLength(0)
  })

  test('a password equal to the username is refused', async () => {
    await expect(ctx.page.getByText('Welcome to PharmaPOS')).toBeVisible({ timeout: 30_000 })
    const same = await ipc(
      ctx.page,
      `window.electron.setup.initialize({ businessName: 'X', adminUsername: 'pharmacy1', adminPassword: 'pharmacy1', adminFullName: 'Same As Username' })`
    )
    expect(String(same)).toMatch(/same as the username/i)
  })

  test('completing the wizard creates exactly one active admin', async () => {
    await completeSetup(ctx.page, 'Wizard Complete Pharmacy')

    const users = query<{ username: string; role: string; is_active: number }>(
      ctx.dbPath,
      'SELECT username, role, is_active FROM users'
    )
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({ username: ADMIN.username, role: 'admin', is_active: 1 })

    const [setting] = query<{ value: string }>(
      ctx.dbPath,
      "SELECT value FROM settings WHERE key = 'business_name'"
    )
    expect(setting.value).toBe('Wizard Complete Pharmacy')
    expect(ctx.errors).toEqual([])
  })

  test('a duplicate admin username is reported, not swallowed', async () => {
    // `INSERT OR IGNORE` used to absorb the collision, so the wizard reported
    // success and then nobody could sign in with the credentials just chosen.
    await completeSetup(ctx.page)
    const again = await ipc(
      ctx.page,
      `window.electron.setup.initialize({ businessName: 'Y', adminUsername: '${ADMIN.username}', adminPassword: 'anotherpass123', adminFullName: 'Someone Else' })`
    )
    expect(String(again)).toMatch(/already taken/i)
  })
})
