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
