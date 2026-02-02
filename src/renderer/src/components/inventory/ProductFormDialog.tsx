import { useEffect } from 'react'
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
import type { Product, Category, Supplier } from '@renderer/stores/inventoryStore'

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  generic_name: z.string().optional(),
  barcode: z.string().optional(),
  sku: z.string().optional(),
  category_id: z.string().optional(),
  supplier_id: z.string().optional(),
  cost_price: z.number().min(0, 'Cost price must be positive'),
  unit_price: z.number().min(0, 'Unit price must be positive'),
  tax_rate: z.number().min(0).max(100).optional(),
  is_tax_inclusive: z.number().optional(),
  reorder_level: z.number().int().min(0).optional(),
  reorder_qty: z.number().int().min(0).optional(),
  unit: z.string().optional(),
  track_expiry: z.number().optional(),
  is_active: z.number().optional()
})

type ProductFormData = z.infer<typeof productSchema>

interface ProductFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: ProductFormData) => Promise<void>
  product?: Product | null
  categories: Category[]
  suppliers: Supplier[]
}

export function ProductFormDialog({
  open,
  onClose,
  onSubmit,
  product,
  categories,
  suppliers
}: ProductFormDialogProps) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      tax_rate: 0,
      is_tax_inclusive: 1,
      reorder_level: 10,
      reorder_qty: 50,
      unit: 'piece',
      track_expiry: 1,
      is_active: 1
    }
  })

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        generic_name: product.generic_name || '',
        barcode: product.barcode || '',
        sku: product.sku,
        category_id: product.category_id || '',
        supplier_id: product.supplier_id || '',
        cost_price: product.cost_price,
        unit_price: product.unit_price,
        tax_rate: product.tax_rate,
        is_tax_inclusive: product.is_tax_inclusive,
        reorder_level: product.reorder_level,
        reorder_qty: product.reorder_qty,
        unit: product.unit,
        track_expiry: product.track_expiry,
        is_active: product.is_active
      })
    } else {
      reset({
        tax_rate: 0,
        is_tax_inclusive: 1,
        reorder_level: 10,
        reorder_qty: 50,
        unit: 'piece',
        track_expiry: 1,
        is_active: 1
      })
    }
  }, [product, reset])

  const handleFormSubmit = async (data: ProductFormData) => {
    await onSubmit(data)
    reset()
  }

  const categoryId = watch('category_id')
  const supplierId = watch('supplier_id')

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'Add New Product'}</DialogTitle>
          <DialogDescription>
            {product
              ? 'Update product information, pricing, and stock settings.'
              : 'Add a new product to your inventory with pricing and stock tracking.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">
                Product Name <span className="text-red-500">*</span>
              </Label>
              <Input id="name" {...register('name')} />
              {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="generic_name">Generic Name</Label>
              <Input id="generic_name" {...register('generic_name')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" {...register('sku')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" {...register('barcode')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category_id">Category</Label>
              <Select value={categoryId} onValueChange={(value) => setValue('category_id', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label htmlFor="unit_price">
                Unit Price (Rs.) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="unit_price"
                type="number"
                step="0.01"
                {...register('unit_price', { valueAsNumber: true })}
              />
              {errors.unit_price && (
                <p className="text-sm text-red-500">{errors.unit_price.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax_rate">Tax Rate (%)</Label>
              <Input
                id="tax_rate"
                type="number"
                step="0.1"
                {...register('tax_rate', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" {...register('unit')} placeholder="e.g., piece, box, bottle" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reorder_level">Reorder Level</Label>
              <Input
                id="reorder_level"
                type="number"
                {...register('reorder_level', { valueAsNumber: true })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reorder_qty">Reorder Quantity</Label>
              <Input
                id="reorder_qty"
                type="number"
                {...register('reorder_qty', { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : product ? 'Update Product' : 'Create Product'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
