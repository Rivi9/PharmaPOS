import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
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
import { initializeDatabase, closeDatabase } from './services/database'
import { registerIpcHandlers } from './ipc/handlers'
import { initializeAggregationJob } from './jobs/aggregation'
import { initializeErrorTracking, setupGlobalErrorHandlers } from './services/logging/error-handler'
import { logInfo, logError } from './services/logging/logger'
import { initializeAutoUpdater } from './services/updates/auto-updater'
import { IPC_CHANNELS } from './ipc/channels'
import * as poleDisplay from './services/pole-display'
import { getDatabase } from './services/database'

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
  poleDisplay.closeDisplay().catch(() => {})
  closeDatabase()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
