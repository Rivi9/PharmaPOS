import { ipcMain, dialog } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission, actingUserId } from './middleware'
import * as inventory from '../services/inventory'
import { getBatchLedger } from '../services/sales'
import { logAudit } from '../services/audit'
import { importProductRows } from '../services/inventory-import'

/** Wraps a handler in a { success, data } / { success, error } envelope. */
async function wrap<T>(
  fn: () => Promise<T> | T
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await fn()
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export function registerInventoryHandlers(): void {
  // =====================
  // PRODUCTS
  // =====================

  ipcMain.handle(IPC_CHANNELS.PRODUCT_LIST, async (_event) => {
    return wrap(() => withPermission(_event, 'inventory:view', () => inventory.listProducts()))
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_CREATE, async (_event, { ...data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:create', () => inventory.createProduct(data))
    )
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_UPDATE, async (_event, { id, data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:update', () => inventory.updateProduct(id, data))
    )
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_DELETE, async (_event, { id }) => {
    return wrap(() => withPermission(_event, 'inventory:delete', () => inventory.deleteProduct(id)))
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_REACTIVATE, async (_event, { id }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:update', () => {
        inventory.reactivateProduct(id)
        logAudit({
          userId: actingUserId(_event),
          action: 'PRODUCT_UPDATED',
          entityType: 'product',
          entityId: id,
          details: { reactivated: true }
        })
        return { success: true }
      })
    )
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_LOW_STOCK, async (_event) => {
    return wrap(() =>
      withPermission(_event, 'inventory:view', () => inventory.getLowStockProducts())
    )
  })

  // =====================
  // CATEGORIES
  // =====================

  ipcMain.handle(IPC_CHANNELS.CATEGORY_LIST, async (_event) => {
    return wrap(() => withPermission(_event, 'inventory:view', () => inventory.listCategories()))
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_CREATE, async (_event, { ...data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:create', () => inventory.createCategory(data))
    )
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_UPDATE, async (_event, { id, data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:update', () => inventory.updateCategory(id, data))
    )
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_DELETE, async (_event, { id }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:delete', () => inventory.deleteCategory(id))
    )
  })

  // =====================
  // SUPPLIERS
  // =====================

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_LIST, async (_event) => {
    return wrap(() => withPermission(_event, 'inventory:view', () => inventory.listSuppliers()))
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_CREATE, async (_event, { ...data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:create', () => inventory.createSupplier(data))
    )
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_UPDATE, async (_event, { id, data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:update', () => inventory.updateSupplier(id, data))
    )
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_DELETE, async (_event, { id }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:delete', () => inventory.deleteSupplier(id))
    )
  })

  // =====================
  // STOCK BATCHES
  // =====================

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_LIST, async (_event) => {
    return wrap(() => withPermission(_event, 'inventory:view', () => inventory.listStockBatches()))
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_CREATE, async (_event, { ...data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:create', () => inventory.createStockBatch(data))
    )
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_UPDATE, async (_event, { id, data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:update', () => inventory.updateStockBatch(id, data))
    )
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_DELETE, async (_event, { id }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:delete', () => inventory.deleteStockBatch(id))
    )
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_LEDGER, async (_event, { batchId }) => {
    return wrap(() => withPermission(_event, 'inventory:view', () => getBatchLedger(batchId)))
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_ADJUST, async (_event, { ...params }) => {
    return withPermission(_event, 'inventory:update', () => {
      const { batchId, productId, adjustmentType, quantityChange, reason } = params
      inventory.adjustStockBatch({
        batchId,
        productId,
        adjustmentType: adjustmentType ?? 'correction',
        quantityChange,
        reason,
        userId: actingUserId(_event)
      })
      logAudit({
        userId: actingUserId(_event),
        action: 'STOCK_ADJUSTED',
        entityType: 'stock_batch',
        entityId: batchId,
        details: { quantity_change: quantityChange, reason }
      })
      return { success: true }
    })
  })

  // =====================
  // CSV EXPORT
  // =====================

  ipcMain.handle(IPC_CHANNELS.PRODUCT_EXPORT_CSV, async (_event) => {
    return wrap(() =>
      withPermission(_event, 'inventory:import_export', () => inventory.exportProductsToCSV())
    )
  })

  // =====================
  // EXCEL IMPORT
  // =====================

  ipcMain.handle(IPC_CHANNELS.PRODUCT_IMPORT_CSV, async (_event) => {
    return withPermission(_event, 'inventory:import_export', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import Products from Excel',
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
        properties: ['openFile']
      })

      if (canceled || !filePaths[0]) {
        return { canceled: true, imported: 0, errors: [] }
      }

      let sheetRows: unknown[][]
      try {
        // Preferred parser.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const readXlsxFile = require('read-excel-file/node') as (
          filePath: string
        ) => Promise<unknown[][]>
        sheetRows = await readXlsxFile(filePaths[0])
      } catch (error: any) {
        // Temporary compatibility fallback if read-excel-file is not installed yet.
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const XLSX = require('xlsx') as any
          const workbook = XLSX.readFile(filePaths[0])
          const sheetName = workbook.SheetNames[0]
          sheetRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1
          }) as unknown[][]
        } catch {
          if (String(error?.message || '').includes("Cannot find module 'read-excel-file/node'")) {
            throw new Error(
              'Excel import dependency missing. Run "npm install" (or "npm ci") and restart the app.'
            )
          }
          throw error
        }
      }
      const outcome = importProductRows(sheetRows)

      logAudit({
        userId: actingUserId(_event),
        action: 'PRODUCTS_IMPORTED_EXCEL',
        entityType: 'product',
        details: {
          file: filePaths[0],
          rows: outcome.totalRows,
          imported: outcome.imported,
          batches: outcome.batchesCreated,
          errors: outcome.errors.length + outcome.errorsTruncated
        }
      })

      return { canceled: false, ...outcome }
    })
  })
}
