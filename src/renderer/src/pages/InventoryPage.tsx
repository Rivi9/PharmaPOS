import { useEffect, useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Plus, Download, Upload, Search } from 'lucide-react'
import { useInventoryStore } from '@renderer/stores/inventoryStore'
import type { Product, Category, Supplier, StockBatch } from '@renderer/stores/inventoryStore'
import { useAuthStore } from '@renderer/stores/authStore'

// Tables
import { ProductsTable } from '@renderer/components/inventory/ProductsTable'
import { CategoriesTable } from '@renderer/components/inventory/CategoriesTable'
import { SuppliersTable } from '@renderer/components/inventory/SuppliersTable'
import { BatchHistoryDialog } from '@renderer/components/inventory/BatchHistoryDialog'
import { StockBatchesTable } from '@renderer/components/inventory/StockBatchesTable'

// Forms
import { ProductFormDialog } from '@renderer/components/inventory/ProductFormDialog'
import { CategoryFormDialog } from '@renderer/components/inventory/CategoryFormDialog'
import { SupplierFormDialog } from '@renderer/components/inventory/SupplierFormDialog'
import { StockBatchFormDialog } from '@renderer/components/inventory/StockBatchFormDialog'

// Alerts
import { LowStockAlert } from '@renderer/components/inventory/LowStockAlert'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { useConfirm } from '@renderer/hooks/useConfirm'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

export function InventoryPage(): React.JSX.Element {
  const { user } = useAuthStore()
  const userId = user?.id ?? ''
  const { confirm, notify, confirmProps } = useConfirm()

  const {
    products,
    setProducts,
    categories,
    setCategories,
    suppliers,
    setSuppliers,
    stockBatches,
    setStockBatches,
    lowStockProducts,
    setLowStockProducts
  } = useInventoryStore()

  // Dialog states
  const [productDialogOpen, setProductDialogOpen] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false)
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)

  // Search states
  const [productSearch, setProductSearch] = useState('')
  const [categorySearch, setCategorySearch] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const [batchSearch, setBatchSearch] = useState('')

  // Selected items for editing
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<StockBatch | null>(null)

  // Load data on mount
  useEffect(() => {
    loadAllData()
  }, [])

  const loadAllData = async () => {
    await Promise.all([
      loadProducts(),
      loadCategories(),
      loadSuppliers(),
      loadStockBatches(),
      loadLowStockProducts()
    ])
  }

  const loadProducts = async () => {
    const result = await window.electron.listProducts(userId)
    if (result.success) {
      setProducts(result.data)
    }
  }

  const loadLowStockProducts = async () => {
    const result = await window.electron.getLowStockProducts(userId)
    if (result.success) {
      setLowStockProducts(result.data)
    }
  }

  const loadCategories = async () => {
    const result = await window.electron.listCategories(userId)
    if (result.success) {
      setCategories(result.data)
    }
  }

  const loadSuppliers = async () => {
    const result = await window.electron.listSuppliers(userId)
    if (result.success) {
      setSuppliers(result.data)
    }
  }

  const loadStockBatches = async () => {
    const result = await window.electron.listStockBatches(userId)
    if (result.success) {
      setStockBatches(result.data)
    }
  }

  // Product handlers
  const handleProductSubmit = async (data: any) => {
    if (selectedProduct) {
      const result = await window.electron.updateProduct(userId, selectedProduct.id, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        await loadProducts()
        await loadLowStockProducts()
        setProductDialogOpen(false)
        setSelectedProduct(null)
      }
    } else {
      const result = await window.electron.createProduct(userId, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        await loadProducts()
        await loadLowStockProducts()
        setProductDialogOpen(false)
      }
    }
  }

  const [historyBatch, setHistoryBatch] = useState<StockBatch | null>(null)

  const handleProductReactivate = async (product: Product): Promise<void> => {
    const result = await window.electron.reactivateProduct(userId, product.id)
    if (result.success) {
      await Promise.all([loadProducts(), loadStockBatches()])
    } else {
      await notify('Could not restore the product', result.error)
    }
  }

  const handleProductEdit = (product: Product) => {
    setSelectedProduct(product)
    setProductDialogOpen(true)
  }

  const handleProductDelete = async (product: Product) => {
    const ok = await confirm({
      title: `Discontinue ${product.name}?`,
      description:
        'It disappears from the till and from searches. Any remaining stock stays recorded, and you can restore it later from the Discontinued filter.',
      confirmLabel: 'Discontinue',
      destructive: true
    })
    if (!ok) return
    const result = await window.electron.deleteProduct(userId, product.id)
    if (result.success) {
      // Reload batches too — the deleted product's batches are now stale.
      await Promise.all([loadProducts(), loadStockBatches()])
    } else {
      await notify('Could not discontinue the product', result.error)
    }
  }

  // Category handlers
  const handleCategorySubmit = async (data: any) => {
    if (selectedCategory) {
      const result = await window.electron.updateCategory(userId, selectedCategory.id, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        await loadCategories()
        setCategoryDialogOpen(false)
        setSelectedCategory(null)
      }
    } else {
      const result = await window.electron.createCategory(userId, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        await loadCategories()
        setCategoryDialogOpen(false)
      }
    }
  }

  const handleCategoryEdit = (category: Category) => {
    setSelectedCategory(category)
    setCategoryDialogOpen(true)
  }

  const handleCategoryDelete = async (category: Category) => {
    const ok = await confirm({
      title: `Delete the ${category.name} category?`,
      description: 'This cannot be undone. Categories still holding products cannot be deleted.',
      confirmLabel: 'Delete',
      destructive: true
    })
    if (!ok) return
    const result = await window.electron.deleteCategory(userId, category.id)
    if (result.success) {
      await loadCategories()
      await loadProducts()
    } else {
      await notify('Could not delete the category', result.error)
    }
  }

  // Supplier handlers
  const handleSupplierSubmit = async (data: any) => {
    if (selectedSupplier) {
      const result = await window.electron.updateSupplier(userId, selectedSupplier.id, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        await loadSuppliers()
        setSupplierDialogOpen(false)
        setSelectedSupplier(null)
      }
    } else {
      const result = await window.electron.createSupplier(userId, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        await loadSuppliers()
        setSupplierDialogOpen(false)
      }
    }
  }

  const handleSupplierEdit = (supplier: Supplier) => {
    setSelectedSupplier(supplier)
    setSupplierDialogOpen(true)
  }

  const handleSupplierDelete = async (supplier: Supplier) => {
    const ok = await confirm({
      title: `Deactivate ${supplier.name}?`,
      description:
        'They stop appearing when you record new stock. Existing batches keep their link to them.',
      confirmLabel: 'Deactivate',
      destructive: true
    })
    if (!ok) return
    const result = await window.electron.deleteSupplier(userId, supplier.id)
    if (result.success) {
      await loadSuppliers()
    } else {
      await notify('Could not deactivate the supplier', result.error)
    }
  }

  // Stock batch handlers
  const handleBatchSubmit = async (data: any) => {
    if (selectedBatch) {
      const result = await window.electron.updateStockBatch(userId, selectedBatch.id, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        await loadStockBatches()
        await loadProducts() // Refresh products to update stock counts
        await loadLowStockProducts()
        setBatchDialogOpen(false)
        setSelectedBatch(null)
      }
    } else {
      const result = await window.electron.createStockBatch(userId, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        await loadStockBatches()
        await loadProducts() // Refresh products to update stock counts
        await loadLowStockProducts()
        setBatchDialogOpen(false)
      }
    }
  }

  const handleBatchEdit = (batch: StockBatch) => {
    setSelectedBatch(batch)
    setBatchDialogOpen(true)
  }

  const handleBatchDelete = async (batch: StockBatch) => {
    const ok = await confirm({
      title: batch.batch_number ? `Delete batch ${batch.batch_number}?` : 'Delete this batch?',
      description:
        'This removes it from the stock history for good. Batches that still hold stock cannot be deleted — adjust the quantity to zero first.',
      confirmLabel: 'Delete',
      destructive: true
    })
    if (!ok) return
    const result = await window.electron.deleteStockBatch(userId, batch.id)
    if (result.success) {
      await loadStockBatches()
      await loadProducts() // Refresh products to update stock counts
      await loadLowStockProducts()
    } else {
      await notify('Could not delete the batch', result.error)
    }
  }

  // Excel Import
  const [importResult, setImportResult] = useState<{
    imported: number
    batchesCreated?: number
    errors: string[]
    errorsTruncated?: number
    totalRows?: number
  } | null>(null)

  const handleImportExcel = async () => {
    try {
      const result = await window.electron.importProductsExcel(userId)
      if (!result.canceled) {
        await loadProducts()
        await loadStockBatches()
        await loadLowStockProducts()
        setImportResult({ imported: result.imported, errors: result.errors })
      }
    } catch (error) {
      await notify('Import failed', ipcErrorMessage(error))
    }
  }

  // CSV Export
  const handleExportProducts = async () => {
    const result = await window.electron.exportProductsCSV(userId)
    if (result.success) {
      const blob = new Blob([result.data], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `products-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  // Filtered data based on search
  const filteredProducts = useMemo(() => {
    if (!productSearch) return products
    const query = productSearch.toLowerCase()
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.generic_name?.toLowerCase().includes(query) ||
        p.sku?.toLowerCase().includes(query) ||
        p.barcode?.toLowerCase().includes(query) ||
        p.category_name?.toLowerCase().includes(query) ||
        p.supplier_name?.toLowerCase().includes(query)
    )
  }, [products, productSearch])

  const filteredCategories = useMemo(() => {
    if (!categorySearch) return categories
    const query = categorySearch.toLowerCase()
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query) ||
        c.parent_name?.toLowerCase().includes(query)
    )
  }, [categories, categorySearch])

  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch) return suppliers
    const query = supplierSearch.toLowerCase()
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.contact_person?.toLowerCase().includes(query) ||
        s.phone?.toLowerCase().includes(query) ||
        s.email?.toLowerCase().includes(query)
    )
  }, [suppliers, supplierSearch])

  const filteredBatches = useMemo(() => {
    if (!batchSearch) return stockBatches
    const query = batchSearch.toLowerCase()
    return stockBatches.filter(
      (b) =>
        b.batch_number?.toLowerCase().includes(query) ||
        b.product_name?.toLowerCase().includes(query) ||
        b.sku?.toLowerCase().includes(query) ||
        b.supplier_name?.toLowerCase().includes(query)
    )
  }, [stockBatches, batchSearch])

  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Inventory Management</h1>
        <p className="text-muted-foreground">Manage products, categories, suppliers, and stock</p>
      </div>

      <LowStockAlert lowStockProducts={lowStockProducts} />

      <Tabs defaultValue="products" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="stock">Stock Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="flex-1 min-h-0 flex flex-col mt-6 space-y-4">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search products by name, SKU, barcode..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {filteredProducts.length} of {products.length} products
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleImportExcel}>
                <Upload className="h-4 w-4 mr-2" />
                Import Excel
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportProducts}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setSelectedProduct(null)
                  setProductDialogOpen(true)
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Product
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
            <ProductsTable
              products={filteredProducts}
              onEdit={handleProductEdit}
              onDelete={handleProductDelete}
              onReactivate={handleProductReactivate}
            />
          </div>
        </TabsContent>

        <TabsContent value="categories" className="flex-1 min-h-0 flex flex-col mt-6 space-y-4">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search categories by name..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {filteredCategories.length} of {categories.length} categories
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setSelectedCategory(null)
                setCategoryDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Category
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
            <CategoriesTable
              categories={filteredCategories}
              onEdit={handleCategoryEdit}
              onDelete={handleCategoryDelete}
            />
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="flex-1 min-h-0 flex flex-col mt-6 space-y-4">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search suppliers by name, contact..."
                  value={supplierSearch}
                  onChange={(e) => setSupplierSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {filteredSuppliers.length} of {suppliers.length} suppliers
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setSelectedSupplier(null)
                setSupplierDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
            <SuppliersTable
              suppliers={filteredSuppliers}
              onEdit={handleSupplierEdit}
              onDelete={handleSupplierDelete}
            />
          </div>
        </TabsContent>

        <TabsContent value="stock" className="flex-1 min-h-0 flex flex-col mt-6 space-y-4">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search batches by product, batch number..."
                  value={batchSearch}
                  onChange={(e) => setBatchSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {filteredBatches.length} of {stockBatches.length} batches
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => {
                setSelectedBatch(null)
                setBatchDialogOpen(true)
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Receive Stock
            </Button>
          </div>
          <div className="flex-1 min-h-0 overflow-auto overscroll-contain">
            <StockBatchesTable
              batches={filteredBatches}
              onEdit={handleBatchEdit}
              onDelete={handleBatchDelete}
              onViewHistory={setHistoryBatch}
            />
          </div>
        </TabsContent>
      </Tabs>

      <BatchHistoryDialog
        key={historyBatch?.id ?? 'none'}
        batch={historyBatch}
        onClose={() => setHistoryBatch(null)}
      />

      {/* Dialogs */}
      <ProductFormDialog
        open={productDialogOpen}
        onClose={() => {
          setProductDialogOpen(false)
          setSelectedProduct(null)
        }}
        onSubmit={handleProductSubmit}
        product={selectedProduct}
        categories={categories}
        suppliers={suppliers}
      />

      <CategoryFormDialog
        open={categoryDialogOpen}
        onClose={() => {
          setCategoryDialogOpen(false)
          setSelectedCategory(null)
        }}
        onSubmit={handleCategorySubmit}
        category={selectedCategory}
        categories={categories}
      />

      <SupplierFormDialog
        open={supplierDialogOpen}
        onClose={() => {
          setSupplierDialogOpen(false)
          setSelectedSupplier(null)
        }}
        onSubmit={handleSupplierSubmit}
        supplier={selectedSupplier}
      />

      <StockBatchFormDialog
        open={batchDialogOpen}
        onClose={() => {
          setBatchDialogOpen(false)
          setSelectedBatch(null)
        }}
        onSubmit={handleBatchSubmit}
        batch={selectedBatch}
        products={products}
        suppliers={suppliers}
      />

      {/* Import Result Dialog */}
      <Dialog open={!!importResult} onOpenChange={() => setImportResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excel Import Complete</DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3">
              {importResult.imported > 0 ? (
                <p className="text-sm text-green-700 font-medium">
                  {importResult.imported} product{importResult.imported !== 1 ? 's' : ''} imported
                  {importResult.batchesCreated
                    ? `, ${importResult.batchesCreated} with opening stock`
                    : ''}
                  .
                </p>
              ) : (
                <>
                  <p className="text-sm text-destructive font-medium">
                    Nothing was imported — the file was not changed.
                  </p>
                  {/* The import is deliberately all-or-nothing. A half-imported
                      medicine catalogue is worse than a refused one: nobody can
                      tell which half is missing, and the stock figures are wrong
                      in a way no report reveals. */}
                  <p className="text-xs text-muted-foreground">
                    Every row has to be valid before anything is written. Fix the rows below and
                    import the sheet again.
                  </p>
                </>
              )}
              {importResult.errors.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-destructive mb-1">
                    {importResult.errors.length + (importResult.errorsTruncated ?? 0)} problem
                    {importResult.errors.length + (importResult.errorsTruncated ?? 0) !== 1
                      ? 's'
                      : ''}
                    {importResult.totalRows ? ` in ${importResult.totalRows} rows` : ''}:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto overscroll-contain">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                  {/* Capped: 10,000 bad rows previously rendered 10,000 <li>
                      nodes into this modal. */}
                  {(importResult.errorsTruncated ?? 0) > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 font-medium">
                      …and {importResult.errorsTruncated} more not shown.
                    </p>
                  )}
                </div>
              )}
              <Button className="w-full" onClick={() => setImportResult(null)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}
