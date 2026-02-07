import { defineConfig, devices } from '@playwright/test'

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
