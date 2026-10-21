import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission } from './middleware'
import {
  initializePrinter,
  getPrinterConfig,
  savePrinterConfig,
  testPrinter,
  openCashDrawer,
  listUSBPrinters,
  getPrinter,
  type PrinterConfig
} from '../services/printer/thermal-printer'
import { printReceipt, printShiftReport } from '../services/printer/receipt-formatter'
import { logError } from '../services/logging/logger'
import {
  unsupportedCharacters,
  resetUnsupportedCharacters
} from '../services/printer/escpos-builder'

/**
 * None of these channels had a session or permission check. Saving or
 * re-initialising the config with a renderer-chosen network address redirects
 * every receipt — customer names, phones, what they were dispensed — to another
 * machine; opening the drawer needed no login at all. Configuration is now
 * admin-only (as the Settings screen that drives it already is), and the
 * till-side channels need someone signed in to sell.
 *
 * Refusals come back through the same `{ success: false, error }` envelope as a
 * printer fault, because that is what every caller already handles.
 */
export function registerPrinterHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PRINTER_GET_CONFIG, (event) => {
    return withPermission(event, 'settings:view', () => getPrinterConfig())
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_INITIALIZE, async (event, config?: PrinterConfig) => {
    try {
      await withPermission(event, 'settings:update', () => initializePrinter(config))
      return { success: true }
    } catch (error) {
      console.warn('Printer initialize failed:', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_TEST, async (event) => {
    try {
      await withPermission(event, 'settings:update', () => testPrinter())
      return { success: true }
    } catch (error) {
      console.warn('Printer test failed:', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_SAVE_CONFIG, async (event, config: PrinterConfig) => {
    try {
      await withPermission(event, 'settings:update', () => savePrinterConfig(config))
      return { success: true }
    } catch (error) {
      console.warn('Printer save config failed:', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_LIST_USB, async () => {
    return await listUSBPrinters()
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_PRINT_RECEIPT, async (event, data) => {
    try {
      await withPermission(event, 'sales:create', () => undefined)
      const printer = getPrinter()
      const { reprint, ...receipt } = data as { reprint?: boolean }
      resetUnsupportedCharacters()
      await printReceipt(printer, receipt as never, { reprint })
      // M11: characters a CP437 printer cannot represent used to become '?'
      // silently, so Sinhala or Tamil text reached the customer as ????????.
      // The print still succeeds — refusing it would be worse — but the caller
      // is told, so it can be raised with the operator rather than discovered
      // on a dispensing record.
      const unsupported = unsupportedCharacters()
      return unsupported.length > 0
        ? {
            success: true,
            warning:
              `The printer cannot print these characters: ${unsupported.join(' ')} — ` +
              'they came out as "?". Use Latin text for anything that must appear on a receipt.'
          }
        : { success: true }
    } catch (error) {
      logError('Print receipt failed', error as Error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_PRINT_SHIFT_REPORT, async (event, data) => {
    try {
      await withPermission(event, 'shifts:manage', () => undefined)
      const printer = getPrinter()
      await printShiftReport(printer, data)
      return { success: true }
    } catch (error) {
      console.warn('Print shift report failed:', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_OPEN_DRAWER, async (event) => {
    try {
      await withPermission(event, 'sales:create', () => openCashDrawer())
      return { success: true }
    } catch (error) {
      console.warn('Open cash drawer failed:', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }
  })
}
