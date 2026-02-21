// eslint-disable-next-line @typescript-eslint/no-require-imports
const escpos = require('escpos')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const USB = require('escpos-usb')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Network = require('escpos-network')

import { getDatabase } from '../database'

export interface PrinterConfig {
  type: 'epson' | 'star' | 'generic'
  interface: 'tcp' | 'usb' | 'serial'
  path?: string // USB: "vid:pid" e.g. "1224:3586"; serial: "COM3"
  ip?: string // TCP only
  port?: number // TCP only (default: 9100)
  width?: number // receipt width in chars (default: 42)
}

/** Returned by getPrinter() — passed to receipt-formatter functions */
export interface EscposPrinterInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  device: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  printer: any
  width: number
}

let storedConfig: PrinterConfig | null = null

/** Load config from DB, validate, store in module state */
export function initializePrinter(config?: PrinterConfig): void {
  if (config) {
    storedConfig = config
    return
  }

  const db = getDatabase()
  const get = (key: string): string | undefined =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)
      ?.value

  storedConfig = {
    type: (get('printer_type') as PrinterConfig['type']) || 'epson',
    interface: (get('printer_interface') as PrinterConfig['interface']) || 'usb',
    path: get('printer_path'),
    ip: get('printer_ip'),
    port: get('printer_port') ? parseInt(get('printer_port')!) : 9100,
    width: get('printer_width') ? parseInt(get('printer_width')!) : 42
  }
}

/** Read saved printer configuration from database */
export function getPrinterConfig(): PrinterConfig {
  const db = getDatabase()
  const get = (key: string): string | undefined =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)
      ?.value

  return {
    type: (get('printer_type') as PrinterConfig['type']) || 'epson',
    interface: (get('printer_interface') as PrinterConfig['interface']) || 'usb',
    path: get('printer_path'),
    ip: get('printer_ip'),
    port: get('printer_port') ? parseInt(get('printer_port')!) : 9100,
    width: get('printer_width') ? parseInt(get('printer_width')!) : 42
  }
}

/** Create a fresh device + printer instance from stored (or DB) config */
export function getPrinter(): EscposPrinterInstance {
  if (!storedConfig) {
    initializePrinter()
  }

  const config = storedConfig!
  const width = config.width || 42
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let device: any

  if (config.interface === 'tcp') {
    if (!config.ip) {
      throw new Error(
        'No IP address configured for TCP interface. Please configure your printer in Settings.'
      )
    }
    device = new Network(config.ip, config.port || 9100)
  } else if (config.interface === 'usb') {
    if (config.path) {
      // path format: "vid:pid" (decimal integers, e.g. "1208:3598")
      const [vidStr, pidStr] = config.path.split(':')
      const vid = parseInt(vidStr, 10)
      const pid = parseInt(pidStr, 10)
      if (
        !isNaN(vid) &&
        !isNaN(pid) &&
        vidStr.trim() === String(vid) &&
        pidStr.trim() === String(pid)
      ) {
        device = new USB(vid, pid)
      } else {
        throw new Error(
          `Invalid USB path format "${config.path}". Expected decimal "vid:pid", e.g. "1208:3598". Reconfigure printer in Settings.`
        )
      }
    } else {
      // Auto-detect first available USB printer
      device = new USB()
    }
  } else {
    throw new Error(`Interface "${config.interface}" is not supported. Use USB or TCP.`)
  }

  const printer = new escpos.Printer(device, { encoding: 'GB18030', width })
  return { device, printer, width }
}

/** Save printer configuration to database and store in module state */
export function savePrinterConfig(config: PrinterConfig): void {
  const db = getDatabase()
  const set = (key: string, value: string) =>
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value)

  set('printer_type', config.type)
  set('printer_interface', config.interface)
  if (config.path) set('printer_path', config.path)
  if (config.ip) set('printer_ip', config.ip)
  if (config.port) set('printer_port', config.port.toString())
  if (config.width) set('printer_width', config.width.toString())

  storedConfig = config
}

/** Print a test page */
export async function testPrinter(): Promise<boolean> {
  try {
    const instance = getPrinter()
    const line = '─'.repeat(instance.width)

    await new Promise<void>((resolve, reject) => {
      instance.device.open((err: Error | null) => {
        if (err) {
          reject(err)
          return
        }
        instance.printer
          .align('CT')
          .style('B')
          .size(2, 2)
          .text('PRINTER TEST\n')
          .style('NORMAL')
          .size(1, 1)
          .text(line + '\n')
          .align('LT')
          .text('If you can read this,\n')
          .text('your printer is working!\n')
          .text(line + '\n')
          .feed(2)
          .cut()
          .close((closeErr: Error | null) => {
            if (closeErr) reject(closeErr)
            else resolve()
          })
      })
    })
    return true
  } catch (error) {
    console.error('Printer test failed:', error)
    return false
  }
}

/** Open the cash drawer (pin 2) */
export async function openCashDrawer(): Promise<void> {
  const instance = getPrinter()
  await new Promise<void>((resolve, reject) => {
    instance.device.open((err: Error | null) => {
      if (err) {
        reject(err)
        return
      }
      instance.printer.cashdraw(2).close((closeErr: Error | null) => {
        if (closeErr) reject(closeErr)
        else resolve()
      })
    })
  })
}

const KNOWN_VENDORS: Record<number, string> = {
  0x04b8: 'Epson',
  0x0519: 'Star Micronics',
  0x154f: 'POSIFLEX',
  0x1504: 'Microcom'
}

/** List available USB printers using libusb (requires WinUSB driver on Windows) */
export async function listUSBPrinters(): Promise<Array<{ name: string; path: string }>> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const devices: any[] = USB.findPrinter()
    if (!devices || devices.length === 0) return []

    return devices.map((device) => {
      const vid: number = device.deviceDescriptor.idVendor
      const pid: number = device.deviceDescriptor.idProduct
      const vendorName = KNOWN_VENDORS[vid] || 'USB Printer'
      const name = `${vendorName} (${vid.toString(16).padStart(4, '0')}:${pid.toString(16).padStart(4, '0')})`
      const path = `${vid}:${pid}`
      return { name, path }
    })
  } catch {
    // libusb not available (WinUSB driver not installed, or USB module not built)
    // Return empty list — UI will show manual entry fallback
    return []
  }
}
