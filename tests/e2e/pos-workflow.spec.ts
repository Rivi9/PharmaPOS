import { test, expect } from './fixtures/database'
import { launchElectronApp, getMainWindow, closeElectronApp } from './setup'

test.describe('POS Workflow', () => {
  test.beforeEach(async ({ testDb }) => {
    // Seed test data
    // This would insert test products, categories, etc.
  })

  test('should complete a cash sale', async ({ testDb }) => {
    const app = await launchElectronApp({ dbPath: testDb })
    const window = await getMainWindow(app)

    // Login first
    await window.fill('input[name="username"]', 'admin')
    await window.fill('input[name="password"]', 'password')
    await window.click('button[type="submit"]')

    // Wait for POS screen
    await expect(window.locator('text=Point of Sale')).toBeVisible()

    // Search and add product
    await window.fill('input[placeholder*="barcode"]', 'PARA-500')
    await window.press('input[placeholder*="barcode"]', 'Enter')

    // Should add to cart
    await expect(window.locator('text=Paracetamol 500mg')).toBeVisible()

    // Set quantity
    await window.fill('input[type="number"]', '2')

    // Proceed to payment
    await window.click('button:has-text("Pay")')

    // Enter cash amount
    await window.fill('input[name="cashReceived"]', '1000')
    await window.click('button:has-text("Complete Sale")')

    // Should show receipt
    await expect(window.locator('text=Sale Completed')).toBeVisible()
    await expect(window.locator('text=Change: Rs. 900.00')).toBeVisible()

    await closeElectronApp(app)
  })

  test('should apply discount to sale', async ({ testDb }) => {
    const app = await launchElectronApp({ dbPath: testDb })
    const window = await getMainWindow(app)

    // Login and add product
    await window.fill('input[name="username"]', 'admin')
    await window.fill('input[name="password"]', 'password')
    await window.click('button[type="submit"]')
    await window.fill('input[placeholder*="barcode"]', 'PARA-500')
    await window.press('input[placeholder*="barcode"]', 'Enter')

    // Apply discount
    await window.click('button:has-text("Discount")')
    await window.fill('input[name="discountValue"]', '10')
    await window.click('input[value="percentage"]')
    await window.click('button:has-text("Apply")')

    // Verify discount applied
    const total = await window.locator('[data-testid="total-amount"]').textContent()
    expect(total).toContain('45.00') // 50 - 10% = 45

    await closeElectronApp(app)
  })

  test('should void a sale', async ({ testDb }) => {
    const app = await launchElectronApp({ dbPath: testDb })
    const window = await getMainWindow(app)

    // Complete a sale first
    await window.fill('input[name="username"]', 'admin')
    await window.fill('input[name="password"]', 'password')
    await window.click('button[type="submit"]')
    await window.fill('input[placeholder*="barcode"]', 'PARA-500')
    await window.press('input[placeholder*="barcode"]', 'Enter')
    await window.click('button:has-text("Pay")')
    await window.fill('input[name="cashReceived"]', '100')
    await window.click('button:has-text("Complete Sale")')

    // Navigate to sales history
    await window.click('button:has-text("Sales")')

    // Void the sale
    await window.click('button:has-text("Void"):first')
    await window.fill('textarea[name="voidReason"]', 'Customer changed mind')
    await window.click('button:has-text("Confirm Void")')

    // Verify void status
    await expect(window.locator('text=Voided')).toBeVisible()

    await closeElectronApp(app)
  })
})
