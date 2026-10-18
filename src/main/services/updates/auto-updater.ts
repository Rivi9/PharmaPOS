import { app, autoUpdater } from 'electron'
import { updateElectronApp, UpdateSourceType } from 'update-electron-app'
import { BrowserWindow } from 'electron'
import { logInfo, logError } from '../logging/logger'
import { confirmClose, runShutdownCleanup } from '../../shutdown'
import { getDatabase } from '../database'

const UPDATE_REPO = 'Rivi9/pharmapos'

let mainWindow: BrowserWindow | null = null
let feedConfigured = false

export type UpdateCheckResult =
  | { status: 'available'; currentVersion: string }
  | { status: 'up-to-date'; currentVersion: string }
  | { status: 'error'; currentVersion: string; message: string }
  | { status: 'unavailable'; currentVersion: string; message: string }

/** Set while a check started from Settings is in flight; that check reports its own result. */
let pendingManualCheck: Promise<UpdateCheckResult> | null = null

/**
 * Automatic checks are opt-in: an absent setting means off.
 *
 * They used to run unconditionally every hour against update.electronjs.org.
 * Until that service is set up for this repo every check fails, and each
 * failure put an "Update failed" card on the till.
 */
function autoUpdateEnabled(): boolean {
  try {
    const row = getDatabase()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('auto_update_enabled') as { value: string } | undefined
    return row?.value === '1'
  } catch {
    return false
  }
}

/**
 * Initialize auto-updater using Squirrel + update-electron-app (GitHub releases)
 */
export function initializeAutoUpdater(window: BrowserWindow): void {
  mainWindow = window

  if (!app.isPackaged) {
    logInfo('Auto-updater skipped (development mode)')
    return
  }

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
    // A check started from Settings shows its error there instead.
    if (!pendingManualCheck) sendUpdateStatus('update-error', { message: error.message })
  })

  // Squirrel downloads as soon as an update is found and fires this when done.
  // The renderer was previously told "downloaded" only from before-quit-for-update,
  // which fires after quitAndInstall — so Install & Restart could never appear.
  autoUpdater.on('update-downloaded', () => {
    logInfo('Update downloaded')
    sendUpdateStatus('update-downloaded')
  })

  autoUpdater.on('before-quit-for-update', () => {
    logInfo('Quitting to install update')
  })

  if (!autoUpdateEnabled()) {
    logInfo('Automatic update checks are off — check manually from Settings')
    return
  }

  // Wire up GitHub releases as the update source (Squirrel protocol)
  updateElectronApp({
    updateSource: {
      type: UpdateSourceType.ElectronPublicUpdateService,
      repo: UPDATE_REPO
    },
    updateInterval: '1 hour',
    notifyUser: false // handled via IPC above
  })
  feedConfigured = true
}

/**
 * Point Squirrel at the same feed update-electron-app uses. Needed for a manual
 * check when automatic checks are off, because then nothing else has set it.
 */
function ensureFeedURL(): void {
  if (feedConfigured) return
  const platform = `${process.platform}-${process.arch}`
  autoUpdater.setFeedURL({
    url: `https://update.electronjs.org/${UPDATE_REPO}/${platform}/${app.getVersion()}`
  })
  feedConfigured = true
}

/**
 * Check for an update now (Squirrel also starts the download if one is found).
 * Resolves with the outcome so Settings can show it.
 */
export function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()

  if (!app.isPackaged) {
    logInfo('Update check skipped (development mode)')
    return Promise.resolve({
      status: 'unavailable',
      currentVersion,
      message: 'Updates can only be checked from the installed app.'
    })
  }

  if (pendingManualCheck) return pendingManualCheck

  const check = new Promise<UpdateCheckResult>((resolve) => {
    const onAvailable = (): void => done({ status: 'available', currentVersion })
    const onNotAvailable = (): void => done({ status: 'up-to-date', currentVersion })
    const onError = (error: Error): void =>
      done({ status: 'error', currentVersion, message: error.message })

    function done(result: UpdateCheckResult): void {
      autoUpdater.removeListener('update-available', onAvailable)
      autoUpdater.removeListener('update-not-available', onNotAvailable)
      autoUpdater.removeListener('error', onError)
      resolve(result)
    }

    autoUpdater.on('update-available', onAvailable)
    autoUpdater.on('update-not-available', onNotAvailable)
    autoUpdater.on('error', onError)

    try {
      ensureFeedURL()
      autoUpdater.checkForUpdates()
    } catch (error) {
      logError('Update check failed', error as Error)
      done({ status: 'error', currentVersion, message: (error as Error).message })
    }
  })

  // Cleared after the listeners above have run, so the global error listener
  // still sees the check as pending and leaves the error to Settings.
  pendingManualCheck = check
  void check.then(() => {
    if (pendingManualCheck === check) pendingManualCheck = null
  })
  return check
}

/**
 * Squirrel auto-downloads on checkForUpdates, so this just re-checks. Used by the
 * update card's Download / Try again button, so errors go back to that card
 * rather than through checkForUpdates(), which keeps them for Settings.
 */
export function downloadUpdate(): void {
  if (!app.isPackaged) return
  try {
    ensureFeedURL()
    autoUpdater.checkForUpdates()
  } catch (error) {
    logError('Update check failed', error as Error)
    sendUpdateStatus('update-error', { message: (error as Error).message })
  }
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
