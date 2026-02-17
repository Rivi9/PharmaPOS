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
import { StockBatchesTable } from '@renderer/components/inventory/StockBatchesTable'

// Forms
import { ProductFormDialog } from '@renderer/components/inventory/ProductFormDialog'
import { CategoryFormDialog } from '@renderer/components/inventory/CategoryFormDialog'
import { SupplierFormDialog } from '@renderer/components/inventory/SupplierFormDialog'
import { StockBatchFormDialog } from '@renderer/components/inventory/StockBatchFormDialog'

// Alerts
import { LowStockAlert } from '@renderer/components/inventory/LowStockAlert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

export function InventoryPage(): React.JSX.Element {
  const { user } = useAuthStore()
  const userId = user?.id ?? ''

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
      if (result.success) {
        await loadProducts()
        await loadLowStockProducts()
        setProductDialogOpen(false)
        setSelectedProduct(null)
      }
    } else {
      const result = await window.electron.createProduct(userId, data)
      if (result.success) {
        await loadProducts()
        await loadLowStockProducts()
        setProductDialogOpen(false)
      }
    }
  }

  const handleProductEdit = (product: Product) => {
    setSelectedProduct(product)
    setProductDialogOpen(true)
  }

  const handleProductDelete = async (product: Product) => {
    if (confirm(`Are you sure you want to delete ${product.name}?`)) {
      const result = await window.electron.deleteProduct(userId, product.id)
      if (result.success) {
        await loadProducts()
      }
    }
  }

  // Category handlers
  const handleCategorySubmit = async (data: any) => {
    if (selectedCategory) {
      const result = await window.electron.updateCategory(userId, selectedCategory.id, data)
      if (result.success) {
        await loadCategories()
        setCategoryDialogOpen(false)
        setSelectedCategory(null)
      }
    } else {
      const result = await window.electron.createCategory(userId, data)
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
    if (confirm(`Are you sure you want to delete ${category.name}?`)) {
      const result = await window.electron.deleteCategory(userId, category.id)
      if (result.success) {
        await loadCategories()
      } else {
        alert(result.error || 'Failed to delete category')
      }
    }
  }

  // Supplier handlers
  const handleSupplierSubmit = async (data: any) => {
    if (selectedSupplier) {
      const result = await window.electron.updateSupplier(userId, selectedSupplier.id, data)
      if (result.success) {
        await loadSuppliers()
        setSupplierDialogOpen(false)
        setSelectedSupplier(null)
      }
    } else {
      const result = await window.electron.createSupplier(userId, data)
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
    if (confirm(`Are you sure you want to deactivate ${supplier.name}?`)) {
      const result = await window.electron.deleteSupplier(userId, supplier.id)
      if (result.success) {
        await loadSuppliers()
      }
    }
  }

  // Stock batch handlers
  const handleBatchSubmit = async (data: any) => {
    if (selectedBatch) {
      const result = await window.electron.updateStockBatch(userId, selectedBatch.id, data)
      if (result.success) {
        await loadStockBatches()
        await loadProducts() // Refresh products to update stock counts
        await loadLowStockProducts()
        setBatchDialogOpen(false)
        setSelectedBatch(null)
      }
    } else {
      const result = await window.electron.createStockBatch(userId, data)
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
    if (confirm(`Are you sure you want to delete this batch?`)) {
      const result = await window.electron.deleteStockBatch(userId, batch.id)
      if (result.success) {
        await loadStockBatches()
        await loadProducts() // Refresh products to update stock counts
        await loadLowStockProducts()
      } else {
        alert(result.error || 'Failed to delete batch')
      }
    }
  }

  // Excel Import
  const [importResult, setImportResult] = useState<{ imported: number; errors: string[] } | null>(null)

  const handleImportExcel = async () => {
    try {
      const result = await window.electron.importProductsExcel(userId)
      if (!result.canceled) {
        await loadProducts()
        await loadLowStockProducts()
        setImportResult({ imported: result.imported, errors: result.errors })
      }
    } catch (error: any) {
      alert(`Import failed: ${error.message}`)
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

      <Tabs defaultValue="products" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="stock">Stock Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="flex-1 flex flex-col mt-6 space-y-4">
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
          <div className="flex-1 overflow-auto">
            <ProductsTable
              products={filteredProducts}
              onEdit={handleProductEdit}
              onDelete={handleProductDelete}
            />
          </div>
        </TabsContent>

        <TabsContent value="categories" className="flex-1 flex flex-col mt-6 space-y-4">
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
          <div className="flex-1 overflow-auto">
            <CategoriesTable
              categories={filteredCategories}
              onEdit={handleCategoryEdit}
              onDelete={handleCategoryDelete}
            />
          </div>
        </TabsContent>

        <TabsContent value="suppliers" className="flex-1 flex flex-col mt-6 space-y-4">
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
          <div className="flex-1 overflow-auto">
            <SuppliersTable
              suppliers={filteredSuppliers}
              onEdit={handleSupplierEdit}
              onDelete={handleSupplierDelete}
            />
          </div>
        </TabsContent>

        <TabsContent value="stock" className="flex-1 flex flex-col mt-6 space-y-4">
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
          <div className="flex-1 overflow-auto">
            <StockBatchesTable
              batches={filteredBatches}
              onEdit={handleBatchEdit}
              onDelete={handleBatchDelete}
            />
          </div>
        </TabsContent>
      </Tabs>

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
              <p className="text-sm text-green-700 font-medium">
                {importResult.imported} product{importResult.imported !== 1 ? 's' : ''} imported successfully.
              </p>
              {importResult.errors.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-destructive mb-1">
                    {importResult.errors.length} row{importResult.errors.length !== 1 ? 's' : ''} skipped:
                  </p>
                  <ul className="text-xs text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}
              <Button className="w-full" onClick={() => setImportResult(null)}>
                Close
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
