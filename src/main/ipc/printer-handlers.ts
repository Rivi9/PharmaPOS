import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
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

export function registerPrinterHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PRINTER_GET_CONFIG, () => {
    return getPrinterConfig()
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_INITIALIZE, (_event, config?: PrinterConfig) => {
    try {
      initializePrinter(config)
      return { success: true }
    } catch (error) {
      console.warn('Printer initialize failed:', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_TEST, async () => {
    try {
      await testPrinter()
      return { success: true }
    } catch (error) {
      console.warn('Printer test failed:', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_SAVE_CONFIG, (_event, config: PrinterConfig) => {
    try {
      savePrinterConfig(config)
      return { success: true }
    } catch (error) {
      console.warn('Printer save config failed:', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_LIST_USB, async () => {
    return await listUSBPrinters()
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_PRINT_RECEIPT, async (_event, data) => {
    try {
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

  ipcMain.handle(IPC_CHANNELS.PRINTER_PRINT_SHIFT_REPORT, async (_event, data) => {
    try {
      const printer = getPrinter()
      await printShiftReport(printer, data)
      return { success: true }
    } catch (error) {
      console.warn('Print shift report failed:', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_OPEN_DRAWER, async () => {
    try {
      await openCashDrawer()
      return { success: true }
    } catch (error) {
      console.warn('Open cash drawer failed:', (error as Error).message)
      return { success: false, error: (error as Error).message }
    }
  })
}
