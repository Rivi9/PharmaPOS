import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@renderer/components/ui/field'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { SearchCombobox } from '@renderer/components/common/search-combobox'
import { ProductOption } from '@renderer/components/common/product-option'
import { DatePickerInput, FormNumberInput } from './form-controls'
import type { StockBatch, Product, Supplier } from '@renderer/stores/inventoryStore'
import { localDateString } from '../../../../shared/dates'

const stockBatchSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  batch_number: z.string().optional(),
  // 0 is allowed here because an edit may legitimately run a batch down to
  // nothing (the delete confirmation tells the operator to do exactly that, and
  // the main process accepts it). A *new* receipt of 0 is refused in submit.
  quantity: z
    .number({ error: 'Enter a quantity' })
    .int('Whole numbers only')
    .min(0, 'Quantity cannot be negative'),
  // Only used when editing: a quantity change becomes a recorded stock
  // adjustment, and an adjustment without a reason is untraceable shrinkage.
  adjustment_reason: z.string().optional(),
  cost_price: z.number({ error: 'Enter the cost price' }).min(0, 'Cost price must be positive'),
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
function productLabel(product: Pick<Product, 'name' | 'sku'>): string {
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
}: StockBatchFormDialogProps): React.JSX.Element {
  const [productSearch, setProductSearch] = useState('')
  // The label of the product currently chosen. Re-focusing after a selection
  // leaves that label in the box; that is a browse, not a search for that exact
  // string, so the suggestions must not be filtered by it.
  const chosenLabel = useRef<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<StockBatchFormData>({
    resolver: zodResolver(stockBatchSchema),
    defaultValues: {
      // Local calendar date (M21) — toISOString() is the UTC date, which dated
      // stock received after midnight local as the previous day.
      received_date: localDateString()
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
      // Pre-fill the search box with the existing product name. The page only
      // holds one page of products, so fall back to the name on the batch row.
      const existing = products.find((p) => p.id === batch.product_id)
      const label = existing
        ? productLabel(existing)
        : batch.product_name
          ? productLabel({ name: batch.product_name, sku: batch.sku ?? '' })
          : ''
      chosenLabel.current = label || null
      setProductSearch(label)
    } else {
      reset({ received_date: localDateString() })
      chosenLabel.current = null
      setProductSearch('')
    }
  }, [batch, reset, products])

  const [submitError, setSubmitError] = useState('')

  const handleFormSubmit = async (data: StockBatchFormData): Promise<void> => {
    setSubmitError('')
    if (!batch && data.quantity < 1) {
      setError('quantity', { message: 'Quantity must be at least 1' })
      return
    }
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
    chosenLabel.current = null
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
  const fetchProducts = async (query: string): Promise<Product[]> => {
    const browsingAll = query.length === 0 || query === chosenLabel.current?.trim()
    const result: { success: boolean; data?: { rows: Product[] } } =
      await window.electron.listProductsPage('', {
        search: browsingAll ? undefined : query,
        limit: MAX_SUGGESTIONS
      })
    return result?.success && result.data ? result.data.rows : []
  }

  const handleProductSelect = (product: Product): void => {
    setValue('product_id', product.id, { shouldValidate: true })
    const label = productLabel(product)
    chosenLabel.current = label
    setProductSearch(label)
  }

  // A barcode scanner types the code and Enter. Pick the product whose barcode
  // or SKU is exactly that; anything looser waits for the operator to choose.
  const handleProductEnter = async (query: string): Promise<void> => {
    if (query === chosenLabel.current?.trim()) return
    const rows = await fetchProducts(query).catch(() => [] as Product[])
    const exact = rows.find((p) => p.barcode === query || p.sku === query)
    if (exact) handleProductSelect(exact)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-6 pr-16">
          <DialogTitle className="text-xl font-semibold">
            {batch ? 'Edit Stock Batch' : 'Receive Stock'}
          </DialogTitle>
          <DialogDescription className="text-base">
            {batch
              ? 'Update stock batch details including quantity and expiry date.'
              : 'Record a new stock receipt with batch tracking and expiry information.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
            <FieldGroup className="gap-5">
              {/* Product — searchable combobox */}
              <Field data-invalid={!!errors.product_id}>
                <FieldLabel htmlFor="product_search">
                  Product <span className="text-destructive">*</span>
                </FieldLabel>
                {/* Suggestions come over IPC, so "nothing found" and "not
                    fetched yet" are different states: the combobox shows a
                    spinner until the current query is answered, and only then
                    "No products match that". Rows are picked on click, NOT
                    pointerdown — a finger landing to scroll must not choose. */}
                <SearchCombobox<Product>
                  id="product_search"
                  query={productSearch}
                  onQueryChange={(q) => {
                    setProductSearch(q)
                    chosenLabel.current = null
                    setValue('product_id', '', { shouldValidate: false })
                  }}
                  fetchItems={fetchProducts}
                  getKey={(p) => p.id}
                  renderItem={(p, q) => (
                    <ProductOption product={p} query={q === chosenLabel.current?.trim() ? '' : q} />
                  )}
                  onSelect={handleProductSelect}
                  onSubmit={(q) => void handleProductEnter(q)}
                  minChars={0}
                  debounceMs={200}
                  selectOnFocus
                  placeholder="Tap to browse, or type to search by name or SKU…"
                  emptyText="No products match that"
                  footer={(items) =>
                    items.length >= MAX_SUGGESTIONS
                      ? `Showing the first ${MAX_SUGGESTIONS} matches — keep typing to narrow.`
                      : null
                  }
                  aria-invalid={!!errors.product_id}
                />
                <FieldError errors={[errors.product_id]} />
              </Field>

              <div className="grid grid-cols-2 gap-5">
                <Field>
                  <FieldLabel htmlFor="batch_number">Batch Number</FieldLabel>
                  <Input id="batch_number" autoComplete="off" {...register('batch_number')} />
                </Field>

                <Field data-invalid={!!errors.quantity}>
                  <FieldLabel htmlFor="quantity">
                    Quantity <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="quantity"
                    render={({ field, fieldState }) => (
                      <FormNumberInput
                        id="quantity"
                        ref={field.ref}
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}
                      />
                    )}
                  />
                  <FieldError errors={[errors.quantity]} />
                  {batch && quantityChanged && (
                    <FieldDescription>
                      {watchedQuantity > batch.quantity ? 'Adding' : 'Removing'}{' '}
                      {Math.abs(watchedQuantity - batch.quantity)} — recorded as a stock adjustment
                    </FieldDescription>
                  )}
                </Field>

                {batch && quantityChanged && (
                  <Field className="col-span-2" data-invalid={!!errors.adjustment_reason}>
                    <FieldLabel htmlFor="adjustment_reason">
                      Reason for the quantity change <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      id="adjustment_reason"
                      placeholder="Damaged, miscount, expired stock removed…"
                      {...register('adjustment_reason')}
                    />
                    <FieldError errors={[errors.adjustment_reason]} />
                  </Field>
                )}

                <Field data-invalid={!!errors.cost_price}>
                  <FieldLabel htmlFor="cost_price">
                    Cost Price (Rs.) <span className="text-destructive">*</span>
                  </FieldLabel>
                  <Controller
                    control={control}
                    name="cost_price"
                    render={({ field, fieldState }) => (
                      <FormNumberInput
                        id="cost_price"
                        decimal
                        ref={field.ref}
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}
                      />
                    )}
                  />
                  <FieldError errors={[errors.cost_price]} />
                </Field>

                <Field data-invalid={!!errors.selling_price}>
                  <FieldLabel htmlFor="selling_price">Selling Price (Rs.)</FieldLabel>
                  <Controller
                    control={control}
                    name="selling_price"
                    render={({ field, fieldState }) => (
                      <FormNumberInput
                        id="selling_price"
                        decimal
                        ref={field.ref}
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        placeholder="Leave blank to use the product price"
                        aria-invalid={fieldState.invalid}
                      />
                    )}
                  />
                  <FieldDescription>
                    Set this when a batch sells at a different price to the product default — the
                    till charges the price of the batch it dispenses from.
                  </FieldDescription>
                  <FieldError errors={[errors.selling_price]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="expiry_date">Expiry Date</FieldLabel>
                  <Controller
                    control={control}
                    name="expiry_date"
                    render={({ field }) => (
                      <DatePickerInput
                        id="expiry_date"
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="No expiry date"
                        clearable
                        yearsBack={3}
                        yearsAhead={15}
                      />
                    )}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="received_date">Received Date</FieldLabel>
                  <Controller
                    control={control}
                    name="received_date"
                    render={({ field }) => (
                      <DatePickerInput
                        id="received_date"
                        value={field.value}
                        onChange={field.onChange}
                        yearsBack={10}
                        yearsAhead={0}
                      />
                    )}
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="supplier_id">Supplier</FieldLabel>
                  <Select
                    value={supplierId}
                    onValueChange={(value) => setValue('supplier_id', value)}
                  >
                    <SelectTrigger id="supplier_id" className="w-full">
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
                </Field>
              </div>

              {submitError && (
                <Alert variant="destructive">
                  <AlertDescription className="text-base font-medium">
                    {submitError}
                  </AlertDescription>
                </Alert>
              )}
            </FieldGroup>
          </div>

          <DialogFooter className="border-t p-4 sm:justify-end">
            <Button type="button" variant="outline" size="lg" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" className="min-w-44" disabled={isSubmitting}>
              {isSubmitting && <Spinner className="size-5" />}
              {isSubmitting ? 'Saving...' : batch ? 'Update Batch' : 'Receive Stock'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
