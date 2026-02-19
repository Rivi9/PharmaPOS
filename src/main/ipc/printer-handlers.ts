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
    return await testPrinter()
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
      await printReceipt(printer, data)
      return { success: true }
    } catch (error) {
      console.warn('Print receipt failed:', (error as Error).message)
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
