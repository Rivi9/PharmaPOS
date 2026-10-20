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

/**
 * Record a mutation, with only the fields that actually changed.
 *
 * H13: across this whole file `logAudit` appeared twice. Creating, updating or
 * deleting products, categories, suppliers and batches left no trace whatsoever,
 * so shrinkage could not be attributed to anyone and price history could not be
 * reconstructed for tax.
 */
function auditDiff(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  keys: string[]
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of keys) {
    const from = before?.[key]
    const to = after?.[key]
    if (from !== to) changes[key] = { from, to }
  }
  return changes
}

const PRODUCT_AUDIT_KEYS = [
  'name',
  'generic_name',
  'barcode',
  'sku',
  'cost_price',
  'unit_price',
  'tax_rate',
  'reorder_level',
  'reorder_qty',
  'unit',
  'track_expiry',
  'category_id',
  'supplier_id',
  'is_active'
]

export function registerInventoryHandlers(): void {
  // =====================
  // PRODUCTS
  // =====================

  ipcMain.handle(IPC_CHANNELS.PRODUCT_LIST, async (_event) => {
    return wrap(() => withPermission(_event, 'inventory:view', () => inventory.listProducts()))
  })

  // Paged and searched in SQL. The unpaged channel above is kept for the CSV
  // export, which genuinely does want every row (H18).
  ipcMain.handle(IPC_CHANNELS.PRODUCT_LIST_PAGE, async (_event, query) => {
    return wrap(() =>
      withPermission(_event, 'inventory:view', () => inventory.listProductsPage(query ?? {}))
    )
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_CREATE, async (_event, { ...data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:create', () => {
        const created = inventory.createProduct(data)
        logAudit({
          userId: actingUserId(_event),
          action: 'PRODUCT_CREATED',
          entityType: 'product',
          entityId: created.id,
          details: { name: data.name, cost_price: data.cost_price, unit_price: data.unit_price }
        })
        return created
      })
    )
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_UPDATE, async (_event, { id, data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:update', () => {
        const before = inventory.getProductRow(id) as Record<string, unknown> | undefined
        inventory.updateProduct(id, data)
        const after = inventory.getProductRow(id) as Record<string, unknown> | undefined
        const changes = auditDiff(before, after, PRODUCT_AUDIT_KEYS)

        if (Object.keys(changes).length) {
          logAudit({
            userId: actingUserId(_event),
            action: 'PRODUCT_UPDATED',
            entityType: 'product',
            entityId: id,
            details: { name: after?.name, changes }
          })
        }
        // A price move gets its own entry: PRICE_CHANGED is what a tax audit
        // reads, and it should not have to sift every unrelated edit to find it.
        if (changes.unit_price || changes.cost_price) {
          logAudit({
            userId: actingUserId(_event),
            action: 'PRICE_CHANGED',
            entityType: 'product',
            entityId: id,
            details: {
              name: after?.name,
              unit_price: changes.unit_price,
              cost_price: changes.cost_price
            }
          })
        }
      })
    )
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_DELETE, async (_event, { id }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:delete', () => {
        const before = inventory.getProductRow(id) as Record<string, unknown> | undefined
        const result = inventory.deleteProduct(id)
        logAudit({
          userId: actingUserId(_event),
          action: 'PRODUCT_DELETED',
          entityType: 'product',
          entityId: id,
          details: { name: before?.name, discontinued: true }
        })
        return result
      })
    )
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
      withPermission(_event, 'inventory:create', () => {
        const created = inventory.createCategory(data)
        logAudit({
          userId: actingUserId(_event),
          action: 'CATEGORY_CREATED',
          entityType: 'category',
          entityId: created.id,
          details: { name: data.name }
        })
        return created
      })
    )
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_UPDATE, async (_event, { id, data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:update', () => {
        inventory.updateCategory(id, data)
        logAudit({
          userId: actingUserId(_event),
          action: 'CATEGORY_UPDATED',
          entityType: 'category',
          entityId: id,
          details: { ...data }
        })
      })
    )
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_DELETE, async (_event, { id }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:delete', () => {
        const result = inventory.deleteCategory(id)
        logAudit({
          userId: actingUserId(_event),
          action: 'CATEGORY_DELETED',
          entityType: 'category',
          entityId: id
        })
        return result
      })
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
      withPermission(_event, 'inventory:create', () => {
        const created = inventory.createSupplier(data)
        logAudit({
          userId: actingUserId(_event),
          action: 'SUPPLIER_CREATED',
          entityType: 'supplier',
          entityId: created.id,
          details: { name: data.name }
        })
        return created
      })
    )
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_UPDATE, async (_event, { id, data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:update', () => {
        inventory.updateSupplier(id, data)
        logAudit({
          userId: actingUserId(_event),
          action: 'SUPPLIER_UPDATED',
          entityType: 'supplier',
          entityId: id,
          details: { ...data }
        })
      })
    )
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_DELETE, async (_event, { id }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:delete', () => {
        const result = inventory.deleteSupplier(id)
        logAudit({
          userId: actingUserId(_event),
          action: 'SUPPLIER_DELETED',
          entityType: 'supplier',
          entityId: id,
          details: { deactivated: true }
        })
        return result
      })
    )
  })

  // =====================
  // STOCK BATCHES
  // =====================

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_LIST, async (_event) => {
    return wrap(() => withPermission(_event, 'inventory:view', () => inventory.listStockBatches()))
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_LIST_PAGE, async (_event, query) => {
    return wrap(() =>
      withPermission(_event, 'inventory:view', () => inventory.listStockBatchesPage(query ?? {}))
    )
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_CREATE, async (_event, { ...data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:create', () => {
        const created = inventory.createStockBatch(data)
        logAudit({
          userId: actingUserId(_event),
          action: 'STOCK_BATCH_CREATED',
          entityType: 'stock_batch',
          entityId: created.id,
          details: {
            product_id: data.product_id,
            quantity: data.quantity,
            cost_price: data.cost_price,
            expiry_date: data.expiry_date ?? null,
            batch_number: data.batch_number ?? null
          }
        })
        return created
      })
    )
  })

  /**
   * H13: the Edit pencil issued an absolute `UPDATE ... SET quantity = ?` — 5 to
   * 500 or back — with no `inventory_adjustments` row and no audit entry, so
   * shrinkage could not be attributed to anyone. A quantity change now goes
   * through `adjustStockBatch`, which writes the adjustment record, and the delta
   * is derived here from the stored row rather than trusted from the renderer.
   */
  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_UPDATE, async (_event, { id, data }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:update', () => {
        const before = inventory.getStockBatchById(id)
        if (!before) throw new Error('Stock batch not found')

        const { quantity, adjustment_reason: adjustmentReason, ...rest } = data ?? {}

        if (Object.keys(rest).length) {
          inventory.updateStockBatch(id, rest)
        }

        if (quantity !== undefined && Number(quantity) !== before.quantity) {
          const target = Number(quantity)
          if (!Number.isFinite(target) || target < 0 || !Number.isInteger(target)) {
            throw new Error('Quantity must be a whole number, not negative')
          }
          const reason = adjustmentReason || 'Corrected while editing the batch'
          inventory.adjustStockBatch({
            batchId: id,
            productId: before.productId,
            adjustmentType: 'correction',
            quantityChange: target - before.quantity,
            reason,
            userId: actingUserId(_event)
          })
          logAudit({
            userId: actingUserId(_event),
            action: 'STOCK_ADJUSTED',
            entityType: 'stock_batch',
            entityId: id,
            details: {
              from: before.quantity,
              to: target,
              quantity_change: target - before.quantity,
              reason
            }
          })
        }

        const after = inventory.getStockBatchById(id)
        const changes = auditDiff(
          before as unknown as Record<string, unknown>,
          after as unknown as Record<string, unknown>,
          ['batchNumber', 'costPrice', 'sellingPrice', 'expiryDate', 'supplierId']
        )
        if (Object.keys(changes).length) {
          logAudit({
            userId: actingUserId(_event),
            action: 'STOCK_BATCH_UPDATED',
            entityType: 'stock_batch',
            entityId: id,
            details: { changes }
          })
        }
      })
    )
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_DELETE, async (_event, { id }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:delete', () => {
        const before = inventory.getStockBatchById(id)
        const result = inventory.deleteStockBatch(id)
        logAudit({
          userId: actingUserId(_event),
          action: 'STOCK_BATCH_DELETED',
          entityType: 'stock_batch',
          entityId: id,
          details: {
            product_id: before?.productId,
            batch_number: before?.batchNumber,
            expiry_date: before?.expiryDate
          }
        })
        return result
      })
    )
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_LEDGER, async (_event, { batchId }) => {
    return wrap(() => withPermission(_event, 'inventory:view', () => getBatchLedger(batchId)))
  })

  /**
   * M14: the preload never sent `productId`, and `inventory_adjustments.product_id`
   * is NOT NULL — so the insert failed and rolled back the quantity change with it.
   * The only *audited* stock-adjustment path in the app therefore did nothing at
   * all. It is derived from the batch here rather than accepted from the renderer,
   * which also makes it impossible to file an adjustment against the wrong product.
   */
  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_ADJUST, async (_event, { ...params }) => {
    return wrap(() =>
      withPermission(_event, 'inventory:update', () => {
        const { batchId, adjustmentType, quantityChange, reason } = params

        const batch = inventory.getStockBatchById(batchId)
        if (!batch) throw new Error('Stock batch not found')

        const change = Number(quantityChange)
        if (!Number.isFinite(change) || !Number.isInteger(change) || change === 0) {
          throw new Error('Adjustment must be a whole number of units, and not zero')
        }
        if (batch.quantity + change < 0) {
          throw new Error(
            `Cannot remove ${Math.abs(change)} — the batch only holds ${batch.quantity}`
          )
        }
        const why = String(reason ?? '').trim()
        if (!why) throw new Error('Say why the stock is being adjusted')

        inventory.adjustStockBatch({
          batchId,
          productId: batch.productId,
          adjustmentType: adjustmentType ?? 'correction',
          quantityChange: change,
          reason: why,
          userId: actingUserId(_event)
        })
        logAudit({
          userId: actingUserId(_event),
          action: 'STOCK_ADJUSTED',
          entityType: 'stock_batch',
          entityId: batchId,
          details: {
            product_id: batch.productId,
            from: batch.quantity,
            to: batch.quantity + change,
            quantity_change: change,
            reason: why
          }
        })
        return { success: true }
      })
    )
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
          skipped_existing: outcome.skippedCount,
          errors: outcome.errors.length + outcome.errorsTruncated
        }
      })

      return { canceled: false, ...outcome }
    })
  })
}
