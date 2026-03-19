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
  cost_price: z.number().min(0, 'Cost price must be positive'),
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
        expiry_date: batch.expiry_date || '',
        received_date: batch.received_date,
        supplier_id: batch.supplier_id || ''
      })
      // Pre-fill the search box with the existing product name
      const existing = products.find((p) => p.id === batch.product_id)
      setProductSearch(existing ? `${existing.name} (${existing.sku})` : '')
    } else {
      reset({ received_date: new Date().toISOString().split('T')[0] })
      setProductSearch('')
    }
  }, [batch, reset, products])

  const handleFormSubmit = async (data: StockBatchFormData) => {
    await onSubmit(data)
    reset()
    setProductSearch('')
  }

  const supplierId = watch('supplier_id')

  // Client-side filter — no IPC needed since products are already loaded
  const filteredProducts = productSearch.trim().length > 0
    ? products.filter((p) => {
        const q = productSearch.toLowerCase()
        return p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)
      }).slice(0, 8)
    : []

  const handleProductSelect = (product: Product) => {
    setValue('product_id', product.id, { shouldValidate: true })
    setProductSearch(`${product.name} (${product.sku})`)
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
                onFocus={() => filteredProducts.length > 0 && setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Type to search by name or SKU…"
                autoComplete="off"
              />
              {showSuggestions && filteredProducts.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {filteredProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onPointerDown={() => handleProductSelect(product)}
                      className="w-full px-3 py-2 text-left hover:bg-muted active:bg-muted/80 border-b last:border-b-0"
                    >
                      <p className="text-sm font-medium">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.sku}</p>
                    </button>
                  ))}
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
            </div>

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
