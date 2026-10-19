import { useEffect, useState } from 'react'
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
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet
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
import { FormNumberInput } from './form-controls'
import type { Product, Category, Supplier } from '@renderer/stores/inventoryStore'

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  generic_name: z.string().optional(),
  barcode: z.string().optional(),
  sku: z.string().optional(),
  category_id: z.string().optional(),
  supplier_id: z.string().optional(),
  cost_price: z.number({ error: 'Enter the cost price' }).min(0, 'Cost price must be positive'),
  unit_price: z.number({ error: 'Enter the unit price' }).min(0, 'Unit price must be positive'),
  tax_rate: z
    .number({ error: 'Enter a tax rate (0 for none)' })
    .min(0, 'Tax rate cannot be negative')
    .max(100, 'Tax rate cannot be over 100%')
    .optional(),
  is_tax_inclusive: z.number().optional(),
  reorder_level: z
    .number({ error: 'Enter a reorder level' })
    .int('Whole numbers only')
    .min(0)
    .optional(),
  reorder_qty: z
    .number({ error: 'Enter a reorder quantity' })
    .int('Whole numbers only')
    .min(0)
    .optional(),
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

type NumberFieldName = 'cost_price' | 'unit_price' | 'tax_rate' | 'reorder_level' | 'reorder_qty'

export function ProductFormDialog({
  open,
  onClose,
  onSubmit,
  product,
  categories,
  suppliers
}: ProductFormDialogProps): React.JSX.Element {
  const {
    register,
    control,
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

  const [submitError, setSubmitError] = useState('')

  const handleFormSubmit = async (data: ProductFormData): Promise<void> => {
    setSubmitError('')
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
  }

  const categoryId = watch('category_id')
  const supplierId = watch('supplier_id')

  const numberField = (
    name: NumberFieldName,
    label: React.ReactNode,
    opts: { decimal?: boolean; placeholder?: string } = {}
  ): React.JSX.Element => (
    <Field data-invalid={!!errors[name]}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => (
          <FormNumberInput
            id={name}
            decimal={opts.decimal}
            placeholder={opts.placeholder}
            ref={field.ref}
            name={field.name}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            aria-invalid={fieldState.invalid}
          />
        )}
      />
      <FieldError errors={[errors[name]]} />
    </Field>
  )

  const required = <span className="text-destructive">*</span>

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-6 pr-16">
          <DialogTitle className="text-xl font-semibold">
            {product ? 'Edit Product' : 'Add New Product'}
          </DialogTitle>
          <DialogDescription className="text-base">
            {product
              ? 'Update product information, pricing, and stock settings.'
              : 'Add a new product to your inventory with pricing and stock tracking.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
            <FieldGroup className="gap-8">
              <FieldSet>
                <FieldLegend>Product</FieldLegend>
                <div className="grid grid-cols-2 gap-5">
                  <Field data-invalid={!!errors.name}>
                    <FieldLabel htmlFor="name">Product Name {required}</FieldLabel>
                    <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
                    <FieldError errors={[errors.name]} />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="generic_name">Generic Name</FieldLabel>
                    <Input id="generic_name" {...register('generic_name')} />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="sku">SKU</FieldLabel>
                    <Input id="sku" autoComplete="off" {...register('sku')} />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="barcode">Barcode</FieldLabel>
                    <Input id="barcode" autoComplete="off" {...register('barcode')} />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="category_id">Category</FieldLabel>
                    <Select
                      value={categoryId}
                      onValueChange={(value) => setValue('category_id', value)}
                    >
                      <SelectTrigger id="category_id" className="w-full">
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
              </FieldSet>

              <FieldSet>
                <FieldLegend>Pricing</FieldLegend>
                <div className="grid grid-cols-3 gap-5">
                  {numberField('cost_price', <>Cost Price (Rs.) {required}</>, { decimal: true })}
                  {numberField('unit_price', <>Unit Price (Rs.) {required}</>, { decimal: true })}
                  {numberField('tax_rate', 'Tax Rate (%)', { decimal: true })}
                </div>
              </FieldSet>

              <FieldSet>
                <FieldLegend>Stock</FieldLegend>
                <div className="grid grid-cols-3 gap-5">
                  <Field>
                    <FieldLabel htmlFor="unit">Unit</FieldLabel>
                    <Input id="unit" {...register('unit')} placeholder="e.g., piece, box, bottle" />
                  </Field>
                  {numberField('reorder_level', 'Reorder Level')}
                  {numberField('reorder_qty', 'Reorder Quantity')}
                </div>
              </FieldSet>

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
              {isSubmitting ? 'Saving...' : product ? 'Update Product' : 'Create Product'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
