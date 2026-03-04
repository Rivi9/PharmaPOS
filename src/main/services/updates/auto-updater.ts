import { autoUpdater } from 'electron'
import { updateElectronApp, UpdateSourceType } from 'update-electron-app'
import { BrowserWindow } from 'electron'
import { logInfo, logError } from '../logging/logger'

let mainWindow: BrowserWindow | null = null

/**
 * Initialize auto-updater using Squirrel + update-electron-app (GitHub releases)
 */
export function initializeAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  if (process.env.NODE_ENV !== 'production') {
    logInfo('Auto-updater skipped (development mode)')
    return
  }

  // Wire up GitHub releases as the update source (Squirrel protocol)
  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: 'Rivi9/pharmapos'
    },
    updateInterval: '1 hour',
    notifyUser: false // handled via IPC below
  })

  autoUpdater.on('checking-for-update', () => {
    logInfo('Checking for updates...')
  })

  autoUpdater.on('update-available', () => {
    logInfo('Update available')
    sendUpdateStatus('update-available')
  })

  autoUpdater.on('update-not-available', () => {
    logInfo('No update available')
  })

  autoUpdater.on('error', (error: Error) => {
    logError('Auto-updater error', error)
    sendUpdateStatus('update-error', { message: error.message })
  })

  // Squirrel fires this just before quitting to apply the downloaded update
  autoUpdater.on('before-quit-for-update', () => {
    logInfo('Update ready to install on next launch')
    sendUpdateStatus('update-downloaded')
  })
}

/**
 * Trigger an immediate update check (also starts download in Squirrel)
 */
export function checkForUpdates(): void {
  if (process.env.NODE_ENV !== 'production') {
    logInfo('Update check skipped (development mode)')
    return
  }
  autoUpdater.checkForUpdates()
}

/**
 * Squirrel auto-downloads on checkForUpdates — this is a no-op kept for IPC compatibility
 */
export function downloadUpdate(): void {
  checkForUpdates()
}

/**
 * Quit and install the downloaded update
 */
export function installUpdate(): void {
  autoUpdater.quitAndInstall()
}

function sendUpdateStatus(event: string, data?: Record<string, unknown>): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { event, data })
  }
}
