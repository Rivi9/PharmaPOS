import { useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Edit, Trash2 } from 'lucide-react'
import type { Category } from '@renderer/stores/inventoryStore'

const columnHelper = createColumnHelper<Category>()

interface CategoriesTableProps {
  categories: Category[]
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
}

export function CategoriesTable({ categories, onEdit, onDelete }: CategoriesTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Category Name',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('parent_name', {
        header: 'Parent Category',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('product_count', {
        header: 'Products',
        cell: (info) => info.getValue() || 0
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(info.row.original)}
              className="h-8 w-8 p-0"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(info.row.original)}
              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
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
    <div className="rounded-md border">
      <table className="w-full">
        <thead className="bg-muted">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th key={header.id} className="px-4 py-3 text-left text-sm font-medium">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted-foreground">
                No categories found. Create your first category to get started.
              </td>
            </tr>
          ) : (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
