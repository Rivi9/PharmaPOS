import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer'
import { getDatabase } from '../database'

let printer: ThermalPrinter | null = null

export interface PrinterConfig {
  type: 'epson' | 'star' | 'generic'
  interface: 'tcp' | 'usb' | 'serial'
  path?: string
  ip?: string
  port?: number
  characterSet?: string
  removeSpecialCharacters?: boolean
  lineCharacter?: string
  width?: number
}

/**
 * Initialize printer with configuration
 */
export function initializePrinter(config?: PrinterConfig): ThermalPrinter {
  const db = getDatabase()

  // Load config from database if not provided
  if (!config) {
    const settings = {
      type: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_type') as
        | { value: string }
        | undefined,
      interface: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_interface') as
        | { value: string }
        | undefined,
      path: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_path') as
        | { value: string }
        | undefined,
      ip: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_ip') as
        | { value: string }
        | undefined,
      port: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_port') as
        | { value: string }
        | undefined,
      width: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_width') as
        | { value: string }
        | undefined
    }

    config = {
      type: (settings.type?.value as 'epson' | 'star' | 'generic') || 'epson',
      interface: (settings.interface?.value as 'tcp' | 'usb' | 'serial') || 'usb',
      path: settings.path?.value,
      ip: settings.ip?.value,
      port: settings.port?.value ? parseInt(settings.port.value) : 9100,
      width: settings.width?.value ? parseInt(settings.width.value) : 42
    }
  }

  // Map printer types
  let printerType: PrinterTypes
  switch (config.type) {
    case 'epson':
      printerType = PrinterTypes.EPSON
      break
    case 'star':
      printerType = PrinterTypes.STAR
      break
    default:
      printerType = PrinterTypes.EPSON
  }

  // Create printer instance
  const printerConfig: any = {
    type: printerType,
    characterSet: config.characterSet || 'SLOVENIA',
    removeSpecialCharacters: config.removeSpecialCharacters ?? false,
    lineCharacter: config.lineCharacter || '=',
    width: config.width || 42
  }

  if (config.interface === 'tcp' && config.ip) {
    printerConfig.interface = 'tcp'
    printerConfig.options = {
      host: config.ip,
      port: config.port || 9100,
      timeout: 3000
    }
  } else if (config.interface === 'usb' && config.path) {
    printerConfig.interface = 'printer:' + config.path
  } else if (config.interface === 'serial' && config.path) {
    printerConfig.interface = config.path
  } else {
    const detail =
      config.interface === 'usb'
        ? 'No printer name/path configured for USB interface'
        : config.interface === 'tcp'
          ? 'No IP address configured for TCP interface'
          : 'No path configured for Serial interface'
    throw new Error(`${detail}. Please configure your printer in Settings.`)
  }

  printer = new ThermalPrinter(printerConfig)
  return printer
}

/**
 * Read saved printer configuration from database
 */
export function getPrinterConfig(): PrinterConfig {
  const db = getDatabase()
  const get = (key: string) =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value

  return {
    type: (get('printer_type') as PrinterConfig['type']) || 'epson',
    interface: (get('printer_interface') as PrinterConfig['interface']) || 'usb',
    path: get('printer_path'),
    ip: get('printer_ip'),
    port: get('printer_port') ? parseInt(get('printer_port')!) : 9100,
    width: get('printer_width') ? parseInt(get('printer_width')!) : 42
  }
}

/**
 * Get current printer instance
 */
export function getPrinter(): ThermalPrinter {
  if (!printer) {
    printer = initializePrinter()
  }
  return printer
}

/**
 * Save printer configuration to database
 */
export function savePrinterConfig(config: PrinterConfig): void {
  const db = getDatabase()

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'printer_type',
    config.type
  )
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'printer_interface',
    config.interface
  )

  if (config.path) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'printer_path',
      config.path
    )
  }

  if (config.ip) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'printer_ip',
      config.ip
    )
  }

  if (config.port) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'printer_port',
      config.port.toString()
    )
  }

  if (config.width) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'printer_width',
      config.width.toString()
    )
  }

  // Reinitialize printer with new config
  initializePrinter(config)
}

/**
 * Test printer connection
 */
export async function testPrinter(): Promise<boolean> {
  try {
    const p = getPrinter()

    p.alignCenter()
    p.setTextSize(1, 1)
    p.bold(true)
    p.println('PRINTER TEST')
    p.bold(false)
    p.drawLine()
    p.alignLeft()
    p.println('If you can read this,')
    p.println('your printer is working!')
    p.drawLine()
    p.newLine()
    p.cut()

    await p.execute()
    return true
  } catch (error) {
    console.error('Printer test failed:', error)
    return false
  }
}

/**
 * Open cash drawer (if connected)
 */
export async function openCashDrawer(): Promise<void> {
  const p = getPrinter()
  p.openCashDrawer()
  await p.execute()
}

/**
 * List available printers.
 * On Windows, node-thermal-printer uses the Windows print spooler — the path
 * must be the printer name exactly as shown in "Devices and Printers".
 * We enumerate installed printers via PowerShell Get-Printer.
 */
export async function listUSBPrinters(): Promise<Array<{ name: string; path: string }>> {
  if (process.platform === 'win32') {
    try {
      const { execFile } = await import('child_process')
      const output = await new Promise<string>((resolve, reject) => {
        execFile(
          'powershell',
          ['-NoProfile', '-Command', 'Get-Printer | Select-Object -ExpandProperty Name'],
          { timeout: 5000 },
          (err, stdout) => (err ? reject(err) : resolve(stdout))
        )
      })
      const names = output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
      if (names.length > 0) {
        return names.map((name) => ({ name, path: name }))
      }
    } catch {
      // PowerShell unavailable — fall through to defaults
    }
    // Well-known Epson TM-T81III Windows printer names as fallback
    return [
      { name: 'EPSON TM-T81III', path: 'EPSON TM-T81III' },
      { name: 'EPSON TM-T81III Receipt', path: 'EPSON TM-T81III Receipt' }
    ]
  }

  // Linux/macOS
  return ['/dev/usb/lp0', '/dev/usb/lp1', '/dev/ttyUSB0'].map((path) => ({
    name: `USB Printer (${path})`,
    path
  }))
}
