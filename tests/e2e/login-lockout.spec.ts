import { test, expect, type Page } from '@playwright/test'
import { launchApp, type LaunchedApp } from './helpers/app'
import { ADMIN, completeSetup } from './helpers/flows'
import { query, seedUser, setLockedUntil } from './helpers/seed'

let ctx: LaunchedApp

const CASHIER = { id: 'e2e-cashier', username: 'cashier1', fullName: 'Kamal Cashier', pin: '2468' }

test.beforeEach(async () => {
  ctx = await launchApp()
  await completeSetup(ctx.page)
  seedUser(ctx.dbPath, CASHIER)
  // The tile list is read once on mount.
  await ctx.page.reload()
  await expect(ctx.page.getByText(CASHIER.fullName)).toBeVisible({ timeout: 20_000 })
})

test.afterEach(async () => {
  await ctx?.close()
})

const lockout = (page: Page): ReturnType<Page['getByTestId']> => page.getByTestId('login-lockout')

/** Seconds left as the lockout banner currently shows them ("27 seconds" or "1:05"). */
async function secondsShown(page: Page): Promise<number> {
  const text = (await lockout(page).textContent()) ?? ''
  const mmss = text.match(/Try again in (\d+):(\d{2})/)
  if (mmss) return Number(mmss[1]) * 60 + Number(mmss[2])
  const secs = text.match(/Try again in (\d+) seconds?/)
  if (!secs) throw new Error(`no countdown in: ${JSON.stringify(text)}`)
  return Number(secs[1])
}

const failedAttempts = (): number =>
  query<{ failed_attempts: number }>(
    ctx.dbPath,
    'SELECT failed_attempts FROM users WHERE id = ?',
    CASHIER.id
  )[0].failed_attempts

async function enterPin(page: Page, pin: string): Promise<void> {
  for (const digit of pin) {
    await page.getByRole('button', { name: digit, exact: true }).click()
  }
  await page.getByRole('button', { name: /^Login$/ }).click()
}

/**
 * The lockout message was built once in the main process from the seconds
 * remaining, so "Try again in 27 seconds" sat frozen on screen; and the attempt
 * that tripped the lock answered only "Invalid credentials", so the cashier
 * found out on the next try.
 */
test.describe('login lockout', () => {
  test('the locking attempt shows a live countdown and disables the PIN pad, for that user only', async () => {
    const { page } = ctx
    await page.getByText(CASHIER.fullName).click()

    // One attempt at a time: wait for each failure to land before the next.
    for (const n of [1, 2]) {
      await enterPin(page, '1111')
      await expect.poll(() => failedAttempts()).toBe(n)
      await expect(page.getByText(/Invalid credentials/)).toBeVisible()
    }
    await enterPin(page, '1111')

    // The third failure itself reports the lock.
    await expect(lockout(page)).toBeVisible()
    const first = await secondsShown(page)
    expect(first).toBeGreaterThan(25)
    expect(first).toBeLessThanOrEqual(30)

    // The keys are disabled, not merely ignored.
    await expect(page.getByRole('button', { name: '5', exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: /^Login$/ })).toBeDisabled()

    // It counts down.
    await expect.poll(() => secondsShown(page), { timeout: 5_000 }).toBeLessThan(first)

    // Another user's tile is not locked by the cashier's lockout…
    await page.getByRole('button', { name: /Back/ }).click()
    await page.getByText(ADMIN.fullName).first().click()
    await expect(lockout(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: '5', exact: true })).toBeEnabled()

    // …and going back to the cashier still shows theirs.
    await page.getByRole('button', { name: /Back/ }).click()
    await page.getByText(CASHIER.fullName).click()
    await expect(lockout(page)).toBeVisible()
    await expect(page.getByRole('button', { name: '5', exact: true })).toBeDisabled()
  })

  test('password login re-enables when the lock runs out', async () => {
    const { page } = ctx
    // A lock a few seconds out rather than walking three failures and waiting
    // the full 30 s.
    setLockedUntil(ctx.dbPath, ADMIN.username, new Date(Date.now() + 4_000))

    await page.getByText(ADMIN.fullName).first().click()
    await page.getByRole('button', { name: /Use Password/i }).click()
    const password = page.locator('input[type="password"]')
    await password.waitFor({ state: 'visible' })
    const loginButton = page.getByRole('button', { name: /^Login$/ })

    // Even the right password is refused while locked; the reply carries the lock.
    await password.fill(ADMIN.password)
    await loginButton.click()
    await expect(lockout(page)).toBeVisible()
    const first = await secondsShown(page)
    expect(first).toBeLessThanOrEqual(4)

    await password.fill(ADMIN.password)
    await expect(loginButton).toBeDisabled()
    await expect.poll(() => secondsShown(page), { timeout: 3_000 }).toBeLessThan(first)

    // At zero the banner goes and Login comes back.
    await expect(lockout(page)).toHaveCount(0, { timeout: 6_000 })
    await expect(loginButton).toBeEnabled()
    await loginButton.click()
    await expect(page.getByText(/Opening Cash/i)).toBeVisible({ timeout: 20_000 })
  })
})
