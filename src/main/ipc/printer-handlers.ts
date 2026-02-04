import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  initializePrinter,
  savePrinterConfig,
  testPrinter,
  openCashDrawer,
  listUSBPrinters,
  getPrinter,
  type PrinterConfig
} from '../services/printer/thermal-printer'
import { printReceipt, printShiftReport } from '../services/printer/receipt-formatter'

export function registerPrinterHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PRINTER_INITIALIZE, (_event, config?: PrinterConfig) => {
    initializePrinter(config)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_TEST, async () => {
    return await testPrinter()
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_SAVE_CONFIG, (_event, config: PrinterConfig) => {
    savePrinterConfig(config)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_LIST_USB, async () => {
    return await listUSBPrinters()
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_PRINT_RECEIPT, async (_event, data) => {
    const printer = getPrinter()
    await printReceipt(printer, data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_PRINT_SHIFT_REPORT, async (_event, data) => {
    const printer = getPrinter()
    await printShiftReport(printer, data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_OPEN_DRAWER, async () => {
    await openCashDrawer()
    return { success: true }
  })
}
