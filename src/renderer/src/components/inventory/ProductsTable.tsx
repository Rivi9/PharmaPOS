import { useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Edit, Trash2 } from 'lucide-react'
import type { Product } from '@renderer/stores/inventoryStore'

const columnHelper = createColumnHelper<Product>()

interface ProductsTableProps {
  products: Product[]
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
}

export function ProductsTable({ products, onEdit, onDelete }: ProductsTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('sku', {
        header: 'SKU',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('name', {
        header: 'Product Name',
        cell: (info) => (
          <div>
            <div className="font-medium">{info.getValue()}</div>
            {info.row.original.generic_name && (
              <div className="text-xs text-muted-foreground">{info.row.original.generic_name}</div>
            )}
          </div>
        )
      }),
      columnHelper.accessor('barcode', {
        header: 'Barcode',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('category_name', {
        header: 'Category',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('unit_price', {
        header: 'Unit Price',
        cell: (info) => `Rs. ${info.getValue().toFixed(2)}`
      }),
      columnHelper.accessor('total_stock', {
        header: 'Stock',
        cell: (info) => {
          const stock = info.getValue() || 0
          const reorderLevel = info.row.original.reorder_level
          const isLowStock = stock <= reorderLevel

          return (
            <span className={isLowStock ? 'text-red-600 font-semibold' : ''}>
              {stock} {info.row.original.unit}
            </span>
          )
        }
      }),
      columnHelper.accessor('is_active', {
        header: 'Status',
        cell: (info) =>
          info.getValue() ? (
            <span className="text-green-600">Active</span>
          ) : (
            <span className="text-gray-400">Inactive</span>
          )
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
    data: products,
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
                No products found. Create your first product to get started.
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
