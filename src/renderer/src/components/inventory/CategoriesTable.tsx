import { useMemo } from 'react'
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Pencil, Trash2, FolderTree } from 'lucide-react'
import type { Category } from '@renderer/stores/inventoryStore'
import { InventoryDataTable } from './data-table'

const columnHelper = createColumnHelper<Category>()

interface CategoriesTableProps {
  categories: Category[]
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
  /** A search is active — the empty state should say "no match". */
  searching?: boolean
}

export function CategoriesTable({
  categories,
  onEdit,
  onDelete,
  searching
}: CategoriesTableProps): React.JSX.Element {
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Category Name',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        meta: { className: 'whitespace-normal text-muted-foreground' },
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('parent_name', {
        header: 'Parent Category',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('product_count', {
        header: 'Products',
        meta: { className: 'text-right tabular-nums' },
        cell: (info) => info.getValue() || 0
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-0 text-right' },
        cell: (info) => (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(info.row.original)}
              aria-label="Edit category"
            >
              <Pencil className="size-5" />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={() => onDelete(info.row.original)}
              aria-label="Delete category"
            >
              <Trash2 className="size-5" />
            </Button>
          </div>
        )
      })
    ],
    [onEdit, onDelete]
  )

  const table = useReactTable({
    data: categories,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  return (
    <InventoryDataTable
      table={table}
      empty={
        searching
          ? { icon: <FolderTree />, title: 'No categories match that' }
          : {
              icon: <FolderTree />,
              title: 'No categories found',
              description: 'Create your first category to get started.'
            }
      }
    />
  )
}
