import { useEffect, useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import type { StockBatch, Product, Supplier } from '@renderer/stores/inventoryStore'

const stockBatchSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  batch_number: z.string().optional(),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  // Only used when editing: a quantity change becomes a recorded stock
  // adjustment, and an adjustment without a reason is untraceable shrinkage.
  adjustment_reason: z.string().optional(),
  cost_price: z.number().min(0, 'Cost price must be positive'),
  selling_price: z.union([z.number().min(0), z.nan()]).optional(),
  expiry_date: z.string().optional(),
  received_date: z.string().optional(),
  supplier_id: z.string().optional()
})

type StockBatchFormData = z.infer<typeof stockBatchSchema>

interface StockBatchFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: StockBatchFormData) => Promise<void>
  batch?: StockBatch | null
  products: Product[]
  suppliers: Supplier[]
}

/** Label shown in the combobox. Products may have no SKU, so guard it. */
function productLabel(product: Product): string {
  return product.sku ? `${product.name} (${product.sku})` : product.name
}

/** Cap on rows rendered at once — enough to browse, safe with a large catalogue. */
const MAX_SUGGESTIONS = 100

export function StockBatchFormDialog({
  open,
  onClose,
  onSubmit,
  batch,
  products,
  suppliers
}: StockBatchFormDialogProps) {
  const [productSearch, setProductSearch] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)
  const productInputRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<StockBatchFormData>({
    resolver: zodResolver(stockBatchSchema),
    defaultValues: {
      received_date: new Date().toISOString().split('T')[0]
    }
  })

  useEffect(() => {
    if (batch) {
      reset({
        product_id: batch.product_id,
        batch_number: batch.batch_number || '',
        quantity: batch.quantity,
        cost_price: batch.cost_price,
        selling_price: batch.selling_price ?? undefined,
        expiry_date: batch.expiry_date || '',
        received_date: batch.received_date,
        supplier_id: batch.supplier_id || ''
      })
      // Pre-fill the search box with the existing product name
      const existing = products.find((p) => p.id === batch.product_id)
      setProductSearch(existing ? productLabel(existing) : '')
    } else {
      reset({ received_date: new Date().toISOString().split('T')[0] })
      setProductSearch('')
    }
  }, [batch, reset, products])

  const [submitError, setSubmitError] = useState('')

  const handleFormSubmit = async (data: StockBatchFormData) => {
    setSubmitError('')
    // Enforced here rather than in the zod schema because it is conditional on
    // the quantity actually having moved, which the schema cannot see.
    if (quantityChanged && !data.adjustment_reason?.trim()) {
      setSubmitError('Say why the quantity changed — it is recorded as a stock adjustment')
      return
    }
    try {
      await onSubmit(data)
    } catch (err) {
      // Keep the user's input on screen. The form used to reset
      // unconditionally, so a duplicate barcode blanked everything
      // with no message shown anywhere.
      setSubmitError((err as Error)?.message || 'Could not save')
      return
    }
    reset()
    setProductSearch('')
  }

  const supplierId = watch('supplier_id')

  // A quantity edit is a stock adjustment, not a correction of a typo: the
  // absolute UPDATE it used to issue left no adjustment row and no audit entry,
  // so shrinkage could not be attributed. Surface that it is being recorded, and
  // ask why, before the operator commits it.
  const watchedQuantity = watch('quantity')
  const quantityChanged =
    batch != null && Number.isFinite(watchedQuantity) && watchedQuantity !== batch.quantity

  // Suggestions come from the server, not the `products` prop.
  //
  // The Inventory page now fetches one page of 50 (H18), so filtering that prop
  // client-side would make 9,950 products of a large catalogue unreachable from
  // this box — you could not receive stock against them at all. The prop is still
  // used to label the already-chosen product when editing.
  const [remoteProducts, setRemoteProducts] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const selectedProduct =
    products.find((p) => p.id === watch('product_id')) ??
    remoteProducts.find((p) => p.id === watch('product_id'))

  const query = productSearch.trim()
  // Re-focusing after a selection leaves the chosen product's label in the box;
  // that is a browse, not a search for that exact string.
  const browsingAll =
    query.length === 0 || (selectedProduct && productSearch === productLabel(selectedProduct))
  const effectiveQuery = browsingAll ? '' : query

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setSearching(true)
    const timer = setTimeout(
      () => {
        window.electron
          .listProductsPage('', { search: effectiveQuery || undefined, limit: MAX_SUGGESTIONS })
          .then((result: { success: boolean; data?: { rows: Product[] } }) => {
            if (cancelled) return
            setRemoteProducts(result?.success && result.data ? result.data.rows : [])
          })
          .catch(() => {
            if (!cancelled) setRemoteProducts([])
          })
          .finally(() => {
            if (!cancelled) setSearching(false)
          })
      },
      effectiveQuery ? 200 : 0
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, effectiveQuery])

  const filteredProducts = remoteProducts
  // The server caps at MAX_SUGGESTIONS, so a full page means "there may be more".
  const hiddenCount = remoteProducts.length >= MAX_SUGGESTIONS ? MAX_SUGGESTIONS : 0

  const handleProductSelect = (product: Product) => {
    setValue('product_id', product.id, { shouldValidate: true })
    setProductSearch(productLabel(product))
    setShowSuggestions(false)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{batch ? 'Edit Stock Batch' : 'Receive Stock'}</DialogTitle>
          <DialogDescription>
            {batch
              ? 'Update stock batch details including quantity and expiry date.'
              : 'Record a new stock receipt with batch tracking and expiry information.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          {/* Product — searchable combobox */}
          <div className="space-y-2">
            <Label htmlFor="product_search">
              Product <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="product_search"
                ref={productInputRef}
                value={productSearch}
                onChange={(e) => {
                  setProductSearch(e.target.value)
                  setValue('product_id', '', { shouldValidate: false })
                  setShowSuggestions(true)
                }}
                onFocus={(e) => {
                  // Select the text so typing replaces the previous choice
                  e.target.select()
                  setShowSuggestions(true)
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Tap to browse, or type to search by name or SKU…"
                autoComplete="off"
              />
              {/* Suggestions come over IPC now, so "nothing found" and "not
                  fetched yet" are different states and must not look the same. */}
              {showSuggestions && filteredProducts.length === 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg px-3 py-2 text-sm text-muted-foreground">
                  {searching ? 'Searching…' : 'No products match that'}
                </div>
              )}
              {showSuggestions && filteredProducts.length > 0 && (
                // Selection is on click, NOT pointerdown: pointerdown fires the
                // instant a finger lands, so dragging to scroll would pick whichever
                // row was under the initial touch. The 150ms blur delay above
                // outlives the click, so the list is still open when it fires.
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg max-h-64 overflow-y-auto overscroll-contain">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => handleProductSelect(product)}
                      className="w-full min-h-11 px-3 py-2.5 text-left hover:bg-muted active:bg-muted/80 border-b last:border-b-0"
                    >
                      <p className="text-sm font-medium">{product.name}</p>
                      {product.sku && (
                        <p className="text-xs text-muted-foreground">{product.sku}</p>
                      )}
                    </button>
                  ))}
                  {hiddenCount > 0 && (
                    <p className="px-3 py-2 text-xs text-muted-foreground bg-muted/40">
                      Showing the first {MAX_SUGGESTIONS} matches — keep typing to narrow.
                    </p>
                  )}
                </div>
              )}
            </div>
            {errors.product_id && (
              <p className="text-sm text-red-500">{errors.product_id.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="batch_number">Batch Number</Label>
              <Input id="batch_number" {...register('batch_number')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">
                Quantity <span className="text-red-500">*</span>
              </Label>
              <Input
                id="quantity"
                type="number"
                {...register('quantity', { valueAsNumber: true })}
              />
              {errors.quantity && <p className="text-sm text-red-500">{errors.quantity.message}</p>}
              {batch && quantityChanged && (
                <p className="text-xs text-muted-foreground">
                  {watchedQuantity > batch.quantity ? 'Adding' : 'Removing'}{' '}
                  {Math.abs(watchedQuantity - batch.quantity)} — recorded as a stock adjustment
                </p>
              )}
            </div>

            {batch && quantityChanged && (
              <div className="space-y-2 col-span-2">
                <Label htmlFor="adjustment_reason">
                  Reason for the quantity change <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="adjustment_reason"
                  placeholder="Damaged, miscount, expired stock removed…"
                  {...register('adjustment_reason')}
                />
                {errors.adjustment_reason && (
                  <p className="text-sm text-red-500">{errors.adjustment_reason.message}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="cost_price">
                Cost Price (Rs.) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="cost_price"
                type="number"
                step="0.01"
                {...register('cost_price', { valueAsNumber: true })}
              />
              {errors.cost_price && (
                <p className="text-sm text-red-500">{errors.cost_price.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="selling_price">Selling Price (Rs.)</Label>
              <Input
                id="selling_price"
                type="number"
                inputMode="decimal"
                step="0.01"
                className="h-11"
                placeholder="Leave blank to use the product price"
                {...register('selling_price', { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                Set this when a batch sells at a different price to the product default — the till
                charges the price of the batch it dispenses from.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expiry_date">Expiry Date</Label>
              <Input id="expiry_date" type="date" {...register('expiry_date')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="received_date">Received Date</Label>
              <Input id="received_date" type="date" {...register('received_date')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier_id">Supplier</Label>
              <Select value={supplierId} onValueChange={(value) => setValue('supplier_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((sup) => (
                    <SelectItem key={sup.id} value={sup.id}>
                      {sup.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {submitError && <p className="text-sm text-destructive font-medium">{submitError}</p>}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : batch ? 'Update Batch' : 'Receive Stock'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
