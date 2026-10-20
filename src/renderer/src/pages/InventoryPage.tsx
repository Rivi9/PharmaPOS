import { useEffect, useState, useMemo } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { SearchInput } from '@renderer/components/common/search-input'
import { toast } from 'sonner'
import {
  Plus,
  Download,
  Upload,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck
} from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { useConfirm } from '@renderer/hooks/useConfirm'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { localDateString } from '../../../shared/dates'

/**
 * Rows fetched per page. Matches the table's own page size so one page of DOM
 * equals one round trip, rather than fetching thousands and paging in the client.
 */
const PAGE_SIZE = 50

/**
 * Server-side pager. The tables carry their own client-side pagination, but that
 * can only page what has been fetched — with the fetch now capped at one page,
 * moving between pages has to go back to the database.
 */
function ServerPager({
  page,
  total,
  onPage
}: {
  page: number
  total: number
  onPage: (next: number) => void
}): React.JSX.Element | null {
  const pages = Math.ceil(total / PAGE_SIZE)
  if (pages <= 1) return null
  return (
    <nav
      aria-label="pagination"
      className="flex items-center justify-end gap-3 border-t bg-card px-4 py-3"
    >
      <Button variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="size-5" />
        Previous
      </Button>
      <span className="min-w-24 px-2 text-center text-base text-muted-foreground tabular-nums">
        Page {page + 1} of {pages}
      </span>
      <Button variant="outline" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>
        Next
        <ChevronRight className="size-5" />
      </Button>
    </nav>
  )
}

/** The rounded panel each tab's table sits in; the inner div is the scroller. */
function TablePanel({
  children,
  footer
}: {
  children: React.ReactNode
  footer?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain">{children}</div>
      {footer}
    </div>
  )
}

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
  // Discontinued products are hidden from the list by default; the discontinue
  // confirmation promises they can be restored "from the Discontinued filter",
  // and this is that filter (it went missing when the search moved into SQL).
  const [showDiscontinued, setShowDiscontinued] = useState(false)
  // Batches sold down to zero are hidden by default but never unreachable: they
  // still carry what the stock cost, and their history is the recall trail.
  const [showSoldOut, setShowSoldOut] = useState(false)

  // Server-side paging for the two tables that can hold thousands of rows.
  const [productPage, setProductPage] = useState(0)
  const [productTotal, setProductTotal] = useState(0)
  const [batchPage, setBatchPage] = useState(0)
  const [batchTotal, setBatchTotal] = useState(0)
  // The count belongs to the *previous* query until the refetch lands. Rendering
  // it as "N matching products" during that window states something untrue — on
  // a 10k catalogue it briefly claimed all 10,001 matched a specific search.
  const [productLoading, setProductLoading] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)
  /**
   * M19: every loader was `if (success)` with no else, so a failed read left the
   * previous (often empty) list on screen — a pharmacy with 10,000 products was
   * shown "No products found — create your first product". An empty catalogue and
   * a database that would not answer must not look the same.
   */
  const [loadError, setLoadError] = useState('')

  // Selected items for editing
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null)
  const [selectedBatch, setSelectedBatch] = useState<StockBatch | null>(null)

  // Load data on mount
  useEffect(() => {
    loadAllData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Typing in the search box now hits the database, so debounce it. A new search
  // resets to the first page — page 7 of the previous result set is meaningless.
  useEffect(() => {
    setProductPage(0)
  }, [productSearch, showDiscontinued])
  useEffect(() => {
    setBatchPage(0)
  }, [batchSearch, showSoldOut])

  useEffect(() => {
    const timer = setTimeout(loadProducts, productSearch ? 250 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSearch, productPage, showDiscontinued])

  useEffect(() => {
    const timer = setTimeout(loadStockBatches, batchSearch ? 250 : 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchSearch, batchPage, showSoldOut])

  const loadAllData = async (): Promise<void> => {
    await Promise.all([
      loadProducts(),
      loadCategories(),
      loadSuppliers(),
      loadStockBatches(),
      loadLowStockProducts()
    ])
  }

  // Server-side page + search. `listProducts` (unpaged) shipped every row over
  // IPC — measured at 4.2 MB and ~250 ms on a 10,000-product catalogue, three
  // times per save — and the search was client-side so the full fetch could not
  // be avoided (H18).
  const loadProducts = async (): Promise<void> => {
    setProductLoading(true)
    try {
      const result = await window.electron.listProductsPage(userId, {
        search: productSearch || undefined,
        limit: PAGE_SIZE,
        offset: productPage * PAGE_SIZE,
        includeInactive: showDiscontinued || undefined
      })
      if (result.success) {
        setProducts(result.data.rows)
        setProductTotal(result.data.total)
        setLoadError('')
      } else {
        setLoadError(result.error || 'Could not read the product list')
      }
    } catch (error) {
      setLoadError(ipcErrorMessage(error, 'Could not read the product list'))
    } finally {
      setProductLoading(false)
    }
  }

  const loadLowStockProducts = async (): Promise<void> => {
    try {
      const result = await window.electron.getLowStockProducts(userId)
      if (result.success) setLowStockProducts(result.data)
      else setLoadError(result.error || 'Could not read the low-stock list')
    } catch (error) {
      setLoadError(ipcErrorMessage(error, 'Could not read the low-stock list'))
    }
  }

  const loadCategories = async (): Promise<void> => {
    try {
      const result = await window.electron.listCategories(userId)
      if (result.success) setCategories(result.data)
      else setLoadError(result.error || 'Could not read the categories')
    } catch (error) {
      setLoadError(ipcErrorMessage(error, 'Could not read the categories'))
    }
  }

  const loadSuppliers = async (): Promise<void> => {
    try {
      const result = await window.electron.listSuppliers(userId)
      if (result.success) setSuppliers(result.data)
      else setLoadError(result.error || 'Could not read the suppliers')
    } catch (error) {
      setLoadError(ipcErrorMessage(error, 'Could not read the suppliers'))
    }
  }

  const loadStockBatches = async (): Promise<void> => {
    setBatchLoading(true)
    try {
      const result = await window.electron.listStockBatchesPage(userId, {
        search: batchSearch || undefined,
        limit: PAGE_SIZE,
        offset: batchPage * PAGE_SIZE,
        includeSoldOut: showSoldOut || undefined
      })
      if (result.success) {
        setStockBatches(result.data.rows)
        setBatchTotal(result.data.total)
        setLoadError('')
      } else {
        setLoadError(result.error || 'Could not read the stock batches')
      }
    } catch (error) {
      setLoadError(ipcErrorMessage(error, 'Could not read the stock batches'))
    } finally {
      setBatchLoading(false)
    }
  }

  // Product handlers
  const handleProductSubmit = async (data: Record<string, unknown>): Promise<void> => {
    if (selectedProduct) {
      const result = await window.electron.updateProduct(userId, selectedProduct.id, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        toast.success('Product updated')
        await loadProducts()
        await loadLowStockProducts()
        setProductDialogOpen(false)
        setSelectedProduct(null)
      }
    } else {
      const result = await window.electron.createProduct(userId, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        toast.success('Product created')
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
      toast.success(`${product.name} restored`)
      await Promise.all([loadProducts(), loadStockBatches()])
    } else {
      await notify('Could not restore the product', result.error)
    }
  }

  const handleProductEdit = (product: Product): void => {
    setSelectedProduct(product)
    setProductDialogOpen(true)
  }

  const handleProductDelete = async (product: Product): Promise<void> => {
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
      toast.success(`${product.name} discontinued`)
      // Reload batches too — the deleted product's batches are now stale.
      await Promise.all([loadProducts(), loadStockBatches()])
    } else {
      await notify('Could not discontinue the product', result.error)
    }
  }

  // Category handlers
  const handleCategorySubmit = async (data: Record<string, unknown>): Promise<void> => {
    if (selectedCategory) {
      const result = await window.electron.updateCategory(userId, selectedCategory.id, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        toast.success('Category updated')
        await loadCategories()
        setCategoryDialogOpen(false)
        setSelectedCategory(null)
      }
    } else {
      const result = await window.electron.createCategory(userId, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        toast.success('Category created')
        await loadCategories()
        setCategoryDialogOpen(false)
      }
    }
  }

  const handleCategoryEdit = (category: Category): void => {
    setSelectedCategory(category)
    setCategoryDialogOpen(true)
  }

  const handleCategoryDelete = async (category: Category): Promise<void> => {
    const ok = await confirm({
      title: `Delete the ${category.name} category?`,
      description: 'This cannot be undone. Categories still holding products cannot be deleted.',
      confirmLabel: 'Delete',
      destructive: true
    })
    if (!ok) return
    const result = await window.electron.deleteCategory(userId, category.id)
    if (result.success) {
      toast.success(`${category.name} deleted`)
      await loadCategories()
      await loadProducts()
    } else {
      await notify('Could not delete the category', result.error)
    }
  }

  // Supplier handlers
  const handleSupplierSubmit = async (data: Record<string, unknown>): Promise<void> => {
    if (selectedSupplier) {
      const result = await window.electron.updateSupplier(userId, selectedSupplier.id, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        toast.success('Supplier updated')
        await loadSuppliers()
        setSupplierDialogOpen(false)
        setSelectedSupplier(null)
      }
    } else {
      const result = await window.electron.createSupplier(userId, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        toast.success('Supplier created')
        await loadSuppliers()
        setSupplierDialogOpen(false)
      }
    }
  }

  const handleSupplierEdit = (supplier: Supplier): void => {
    setSelectedSupplier(supplier)
    setSupplierDialogOpen(true)
  }

  const handleSupplierDelete = async (supplier: Supplier): Promise<void> => {
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
      toast.success(`${supplier.name} deactivated`)
      await loadSuppliers()
    } else {
      await notify('Could not deactivate the supplier', result.error)
    }
  }

  // Stock batch handlers
  const handleBatchSubmit = async (data: Record<string, unknown>): Promise<void> => {
    if (selectedBatch) {
      const result = await window.electron.updateStockBatch(userId, selectedBatch.id, data)
      if (!result.success) throw new Error(result.error || 'Save failed')
      if (result.success) {
        toast.success('Batch updated')
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
        toast.success('Stock received')
        await loadStockBatches()
        await loadProducts() // Refresh products to update stock counts
        await loadLowStockProducts()
        setBatchDialogOpen(false)
      }
    }
  }

  const handleBatchEdit = (batch: StockBatch): void => {
    setSelectedBatch(batch)
    setBatchDialogOpen(true)
  }

  const handleBatchDelete = async (batch: StockBatch): Promise<void> => {
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
      toast.success('Batch deleted')
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

  const handleImportExcel = async (): Promise<void> => {
    try {
      const result = await window.electron.importProductsExcel(userId)
      if (!result.canceled) {
        await loadProducts()
        await loadStockBatches()
        await loadLowStockProducts()
        // Pass the whole outcome through. Only `imported` and `errors` were kept,
        // so the "…and N more not shown" line and the row count never appeared
        // and a sheet with 400 bad rows reported "50 problems".
        setImportResult({
          imported: result.imported,
          batchesCreated: result.batchesCreated,
          errors: result.errors ?? [],
          errorsTruncated: result.errorsTruncated,
          totalRows: result.totalRows
        })
      }
    } catch (error) {
      await notify('Import failed', ipcErrorMessage(error))
    }
  }

  // CSV Export
  const handleExportProducts = async (): Promise<void> => {
    const result = await window.electron.exportProductsCSV(userId)
    if (!result.success) {
      toast.error('Could not export the products', { description: result.error })
      return
    }
    const blob = new Blob([result.data], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Local date (M21): toISOString() named an after-midnight export by yesterday.
    a.download = `products-${localDateString()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Products and batches arrive already searched and paged from SQL. Categories
  // and suppliers stay client-side: a pharmacy has tens of those, not thousands.
  const filteredProducts = products

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

  const filteredBatches = stockBatches

  const countText = 'whitespace-nowrap text-sm text-muted-foreground tabular-nums'

  return (
    <div className="flex h-full flex-col gap-4 bg-canvas p-6">
      <div>
        <h1 className="text-2xl font-semibold">Inventory Management</h1>
        <p className="text-base text-muted-foreground">
          Manage products, categories, suppliers, and stock
        </p>
      </div>

      <LowStockAlert lowStockProducts={lowStockProducts} />

      {loadError && (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/10">
          <CircleAlert />
          <AlertDescription className="text-base font-medium">
            {loadError} — the list below may be incomplete or out of date.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="products" className="flex min-h-0 flex-1 flex-col gap-4">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="stock">Stock Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <SearchInput
                aria-label="Search products"
                placeholder="Search products by name, SKU, barcode..."
                value={productSearch}
                onValueChange={setProductSearch}
                loading={productLoading}
                className="flex-1"
              />
              <div className={countText}>
                {productLoading
                  ? 'Searching…'
                  : productTotal === 0
                    ? productSearch
                      ? 'No products match that'
                      : 'No products yet'
                    : `Showing ${productPage * PAGE_SIZE + 1}–${Math.min((productPage + 1) * PAGE_SIZE, productTotal)} of ${productTotal}${productSearch ? ' matching' : ''} products`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="show-discontinued"
                className="h-12 cursor-pointer gap-3 rounded-lg px-3 text-base font-normal"
              >
                <Switch
                  id="show-discontinued"
                  checked={showDiscontinued}
                  onCheckedChange={setShowDiscontinued}
                />
                Show discontinued
              </Label>
              <Button variant="outline" onClick={handleImportExcel}>
                <Upload className="size-5" />
                Import Excel
              </Button>
              <Button variant="outline" onClick={handleExportProducts}>
                <Download className="size-5" />
                Export CSV
              </Button>
              <Button
                onClick={() => {
                  setSelectedProduct(null)
                  setProductDialogOpen(true)
                }}
              >
                <Plus className="size-5" />
                Add Product
              </Button>
            </div>
          </div>
          <TablePanel
            footer={<ServerPager page={productPage} total={productTotal} onPage={setProductPage} />}
          >
            <ProductsTable
              products={filteredProducts}
              onEdit={handleProductEdit}
              onDelete={handleProductDelete}
              onReactivate={handleProductReactivate}
              loading={productLoading}
              searching={!!productSearch}
            />
          </TablePanel>
        </TabsContent>

        <TabsContent value="categories" className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <SearchInput
                aria-label="Search categories"
                placeholder="Search categories by name..."
                value={categorySearch}
                onValueChange={setCategorySearch}
                className="flex-1"
              />
              <div className={countText}>
                {filteredCategories.length} of {categories.length} categories
              </div>
            </div>
            <Button
              onClick={() => {
                setSelectedCategory(null)
                setCategoryDialogOpen(true)
              }}
            >
              <Plus className="size-5" />
              Add Category
            </Button>
          </div>
          <TablePanel>
            <CategoriesTable
              categories={filteredCategories}
              onEdit={handleCategoryEdit}
              onDelete={handleCategoryDelete}
              searching={!!categorySearch}
            />
          </TablePanel>
        </TabsContent>

        <TabsContent value="suppliers" className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <SearchInput
                aria-label="Search suppliers"
                placeholder="Search suppliers by name, contact..."
                value={supplierSearch}
                onValueChange={setSupplierSearch}
                className="flex-1"
              />
              <div className={countText}>
                {filteredSuppliers.length} of {suppliers.length} suppliers
              </div>
            </div>
            <Button
              onClick={() => {
                setSelectedSupplier(null)
                setSupplierDialogOpen(true)
              }}
            >
              <Plus className="size-5" />
              Add Supplier
            </Button>
          </div>
          <TablePanel>
            <SuppliersTable
              suppliers={filteredSuppliers}
              onEdit={handleSupplierEdit}
              onDelete={handleSupplierDelete}
              searching={!!supplierSearch}
            />
          </TablePanel>
        </TabsContent>

        <TabsContent value="stock" className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <SearchInput
                aria-label="Search batches"
                placeholder="Search batches by product, batch number..."
                value={batchSearch}
                onValueChange={setBatchSearch}
                loading={batchLoading}
                className="flex-1"
              />
              <div className={countText}>
                {batchLoading
                  ? 'Searching…'
                  : batchTotal === 0
                    ? batchSearch
                      ? 'No batches match that'
                      : 'No stock batches yet'
                    : `Showing ${batchPage * PAGE_SIZE + 1}–${Math.min((batchPage + 1) * PAGE_SIZE, batchTotal)} of ${batchTotal}${batchSearch ? ' matching' : ''} batches`}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="show-sold-out"
                className="h-12 cursor-pointer gap-3 rounded-lg px-3 text-base font-normal"
              >
                <Switch id="show-sold-out" checked={showSoldOut} onCheckedChange={setShowSoldOut} />
                Show sold out
              </Label>
              <Button
                onClick={() => {
                  setSelectedBatch(null)
                  setBatchDialogOpen(true)
                }}
              >
                <Plus className="size-5" />
                Receive Stock
              </Button>
            </div>
          </div>
          <TablePanel
            footer={<ServerPager page={batchPage} total={batchTotal} onPage={setBatchPage} />}
          >
            <StockBatchesTable
              batches={filteredBatches}
              onEdit={handleBatchEdit}
              onDelete={handleBatchDelete}
              onViewHistory={setHistoryBatch}
              loading={batchLoading}
              searching={!!batchSearch}
            />
          </TablePanel>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader className="pr-10">
            <DialogTitle className="text-xl font-semibold">Excel Import Complete</DialogTitle>
            <DialogDescription className="sr-only">Result of the Excel import</DialogDescription>
          </DialogHeader>
          {importResult && (
            <div className="space-y-4">
              {importResult.imported > 0 ? (
                <p className="flex items-center gap-2 text-base font-medium text-success">
                  <CircleCheck className="size-5 shrink-0" />
                  <span>
                    {importResult.imported} product{importResult.imported !== 1 ? 's' : ''} imported
                    {importResult.batchesCreated
                      ? `, ${importResult.batchesCreated} with opening stock`
                      : ''}
                    .
                  </span>
                </p>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-base font-medium text-destructive">
                    <CircleAlert className="size-5 shrink-0" />
                    Nothing was imported — the file was not changed.
                  </p>
                  {/* The import is deliberately all-or-nothing. A half-imported
                      medicine catalogue is worse than a refused one: nobody can
                      tell which half is missing, and the stock figures are wrong
                      in a way no report reveals. */}
                  <p className="text-sm text-muted-foreground">
                    Every row has to be valid before anything is written. Fix the rows below and
                    import the sheet again.
                  </p>
                </>
              )}
              {importResult.errors.length > 0 && (
                <div>
                  <p className="mb-2 text-base font-medium text-destructive">
                    {importResult.errors.length + (importResult.errorsTruncated ?? 0)} problem
                    {importResult.errors.length + (importResult.errorsTruncated ?? 0) !== 1
                      ? 's'
                      : ''}
                    {importResult.totalRows ? ` in ${importResult.totalRows} rows` : ''}:
                  </p>
                  <ul className="max-h-48 space-y-1 overflow-y-auto overscroll-contain rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                    {importResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                  {/* Capped: 10,000 bad rows previously rendered 10,000 <li>
                      nodes into this modal. */}
                  {(importResult.errorsTruncated ?? 0) > 0 && (
                    <p className="mt-2 text-sm font-medium text-muted-foreground">
                      …and {importResult.errorsTruncated} more not shown.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button size="lg" className="w-full" onClick={() => setImportResult(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}
