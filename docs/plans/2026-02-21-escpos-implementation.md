# ESC/POS Printer Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace `node-thermal-printer` with `escpos` + `escpos-usb` + `escpos-network` for direct USB printing on Windows without the `printer` native module.

**Architecture:** `escpos` core builds ESC/POS command sequences. `escpos-usb` (uses `node-usb`/libusb) talks directly to the USB device. Each print job opens the device, chains commands on the `Printer` fluent API, and calls `.close()` to flush. No persistent printer state is held between jobs.

**Tech Stack:** `escpos@3.0.0-alpha.6`, `escpos-usb@3.0.0-alpha.4`, `escpos-network@3.0.0-alpha.5`, `electron-rebuild`, Node.js `child_process` (for PowerShell USB enumeration fallback)

---

## Task 1: Install escpos packages and update build scripts

**Files:**
- Modify: `package.json`

**Step 1: Remove old dependency, install new ones**

```bash
npm uninstall node-thermal-printer
npm install escpos escpos-usb escpos-network
```

Expected: `package.json` `dependencies` now contains `escpos`, `escpos-usb`, `escpos-network`. `node-thermal-printer` is gone.

**Step 2: Update rebuild-native script**

In `package.json`, change:
```json
"rebuild-native": "electron-rebuild -f -w better-sqlite3"
```
to:
```json
"rebuild-native": "electron-rebuild -f -w better-sqlite3,usb"
```

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: replace node-thermal-printer with escpos + escpos-usb"
```

---

## Task 2: Rewrite thermal-printer.ts

**Files:**
- Modify: `src/main/services/printer/thermal-printer.ts`

This file keeps the same exported function signatures so `printer-handlers.ts` requires **no changes**.

**Step 1: Replace entire file with the following**

```typescript
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
  path?: string   // USB: "vid:pid" e.g. "1224:3586"; serial: "COM3"
  ip?: string     // TCP only
  port?: number   // TCP only (default: 9100)
  width?: number  // receipt width in chars (default: 42)
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
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value

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
      throw new Error('No IP address configured for TCP interface. Please configure your printer in Settings.')
    }
    device = new Network(config.ip, config.port || 9100)
  } else if (config.interface === 'usb') {
    if (config.path) {
      // path format: "vid:pid" (decimal, e.g. "1224:3586")
      const [vidStr, pidStr] = config.path.split(':')
      const vid = parseInt(vidStr)
      const pid = parseInt(pidStr)
      if (!isNaN(vid) && !isNaN(pid)) {
        device = new USB(vid, pid)
      } else {
        // Fallback: auto-detect first available USB printer
        device = new USB()
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
        if (err) { reject(err); return }
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
      if (err) { reject(err); return }
      instance.printer
        .cashdraw(2)
        .close((closeErr: Error | null) => {
          if (closeErr) reject(closeErr)
          else resolve()
        })
    })
  })
}

const KNOWN_VENDORS: Record<number, string> = {
  0x04B8: 'Epson',
  0x0519: 'Star Micronics',
  0x154F: 'POSIFLEX',
  0x1504: 'Microcom',
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
```

**Step 2: Commit**

```bash
git add src/main/services/printer/thermal-printer.ts
git commit -m "feat: rewrite thermal-printer.ts with escpos + escpos-usb"
```

---

## Task 3: Rewrite receipt-formatter.ts

**Files:**
- Modify: `src/main/services/printer/receipt-formatter.ts`

**Step 1: Replace entire file with the following**

```typescript
import { EscposPrinterInstance } from './thermal-printer'
import { getDatabase } from '../database'

export interface ReceiptData {
  sale: {
    id: string
    receipt_number: string
    created_at: string
    subtotal: number
    tax_amount: number
    discount_amount: number
    total: number
    payment_method: string
    cash_received: number
    change_given: number
    customer_name?: string
  }
  items: Array<{
    product_name: string
    quantity: number
    unit_price: number
    line_total: number
  }>
  user: {
    full_name: string
  }
}

interface Column {
  text: string
  align: 'LEFT' | 'CENTER' | 'RIGHT'
  width: number  // proportion 0..1, must sum to 1.0
}

/** Format a row of columns into a fixed-width string */
function tableRow(columns: Column[], totalWidth: number): string {
  return columns
    .map((col) => {
      const chars = Math.floor(col.width * totalWidth)
      const text = col.text.length > chars ? col.text.substring(0, chars) : col.text
      if (col.align === 'RIGHT') return text.padStart(chars)
      if (col.align === 'CENTER') {
        const pad = Math.floor((chars - text.length) / 2)
        return ' '.repeat(pad) + text + ' '.repeat(chars - text.length - pad)
      }
      return text.padEnd(chars)
    })
    .join('')
}

/** Format and print receipt */
export async function printReceipt(
  instance: EscposPrinterInstance,
  data: ReceiptData
): Promise<void> {
  const db = getDatabase()
  const get = (key: string): string | undefined =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value

  const businessName = get('business_name') || 'PharmaPOS'
  const address = get('business_address')
  const phone = get('business_phone')
  const footer = get('receipt_footer')
  const currency = get('currency_symbol') || 'Rs.'
  const width = instance.width
  const line = '─'.repeat(width)

  await new Promise<void>((resolve, reject) => {
    instance.device.open((err: Error | null) => {
      if (err) { reject(err); return }

      const p = instance.printer

      // Header
      p.align('CT')
        .style('B')
        .size(2, 2)
        .text(businessName + '\n')
        .style('NORMAL')
        .size(1, 1)

      if (address) p.text(address + '\n')
      if (phone) p.text(`Tel: ${phone}\n`)

      p.text(line + '\n')

      // Receipt info
      p.align('LT')
        .text(`Receipt: ${data.sale.receipt_number}\n`)
        .text(`Date: ${new Date(data.sale.created_at).toLocaleString()}\n`)
        .text(`Cashier: ${data.user.full_name}\n`)

      if (data.sale.customer_name) {
        p.text(`Customer: ${data.sale.customer_name}\n`)
      }

      p.text(line + '\n')

      // Items header
      p.style('B')
        .text(
          tableRow(
            [
              { text: 'Item', align: 'LEFT', width: 0.5 },
              { text: 'Qty', align: 'CENTER', width: 0.15 },
              { text: 'Price', align: 'RIGHT', width: 0.2 },
              { text: 'Total', align: 'RIGHT', width: 0.15 }
            ],
            width
          ) + '\n'
        )
        .style('NORMAL')

      // Items
      for (const item of data.items) {
        p.text(
          tableRow(
            [
              { text: item.product_name, align: 'LEFT', width: 0.5 },
              { text: item.quantity.toString(), align: 'CENTER', width: 0.15 },
              { text: `${currency}${item.unit_price.toFixed(2)}`, align: 'RIGHT', width: 0.2 },
              { text: `${currency}${item.line_total.toFixed(2)}`, align: 'RIGHT', width: 0.15 }
            ],
            width
          ) + '\n'
        )
      }

      p.text(line + '\n')

      // Totals
      p.text(
        tableRow(
          [
            { text: 'Subtotal:', align: 'LEFT', width: 0.7 },
            { text: `${currency}${data.sale.subtotal.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
          ],
          width
        ) + '\n'
      )

      if (data.sale.discount_amount > 0) {
        p.text(
          tableRow(
            [
              { text: 'Discount:', align: 'LEFT', width: 0.7 },
              { text: `-${currency}${data.sale.discount_amount.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
            ],
            width
          ) + '\n'
        )
      }

      if (data.sale.tax_amount > 0) {
        p.text(
          tableRow(
            [
              { text: 'Tax:', align: 'LEFT', width: 0.7 },
              { text: `${currency}${data.sale.tax_amount.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
            ],
            width
          ) + '\n'
        )
      }

      p.text(line + '\n')

      // Total (large)
      p.style('B')
        .size(2, 2)
        .text(
          tableRow(
            [
              { text: 'TOTAL:', align: 'LEFT', width: 0.6 },
              { text: `${currency}${data.sale.total.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
            ],
            Math.floor(width / 2)  // half-width because size is doubled
          ) + '\n'
        )
        .size(1, 1)
        .style('NORMAL')

      p.text(line + '\n')

      // Payment
      if (data.sale.payment_method === 'cash') {
        p.text(
          tableRow(
            [{ text: 'Cash:', align: 'LEFT', width: 0.7 }, { text: `${currency}${data.sale.cash_received.toFixed(2)}`, align: 'RIGHT', width: 0.3 }],
            width
          ) + '\n'
        ).text(
          tableRow(
            [{ text: 'Change:', align: 'LEFT', width: 0.7 }, { text: `${currency}${data.sale.change_given.toFixed(2)}`, align: 'RIGHT', width: 0.3 }],
            width
          ) + '\n'
        )
      } else if (data.sale.payment_method === 'card') {
        p.text('Payment: CARD\n')
      } else if (data.sale.payment_method === 'mixed') {
        p.text(`Cash: ${currency}${data.sale.cash_received.toFixed(2)}\n`)
          .text(`Card: ${currency}${(data.sale.total - data.sale.cash_received).toFixed(2)}\n`)
      }

      p.text(line + '\n')

      // Footer
      p.align('CT')
      if (footer) p.text(footer + '\n')
      p.text('Powered by PharmaPOS\n')

      p.feed(2).cut().close((closeErr: Error | null) => {
        if (closeErr) reject(closeErr)
        else resolve()
      })
    })
  })
}

/** Print shift report */
export async function printShiftReport(
  instance: EscposPrinterInstance,
  shiftData: {
    shift_id: string
    user_name: string
    started_at: string
    ended_at: string
    opening_cash: number
    closing_cash: number
    expected_cash?: number
    total_sales: number
    cash_sales: number
    card_sales: number
    transaction_count: number
  }
): Promise<void> {
  const db = getDatabase()
  const currency =
    (db.prepare('SELECT value FROM settings WHERE key = ?').get('currency_symbol') as { value: string } | undefined)?.value || 'Rs.'

  const width = instance.width
  const line = '─'.repeat(width)

  await new Promise<void>((resolve, reject) => {
    instance.device.open((err: Error | null) => {
      if (err) { reject(err); return }

      const p = instance.printer
      const row = (left: string, right: string) =>
        tableRow([{ text: left, align: 'LEFT', width: 0.6 }, { text: right, align: 'RIGHT', width: 0.4 }], width) + '\n'

      p.align('CT')
        .style('B')
        .size(2, 2)
        .text('SHIFT REPORT\n')
        .style('NORMAL')
        .size(1, 1)
        .text(line + '\n')
        .align('LT')
        .text(`Cashier: ${shiftData.user_name}\n`)
        .text(`Started: ${new Date(shiftData.started_at).toLocaleString()}\n`)
        .text(`Ended: ${new Date(shiftData.ended_at).toLocaleString()}\n`)
        .text(line + '\n')
        .text('CASH SUMMARY\n')
        .text(row('Opening Cash:', `${currency}${shiftData.opening_cash.toFixed(2)}`))
        .text(row('Expected Cash:', `${currency}${(shiftData.expected_cash ?? 0).toFixed(2)}`))
        .text(row('Actual Cash:', `${currency}${shiftData.closing_cash.toFixed(2)}`))

      const diff = shiftData.closing_cash - (shiftData.expected_cash ?? 0)
      p.style('B')
        .text(row('Difference:', `${currency}${Math.abs(diff).toFixed(2)} ${diff >= 0 ? 'OVER' : 'SHORT'}`))
        .style('NORMAL')
        .text(line + '\n')
        .text('SALES SUMMARY\n')
        .text(row('Transactions:', shiftData.transaction_count.toString()))
        .text(row('Total Sales:', `${currency}${shiftData.total_sales.toFixed(2)}`))
        .text(row('Cash Sales:', `${currency}${shiftData.cash_sales.toFixed(2)}`))
        .text(row('Card Sales:', `${currency}${shiftData.card_sales.toFixed(2)}`))
        .text(line + '\n')
        .align('CT')
        .text('End of Shift Report\n')
        .feed(2)
        .cut()
        .close((closeErr: Error | null) => {
          if (closeErr) reject(closeErr)
          else resolve()
        })
    })
  })
}
```

**Step 2: Commit**

```bash
git add src/main/services/printer/receipt-formatter.ts
git commit -m "feat: rewrite receipt-formatter.ts for escpos API"
```

---

## Task 4: Update PrinterSetupWizard.tsx — USB driver instructions

**Files:**
- Modify: `src/renderer/src/components/settings/PrinterSetupWizard.tsx`

The only change is replacing the helper text in the USB section (currently says "On Windows, this is the printer name shown in Devices & Printers") with a note about WinUSB driver setup.

**Step 1: Find this block in the file (line ~195)**

```tsx
                <p className="text-xs text-muted-foreground mt-1">
                  On Windows, this is the printer name shown in Devices &amp; Printers
                </p>
```

**Step 2: Replace with**

```tsx
                <p className="text-xs text-muted-foreground mt-1">
                  USB printing requires the <strong>WinUSB</strong> driver.{' '}
                  Download <a href="#" onClick={(e) => { e.preventDefault(); window.open('https://zadig.akeo.ie') }} className="underline">Zadig</a>,
                  select your printer, and install WinUSB. Then click Refresh.
                </p>
```

**Step 3: Commit**

```bash
git add src/renderer/src/components/settings/PrinterSetupWizard.tsx
git commit -m "feat: add WinUSB driver instructions to PrinterSetupWizard"
```

---

## Task 5: Run typecheck and smoke test

**Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: No errors. If TypeScript complains about `escpos`/`escpos-usb`/`escpos-network` types, add to `src/main/env.d.ts`:

```typescript
declare module 'escpos' {
  const escpos: any
  export = escpos
}
declare module 'escpos-usb' {
  const USB: any
  export = USB
}
declare module 'escpos-network' {
  const Network: any
  export = Network
}
```

**Step 2: Run the app in dev mode**

```bash
npm run dev
```

Expected: App starts. Navigate to Settings → Printer Setup Wizard. The USB section should show the WinUSB Zadig instructions and the Refresh button should call `listUSBPrinters()` without crashing (returns empty list if WinUSB not installed, which is fine — manual input fallback already exists).

**Step 3: Run rebuild-native**

```bash
npm run rebuild-native
```

Expected: `better-sqlite3` and `usb` rebuilt against Electron's Node.js version. No errors.

**Step 4: Final commit**

```bash
git add .
git commit -m "chore: verify escpos integration builds and typechecks"
```

---

## Notes

### WinUSB one-time setup (for POS machine)

1. Connect EPSON TM-T81III via USB
2. Download Zadig from https://zadig.akeo.ie
3. In Zadig: Options → List All Devices
4. Select "EPSON TM-T81III" from dropdown
5. Choose "WinUSB" as target driver
6. Click "Install Driver" — takes ~30 seconds
7. Printer disappears from "Devices and Printers" — this is expected
8. In PharmaPOS Settings → Printer → Refresh — printer now appears as `Epson (04b8:XXXX)`

### TCP fallback (no driver change needed)

If the printer has an ethernet port:
1. Set printer IP (print a self-test page to find it)
2. In PharmaPOS Settings: Connection Type = Network (TCP/IP), enter IP, port 9100
3. No driver change needed — `escpos-network` uses pure TCP sockets

### tableRow total width note (Task 3)

When `size(2, 2)` doubles the text, the effective character width is halved. The TOTAL row uses `Math.floor(width / 2)` as total column width to compensate. Verify this looks correct on the actual printer and adjust if needed.
