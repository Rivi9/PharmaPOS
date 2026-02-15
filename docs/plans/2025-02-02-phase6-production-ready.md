# Phase 6: Production Ready Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete production-ready features including first-run setup wizard, comprehensive error handling and logging, end-to-end testing infrastructure, Windows installer build, auto-update mechanism, and user documentation.

**Architecture:** Multi-step onboarding wizard with database initialization. Winston logger with file rotation and Sentry integration for error tracking. Playwright E2E tests with fixture isolation. Electron-builder for Windows installer with code signing. Electron-updater for automatic updates with GitHub releases.

**Tech Stack:** React 19, TypeScript, winston (logging), @sentry/electron (error tracking), playwright (E2E testing), electron-builder (packaging), electron-updater (auto-updates)

---

## Part 1: First-Run Setup & Onboarding

### Task 1: Create First-Run Setup Wizard

**Files:**
- Create: `src/renderer/src/pages/SetupWizardPage.tsx`
- Create: `src/renderer/src/components/setup/WizardSteps.tsx`
- Create: `src/main/services/setup/first-run.ts`

**Step 1: Create first-run detection service**

```typescript
// src/main/services/setup/first-run.ts
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getDatabase } from '../../db'

const SETUP_COMPLETE_FLAG = path.join(app.getPath('userData'), '.setup-complete')

/**
 * Check if this is the first run
 */
export function isFirstRun(): boolean {
  return !fs.existsSync(SETUP_COMPLETE_FLAG)
}

/**
 * Mark setup as complete
 */
export function markSetupComplete(): void {
  fs.writeFileSync(SETUP_COMPLETE_FLAG, new Date().toISOString())
}

/**
 * Initialize database with default data
 */
export function initializeDatabase(data: {
  businessName: string
  businessAddress?: string
  businessPhone?: string
  currency?: string
  adminUsername: string
  adminPassword: string
  adminFullName: string
}): void {
  const db = getDatabase()

  // Update business settings
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
    data.businessName,
    'business_name'
  )

  if (data.businessAddress) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      data.businessAddress,
      'business_address'
    )
  }

  if (data.businessPhone) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      data.businessPhone,
      'business_phone'
    )
  }

  if (data.currency) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(
      data.currency,
      'currency_symbol'
    )
  }

  // Note: Admin user creation is handled by user-management service
  // This is just for database setup
}

/**
 * Reset setup (for testing purposes)
 */
export function resetSetup(): void {
  if (fs.existsSync(SETUP_COMPLETE_FLAG)) {
    fs.unlinkSync(SETUP_COMPLETE_FLAG)
  }
}
```

**Step 2: Create setup wizard page**

```typescript
// src/renderer/src/pages/SetupWizardPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { CheckCircle2, Store, User, Settings } from 'lucide-react'

export function SetupWizardPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState({
    businessName: '',
    businessAddress: '',
    businessPhone: '',
    currency: 'Rs.',
    adminUsername: '',
    adminPassword: '',
    adminFullName: ''
  })

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = async () => {
    try {
      // Create admin user
      await window.electron.users.create({
        username: formData.adminUsername,
        password: formData.adminPassword,
        full_name: formData.adminFullName,
        role: 'admin'
      })

      // Initialize database settings
      await window.electron.setup.initialize(formData)

      // Mark setup complete
      await window.electron.setup.complete()

      // Navigate to login
      navigate('/login')
    } catch (error: any) {
      alert(`Setup failed: ${error.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`h-2 w-16 rounded-full ${
                    step <= currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              Step {currentStep} of 3
            </span>
          </div>
          <CardTitle className="text-2xl">Welcome to PharmaPOS</CardTitle>
          <CardDescription>Let's set up your pharmacy management system</CardDescription>
        </CardHeader>

        <CardContent>
          {/* Step 1: Business Information */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Store className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-medium">Business Information</h3>
              </div>

              <div>
                <Label htmlFor="businessName">Business Name *</Label>
                <Input
                  id="businessName"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  placeholder="My Pharmacy"
                  required
                />
              </div>

              <div>
                <Label htmlFor="businessAddress">Address</Label>
                <Input
                  id="businessAddress"
                  value={formData.businessAddress}
                  onChange={(e) => setFormData({ ...formData, businessAddress: e.target.value })}
                  placeholder="123 Main Street, City"
                />
              </div>

              <div>
                <Label htmlFor="businessPhone">Phone Number</Label>
                <Input
                  id="businessPhone"
                  value={formData.businessPhone}
                  onChange={(e) => setFormData({ ...formData, businessPhone: e.target.value })}
                  placeholder="+1 234 567 8900"
                />
              </div>

              <div>
                <Label htmlFor="currency">Currency Symbol</Label>
                <Input
                  id="currency"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  placeholder="Rs."
                />
              </div>
            </div>
          )}

          {/* Step 2: Admin Account */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-medium">Create Admin Account</h3>
              </div>

              <div>
                <Label htmlFor="adminFullName">Full Name *</Label>
                <Input
                  id="adminFullName"
                  value={formData.adminFullName}
                  onChange={(e) => setFormData({ ...formData, adminFullName: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <Label htmlFor="adminUsername">Username *</Label>
                <Input
                  id="adminUsername"
                  value={formData.adminUsername}
                  onChange={(e) => setFormData({ ...formData, adminUsername: e.target.value })}
                  placeholder="admin"
                  required
                />
              </div>

              <div>
                <Label htmlFor="adminPassword">Password *</Label>
                <Input
                  id="adminPassword"
                  type="password"
                  value={formData.adminPassword}
                  onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                  placeholder="Enter a strong password"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Choose a strong password with at least 8 characters
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Review & Complete */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-medium">Review & Complete</h3>
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div>
                  <p className="text-sm font-medium">Business Name</p>
                  <p className="text-sm text-muted-foreground">{formData.businessName}</p>
                </div>
                {formData.businessAddress && (
                  <div>
                    <p className="text-sm font-medium">Address</p>
                    <p className="text-sm text-muted-foreground">{formData.businessAddress}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">Admin User</p>
                  <p className="text-sm text-muted-foreground">
                    {formData.adminFullName} (@{formData.adminUsername})
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Ready to start!</strong> Click "Complete Setup" to initialize your
                  pharmacy management system.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-2 mt-6">
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
            )}
            {currentStep < 3 ? (
              <Button
                onClick={handleNext}
                disabled={
                  currentStep === 1
                    ? !formData.businessName
                    : !formData.adminUsername || !formData.adminPassword || !formData.adminFullName
                }
                className="ml-auto"
              >
                Next
              </Button>
            ) : (
              <Button onClick={handleComplete} className="ml-auto">
                Complete Setup
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 3: Add setup IPC handlers**

```typescript
// Add to src/main/ipc/channels.ts
SETUP_IS_FIRST_RUN: 'setup:is-first-run',
SETUP_INITIALIZE: 'setup:initialize',
SETUP_COMPLETE: 'setup:complete',

// Create src/main/ipc/setup-handlers.ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { isFirstRun, initializeDatabase, markSetupComplete } from '../services/setup/first-run'

export function registerSetupHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETUP_IS_FIRST_RUN, () => {
    return isFirstRun()
  })

  ipcMain.handle(IPC_CHANNELS.SETUP_INITIALIZE, (_event, data) => {
    initializeDatabase(data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.SETUP_COMPLETE, () => {
    markSetupComplete()
    return { success: true }
  })
}

// Add to preload
setup: {
  isFirstRun: () => ipcRenderer.invoke(IPC_CHANNELS.SETUP_IS_FIRST_RUN),
  initialize: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SETUP_INITIALIZE, data),
  complete: () => ipcRenderer.invoke(IPC_CHANNELS.SETUP_COMPLETE)
}
```

**Step 4: Update App.tsx to check first run**

```typescript
// Add to src/renderer/src/App.tsx
import { useEffect, useState } from 'react'
import { SetupWizardPage } from './pages/SetupWizardPage'

function App() {
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null)

  useEffect(() => {
    const checkFirstRun = async () => {
      const firstRun = await window.electron.setup.isFirstRun()
      setIsFirstRun(firstRun)
    }
    checkFirstRun()
  }, [])

  if (isFirstRun === null) {
    return <div>Loading...</div>
  }

  if (isFirstRun) {
    return <SetupWizardPage />
  }

  return (
    // ... regular app routes
  )
}
```

**Step 5: Commit**

```bash
git add src/main/services/setup/first-run.ts src/renderer/src/pages/SetupWizardPage.tsx src/main/ipc/setup-handlers.ts src/main/ipc/channels.ts src/preload/index.ts src/renderer/src/App.tsx
git commit -m "feat: add first-run setup wizard"
```

---

### Task 2: Create Error Handling & Logging Service

**Files:**
- Create: `src/main/services/logging/logger.ts`
- Create: `src/main/services/logging/error-handler.ts`

**Step 1: Install logging dependencies**

Run: `npm install winston winston-daily-rotate-file @sentry/electron`

**Step 2: Create Winston logger**

```typescript
// src/main/services/logging/logger.ts
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import { app } from 'electron'
import path from 'path'

const logsDir = path.join(app.getPath('userData'), 'logs')

/**
 * Create Winston logger instance
 */
export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'pharmapos' },
  transports: [
    // Error logs
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    }),
    // Combined logs
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true
    })
  ]
})

// Console output in development
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  )
}

/**
 * Log levels:
 * - error: 0
 * - warn: 1
 * - info: 2
 * - http: 3
 * - verbose: 4
 * - debug: 5
 * - silly: 6
 */

export function logError(message: string, error?: Error | unknown, context?: Record<string, any>): void {
  logger.error(message, {
    error: error instanceof Error ? {
      message: error.message,
      stack: error.stack,
      name: error.name
    } : error,
    ...context
  })
}

export function logWarning(message: string, context?: Record<string, any>): void {
  logger.warn(message, context)
}

export function logInfo(message: string, context?: Record<string, any>): void {
  logger.info(message, context)
}

export function logDebug(message: string, context?: Record<string, any>): void {
  logger.debug(message, context)
}
```

**Step 3: Create error handler with Sentry integration**

```typescript
// src/main/services/logging/error-handler.ts
import * as Sentry from '@sentry/electron/main'
import { app, dialog } from 'electron'
import { logger, logError } from './logger'

let isInitialized = false

/**
 * Initialize Sentry error tracking
 */
export function initializeErrorTracking(): void {
  if (isInitialized) return

  // Only initialize Sentry in production
  if (process.env.NODE_ENV === 'production') {
    Sentry.init({
      dsn: process.env.SENTRY_DSN, // Set in environment or build config
      environment: process.env.NODE_ENV,
      release: app.getVersion(),
      beforeSend(event) {
        // Don't send events if user hasn't opted in to error reporting
        // This should be checked against settings
        return event
      }
    })
  }

  isInitialized = true
}

/**
 * Handle uncaught exceptions
 */
export function setupGlobalErrorHandlers(): void {
  // Main process errors
  process.on('uncaughtException', (error) => {
    logError('Uncaught Exception', error, { fatal: true })

    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(error)
    }

    // Show error dialog
    dialog.showErrorBox(
      'Application Error',
      `An unexpected error occurred:\n\n${error.message}\n\nThe application will continue running, but some features may not work correctly.`
    )
  })

  process.on('unhandledRejection', (reason, promise) => {
    logError('Unhandled Promise Rejection', reason as Error, { promise: String(promise) })

    if (process.env.NODE_ENV === 'production') {
      Sentry.captureException(reason)
    }
  })
}

/**
 * Report error to tracking service
 */
export function reportError(error: Error, context?: Record<string, any>): void {
  logError('Reported Error', error, context)

  if (process.env.NODE_ENV === 'production') {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext('additional', context)
      }
      Sentry.captureException(error)
    })
  }
}

/**
 * Set user context for error tracking
 */
export function setErrorTrackingUser(user: { id: string; username: string }): void {
  if (process.env.NODE_ENV === 'production') {
    Sentry.setUser({
      id: user.id,
      username: user.username
    })
  }
}

/**
 * Clear user context
 */
export function clearErrorTrackingUser(): void {
  if (process.env.NODE_ENV === 'production') {
    Sentry.setUser(null)
  }
}
```

**Step 4: Initialize error handling in main process**

```typescript
// Add to src/main/index.ts at the top
import { initializeErrorTracking, setupGlobalErrorHandlers } from './services/logging/error-handler'
import { logInfo } from './services/logging/logger'

// Initialize error tracking
initializeErrorTracking()
setupGlobalErrorHandlers()

// Log app start
logInfo('Application starting', {
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch
})
```

**Step 5: Commit**

```bash
git add src/main/services/logging/logger.ts src/main/services/logging/error-handler.ts src/main/index.ts package.json package-lock.json
git commit -m "feat: add comprehensive error handling and logging"
```

---

## Part 1 Complete - Setup & Error Handling

Tasks 1-2 establish onboarding and error tracking:
- ✅ First-run setup wizard with multi-step form
- ✅ Database initialization with business settings
- ✅ Winston logger with daily file rotation
- ✅ Sentry error tracking integration
- ✅ Global error handlers

**Next:** Part 2 will cover E2E testing infrastructure

---

_Plan Part 1 completed: 2025-02-02_

## Part 2: E2E Testing Infrastructure

### Task 3: Setup Playwright E2E Testing

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/database.ts`
- Create: `tests/e2e/setup.ts`

**Step 1: Install Playwright**

Run: `npm install -D @playwright/test playwright`

**Step 2: Create Playwright config for Electron**

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Electron can't run multiple instances in parallel
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Must be 1 for Electron tests
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  timeout: 30000,
  expect: {
    timeout: 5000
  },
  projects: [
    {
      name: 'electron',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
})
```

**Step 3: Create database fixture for test isolation**

```typescript
// tests/e2e/fixtures/database.ts
import { test as base } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

/**
 * Custom fixture that provides isolated test database
 */
export const test = base.extend<{ testDb: string }>({
  testDb: async ({}, use) => {
    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../temp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Create unique test database
    const testDbPath = path.join(tempDir, `test-${Date.now()}.db`)

    // Initialize database with schema
    const db = new Database(testDbPath)
    const schemaPath = path.join(__dirname, '../../../src/main/db/schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf-8')
    db.exec(schema)
    db.close()

    // Provide database path to test
    await use(testDbPath)

    // Cleanup after test
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
  }
})

export { expect } from '@playwright/test'
```

**Step 4: Create Electron test helpers**

```typescript
// tests/e2e/setup.ts
import { _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'path'

/**
 * Launch Electron app for testing
 */
export async function launchElectronApp(options?: {
  dbPath?: string
}): Promise<ElectronApplication> {
  const env = { ...process.env }

  if (options?.dbPath) {
    env.TEST_DB_PATH = options.dbPath
  }

  const electronPath = require('electron')
  const appPath = path.join(__dirname, '../../out/main/index.js')

  const app = await electron.launch({
    executablePath: electronPath as any,
    args: [appPath],
    env
  })

  return app
}

/**
 * Get main window from Electron app
 */
export async function getMainWindow(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  return window
}

/**
 * Close Electron app
 */
export async function closeElectronApp(app: ElectronApplication): Promise<void> {
  await app.close()
}
```

**Step 5: Update main process to use test database**

```typescript
// Add to src/main/db/index.ts
import { app } from 'electron'
import path from 'path'

function getDatabasePath(): string {
  // Use test database in test environment
  if (process.env.TEST_DB_PATH) {
    return process.env.TEST_DB_PATH
  }

  return path.join(app.getPath('userData'), 'pharmapos.db')
}
```

**Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e/fixtures/database.ts tests/e2e/setup.ts src/main/db/index.ts package.json package-lock.json
git commit -m "feat: add Playwright E2E testing infrastructure"
```

---

### Task 4: Create Core E2E Tests

**Files:**
- Create: `tests/e2e/auth.spec.ts`
- Create: `tests/e2e/pos-workflow.spec.ts`
- Create: `tests/e2e/inventory.spec.ts`

**Step 1: Create authentication flow tests**

```typescript
// tests/e2e/auth.spec.ts
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
```

**Step 2: Create POS workflow tests**

```typescript
// tests/e2e/pos-workflow.spec.ts
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
```

**Step 3: Create inventory management tests**

```typescript
// tests/e2e/inventory.spec.ts
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
```

**Step 4: Add test scripts to package.json**

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

**Step 5: Run tests to verify setup**

Run: `npm run test:e2e`
Expected: All tests should pass

**Step 6: Commit**

```bash
git add tests/e2e/auth.spec.ts tests/e2e/pos-workflow.spec.ts tests/e2e/inventory.spec.ts package.json
git commit -m "feat: add E2E test suites for auth, POS, and inventory"
```

---

## Part 2 Complete - E2E Testing

Tasks 3-4 establish comprehensive E2E testing:
- ✅ Playwright configuration for Electron
- ✅ Database fixtures for test isolation
- ✅ Test helpers for launching Electron app
- ✅ Authentication flow tests
- ✅ POS workflow tests (sales, discounts, voids)
- ✅ Inventory management tests

**Next:** Part 3 will cover Windows installer and auto-updates

---

## Part 3: Windows Installer & Auto-Updates

### Task 5: Configure electron-builder for Windows

**Files:**
- Create: `electron-builder.yml`
- Modify: `package.json`

**Step 1: Install electron-builder**

Run: `npm install -D electron-builder`

**Step 2: Create electron-builder configuration**

```yaml
# electron-builder.yml
appId: com.pharmapos.app
productName: PharmaPOS
copyright: Copyright © 2025 PharmaPOS

directories:
  buildResources: build
  output: dist

files:
  - out/**/*
  - package.json

extraResources:
  - resources/**

win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.ico
  artifactName: ${productName}-Setup-${version}.${ext}

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: always
  createStartMenuShortcut: true
  shortcutName: ${productName}
  installerIcon: build/icon.ico
  uninstallerIcon: build/icon.ico
  license: LICENSE
  displayLanguageSelector: false
  installerHeader: build/installerHeader.bmp
  installerSidebar: build/installerSidebar.bmp

publish:
  provider: github
  owner: your-org
  repo: pharmapos
  releaseType: release
```

**Step 3: Update package.json**

```json
{
  "main": "out/main/index.js",
  "scripts": {
    "build": "vite build && electron-builder build --win --publish never",
    "build:publish": "vite build && electron-builder build --win --publish always",
    "release": "vite build && electron-builder build --win --publish always"
  },
  "build": {
    "extends": "electron-builder.yml"
  }
}
```

**Step 4: Create build resources**

```
build/
├── icon.ico (256x256 app icon)
├── installerHeader.bmp (150x57 installer header)
└── installerSidebar.bmp (164x314 installer sidebar)
```

Note: Icon files should be created by designer. Placeholder icons acceptable for testing.

**Step 5: Create LICENSE file**

```
MIT License

Copyright (c) 2025 PharmaPOS

[Standard MIT license text]
```

**Step 6: Test build locally**

Run: `npm run build`
Expected: Creates installer in `dist/` directory

**Step 7: Commit**

```bash
git add electron-builder.yml package.json build/ LICENSE
git commit -m "feat: add electron-builder configuration for Windows installer"
```

---

### Task 6: Setup Code Signing for Windows

**Files:**
- Create: `.env.local` (gitignored)
- Modify: `electron-builder.yml`

**Step 1: Obtain code signing certificate**

For development:
- Create self-signed certificate for testing
- For production: Purchase from trusted CA (DigiCert, Sectigo, etc.)

```bash
# Create self-signed certificate (Windows only, for testing)
# Run in PowerShell as Administrator:
New-SelfSignedCertificate -Subject "CN=PharmaPOS" -Type CodeSigning -CertStoreLocation Cert:\CurrentUser\My

# Export certificate
# Note: In production, use proper certificate from CA
```

**Step 2: Update electron-builder.yml for signing**

```yaml
# Add to electron-builder.yml
win:
  target:
    - target: nsis
      arch:
        - x64
  icon: build/icon.ico
  artifactName: ${productName}-Setup-${version}.${ext}
  certificateFile: ${env.CSC_LINK}
  certificatePassword: ${env.CSC_KEY_PASSWORD}
  signingHashAlgorithms:
    - sha256
  sign: ./scripts/sign.js # Optional custom signing script
```

**Step 3: Create environment file for credentials**

```bash
# .env.local (DO NOT COMMIT)
CSC_LINK=path/to/certificate.pfx
CSC_KEY_PASSWORD=your-certificate-password
GH_TOKEN=your-github-personal-access-token
```

**Step 4: Update .gitignore**

```
# .gitignore
.env.local
*.pfx
*.p12
dist/
```

**Step 5: Document signing process**

```markdown
# docs/BUILDING.md

## Code Signing

### Development
1. Create self-signed certificate (Windows only)
2. Set CSC_LINK and CSC_KEY_PASSWORD in .env.local

### Production
1. Purchase code signing certificate from trusted CA
2. Install certificate to build machine
3. Set environment variables in CI/CD:
   - CSC_LINK: Path to .pfx certificate
   - CSC_KEY_PASSWORD: Certificate password
   - GH_TOKEN: GitHub token for publishing releases

### Building Signed Installer
```bash
npm run build
```

Installer will be signed automatically if certificate is configured.
```

**Step 6: Commit**

```bash
git add electron-builder.yml .gitignore docs/BUILDING.md
git commit -m "feat: add code signing configuration"
```

---

### Task 7: Implement Auto-Update Mechanism

**Files:**
- Create: `src/main/services/updates/auto-updater.ts`
- Create: `src/renderer/src/components/UpdateNotification.tsx`

**Step 1: Install electron-updater**

Run: `npm install electron-updater`

**Step 2: Create auto-updater service**

```typescript
// src/main/services/updates/auto-updater.ts
import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow } from 'electron'
import { logger, logInfo, logError } from '../logging/logger'

let mainWindow: BrowserWindow | null = null

/**
 * Initialize auto-updater
 */
export function initializeAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  // Configure updater
  autoUpdater.logger = logger
  autoUpdater.autoDownload = false // Manual download
  autoUpdater.autoInstallOnAppQuit = true

  // Update events
  autoUpdater.on('checking-for-update', () => {
    logInfo('Checking for updates...')
  })

  autoUpdater.on('update-available', (info) => {
    logInfo('Update available', { version: info.version })
    sendUpdateStatus('update-available', info)
  })

  autoUpdater.on('update-not-available', (info) => {
    logInfo('Update not available', { version: info.version })
  })

  autoUpdater.on('error', (error) => {
    logError('Error in auto-updater', error)
    sendUpdateStatus('update-error', { message: error.message })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus('download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    logInfo('Update downloaded', { version: info.version })
    sendUpdateStatus('update-downloaded', info)
  })

  // Check for updates after app is ready
  if (process.env.NODE_ENV === 'production') {
    setTimeout(() => {
      checkForUpdates()
    }, 5000) // Wait 5 seconds after startup
  }
}

/**
 * Check for updates manually
 */
export function checkForUpdates(): void {
  if (process.env.NODE_ENV !== 'production') {
    logInfo('Update check skipped (development mode)')
    return
  }

  autoUpdater.checkForUpdates()
}

/**
 * Download update
 */
export function downloadUpdate(): void {
  autoUpdater.downloadUpdate()
}

/**
 * Install update and restart
 */
export function installUpdate(): void {
  autoUpdater.quitAndInstall(false, true)
}

/**
 * Send update status to renderer
 */
function sendUpdateStatus(event: string, data?: any): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { event, data })
  }
}
```

**Step 3: Create update notification component**

```typescript
// src/renderer/src/components/UpdateNotification.tsx
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Download, RefreshCw } from 'lucide-react'

interface UpdateInfo {
  version: string
  releaseNotes?: string
}

interface DownloadProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export function UpdateNotification(): React.JSX.Element | null {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)

  useEffect(() => {
    // Listen for update events
    const handleUpdateStatus = (_event: any, status: { event: string; data: any }) => {
      switch (status.event) {
        case 'update-available':
          setUpdateAvailable(true)
          setUpdateInfo(status.data)
          break

        case 'download-progress':
          setDownloading(true)
          setDownloadProgress(status.data)
          break

        case 'update-downloaded':
          setDownloading(false)
          setUpdateDownloaded(true)
          break

        case 'update-error':
          setDownloading(false)
          alert(`Update error: ${status.data.message}`)
          break
      }
    }

    window.electron.ipcRenderer.on('update-status', handleUpdateStatus)

    return () => {
      window.electron.ipcRenderer.removeListener('update-status', handleUpdateStatus)
    }
  }, [])

  const handleDownload = () => {
    window.electron.updates.download()
  }

  const handleInstall = () => {
    if (confirm('The application will restart to install the update. Continue?')) {
      window.electron.updates.install()
    }
  }

  if (!updateAvailable) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 z-50">
      <Card className="shadow-lg border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Update Available
          </CardTitle>
          <CardDescription>
            Version {updateInfo?.version} is ready to install
          </CardDescription>
        </CardHeader>

        <CardContent>
          {!updateDownloaded ? (
            <>
              {downloading && downloadProgress ? (
                <div className="space-y-2">
                  <Progress value={downloadProgress.percent} />
                  <p className="text-xs text-muted-foreground text-center">
                    {downloadProgress.percent.toFixed(0)}% - {formatBytes(downloadProgress.bytesPerSecond)}/s
                  </p>
                </div>
              ) : (
                <Button onClick={handleDownload} className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Download Update
                </Button>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Update downloaded and ready to install
              </p>
              <Button onClick={handleInstall} className="w-full">
                Install & Restart
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
```

**Step 4: Add update IPC handlers**

```typescript
// Add to src/main/ipc/channels.ts
UPDATES_CHECK: 'updates:check',
UPDATES_DOWNLOAD: 'updates:download',
UPDATES_INSTALL: 'updates:install',

// Create src/main/ipc/update-handlers.ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { checkForUpdates, downloadUpdate, installUpdate } from '../services/updates/auto-updater'

export function registerUpdateHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.UPDATES_CHECK, () => {
    checkForUpdates()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.UPDATES_DOWNLOAD, () => {
    downloadUpdate()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.UPDATES_INSTALL, () => {
    installUpdate()
    return { success: true }
  })
}

// Add to preload
updates: {
  check: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_CHECK),
  download: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_DOWNLOAD),
  install: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATES_INSTALL)
}
```

**Step 5: Initialize auto-updater in main process**

```typescript
// Add to src/main/index.ts
import { initializeAutoUpdater } from './services/updates/auto-updater'

app.whenReady().then(() => {
  createWindow()

  if (mainWindow) {
    initializeAutoUpdater(mainWindow)
  }
})
```

**Step 6: Add update notification to App**

```typescript
// Add to src/renderer/src/App.tsx
import { UpdateNotification } from './components/UpdateNotification'

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <UpdateNotification />
    </>
  )
}
```

**Step 7: Commit**

```bash
git add src/main/services/updates/auto-updater.ts src/renderer/src/components/UpdateNotification.tsx src/main/ipc/update-handlers.ts src/main/ipc/channels.ts src/preload/index.ts src/main/index.ts src/renderer/src/App.tsx package.json package-lock.json
git commit -m "feat: implement auto-update mechanism with electron-updater"
```

---

### Task 8: Setup GitHub Releases & Documentation

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `docs/DEPLOYMENT.md`
- Modify: `README.md`

**Step 1: Create GitHub Actions workflow for releases**

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: windows-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build:publish
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: release-artifacts
          path: dist/*.exe

      - name: Create Release
        uses: softprops/action-gh-release@v1
        with:
          files: dist/*.exe
          generate_release_notes: true
          draft: false
          prerelease: false
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Step 2: Create deployment documentation**

```markdown
# docs/DEPLOYMENT.md

# PharmaPOS Deployment Guide

## Prerequisites

- Node.js 18 or higher
- Windows 10 or higher (for building Windows installer)
- Code signing certificate (production only)
- GitHub personal access token with repo permissions

## Building for Production

### 1. Prepare Environment

```bash
# Install dependencies
npm ci

# Create .env.local with credentials
CSC_LINK=path/to/certificate.pfx
CSC_KEY_PASSWORD=certificate-password
GH_TOKEN=github-token
```

### 2. Build Installer

```bash
# Build without publishing
npm run build

# Build and publish to GitHub releases
npm run release
```

### 3. Test Installer

1. Install the generated .exe from `dist/` directory
2. Run the application and complete first-run setup
3. Verify all features work correctly
4. Test auto-update mechanism (with test release)

## GitHub Releases

### Creating a Release

1. Update version in `package.json`
2. Commit changes: `git commit -m "chore: bump version to X.Y.Z"`
3. Create and push tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. GitHub Actions will automatically build and create release

### Manual Release

```bash
# Build and publish
npm run release

# Installer will be uploaded to GitHub releases
```

## Auto-Update Configuration

Auto-updates work through GitHub releases:

1. Application checks for updates on startup (production only)
2. Downloads latest release from GitHub
3. Prompts user to install and restart
4. Update installed on next app quit

### Update Channels

- `latest`: Stable releases (default)
- `beta`: Pre-release versions (set in electron-builder.yml)

## Code Signing

### Development

Use self-signed certificate for testing:

```powershell
New-SelfSignedCertificate -Subject "CN=PharmaPOS" -Type CodeSigning -CertStoreLocation Cert:\CurrentUser\My
```

### Production

1. Purchase certificate from trusted CA (DigiCert, Sectigo)
2. Install certificate to build machine
3. Set CSC_LINK and CSC_KEY_PASSWORD in CI/CD secrets

## CI/CD Setup

### GitHub Secrets

Add these secrets to repository settings:

- `CSC_LINK`: Base64-encoded certificate (or path in runner)
- `CSC_KEY_PASSWORD`: Certificate password
- `GH_TOKEN`: GitHub token (auto-provided by Actions)

### Triggering Builds

Builds trigger automatically on version tags:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Troubleshooting

### Build Fails

- Verify Node.js version (18+)
- Check certificate is valid
- Ensure all dependencies installed

### Auto-Update Not Working

- Verify GH_TOKEN has repo permissions
- Check GitHub release exists
- Confirm production build (not dev)

### Installer Unsigned

- Verify CSC_LINK and CSC_KEY_PASSWORD set
- Check certificate hasn't expired
- Confirm certificate is code-signing type

## Distribution

### Direct Download

Users download installer from GitHub releases page.

### Enterprise Deployment

Deploy via Group Policy, SCCM, or Intune:

```powershell
# Silent install
PharmaPOS-Setup-1.0.0.exe /S

# Custom install directory
PharmaPOS-Setup-1.0.0.exe /S /D=C:\CustomPath
```
```

**Step 3: Update README with build instructions**

```markdown
# Add to README.md

## Building

### Development

```bash
npm install
npm run dev
```

### Production

```bash
npm run build
```

Installer will be created in `dist/` directory.

See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

## Releases

Releases are automatically created when version tags are pushed:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Download latest release from [GitHub Releases](https://github.com/your-org/pharmapos/releases).
```

**Step 4: Test release workflow**

1. Update version in package.json to 1.0.0
2. Create tag: `git tag v1.0.0`
3. Push tag: `git push origin v1.0.0`
4. Verify GitHub Actions builds and creates release
5. Test installer download and installation
6. Test auto-update mechanism

**Step 5: Commit**

```bash
git add .github/workflows/release.yml docs/DEPLOYMENT.md README.md
git commit -m "feat: add GitHub releases workflow and deployment docs"
```

---

## Part 3 Complete - Installer & Auto-Updates

Tasks 5-8 establish production distribution:
- ✅ electron-builder configuration for Windows
- ✅ NSIS installer with custom branding
- ✅ Code signing setup (self-signed for dev, CA for prod)
- ✅ Auto-update mechanism with electron-updater
- ✅ GitHub Actions workflow for automated releases
- ✅ Deployment documentation

---

## Phase 6 Complete - Production Ready

All 8 tasks completed:

**Part 1: Setup & Error Handling**
- ✅ First-run setup wizard with database initialization
- ✅ Winston logger with daily file rotation
- ✅ Sentry error tracking integration

**Part 2: E2E Testing**
- ✅ Playwright testing infrastructure
- ✅ Authentication, POS, and inventory test suites

**Part 3: Installer & Auto-Updates**
- ✅ Windows installer with electron-builder
- ✅ Code signing configuration
- ✅ Auto-update mechanism
- ✅ GitHub releases automation

**Project Status:** PharmaPOS is now production-ready with comprehensive onboarding, error tracking, testing, and automated deployment.

---

_Phase 6 implementation plan completed: 2025-02-02_
