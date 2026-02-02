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
}: CategoryFormDialogProps) {
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

  const handleFormSubmit = async (data: CategoryFormData) => {
    // Convert "none" back to undefined for submission
    const submitData = {
      ...data,
      parent_id: data.parent_id === 'none' ? undefined : data.parent_id
    }
    await onSubmit(submitData)
    reset()
  }

  const parentId = watch('parent_id') || 'none'

  // Filter out current category and its descendants from parent options
  const availableParents = categories.filter((cat) => cat.id !== category?.id)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit Category' : 'Add New Category'}</DialogTitle>
          <DialogDescription>
            {category
              ? 'Update category details and hierarchy.'
              : 'Create a new category to organize your products.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Category Name <span className="text-red-500">*</span>
            </Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input id="description" {...register('description')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="parent_id">Parent Category (Optional)</Label>
            <Select value={parentId} onValueChange={(value) => setValue('parent_id', value)}>
              <SelectTrigger>
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
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : category ? 'Update Category' : 'Create Category'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
