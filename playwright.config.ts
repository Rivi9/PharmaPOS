import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // Electron can't run multiple instances in parallel
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Must be 1 for Electron tests
  // `html` alone opens a browser and blocks CI; list gives readable output.
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  // Each test cold-starts Electron, walks the setup wizard and signs in, which
  // costs ~20s before the assertions even begin.
  timeout: 120_000,
  expect: {
    timeout: 10_000
  },
  // No `devices` entry: these drive Electron via `_electron.launch()`, not a
  // browser, so a Desktop Chrome descriptor only misleads. Nothing here needs
  // `npx playwright install` either.
  projects: [{ name: 'electron' }]
})
