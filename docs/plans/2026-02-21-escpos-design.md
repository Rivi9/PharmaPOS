# ESC/POS Printer Integration Redesign

**Date:** 2026-02-21
**Status:** Approved

## Problem

The current `node-thermal-printer` USB implementation on Windows requires the `printer` native npm module. This module is abandoned, difficult to build, and fails with:

> "USB printer driver module is not available. On Windows, install and bundle the 'printer' native dependency, or use Network (TCP/IP) printing."

## Solution

Replace `node-thermal-printer` with `escpos` (core) + `escpos-usb` (USB adapter). The `escpos-usb` package uses `node-usb` (libusb), which is actively maintained and ships Electron prebuild binaries.

## Target Hardware

- POS Machine: Windows 10, touch screen
- Printer: EPSON TM-T81III (USB-connected)

## Architecture

```
Renderer (React)
     ↓ IPC
Main Process (Electron)
     ↓
printer-handlers.ts   ← unchanged
     ↓
thermal-printer.ts    ← rewritten
     ↓
escpos.Printer + USB adapter (escpos-usb → node-usb → libusb)
     ↓
EPSON TM-T81III (USB)
```

## Windows Driver Requirement

On Windows, libusb requires the **WinUSB** driver. The TM-T81III ships with a custom Epson USB driver. A **one-time setup** is needed on the POS machine:

1. Download and run **Zadig** (https://zadig.akeo.ie)
2. Select "EPSON TM-T81III" from the device list
3. Replace driver with "WinUSB"
4. The printer disappears from "Devices and Printers" — this is expected
5. libusb (and therefore escpos-usb) can now access the printer directly

After this, the printer no longer works with the Windows print spooler but is fully accessible via the ESC/POS USB path in PharmaPOS.

## TCP Fallback

Keep TCP/IP as a fully supported fallback using `escpos-network`. If USB setup is not complete, users can configure the printer's IP address (port 9100) and print over the network instead. The `escpos-network` adapter is pure Node.js with no native dependencies.

## Files Changed

| File | Change |
|---|---|
| `package.json` | Add `escpos`, `escpos-usb`, `escpos-network`; remove `node-thermal-printer` |
| `package.json` rebuild script | Add `usb` to `-w` flag: `-w better-sqlite3,usb` |
| `electron-builder.yml` | No change — `npmRebuild: false` already set |
| `src/main/services/printer/thermal-printer.ts` | Full rewrite using escpos API |
| `src/main/services/printer/receipt-formatter.ts` | Update to escpos.Printer API |
| `src/main/ipc/printer-handlers.ts` | No change — public IPC API preserved |
| `src/renderer/src/components/settings/PrinterSetupWizard.tsx` | Add WinUSB setup instructions for USB mode |

## API Mapping

| node-thermal-printer | escpos |
|---|---|
| `printer.alignCenter()` | `printer.align('CT')` |
| `printer.alignLeft()` | `printer.align('LT')` |
| `printer.bold(true)` | `printer.style('B')` |
| `printer.bold(false)` | `printer.style('NORMAL')` |
| `printer.setTextSize(1, 1)` | `printer.size(2, 2)` (1=normal, 2=double) |
| `printer.println(text)` | `printer.text(text + '\n')` |
| `printer.drawLine()` | `printer.text('─'.repeat(width) + '\n')` |
| `printer.tableCustom([...])` | Pure string padding helper |
| `printer.cut()` | `printer.cut()` |
| `printer.newLine()` | `printer.feed(1)` |
| `await printer.execute()` | `await printer.close()` (Promise-wrapped) |
| `printer.openCashDrawer()` | `printer.cashdraw(2)` |

## USB Device Discovery

`USB.findPrinter()` auto-enumerates all connected USB printers using libusb — no hardcoded VID/PID needed. The Settings UI lists discovered devices and allows the user to select the correct one.

## Public API Preserved

The following functions in `thermal-printer.ts` keep the same signatures so `printer-handlers.ts` requires no changes:

- `initializePrinter(config?: PrinterConfig): void`
- `getPrinterConfig(): PrinterConfig`
- `savePrinterConfig(config: PrinterConfig): void`
- `testPrinter(): Promise<boolean>`
- `openCashDrawer(): Promise<void>`
- `listUSBPrinters(): Promise<Array<{ name: string; path: string }>>`
- `getPrinter(): escpos.Printer`

## PrinterConfig Interface

```typescript
interface PrinterConfig {
  type: 'epson' | 'star' | 'generic'  // kept for DB compat
  interface: 'usb' | 'tcp' | 'serial'
  path?: string       // USB: device identifier; serial: COM port
  ip?: string         // TCP only
  port?: number       // TCP only (default: 9100)
  width?: number      // paper width in chars (default: 42)
}
```

## Error Handling

- USB connect failure → surface error message recommending WinUSB driver setup or switching to TCP
- TCP connect failure → surface IP/port config guidance
- Print failure → log via Winston, return `{ success: false, error: string }` to renderer
