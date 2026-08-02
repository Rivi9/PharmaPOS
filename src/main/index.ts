import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join, basename, resolve } from 'path'
import { spawnSync } from 'child_process'
import { electronApp, optimizer } from '@electron-toolkit/utils'

// Forge Vite plugin injects these globals at build time
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string
declare const MAIN_WINDOW_VITE_NAME: string

interface CartData {
  items?: { name?: string }[]
  total?: number
  currency?: string
}

interface SaleData {
  total?: number
  change_given?: number
  currency?: string
}
import { initializeDatabase, closeDatabase, migrateDatabaseOnly } from './services/database'
import { registerIpcHandlers } from './ipc/handlers'
import { initializeAggregationJob } from './jobs/aggregation'
import { startBackupScheduler, stopBackupScheduler } from './services/backup/scheduler'
import { initializeErrorTracking, setupGlobalErrorHandlers } from './services/logging/error-handler'
import { logInfo, logError } from './services/logging/logger'
import { initializeAutoUpdater } from './services/updates/auto-updater'
import { IPC_CHANNELS } from './ipc/channels'
import * as poleDisplay from './services/pole-display'
import { getDatabase } from './services/database'

/**
 * Squirrel.Windows runs the installed executable with a `--squirrel-*` argument
 * at install, update and uninstall. Those runs must not open a window, and they
 * are the right moment to bring the database schema up to date — so the first
 * time the pharmacy opens the new version, the migration has already happened.
 *
 * Nothing handled these before, so the app briefly launched a full window during
 * every install and update.
 *
 * Returns true when this process was an installer hook and should exit.
 */
function handleSquirrelEvent(): boolean {
  if (process.platform !== 'win32' || process.argv.length < 2) return false

  const command = process.argv[1]
  if (!command.startsWith('--squirrel')) return false

  // Update.exe lives one directory above the versioned app folder.
  const updateExe = resolve(process.execPath, '..', '..', 'Update.exe')
  const exeName = basename(process.execPath)
  const runUpdate = (args: string[]): void => {
    try {
      spawnSync(updateExe, args, { timeout: 15_000 })
    } catch {
      /* shortcut management is best-effort — never block the install */
    }
  }

  switch (command) {
    case '--squirrel-install':
    case '--squirrel-updated':
      // Migrate first: a failure here must not stop the install, because the
      // startup path re-checks and will surface the error to the operator.
      try {
        migrateDatabaseOnly()
      } catch (error) {
        logError('Install-time database migration failed', error as Error)
      }
      runUpdate(['--createShortcut', exeName])
      break

    case '--squirrel-uninstall':
      // Never migrate on the way out.
      runUpdate(['--removeShortcut', exeName])
      break

    case '--squirrel-obsolete':
      break
  }

  // exit() rather than quit(): the End-Shift close guard must not trap an installer hook.
  app.exit(0)
  return true
}

// Runs before anything else boots. app.exit() terminates the process, so nothing
// below executes when this was an installer hook.
handleSquirrelEvent()

// Initialize error tracking
initializeErrorTracking()
setupGlobalErrorHandlers()

// Module-level flag: set to true once the user has confirmed close via EndShift.
// Shared between the 'close' event handler and the 'before-quit' backup layer.
let closingConfirmed = false
let mainWindowRef: BrowserWindow | null = null

// Log app start
logInfo('Application starting', {
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch
})

function createWindow(): BrowserWindow {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    title: `PharmaPOS v${app.getVersion()}`,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon: join(__dirname, '../../resources/icon.png') } : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Forge Vite plugin: use dev server URL in dev, bundled HTML in production
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`))
  }

  return mainWindow
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Initialize database
  initializeDatabase()

  // Register IPC handlers
  registerIpcHandlers()

  // Initialize daily aggregation job
  initializeAggregationJob()

  // Start automatic backups. Nothing used to call this at launch, so scheduled
  // backups never ran; it also performs a catch-up if one was missed while the
  // machine was switched off overnight.
  startBackupScheduler()

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  const mainWindow = createWindow()
  mainWindowRef = mainWindow

  // ── Window close interception ──────────────────────────────────────────────
  // Dual-layer protection against Alt+F4 / OS close button.
  // Layer 1: mainWindow 'close' event — preventDefault() stops normal close.
  // Layer 2: app 'before-quit' — catches app.quit() if layer 1 fails on Windows.
  // The renderer sends APP_CONFIRM_CLOSE when the user completes End Shift
  // (or when there is no active shift). Only then do we allow the app to exit.
  mainWindow.on('close', (event) => {
    if (!closingConfirmed) {
      event.preventDefault()
      mainWindow.webContents.send(IPC_CHANNELS.APP_CLOSE_REQUESTED)
    }
  })

  ipcMain.on(IPC_CHANNELS.APP_CONFIRM_CLOSE, () => {
    closingConfirmed = true
    mainWindow.destroy()
  })

  // Used after a database restore. app.exit() bypasses `before-quit`, so the
  // End-Shift guard cannot trap us here — the database has already been closed
  // and swapped by restoreBackup(), and continuing to run would be unsafe.
  ipcMain.on(IPC_CHANNELS.APP_RELAUNCH, () => {
    closingConfirmed = true
    stopBackupScheduler()
    app.relaunch()
    app.exit(0)
  })

  // ── Pole display — auto-connect from saved settings ───────────────────────
  try {
    const db = getDatabase()
    const portRow = db.prepare("SELECT value FROM settings WHERE key = 'display_port'").get() as
      | { value: string }
      | undefined
    const baudRow = db
      .prepare("SELECT value FROM settings WHERE key = 'display_baud_rate'")
      .get() as { value: string } | undefined
    const savedPort = portRow?.value
    const savedBaud = parseInt(baudRow?.value ?? '9600', 10)
    if (savedPort) {
      poleDisplay.openDisplay(savedPort, savedBaud).catch((err: Error) => {
        logError('Could not auto-connect pole display', { port: savedPort, error: err.message })
      })
    }
  } catch (err: unknown) {
    logError('Failed to read display settings for auto-connect', {
      error: err instanceof Error ? err.message : String(err)
    })
  }

  // ── Pole display IPC handlers ──────────────────────────────────────────────

  // Cart updated — write last item + running total to pole display
  ipcMain.handle(IPC_CHANNELS.DISPLAY_UPDATE, (_event, cartData: CartData) => {
    if (poleDisplay.isConnected()) {
      const lastItem = cartData?.items?.at(-1)
      const itemName = lastItem?.name ?? ''
      poleDisplay.showCartUpdate(itemName, cartData?.total ?? 0, cartData?.currency ?? 'Rs.')
    }
    return { success: true }
  })

  // Sale complete — show total + change
  ipcMain.handle(IPC_CHANNELS.DISPLAY_SALE_COMPLETE, (_event, saleData: SaleData) => {
    if (poleDisplay.isConnected()) {
      poleDisplay.showSaleComplete(
        saleData?.total ?? 0,
        saleData?.change_given ?? 0,
        saleData?.currency ?? 'Rs.'
      )
    }
    return { success: true }
  })

  // List available COM ports
  ipcMain.handle(IPC_CHANNELS.DISPLAY_LIST_PORTS, async () => {
    return await poleDisplay.listPorts()
  })

  // Connect to a COM port
  ipcMain.handle(IPC_CHANNELS.DISPLAY_CONNECT, async (_event, { port, baudRate }) => {
    await poleDisplay.openDisplay(port, baudRate ?? 9600)
    // Persist to settings
    const db = getDatabase()
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('display_port', ?, datetime('now'))").run(port)
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('display_baud_rate', ?, datetime('now'))").run(
      String(baudRate ?? 9600)
    )
    return { success: true }
  })

  // Disconnect
  ipcMain.handle(IPC_CHANNELS.DISPLAY_DISCONNECT, async () => {
    await poleDisplay.closeDisplay()
    return { success: true }
  })

  // Test — send a test message
  ipcMain.handle(IPC_CHANNELS.DISPLAY_TEST, () => {
    poleDisplay.sendTestMessage()
    return { success: true }
  })

  // Get current connection status
  ipcMain.handle(IPC_CHANNELS.DISPLAY_GET_STATUS, () => {
    return poleDisplay.getStatus()
  })

  // Initialize auto-updater
  initializeAutoUpdater(mainWindow)

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Before-quit fires when app.quit() is called (triggered by window-all-closed on Windows).
// Layer 2: if closingConfirmed is still false here, the OS forced a quit without going
// through our EndShift flow. Intercept, restore the window, and re-send the close signal.
// If closingConfirmed is true, the window is already destroyed — just run cleanup.
app.on('before-quit', (event) => {
  if (!closingConfirmed) {
    event.preventDefault()
    const win = mainWindowRef
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
      win.webContents.send(IPC_CHANNELS.APP_CLOSE_REQUESTED)
    } else {
      // No window to restore — nothing we can do, allow quit
      closingConfirmed = true
    }
    return
  }
  // Confirmed — run cleanup before the process exits
  stopBackupScheduler()
  poleDisplay.closeDisplay().catch(() => {})
  closeDatabase()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
