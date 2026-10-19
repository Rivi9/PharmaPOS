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
import { Textarea } from '@renderer/components/ui/textarea'
import { Field, FieldError, FieldGroup, FieldLabel } from '@renderer/components/ui/field'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Spinner } from '@renderer/components/ui/spinner'
import { FormNumberInput } from './form-controls'
import type { Supplier } from '@renderer/stores/inventoryStore'

const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required'),
  contact_person: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  lead_time_days: z
    .number({ error: 'Enter the lead time in days' })
    .int('Whole days only')
    .min(0)
    .optional(),
  is_active: z.number().optional()
})

type SupplierFormData = z.infer<typeof supplierSchema>

interface SupplierFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: SupplierFormData) => Promise<void>
  supplier?: Supplier | null
}

export function SupplierFormDialog({
  open,
  onClose,
  onSubmit,
  supplier
}: SupplierFormDialogProps): React.JSX.Element {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: {
      lead_time_days: 3,
      is_active: 1
    }
  })

  useEffect(() => {
    if (supplier) {
      reset({
        name: supplier.name,
        contact_person: supplier.contact_person || '',
        phone: supplier.phone || '',
        email: supplier.email || '',
        address: supplier.address || '',
        lead_time_days: supplier.lead_time_days,
        is_active: supplier.is_active
      })
    } else {
      reset({
        lead_time_days: 3,
        is_active: 1
      })
    }
  }, [supplier, reset])

  const [submitError, setSubmitError] = useState('')

  const handleFormSubmit = async (data: SupplierFormData): Promise<void> => {
    setSubmitError('')
    try {
      await onSubmit(data)
    } catch (err) {
      // Same rule as the product form: a refused save keeps the input and says
      // why, instead of an unhandled rejection and nothing on screen.
      setSubmitError((err as Error)?.message || 'Could not save')
      return
    }
    reset()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-6 pr-16">
          <DialogTitle className="text-xl font-semibold">
            {supplier ? 'Edit Supplier' : 'Add New Supplier'}
          </DialogTitle>
          <DialogDescription className="text-base">
            {supplier
              ? 'Update supplier contact information and delivery details.'
              : 'Add a new supplier for product sourcing and inventory management.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="flex min-h-0 flex-1 flex-col"
          noValidate
        >
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
            <FieldGroup className="gap-5">
              <Field data-invalid={!!errors.name}>
                <FieldLabel htmlFor="name">
                  Supplier Name <span className="text-destructive">*</span>
                </FieldLabel>
                <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
                <FieldError errors={[errors.name]} />
              </Field>

              <div className="grid grid-cols-2 gap-5">
                <Field>
                  <FieldLabel htmlFor="contact_person">Contact Person</FieldLabel>
                  <Input id="contact_person" {...register('contact_person')} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="phone">Phone</FieldLabel>
                  <Input id="phone" type="tel" inputMode="tel" {...register('phone')} />
                </Field>

                <Field className="col-span-2" data-invalid={!!errors.email}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    aria-invalid={!!errors.email}
                    {...register('email')}
                  />
                  <FieldError errors={[errors.email]} />
                </Field>

                <Field className="col-span-2">
                  <FieldLabel htmlFor="address">Address</FieldLabel>
                  <Textarea id="address" rows={2} {...register('address')} />
                </Field>

                <Field data-invalid={!!errors.lead_time_days}>
                  <FieldLabel htmlFor="lead_time_days">Lead Time (days)</FieldLabel>
                  <Controller
                    control={control}
                    name="lead_time_days"
                    render={({ field, fieldState }) => (
                      <FormNumberInput
                        id="lead_time_days"
                        ref={field.ref}
                        name={field.name}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        aria-invalid={fieldState.invalid}
                      />
                    )}
                  />
                  <FieldError errors={[errors.lead_time_days]} />
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
              {isSubmitting ? 'Saving...' : supplier ? 'Update Supplier' : 'Create Supplier'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
