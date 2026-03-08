// eslint-disable-next-line @typescript-eslint/no-require-imports
const usbLib = require('usb')
import * as net from 'net'
import { getDatabase } from '../database'
import { EscPosBuilder } from './escpos-builder'

export interface PrinterConfig {
  type: 'epson' | 'star' | 'generic'
  interface: 'tcp' | 'usb'
  path?: string // USB: "vid:pid" decimal e.g. "1208:3598"
  ip?: string // TCP only
  port?: number // TCP only (default: 9100)
  width?: number // receipt width in chars (default: 42)
}

/** Passed to receipt-formatter functions */
export interface PrinterHandle {
  send: (buf: Buffer) => Promise<void>
  width: number
}

let storedConfig: PrinterConfig | null = null

function loadConfigFromDb(): PrinterConfig {
  const db = getDatabase()
  const get = (key: string): string | undefined =>
    (
      db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined
    )?.value

  return {
    type: (get('printer_type') as PrinterConfig['type']) || 'epson',
    interface: (get('printer_interface') as PrinterConfig['interface']) || 'usb',
    path: get('printer_path'),
    ip: get('printer_ip'),
    port: get('printer_port') ? parseInt(get('printer_port')!) : 9100,
    width: get('printer_width') ? parseInt(get('printer_width')!) : 42
  }
}

export function initializePrinter(config?: PrinterConfig): void {
  if (config) {
    storedConfig = config
    return
  }
  storedConfig = loadConfigFromDb()
}

export function getPrinterConfig(): PrinterConfig {
  return loadConfigFromDb()
}

export function savePrinterConfig(config: PrinterConfig): void {
  const db = getDatabase()
  const set = (key: string, value: string) =>
    db
      .prepare(
        "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
      )
      .run(key, value)

  set('printer_type', config.type)
  set('printer_interface', config.interface)
  if (config.path) set('printer_path', config.path)
  if (config.ip) set('printer_ip', config.ip)
  if (config.port) set('printer_port', config.port.toString())
  if (config.width) set('printer_width', config.width.toString())
  storedConfig = config
}

// ── USB transport ─────────────────────────────────────────────────────────────

async function sendUSB(vid: number, pid: number, data: Buffer): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const device: any = usbLib.findByIds(vid, pid)
  if (!device) throw new Error(`USB printer not found (${vid}:${pid}). Is it plugged in?`)

  device.open()

  // Prefer the interface with printer class (0x07); fall back to interface 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ifaces: any[] = device.interfaces ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const iface = ifaces.find((i: any) => i.descriptor.bInterfaceClass === 0x07) ?? device.interface(0)

  try {
    // detachKernelDriver is not supported on Windows — skip it
    if (process.platform !== 'win32') {
      try {
        if (iface.isKernelDriverActive()) iface.detachKernelDriver()
      } catch {
        /* ignore */
      }
    }
    iface.claim()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const endpoint: any = iface.endpoints.find((e: any) => e.direction === 'out')
    if (!endpoint) throw new Error('No bulk-OUT endpoint found on USB printer')

    await new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      endpoint.transfer(data, (err: any) => (err ? reject(err) : resolve()))
    })
  } finally {
    try {
      iface.release(true, () => {})
    } catch {
      /* ignore */
    }
    try {
      device.close()
    } catch {
      /* ignore */
    }
  }
}

// ── TCP transport ─────────────────────────────────────────────────────────────

async function sendTCP(ip: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(port, ip)
    socket.setTimeout(5000)
    socket.on('connect', () => {
      socket.write(data, (err) => {
        socket.destroy()
        if (err) reject(err)
        else resolve()
      })
    })
    socket.on('error', reject)
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`TCP timeout connecting to ${ip}:${port}`))
    })
  })
}

// ── Public printer handle ─────────────────────────────────────────────────────

export function getPrinter(): PrinterHandle {
  if (!storedConfig) initializePrinter()
  const config = storedConfig!
  const width = config.width || 42

  if (config.interface === 'tcp') {
    if (!config.ip) throw new Error('No IP address configured for TCP printer')
    const { ip, port } = config
    return { send: (buf) => sendTCP(ip, port || 9100, buf), width }
  }

  if (config.interface === 'usb') {
    let vid: number, pid: number

    if (config.path) {
      const [vidStr, pidStr] = config.path.split(':')
      vid = parseInt(vidStr, 10)
      pid = parseInt(pidStr, 10)
      if (isNaN(vid) || isNaN(pid))
        throw new Error(`Invalid USB path "${config.path}". Expected decimal "vid:pid".`)
    } else {
      // Auto-detect: first device with a printer-class interface
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const found = (usbLib.getDeviceList() as any[]).find((d: any) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.interfaces ?? []).some((i: any) => i.descriptor.bInterfaceClass === 0x07)
      )
      if (!found) throw new Error('No USB printer detected. Check connection and WinUSB driver.')
      vid = found.deviceDescriptor.idVendor
      pid = found.deviceDescriptor.idProduct
    }

    return { send: (buf) => sendUSB(vid, pid, buf), width }
  }

  throw new Error(`Unsupported interface "${config.interface}". Use USB or TCP.`)
}

// ── High-level operations ─────────────────────────────────────────────────────

/** Throws on failure so the caller sees the real error */
export async function testPrinter(): Promise<void> {
  const handle = getPrinter()
  const line = '-'.repeat(handle.width)
  const buf = new EscPosBuilder()
    .align('CT')
    .bold(true)
    .size(2, 2)
    .text('PRINTER TEST\n')
    .bold(false)
    .size(1, 1)
    .text(line + '\n')
    .align('LT')
    .text('If you can read this,\n')
    .text('your printer is working!\n')
    .text(line + '\n')
    .feed(2)
    .cut()
    .build()
  await handle.send(buf)
}

export async function openCashDrawer(): Promise<void> {
  const handle = getPrinter()
  const buf = new EscPosBuilder().cashdraw(2).build()
  await handle.send(buf)
}

// ── USB device listing ────────────────────────────────────────────────────────

const KNOWN_VENDORS: Record<number, string> = {
  0x04b8: 'Epson',
  0x0519: 'Star Micronics',
  0x154f: 'POSIFLEX',
  0x1504: 'Microcom'
}

export function listUSBPrinters(): Array<{ name: string; path: string }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const devices: any[] = usbLib.getDeviceList()
    const results: Array<{ name: string; path: string }> = []

    for (const device of devices) {
      const vid: number = device.deviceDescriptor.idVendor
      const pid: number = device.deviceDescriptor.idProduct

      // Check config descriptor for a printer-class interface (class 0x07)
      // configDescriptor.interfaces is an array-of-arrays (one per alternate setting)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ifaceGroups: any[][] = device.configDescriptor?.interfaces ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasPrinterClass = ifaceGroups.some((alts: any[]) =>
        alts.some((alt) => alt.bInterfaceClass === 0x07)
      )

      if (hasPrinterClass || KNOWN_VENDORS[vid]) {
        const vendorName = KNOWN_VENDORS[vid] || 'USB Printer'
        results.push({
          name: `${vendorName} (${vid.toString(16).padStart(4, '0')}:${pid.toString(16).padStart(4, '0')})`,
          path: `${vid}:${pid}`
        })
      }
    }

    return results
  } catch {
    return []
  }
}
