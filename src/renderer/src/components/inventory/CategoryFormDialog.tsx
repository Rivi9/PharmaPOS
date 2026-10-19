import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import type { Category } from '@renderer/stores/inventoryStore'

const categorySchema = z.object({
  name: z.string().min(1, 'Category name is required'),
  description: z.string().optional(),
  parent_id: z.string().optional()
})

type CategoryFormData = z.infer<typeof categorySchema>

interface CategoryFormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: CategoryFormData) => Promise<void>
  category?: Category | null
  categories: Category[]
}

export function CategoryFormDialog({
  open,
  onClose,
  onSubmit,
  category,
  categories
}: CategoryFormDialogProps): React.JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<CategoryFormData>({
    resolver: zodResolver(categorySchema)
  })

  useEffect(() => {
    if (category) {
      reset({
        name: category.name,
        description: category.description || '',
        parent_id: category.parent_id || 'none'
      })
    } else {
      reset({ name: '', description: '', parent_id: 'none' })
    }
  }, [category, reset])

  const [submitError, setSubmitError] = useState('')

  const handleFormSubmit = async (data: CategoryFormData): Promise<void> => {
    setSubmitError('')
    // Convert "none" back to undefined for submission
    const submitData = {
      ...data,
      parent_id: data.parent_id === 'none' ? undefined : data.parent_id
    }
    try {
      await onSubmit(submitData)
    } catch (err) {
      // Same rule as the product form: a refused save (duplicate name) keeps
      // the input and says why, instead of an unhandled rejection and nothing.
      setSubmitError((err as Error)?.message || 'Could not save')
      return
    }
    reset()
  }

  const parentId = watch('parent_id') || 'none'

  // Filter out current category and its descendants from parent options
  const availableParents = categories.filter((cat) => cat.id !== category?.id)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="pr-10">
          <DialogTitle className="text-xl font-semibold">
            {category ? 'Edit Category' : 'Add New Category'}
          </DialogTitle>
          <DialogDescription className="text-base">
            {category
              ? 'Update category details and hierarchy.'
              : 'Create a new category to organize your products.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="flex flex-col gap-6" noValidate>
          <FieldGroup className="gap-5">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="name">
                Category Name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input id="name" aria-invalid={!!errors.name} {...register('name')} />
              <FieldError errors={[errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea id="description" rows={2} {...register('description')} />
            </Field>

            <Field>
              <FieldLabel htmlFor="parent_id">Parent Category (Optional)</FieldLabel>
              <Select value={parentId} onValueChange={(value) => setValue('parent_id', value)}>
                <SelectTrigger id="parent_id" className="w-full">
                  <SelectValue placeholder="None (Top level)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top level)</SelectItem>
                  {availableParents.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {submitError && (
              <Alert variant="destructive">
                <AlertDescription className="text-base font-medium">{submitError}</AlertDescription>
              </Alert>
            )}
          </FieldGroup>

          <DialogFooter>
            <Button type="button" variant="outline" size="lg" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" className="min-w-44" disabled={isSubmitting}>
              {isSubmitting && <Spinner className="size-5" />}
              {isSubmitting ? 'Saving...' : category ? 'Update Category' : 'Create Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
