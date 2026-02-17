import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission } from './middleware'
import * as inventory from '../services/inventory'
import { logAudit } from '../services/audit'

export function registerInventoryHandlers(): void {
  // =====================
  // PRODUCTS
  // =====================

  ipcMain.handle(IPC_CHANNELS.PRODUCT_LIST, async (_event, { userId }) => {
    return withPermission(userId, 'inventory:view', () => inventory.listProducts())
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_CREATE, async (_event, { userId, ...data }) => {
    return withPermission(userId, 'inventory:create', () => inventory.createProduct(data))
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_UPDATE, async (_event, { userId, id, data }) => {
    return withPermission(userId, 'inventory:update', () => inventory.updateProduct(id, data))
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_DELETE, async (_event, { userId, id }) => {
    return withPermission(userId, 'inventory:delete', () => inventory.deleteProduct(id))
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_LOW_STOCK, async (_event, { userId }) => {
    return withPermission(userId, 'inventory:view', () => inventory.getLowStockProducts())
  })

  // =====================
  // CATEGORIES
  // =====================

  ipcMain.handle(IPC_CHANNELS.CATEGORY_LIST, async (_event, { userId }) => {
    return withPermission(userId, 'inventory:view', () => inventory.listCategories())
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_CREATE, async (_event, { userId, ...data }) => {
    return withPermission(userId, 'inventory:create', () => inventory.createCategory(data))
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_UPDATE, async (_event, { userId, id, data }) => {
    return withPermission(userId, 'inventory:update', () => inventory.updateCategory(id, data))
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_DELETE, async (_event, { userId, id }) => {
    return withPermission(userId, 'inventory:delete', () => inventory.deleteCategory(id))
  })

  // =====================
  // SUPPLIERS
  // =====================

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_LIST, async (_event, { userId }) => {
    return withPermission(userId, 'inventory:view', () => inventory.listSuppliers())
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_CREATE, async (_event, { userId, ...data }) => {
    return withPermission(userId, 'inventory:create', () => inventory.createSupplier(data))
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_UPDATE, async (_event, { userId, id, data }) => {
    return withPermission(userId, 'inventory:update', () => inventory.updateSupplier(id, data))
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_DELETE, async (_event, { userId, id }) => {
    return withPermission(userId, 'inventory:delete', () => inventory.deleteSupplier(id))
  })

  // =====================
  // STOCK BATCHES
  // =====================

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_LIST, async (_event, { userId }) => {
    return withPermission(userId, 'inventory:view', () => inventory.listStockBatches())
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_CREATE, async (_event, { userId, ...data }) => {
    return withPermission(userId, 'inventory:create', () => inventory.createStockBatch(data))
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_UPDATE, async (_event, { userId, id, data }) => {
    return withPermission(userId, 'inventory:update', () => inventory.updateStockBatch(id, data))
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_DELETE, async (_event, { userId, id }) => {
    return withPermission(userId, 'inventory:delete', () => inventory.deleteStockBatch(id))
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
    return withPermission(userId, 'inventory:import_export', () => inventory.exportProductsToCSV())
  })
}
