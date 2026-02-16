import { BrowserWindow } from 'electron'
import { logInfo, logError } from './logging/logger'

// ── IPC channels shared with the renderer serial module ──────────────────────
export const SERIAL_CMD_CHANNEL = 'serial:cmd'
export const SERIAL_RESULT_CHANNEL = 'serial:result'
export const SERIAL_READY_CHANNEL = 'serial:ready'

// ── Display constants ─────────────────────────────────────────────────────────
// \x0C (Form Feed) resets/clears most single-line LED price displays.
const CLEAR = '\x0C'

// ── Module state ──────────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null
let _connected = false
let _currentPort = ''
let _currentBaudRate = 9600

// Pending promise resolvers — held while waiting for renderer to respond
let _listPortsResolve: ((ports: { path: string; manufacturer?: string }[]) => void) | null = null
let _connectResolve: (() => void) | null = null
let _connectReject: ((err: Error) => void) | null = null

// Port name to auto-select in the 'select-serial-port' session event
let _pendingConnectPort = ''

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Forward a command object to the renderer via the serial command channel */
function sendCmd(cmd: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(SERIAL_CMD_CHANNEL, cmd)
}

// ── Called from index.ts event handlers ──────────────────────────────────────

/** Store reference to the main window so we can push commands to the renderer */
export function init(win: BrowserWindow): void {
  mainWindow = win
}

/**
 * Called from the 'select-serial-port' session event.
 * Resolves a pending listPorts() call or auto-selects a port for openDisplay().
 */
export function handlePortSelect(
  portList: { portId: string; portName: string }[],
  callback: (portId: string) => void
): void {
  if (_listPortsResolve) {
    // listPorts() is waiting — resolve it with the captured port list, then cancel selection
    const result = portList.map((p) => ({ path: p.portName, manufacturer: undefined }))
    _listPortsResolve(result)
    _listPortsResolve = null
    callback('') // cancel — no port is actually opened
    return
  }

  if (_pendingConnectPort) {
    // openDisplay() is waiting — find the matching port by name and select it
    const match = portList.find((p) => p.portName === _pendingConnectPort)
    if (match) {
      callback(match.portId)
    } else {
      callback('') // port not found; renderer requestPort() will throw NotFoundError
    }
    return
  }

  callback('') // unexpected call — cancel
}

/**
 * Called from ipcMain.on('serial:result') in index.ts.
 * Settles the promise created by openDisplay() or acknowledges a disconnect.
 */
export function handleResult(data: {
  type: string
  success: boolean
  error?: string
}): void {
  if (data.type === 'connect') {
    if (data.success) {
      _connected = true
      logInfo('Pole display connected via Web Serial', {
        port: _currentPort,
        baudRate: _currentBaudRate
      })
      _connectResolve?.()
    } else {
      _connected = false
      logError('Pole display connection failed', { port: _currentPort, error: data.error })
      _connectReject?.(new Error(data.error ?? 'Connection failed'))
    }
    _connectResolve = null
    _connectReject = null
    _pendingConnectPort = ''
  } else if (data.type === 'disconnect') {
    _connected = false
    _currentPort = ''
    logInfo('Pole display disconnected')
  }
}

// ── Public API (same interface as before) ─────────────────────────────────────

/** List available serial ports — triggers a requestPort() in the renderer to capture the port list */
export async function listPorts(): Promise<{ path: string; manufacturer?: string }[]> {
  if (!mainWindow || mainWindow.isDestroyed()) return []
  return new Promise((resolve) => {
    _listPortsResolve = resolve
    sendCmd({ type: 'listPorts' })
    // Timeout after 5 s if the renderer never triggers the port list
    setTimeout(() => {
      if (_listPortsResolve) {
        _listPortsResolve([])
        _listPortsResolve = null
      }
    }, 5000)
  })
}

/** Open a connection to the pole display */
export async function openDisplay(portPath: string, baudRate = 9600): Promise<void> {
  if (_connected) await closeDisplay()
  _currentPort = portPath
  _currentBaudRate = baudRate
  _pendingConnectPort = portPath
  return new Promise((resolve, reject) => {
    _connectResolve = resolve
    _connectReject = reject
    sendCmd({ type: 'connect', portName: portPath, baudRate })
    // Timeout after 10 s
    setTimeout(() => {
      if (_connectResolve || _connectReject) {
        _connectReject?.(new Error('Connection timeout'))
        _connectResolve = null
        _connectReject = null
        _pendingConnectPort = ''
      }
    }, 10000)
  })
}

/** Close the serial connection */
export async function closeDisplay(): Promise<void> {
  sendCmd({ type: 'disconnect' })
  _connected = false
  _currentPort = ''
}

/** Returns whether the display port is currently open */
export function isConnected(): boolean {
  return _connected
}

/** Returns the currently connected port path and baud rate */
export function getStatus(): { connected: boolean; port: string; baudRate: number } {
  return { connected: _connected, port: _currentPort, baudRate: _currentBaudRate }
}

/** Write a number to the display — clears first, then sends the value */
function showNumber(value: number): void {
  sendCmd({ type: 'write', data: CLEAR + value.toFixed(2) })
}

/** Show 0.00 on the idle welcome screen */
export function showWelcome(_businessName: string): void {
  showNumber(0)
}

/** Show the running cart total on every cart update */
export function showCartUpdate(_lastItemName: string, total: number, _currency: string): void {
  showNumber(total)
}

/** Show the sale total after payment */
export function showSaleComplete(total: number, _change: number, _currency: string): void {
  showNumber(total)
}

/** Send a test pattern to verify the display is working */
export function sendTestMessage(): void {
  showNumber(88.88)
}
