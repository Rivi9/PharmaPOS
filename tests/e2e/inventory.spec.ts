import { test, expect } from './fixtures/database'
import { launchElectronApp, getMainWindow, closeElectronApp } from './setup'

test.describe('Inventory Management', () => {
  test('should add new product', async ({ testDb }) => {
    const app = await launchElectronApp({ dbPath: testDb })
    const window = await getMainWindow(app)

    // Login
    await window.fill('input[name="username"]', 'admin')
    await window.fill('input[name="password"]', 'password')
    await window.click('button[type="submit"]')

    // Navigate to inventory
    await window.click('a[href="/inventory"]')
    await window.click('button:has-text("Add Product")')

    // Fill product form
    await window.fill('input[name="name"]', 'Aspirin 100mg')
    await window.fill('input[name="barcode"]', 'ASP-100')
    await window.fill('input[name="sku"]', 'SKU-ASP-100')
    await window.selectOption('select[name="category_id"]', { label: 'Pain Relief' })
    await window.fill('input[name="unit_price"]', '25.00')
    await window.fill('input[name="cost_price"]', '15.00')
    await window.click('button:has-text("Save Product")')

    // Verify product added
    await expect(window.locator('text=Aspirin 100mg')).toBeVisible()

    await closeElectronApp(app)
  })

  test('should receive stock', async ({ testDb }) => {
    const app = await launchElectronApp({ dbPath: testDb })
    const window = await getMainWindow(app)

    // Login and navigate
    await window.fill('input[name="username"]', 'admin')
    await window.fill('input[name="password"]', 'password')
    await window.click('button[type="submit"]')
    await window.click('a[href="/inventory"]')

    // Find product and receive stock
    await window.fill('input[placeholder="Search"]', 'Paracetamol')
    await window.click('button:has-text("Receive Stock"):first')

    // Fill stock receipt form
    await window.fill('input[name="quantity"]', '100')
    await window.fill('input[name="cost_price"]', '30.00')
    await window.fill('input[name="batch_number"]', 'BATCH-001')
    await window.fill('input[name="expiry_date"]', '2026-12-31')
    await window.click('button:has-text("Receive")')

    // Verify stock updated
    await expect(window.locator('text=Stock received successfully')).toBeVisible()

    await closeElectronApp(app)
  })

  test('should show low stock alerts', async ({ testDb }) => {
    const app = await launchElectronApp({ dbPath: testDb })
    const window = await getMainWindow(app)

    // Login and navigate
    await window.fill('input[name="username"]', 'admin')
    await window.fill('input[name="password"]', 'password')
    await window.click('button[type="submit"]')
    await window.click('a[href="/inventory"]')

    // Filter low stock
    await window.click('button:has-text("Low Stock")')

    // Should show products below reorder level
    await expect(window.locator('[data-testid="low-stock-badge"]')).toBeVisible()

    await closeElectronApp(app)
  })
})
