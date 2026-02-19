import { ipcMain, dialog } from 'electron'
import * as XLSX from 'xlsx'
import { IPC_CHANNELS } from './channels'
import { withPermission } from './middleware'
import * as inventory from '../services/inventory'
import { logAudit } from '../services/audit'
import { getDatabase } from '../services/database'

/** Wraps a handler in a { success, data } / { success, error } envelope. */
async function wrap<T>(fn: () => Promise<T> | T): Promise<{ success: true; data: T } | { success: false; error: string }> {
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

  ipcMain.handle(IPC_CHANNELS.PRODUCT_LIST, async (_event, { userId }) => {
    return wrap(() => withPermission(userId, 'inventory:view', () => inventory.listProducts()))
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_CREATE, async (_event, { userId, ...data }) => {
    return wrap(() => withPermission(userId, 'inventory:create', () => inventory.createProduct(data)))
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_UPDATE, async (_event, { userId, id, data }) => {
    return wrap(() => withPermission(userId, 'inventory:update', () => inventory.updateProduct(id, data)))
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_DELETE, async (_event, { userId, id }) => {
    return wrap(() => withPermission(userId, 'inventory:delete', () => inventory.deleteProduct(id)))
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_LOW_STOCK, async (_event, { userId }) => {
    return wrap(() => withPermission(userId, 'inventory:view', () => inventory.getLowStockProducts()))
  })

  // =====================
  // CATEGORIES
  // =====================

  ipcMain.handle(IPC_CHANNELS.CATEGORY_LIST, async (_event, { userId }) => {
    return wrap(() => withPermission(userId, 'inventory:view', () => inventory.listCategories()))
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_CREATE, async (_event, { userId, ...data }) => {
    return wrap(() => withPermission(userId, 'inventory:create', () => inventory.createCategory(data)))
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_UPDATE, async (_event, { userId, id, data }) => {
    return wrap(() => withPermission(userId, 'inventory:update', () => inventory.updateCategory(id, data)))
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_DELETE, async (_event, { userId, id }) => {
    return wrap(() => withPermission(userId, 'inventory:delete', () => inventory.deleteCategory(id)))
  })

  // =====================
  // SUPPLIERS
  // =====================

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_LIST, async (_event, { userId }) => {
    return wrap(() => withPermission(userId, 'inventory:view', () => inventory.listSuppliers()))
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_CREATE, async (_event, { userId, ...data }) => {
    return wrap(() => withPermission(userId, 'inventory:create', () => inventory.createSupplier(data)))
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_UPDATE, async (_event, { userId, id, data }) => {
    return wrap(() => withPermission(userId, 'inventory:update', () => inventory.updateSupplier(id, data)))
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_DELETE, async (_event, { userId, id }) => {
    return wrap(() => withPermission(userId, 'inventory:delete', () => inventory.deleteSupplier(id)))
  })

  // =====================
  // STOCK BATCHES
  // =====================

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_LIST, async (_event, { userId }) => {
    return wrap(() => withPermission(userId, 'inventory:view', () => inventory.listStockBatches()))
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_CREATE, async (_event, { userId, ...data }) => {
    return wrap(() => withPermission(userId, 'inventory:create', () => inventory.createStockBatch(data)))
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_UPDATE, async (_event, { userId, id, data }) => {
    return wrap(() => withPermission(userId, 'inventory:update', () => inventory.updateStockBatch(id, data)))
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_DELETE, async (_event, { userId, id }) => {
    return wrap(() => withPermission(userId, 'inventory:delete', () => inventory.deleteStockBatch(id)))
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_ADJUST, async (_event, { userId, ...params }) => {
    return withPermission(userId, 'inventory:update', () => {
      const { batchId, productId, adjustmentType, quantityChange, reason } = params
      inventory.adjustStockBatch({
        batchId,
        productId,
        adjustmentType: adjustmentType ?? 'correction',
        quantityChange,
        reason,
        userId
      })
      logAudit({
        userId,
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

  ipcMain.handle(IPC_CHANNELS.PRODUCT_EXPORT_CSV, async (_event, { userId }) => {
    return wrap(() => withPermission(userId, 'inventory:import_export', () => inventory.exportProductsToCSV()))
  })

  // =====================
  // EXCEL IMPORT
  // =====================

  ipcMain.handle(IPC_CHANNELS.PRODUCT_IMPORT_CSV, async (_event, { userId }) => {
    return withPermission(userId, 'inventory:import_export', async () => {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Import Products from Excel',
        filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }],
        properties: ['openFile']
      })

      if (canceled || !filePaths[0]) {
        return { canceled: true, imported: 0, errors: [] }
      }

      const workbook = XLSX.readFile(filePaths[0])
      const sheetName = workbook.SheetNames[0]
      const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName])

      const errors: string[] = []
      let imported = 0

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        const rowNum = i + 2 // 1-indexed + header row

        const name = String(row['name'] ?? row['Name'] ?? '').trim()
        if (!name) {
          errors.push(`Row ${rowNum}: missing "name"`)
          continue
        }

        const costPrice = parseFloat(String(row['cost_price'] ?? row['Cost Price'] ?? '0'))
        const unitPrice = parseFloat(String(row['unit_price'] ?? row['Unit Price'] ?? row['Selling Price'] ?? '0'))
        const rawCurrentStock =
          row['current_stock'] ??
          row['Current Stock'] ??
          row['current stock'] ??
          row['stock'] ??
          row['Stock'] ??
          ''
        const currentStockText = String(rawCurrentStock).trim()
        const currentStock = currentStockText === '' ? 0 : parseFloat(currentStockText)

        if (isNaN(costPrice) || isNaN(unitPrice)) {
          errors.push(`Row ${rowNum}: invalid cost_price or unit_price for "${name}"`)
          continue
        }
        if (isNaN(currentStock) || currentStock < 0) {
          errors.push(`Row ${rowNum}: invalid current_stock for "${name}"`)
          continue
        }

        try {
          const db = getDatabase()
          db.transaction(() => {
            const created = inventory.createProduct({
              name,
              generic_name: String(row['generic_name'] ?? row['Generic Name'] ?? '').trim() || undefined,
              barcode: String(row['barcode'] ?? row['Barcode'] ?? '').trim() || undefined,
              sku: String(row['sku'] ?? row['SKU'] ?? '').trim() || undefined,
              cost_price: costPrice,
              unit_price: unitPrice,
              tax_rate: parseFloat(String(row['tax_rate'] ?? row['Tax Rate'] ?? '0')) || 0,
              reorder_level: parseInt(String(row['reorder_level'] ?? row['Reorder Level'] ?? '5')) || 5,
              unit: String(row['unit'] ?? row['Unit'] ?? 'pcs').trim() || 'pcs'
            })
            if (currentStock > 0) {
              inventory.createStockBatch({
                product_id: created.id,
                quantity: currentStock,
                cost_price: costPrice
              })
            }
          })()
          imported++
        } catch (err: any) {
          errors.push(`Row ${rowNum} "${name}": ${err.message}`)
        }
      }

      logAudit({
        userId,
        action: 'PRODUCTS_IMPORTED_EXCEL',
        entityType: 'product',
        details: { file: filePaths[0], imported, errors: errors.length }
      })

      return { canceled: false, imported, errors }
    })
  })
}
