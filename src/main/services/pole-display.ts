import { SerialPort } from 'serialport'
import { logInfo, logError } from './logging/logger'

// ── OCPD-LED8 protocol (from official manual) ─────────────────────────────────
//
// Baud: 2400, N, 8, 1  (default, no handshake)
//
// Key commands:
//   CLR            \x0C              — clear all digits
//   ESC @          \x1B\x40          — initialize (power-on reset)
//   ESC Q A … CR   \x1B\x51\x41 + digits + \x0D  — display digits
//   ESC s n        \x1B\x73 + n      — light a label LED
//                    n='0' all off | '1' Price | '2' Total | '3' Collect | '4' Change
//
// ESC Q A accepts only: digits 0-9, '-', '.'
// Max 8 digits without decimal, up to 15 chars with decimal places.
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_BAUD = 2400

// Label LED selector values (ASCII '0'..'4')
const LABEL = {
  OFF: '0',
  PRICE: '1',
  TOTAL: '2',
  COLLECT: '3',
  CHANGE: '4'
} as const

let activePort: SerialPort | null = null
let _currentPort = ''
let _currentBaudRate = DEFAULT_BAUD

// ── Public API ────────────────────────────────────────────────────────────────

export async function listPorts(): Promise<{ path: string; manufacturer?: string }[]> {
  const ports = await SerialPort.list()
  return ports.map((p) => ({ path: p.path, manufacturer: p.manufacturer }))
}

export async function openDisplay(portPath: string, baudRate = DEFAULT_BAUD): Promise<void> {
  if (activePort?.isOpen) await closeDisplay()

  return new Promise((resolve, reject) => {
    const port = new SerialPort({ path: portPath, baudRate }, (err) => {
      if (err) {
        logError('Pole display connection failed', { port: portPath, error: err.message })
        reject(err)
        return
      }
      activePort = port
      _currentPort = portPath
      _currentBaudRate = baudRate
      logInfo('Pole display connected', { port: portPath, baudRate })
      showWelcome()
      resolve()
    })
  })
}

export async function closeDisplay(): Promise<void> {
  if (!activePort?.isOpen) {
    activePort = null
    return
  }
  return new Promise((resolve) => {
    activePort!.close(() => {
      activePort = null
      _currentPort = ''
      logInfo('Pole display disconnected')
      resolve()
    })
  })
}

export function isConnected(): boolean {
  return activePort?.isOpen ?? false
}

export function getStatus(): { connected: boolean; port: string; baudRate: number } {
  return { connected: isConnected(), port: _currentPort, baudRate: _currentBaudRate }
}

// ── Low-level helpers ─────────────────────────────────────────────────────────

function writeToPort(data: string): void {
  if (!activePort?.isOpen) return
  const bytes = Buffer.from([...data].map((c) => c.charCodeAt(0) & 0xff))
  activePort.write(bytes, (err) => {
    if (err) logError('Pole display write error', { error: err.message })
  })
}

/** CLR + ESC s n + ESC Q A [value] CR */
function showValue(value: string, label: string): void {
  const cmd =
    '\x0C' + // CLR — clear screen
    '\x1B\x73' +
    label + // ESC s n — set label LED
    '\x1B\x51\x41' +
    value +
    '\x0D' // ESC Q A … CR — display digits
  writeToPort(cmd)
}

// ── Display commands ──────────────────────────────────────────────────────────

export function showWelcome(): void {
  showValue('0.00', LABEL.OFF)
}

export function showCartUpdate(_lastItemName: string, total: number, _currency: string): void {
  showValue(total.toFixed(2), LABEL.TOTAL)
}

export function showSaleComplete(total: number, change: number, _currency: string): void {
  showValue(total.toFixed(2), LABEL.TOTAL)
  // After 3 s switch to showing change amount
  setTimeout(() => {
    if (isConnected()) showValue(change.toFixed(2), LABEL.CHANGE)
  }, 3000)
}

export function sendTestMessage(): void {
  showValue('88.88', LABEL.OFF)
}
