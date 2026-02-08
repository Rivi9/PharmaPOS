import { test, expect } from './fixtures/database'
import { launchElectronApp, getMainWindow, closeElectronApp } from './setup'

test.describe('Authentication', () => {
  test('should complete first-run setup', async ({ testDb }) => {
    const app = await launchElectronApp({ dbPath: testDb })
    const window = await getMainWindow(app)

    // Should show setup wizard on first run
    await expect(window.locator('text=Welcome to PharmaPOS')).toBeVisible()

    // Fill business info
    await window.fill('input[id="businessName"]', 'Test Pharmacy')
    await window.fill('input[id="businessAddress"]', '123 Test St')
    await window.fill('input[id="businessPhone"]', '555-1234')
    await window.click('button:has-text("Next")')

    // Fill admin account
    await window.fill('input[id="adminFullName"]', 'Admin User')
    await window.fill('input[id="adminUsername"]', 'admin')
    await window.fill('input[id="adminPassword"]', 'admin123')
    await window.click('button:has-text("Next")')

    // Complete setup
    await window.click('button:has-text("Complete Setup")')

    // Should redirect to login
    await expect(window.locator('text=Login')).toBeVisible()

    await closeElectronApp(app)
  })

  test('should login with valid credentials', async ({ testDb }) => {
    const app = await launchElectronApp({ dbPath: testDb })
    const window = await getMainWindow(app)

    // Login
    await window.fill('input[name="username"]', 'admin')
    await window.fill('input[name="password"]', 'password')
    await window.click('button[type="submit"]')

    // Should see POS screen
    await expect(window.locator('text=Point of Sale')).toBeVisible()

    await closeElectronApp(app)
  })

  test('should reject invalid credentials', async ({ testDb }) => {
    const app = await launchElectronApp({ dbPath: testDb })
    const window = await getMainWindow(app)

    await window.fill('input[name="username"]', 'admin')
    await window.fill('input[name="password"]', 'wrongpassword')
    await window.click('button[type="submit"]')

    // Should show error
    await expect(window.locator('text=Invalid username or password')).toBeVisible()

    await closeElectronApp(app)
  })
})
