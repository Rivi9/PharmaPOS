import { useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Edit, Trash2, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Product } from '@renderer/stores/inventoryStore'

const columnHelper = createColumnHelper<Product>()

interface ProductsTableProps {
  products: Product[]
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onReactivate?: (product: Product) => void
}

export function ProductsTable({
  products,
  onEdit,
  onDelete,
  onReactivate
}: ProductsTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('sku', {
        header: 'SKU',
        cell: (info) => {
          const v = info.getValue()
          return (
            <div className="max-w-[120px] truncate" title={v || undefined}>
              {v || '-'}
            </div>
          )
        }
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
        cell: (info) => {
          const v = info.getValue()
          return (
            <div className="max-w-[140px] truncate font-mono text-xs" title={v || undefined}>
              {v || '-'}
            </div>
          )
        }
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
        cell: (info) =>
          info.row.original.is_active === 0 ? (
            <Button
              variant="outline"
              className="h-11 gap-2"
              onClick={() => onReactivate?.(info.row.original)}
            >
              <RotateCcw className="h-4 w-4" />
              Restore
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(info.row.original)}
                aria-label="Edit product"
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(info.row.original)}
                aria-label="Delete product"
                className="text-red-600 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )
      })
    ],
    [onEdit, onDelete, onReactivate]
  )

  // Paginated: the table rendered every row, so a 10,000-product catalogue meant
  // roughly 80,000 DOM nodes in one scroll container on POS-class hardware.
  const table = useReactTable({
    data: products,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } }
  })

  return (
    <div className="rounded-md border">
      <table className="w-full table-fixed">
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
              <tr key={row.id} className="border-t hover:bg-muted/50 active:bg-muted/60">
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

      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
            {'–'}
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              products.length
            )}{' '}
            of {products.length}
          </p>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="h-11 gap-1"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm tabular-nums">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              className="h-11 gap-1"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
