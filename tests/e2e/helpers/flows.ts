import { expect, type Page } from '@playwright/test'

export const ADMIN = {
  fullName: 'Test Admin',
  username: 'testadmin',
  password: 'testpass123'
}

/**
 * Fill the input belonging to a visible label.
 *
 * `getByLabel` resolves the real label→control association (both `htmlFor` and
 * nesting), which is what a person reads off the screen. Filtering ancestor
 * `div`s by label text does NOT work here: the match climbs to the whole step
 * container, so `.first()` returns the same input for every field and only the
 * first one ever gets filled.
 */
export async function fillField(page: Page, label: string, value: string): Promise<void> {
  await page
    .getByLabel(new RegExp(`^\\s*${label}\\s*\\*?\\s*$`, 'i'))
    .first()
    .fill(value)
}

/** Walk the three-step first-run wizard and land on the login screen. */
export async function completeSetup(page: Page, businessName = 'E2E Test Pharmacy'): Promise<void> {
  await expect(page.getByText('Welcome to PharmaPOS')).toBeVisible({ timeout: 30_000 })

  await fillField(page, 'Business Name', businessName)
  await page.getByRole('button', { name: 'Next' }).click()

  await fillField(page, 'Full Name', ADMIN.fullName)
  await fillField(page, 'Username', ADMIN.username)
  await fillField(page, 'Password', ADMIN.password)
  await page.getByRole('button', { name: 'Next' }).click()

  await page.getByRole('button', { name: /Complete Setup/i }).click()

  // The wizard reloads the window to pick up the new settings.
  await expect(page.getByText(/Select user to login/i)).toBeVisible({ timeout: 30_000 })
}

/**
 * Sign in as the wizard-created admin.
 *
 * The tile opens a PIN pad by default. The wizard never sets a PIN, so the
 * password form has to be reached through "Use Password" — a detail that made
 * the original spec's `input[name="password"]` unreachable even had it existed.
 */
export async function login(page: Page): Promise<void> {
  await page.getByText(ADMIN.fullName).first().click()
  await page.getByRole('button', { name: /Use Password/i }).click()

  // Wait for the password form to actually replace the PIN pad before typing —
  // filling into a field that is still animating in loses the value, and the
  // failure then looks like a wrong password rather than a race.
  const password = page.locator('input[type="password"]')
  await password.waitFor({ state: 'visible', timeout: 20_000 })
  await password.fill(ADMIN.password)

  const loginButton = page.getByRole('button', { name: /^Login$/ })
  await expect(loginButton).toBeEnabled()
  await loginButton.click()

  // Either the shift screen (no open shift) or straight to the till (shift
  // already open) counts as signed in.
  await expect(
    page
      .getByText(/Opening Cash/i)
      .or(page.getByPlaceholder(/Scan a barcode/i))
      .first()
  ).toBeVisible({ timeout: 20_000 })
}

/** Enter an opening float on the numpad and open the shift. */
export async function startShift(page: Page, amount = '5000'): Promise<void> {
  for (const digit of amount) {
    await page.getByRole('button', { name: digit, exact: true }).first().click()
  }
  await page.getByRole('button', { name: /Start Shift/i }).click()
  await expect(page.getByPlaceholder(/Scan a barcode/i)).toBeVisible({ timeout: 20_000 })
}

/** Fresh install → signed in → shift open → sitting on the POS. */
export async function bootToPos(page: Page): Promise<void> {
  await completeSetup(page)
  await login(page)
  await startShift(page)
}
