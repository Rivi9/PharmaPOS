import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
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
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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

  // ── Window close interception ──────────────────────────────────────────────
  // Prevent Alt+F4 / OS close from killing the app immediately.
  // Instead, send a signal to the renderer so it can show the EndShift modal.
  // The renderer sends APP_CONFIRM_CLOSE when the user has finished the modal.
  let allowClose = false
  mainWindow.on('close', (event) => {
    if (!allowClose) {
      event.preventDefault()
      mainWindow.webContents.send(IPC_CHANNELS.APP_CLOSE_REQUESTED)
    }
  })
  ipcMain.on(IPC_CHANNELS.APP_CONFIRM_CLOSE, () => {
    allowClose = true
    mainWindow.close()
  })

  // ── Web Serial API — grant port access automatically ──────────────────────
  // This intercepts navigator.serial.requestPort() calls from the renderer.
  // The pole-display module uses it to list ports and to auto-select by name.
  session.defaultSession.on('select-serial-port', (_event, portList, _webContents, callback) => {
    poleDisplay.handlePortSelect(portList, callback)
  })

  // Initialise the pole display bridge with the window reference
  poleDisplay.init(mainWindow)

  // Result messages sent back from the renderer's Web Serial implementation
  ipcMain.on(poleDisplay.SERIAL_RESULT_CHANNEL, (_event, data) => {
    poleDisplay.handleResult(data)
  })

  // Renderer signals it is ready — trigger auto-connect now that we can send IPC
  ipcMain.on(poleDisplay.SERIAL_READY_CHANNEL, () => {
    try {
      const db = getDatabase()
      const portRow = db
        .prepare("SELECT value FROM settings WHERE key = 'display_port'")
        .get() as { value: string } | undefined
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
    } catch (err: any) {
      logError('Failed to read display settings for auto-connect', { error: err.message })
    }
  })

  // ── Pole display IPC handlers ──────────────────────────────────────────────

  // Cart updated — write last item + running total to pole display
  ipcMain.handle(IPC_CHANNELS.DISPLAY_UPDATE, (_event, cartData: any) => {
    if (poleDisplay.isConnected()) {
      const lastItem = cartData?.items?.at(-1)
      const itemName = lastItem?.name ?? ''
      poleDisplay.showCartUpdate(itemName, cartData?.total ?? 0, cartData?.currency ?? 'Rs.')
    }
    return { success: true }
  })

  // Sale complete — show total + change
  ipcMain.handle(IPC_CHANNELS.DISPLAY_SALE_COMPLETE, (_event, saleData: any) => {
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
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('display_port', ?)").run(port)
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('display_baud_rate', ?)").run(String(baudRate ?? 9600))
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

// Close database and pole display before quitting
app.on('before-quit', () => {
  poleDisplay.closeDisplay().catch(() => {})
  closeDatabase()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
