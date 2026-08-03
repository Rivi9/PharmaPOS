import { app, autoUpdater } from 'electron'
import { updateElectronApp, UpdateSourceType } from 'update-electron-app'
import { BrowserWindow } from 'electron'
import { logInfo, logError } from '../logging/logger'
import { confirmClose, runShutdownCleanup } from '../../shutdown'

let mainWindow: BrowserWindow | null = null

/**
 * Initialize auto-updater using Squirrel + update-electron-app (GitHub releases)
 */
export function initializeAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  if (!app.isPackaged) {
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
  if (!app.isPackaged) {
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
 * Quit and install the downloaded update.
 *
 * Two things have to happen before `quitAndInstall`. The End-Shift close guard
 * must be released, or `before-quit` calls `preventDefault()` and re-shows the
 * window while Squirrel has already launched the replacement — two processes,
 * one WAL database, two receipt-number generators. And the database has to be
 * closed here rather than in the `before-quit` cleanup, because Squirrel starts
 * the incoming process as soon as this one exits and we do not get to choose
 * the order those two race in.
 */
export function installUpdate(): void {
  logInfo('Installing update — quitting')
  confirmClose()
  runShutdownCleanup()
  autoUpdater.quitAndInstall()
}

function sendUpdateStatus(event: string, data?: Record<string, unknown>): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { event, data })
  }
}
