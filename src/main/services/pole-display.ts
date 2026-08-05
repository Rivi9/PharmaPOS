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

/**
 * The OCPD-LED8 ships at 2400 baud with no handshake.
 *
 * The settings seed, the auto-connect fallback and the save handler all defaulted
 * to **9600**, so a fresh install opened the port at the wrong rate. The port
 * opens fine at any baud — nothing detects the mismatch — so `isConnected()`
 * returned true, every display call reported success, and the pole showed
 * nothing at all. Migration 6 corrects installs still holding the 9600 default.
 */
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
// Tracked so closing the port cannot leave a pending write to a dead handle, and
// so a second sale's total is not overwritten by the previous sale's change.
let changeTimer: NodeJS.Timeout | null = null
let idleTimer: NodeJS.Timeout | null = null

/**
 * Until this moment passes, cart updates are ignored (M6).
 *
 * Completing a sale writes the total, and the renderer calls `clearCart()`
 * immediately afterwards — whose store subscription pushes a cart total of 0, so
 * the customer saw the amount they owed for a few milliseconds and then `0.00`.
 * The change then arrived 3 s later and stayed on the panel indefinitely, so the
 * next customer's first scanned item appeared under a stale "CHANGE" label.
 *
 * The post-sale sequence therefore owns the display: total → change → idle, and
 * a cart update only takes over once that has finished or a new item is scanned
 * after it.
 */
let holdCartUpdatesUntil = 0

/** How long the total and then the change stay visible after a sale. */
const TOTAL_DWELL_MS = 3000
const CHANGE_DWELL_MS = 8000

function clearTimers(): void {
  if (changeTimer) {
    clearTimeout(changeTimer)
    changeTimer = null
  }
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}
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
  clearTimers()
  holdCartUpdatesUntil = 0
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

/**
 * Fit an amount into the OCPD-LED8's eight digits.
 *
 * `ESC Q A` accepts only `0-9`, `-` and `.`, and the panel has **eight** digit
 * positions. `total.toFixed(2)` was sent unchecked, so once a total reached
 * Rs. 1,000,000 the string was nine digits and the display either truncated it
 * or ignored the command — and the customer would have been shown a number that
 * was not the price.
 *
 * Decimals are dropped first, because whole rupees are still the right amount;
 * a value that cannot be shown truthfully at all becomes dashes, which reads as
 * "look at the till" rather than as a wrong price.
 */
export function formatForDisplay(amount: number): string {
  if (!Number.isFinite(amount)) return '-'.repeat(8)

  const withDecimals = amount.toFixed(2)
  if (digitCount(withDecimals) <= 8) return withDecimals

  const whole = Math.round(amount).toString()
  if (digitCount(whole) <= 8) return whole

  return '-'.repeat(8)
}

/** Digit positions used, ignoring the decimal point and sign. */
function digitCount(text: string): number {
  return text.replace(/[^0-9]/g, '').length
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

/**
 * The item name is deliberately ignored: this is an eight-digit numeric panel,
 * so the running total is the only thing it can truthfully show.
 */
export function showCartUpdate(_lastItemName: string, total: number, _currency: string): void {
  // An empty cart during the post-sale window is the `clearCart()` that follows
  // every sale, not the customer's business — see `holdCartUpdatesUntil`.
  if (total === 0 && Date.now() < holdCartUpdatesUntil) return

  // A real scan ends the post-sale sequence early: the next customer's first
  // item matters more than the previous one's change.
  if (total > 0) {
    clearTimers()
    holdCartUpdatesUntil = 0
  }
  showValue(formatForDisplay(total), LABEL.TOTAL)
}

/**
 * Post-sale sequence: the amount due, then the change, then back to idle.
 *
 * The change used to stay on the panel until something else overwrote it, so the
 * next customer began their transaction looking at the previous one's change.
 */
export function showSaleComplete(total: number, change: number, _currency: string): void {
  clearTimers()
  holdCartUpdatesUntil = Date.now() + TOTAL_DWELL_MS + CHANGE_DWELL_MS

  showValue(formatForDisplay(total), LABEL.TOTAL)

  changeTimer = setTimeout(() => {
    changeTimer = null
    if (!isConnected()) return
    showValue(formatForDisplay(change), LABEL.CHANGE)

    idleTimer = setTimeout(() => {
      idleTimer = null
      holdCartUpdatesUntil = 0
      if (isConnected()) showWelcome()
    }, CHANGE_DWELL_MS)
  }, TOTAL_DWELL_MS)
}

export function sendTestMessage(): void {
  // All eights lights every segment, which is how you tell a dead digit from a
  // blank one — and confirms the baud rate is right, since a mismatch shows
  // nothing or garbage rather than 88888888.
  showValue('88888888', LABEL.OFF)
}
