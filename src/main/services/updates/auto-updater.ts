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
