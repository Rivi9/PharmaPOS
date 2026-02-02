import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import * as inventory from '../services/inventory'

export function registerInventoryHandlers(): void {
  // =====================
  // PRODUCTS
  // =====================

  ipcMain.handle(IPC_CHANNELS.PRODUCT_LIST, () => {
    try {
      const products = inventory.listProducts()
      return { success: true, data: products }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_CREATE, (_, data) => {
    try {
      const result = inventory.createProduct(data)
      return { success: true, ...result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_UPDATE, (_, { id, data }) => {
    try {
      inventory.updateProduct(id, data)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_DELETE, (_, id: string) => {
    try {
      inventory.deleteProduct(id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_LOW_STOCK, () => {
    try {
      const products = inventory.getLowStockProducts()
      return { success: true, data: products }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // =====================
  // CATEGORIES
  // =====================

  ipcMain.handle(IPC_CHANNELS.CATEGORY_LIST, () => {
    try {
      const categories = inventory.listCategories()
      return { success: true, data: categories }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_CREATE, (_, data) => {
    try {
      const result = inventory.createCategory(data)
      return { success: true, ...result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_UPDATE, (_, { id, data }) => {
    try {
      inventory.updateCategory(id, data)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_DELETE, (_, id: string) => {
    try {
      inventory.deleteCategory(id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // =====================
  // SUPPLIERS
  // =====================

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_LIST, () => {
    try {
      const suppliers = inventory.listSuppliers()
      return { success: true, data: suppliers }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_CREATE, (_, data) => {
    try {
      const result = inventory.createSupplier(data)
      return { success: true, ...result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_UPDATE, (_, { id, data }) => {
    try {
      inventory.updateSupplier(id, data)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_DELETE, (_, id: string) => {
    try {
      inventory.deleteSupplier(id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // =====================
  // STOCK BATCHES
  // =====================

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_LIST, () => {
    try {
      const batches = inventory.listStockBatches()
      return { success: true, data: batches }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_CREATE, (_, data) => {
    try {
      const result = inventory.createStockBatch(data)
      return { success: true, ...result }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_UPDATE, (_, { id, data }) => {
    try {
      inventory.updateStockBatch(id, data)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_DELETE, (_, id: string) => {
    try {
      inventory.deleteStockBatch(id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_ADJUST, (_, { batchId, quantityChange, reason, userId }) => {
    try {
      inventory.adjustStockBatch(batchId, quantityChange, reason, userId)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })
}
