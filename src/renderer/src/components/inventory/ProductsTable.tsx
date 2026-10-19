import { useMemo } from 'react'
import { formatCurrency } from '@renderer/lib/calculations'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import {
  createColumnHelper,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Pencil, Trash2, RotateCcw, ChevronLeft, ChevronRight, Package } from 'lucide-react'
import type { Product } from '@renderer/stores/inventoryStore'
import { InventoryDataTable } from './data-table'

const columnHelper = createColumnHelper<Product>()

interface ProductsTableProps {
  products: Product[]
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onReactivate?: (product: Product) => void
  loading?: boolean
  /** A search is active — the empty state should say "no match", not "no products". */
  searching?: boolean
}

export function ProductsTable({
  products,
  onEdit,
  onDelete,
  onReactivate,
  loading,
  searching
}: ProductsTableProps): React.JSX.Element {
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Product Name',
        meta: { className: 'w-[30%] whitespace-normal' },
        cell: (info) => (
          <div className="min-w-0">
            <div className="font-medium">{info.getValue()}</div>
            {info.row.original.generic_name && (
              <div className="text-sm text-muted-foreground">{info.row.original.generic_name}</div>
            )}
          </div>
        )
      }),
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
      columnHelper.accessor('barcode', {
        header: 'Barcode',
        cell: (info) => {
          const v = info.getValue()
          return (
            <div
              className="max-w-[140px] truncate font-mono text-sm text-muted-foreground"
              title={v || undefined}
            >
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
        meta: { className: 'text-right tabular-nums' },
        cell: (info) => formatCurrency(info.getValue(), currencySymbol)
      }),
      columnHelper.accessor('total_stock', {
        header: 'Stock',
        meta: { className: 'text-right tabular-nums' },
        cell: (info) => {
          const stock = info.getValue() || 0
          const reorderLevel = info.row.original.reorder_level
          const isLowStock = stock <= reorderLevel

          return (
            <span
              className={
                isLowStock ? 'inline-flex items-center gap-2 font-semibold text-destructive' : ''
              }
            >
              {isLowStock && <Badge variant="destructive">{stock <= 0 ? 'Out' : 'Low'}</Badge>}
              {stock} {info.row.original.unit}
            </span>
          )
        }
      }),
      columnHelper.accessor('is_active', {
        header: 'Status',
        cell: (info) =>
          info.getValue() ? (
            <Badge variant="outline" className="border-success/30 bg-success-muted text-success">
              Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-muted-foreground">
              Discontinued
            </Badge>
          )
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-0 text-right' },
        cell: (info) =>
          info.row.original.is_active === 0 ? (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => onReactivate?.(info.row.original)}
            >
              <RotateCcw className="size-5" />
              Restore
            </Button>
          ) : (
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(info.row.original)}
                aria-label="Edit product"
              >
                <Pencil className="size-5" />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => onDelete(info.row.original)}
                aria-label="Delete product"
              >
                <Trash2 className="size-5" />
              </Button>
            </div>
          )
      })
    ],
    [onEdit, onDelete, onReactivate, currencySymbol]
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
    <div>
      <InventoryDataTable
        table={table}
        loading={loading}
        empty={
          searching
            ? {
                icon: <Package />,
                title: 'No products match that',
                description: 'Try a shorter name, the SKU, or scan the barcode.'
              }
            : {
                icon: <Package />,
                title: 'No products found',
                description: 'Create your first product to get started.'
              }
        }
      />

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
              className="gap-1"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-5" />
              Previous
            </Button>
            <span className="text-base tabular-nums">
              {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button
              variant="outline"
              className="gap-1"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Next
              <ChevronRight className="size-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
