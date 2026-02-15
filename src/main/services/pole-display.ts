import { SerialPort } from 'serialport'
import { logInfo, logError } from './logging/logger'

// ── VFD display constants ────────────────────────────────────────────────────
// Most 2×20 VFD pole displays (Epson, Logic Controls, generic Chinese) use:
//   \x0C  – Form Feed: clear entire display
//   \x0B  – Vertical Tab: cursor home (line 1, col 1) on some models
//   \x0D\x0A – CR+LF: move to next line
// Raw ASCII text is written directly after clear.
const CLEAR = '\x0C'
const CRLF = '\x0D\x0A'
const DISPLAY_WIDTH = 20

let port: SerialPort | null = null
let currentPort = ''
let currentBaudRate = 9600

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Truncate and right-pad text to exactly DISPLAY_WIDTH characters */
function pad(text: string, width = DISPLAY_WIDTH): string {
  return text.slice(0, width).padEnd(width, ' ')
}

/** Write raw bytes to the display — silently drops errors if not connected */
function write(data: string): void {
  if (!port?.isOpen) return
  port.write(Buffer.from(data, 'binary'), (err) => {
    if (err) logError('Pole display write error', { error: err.message })
  })
}

// ── Public API ───────────────────────────────────────────────────────────────

/** List available serial ports (COM ports) on this machine */
export async function listPorts(): Promise<{ path: string; manufacturer?: string }[]> {
  const ports = await SerialPort.list()
  return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer }))
}

/** Open a connection to the pole display */
export async function openDisplay(portPath: string, baudRate = 9600): Promise<void> {
  if (port?.isOpen) {
    await closeDisplay()
  }

  return new Promise((resolve, reject) => {
    const newPort = new SerialPort(
      { path: portPath, baudRate, autoOpen: false },
      (err) => {
        if (err) {
          reject(new Error(`Cannot open ${portPath}: ${err.message}`))
          return
        }
      }
    )

    newPort.open((err) => {
      if (err) {
        reject(new Error(`Cannot open ${portPath}: ${err.message}`))
        return
      }
      port = newPort
      currentPort = portPath
      currentBaudRate = baudRate
      logInfo('Pole display connected', { port: portPath, baudRate })
      // Show welcome on connect
      write(CLEAR)
      write(pad('** PharmaPOS **') + CRLF + pad('Ready'))
      resolve()
    })
  })
}

/** Close the serial connection */
export async function closeDisplay(): Promise<void> {
  if (!port) return
  return new Promise((resolve) => {
    if (!port?.isOpen) {
      port = null
      resolve()
      return
    }
    write(CLEAR)
    port.close(() => {
      logInfo('Pole display disconnected', { port: currentPort })
      port = null
      currentPort = ''
      resolve()
    })
  })
}

/** Returns whether the display port is currently open */
export function isConnected(): boolean {
  return !!port?.isOpen
}

/** Returns the currently connected port path and baud rate */
export function getStatus(): { connected: boolean; port: string; baudRate: number } {
  return { connected: isConnected(), port: currentPort, baudRate: currentBaudRate }
}

/**
 * Show two lines of text.
 * Both lines are padded/truncated to exactly 20 characters.
 */
export function showLines(line1: string, line2: string): void {
  write(CLEAR)
  write(pad(line1) + CRLF + pad(line2))
}

/** Show idle welcome screen */
export function showWelcome(businessName: string): void {
  showLines('  Welcome!', businessName)
}

/**
 * Called on every cart update from the POS.
 * Shows the last-added item name and the running total.
 */
export function showCartUpdate(
  lastItemName: string,
  total: number,
  currency: string
): void {
  showLines(lastItemName, `Total: ${currency} ${total.toFixed(2)}`)
}

/**
 * Called after a sale is completed.
 * Shows the total charged and change due.
 */
export function showSaleComplete(
  total: number,
  change: number,
  currency: string
): void {
  const totalStr = `${currency} ${total.toFixed(2)}`
  const changeStr = change > 0 ? `Change:${currency}${change.toFixed(2)}` : 'Thank You!'
  showLines(`Paid: ${totalStr}`, changeStr)
}

/** Send a test message to verify the display is working */
export function sendTestMessage(): void {
  showLines('** Test Message **', 'Display OK!')
}
