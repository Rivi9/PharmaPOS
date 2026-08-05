import { useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Edit, Trash2, History } from 'lucide-react'
import type { StockBatch } from '@renderer/stores/inventoryStore'
import { daysUntil } from '../../../../shared/dates'

const columnHelper = createColumnHelper<StockBatch>()

interface StockBatchesTableProps {
  batches: StockBatch[]
  onEdit: (batch: StockBatch) => void
  onDelete: (batch: StockBatch) => void
  onViewHistory?: (batch: StockBatch) => void
}

export function StockBatchesTable({
  batches,
  onEdit,
  onDelete,
  onViewHistory
}: StockBatchesTableProps) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('product_name', {
        header: 'Product',
        cell: (info) => (
          <div>
            <div className="font-medium">{info.getValue()}</div>
            {info.row.original.sku && (
              <div className="text-xs text-muted-foreground">{info.row.original.sku}</div>
            )}
          </div>
        )
      }),
      columnHelper.accessor('batch_number', {
        header: 'Batch Number',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('quantity', {
        header: 'Quantity',
        cell: (info) => info.getValue()
      }),
      columnHelper.accessor('cost_price', {
        header: 'Cost Price',
        cell: (info) => `Rs. ${info.getValue().toFixed(2)}`
      }),
      columnHelper.accessor('expiry_date', {
        header: 'Expiry Date',
        cell: (info) => {
          const expiryDate = info.getValue()
          if (!expiryDate) return '-'

          // Local calendar days: comparing a UTC-parsed date against `new Date()`
          // marked a batch expired from 05:30 local on its expiry day (L9/M21).
          const daysUntilExpiry = daysUntil(expiryDate) ?? 0
          // Rendered from the stored YYYY-MM-DD parts, not `new Date(expiryDate)`,
          // which parses as UTC midnight and prints the previous day locally.
          const [y, m, d] = expiryDate.slice(0, 10).split('-').map(Number)
          const displayDate = new Date(y, (m || 1) - 1, d || 1)

          const isExpired = daysUntilExpiry < 0
          const isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 30

          return (
            <span
              className={
                isExpired
                  ? 'text-red-600 font-semibold'
                  : isExpiringSoon
                    ? 'text-orange-600 font-semibold'
                    : ''
              }
            >
              {displayDate.toLocaleDateString()}
              {isExpiringSoon && !isExpired && ` (${daysUntilExpiry}d)`}
              {isExpired && ' (Expired)'}
            </span>
          )
        }
      }),
      columnHelper.accessor('received_date', {
        header: 'Received',
        cell: (info) => {
          const date = new Date(info.getValue())
          return date.toLocaleDateString()
        }
      }),
      columnHelper.accessor('supplier_name', {
        header: 'Supplier',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => {
          const hasStock = info.row.original.quantity > 0
          return (
            <div className="flex items-center gap-3">
              {onViewHistory && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onViewHistory(info.row.original)}
                  aria-label="Batch history"
                >
                  <History className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(info.row.original)}
                aria-label="Edit batch"
              >
                <Edit className="h-4 w-4" />
              </Button>
              {hasStock ? (
                // A disabled button plus a title tooltip explained nothing on a
                // touchscreen: hover never fires and pointer-events are off, so
                // the operator saw a dead grey control with no reason given.
                <span className="text-xs text-muted-foreground">has stock</span>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(info.row.original)}
                  className="text-red-600 hover:text-red-700"
                  aria-label="Delete batch"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          )
        }
      })
    ],
    [onEdit, onDelete, onViewHistory]
  )

  const table = useReactTable({
    data: batches,
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
                No stock batches found. Receive stock to get started.
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
    </div>
  )
}
