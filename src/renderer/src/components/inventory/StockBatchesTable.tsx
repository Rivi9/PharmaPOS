import { useMemo } from 'react'
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Pencil, Trash2, History, Boxes } from 'lucide-react'
import type { StockBatch } from '@renderer/stores/inventoryStore'
import { daysUntil } from '../../../../shared/dates'
import { InventoryDataTable } from './data-table'

const columnHelper = createColumnHelper<StockBatch>()

interface StockBatchesTableProps {
  batches: StockBatch[]
  onEdit: (batch: StockBatch) => void
  onDelete: (batch: StockBatch) => void
  onViewHistory?: (batch: StockBatch) => void
  loading?: boolean
  /** A search is active — the empty state should say "no match". */
  searching?: boolean
}

/** A stored `YYYY-MM-DD` as a local date, for display. */
function localDisplayDate(value: string): string {
  // Rendered from the stored YYYY-MM-DD parts, not `new Date(value)`, which
  // parses as UTC midnight and prints the previous day locally.
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString()
}

export function StockBatchesTable({
  batches,
  onEdit,
  onDelete,
  onViewHistory,
  loading,
  searching
}: StockBatchesTableProps): React.JSX.Element {
  const columns = useMemo(
    () => [
      columnHelper.accessor('product_name', {
        header: 'Product',
        meta: { className: 'whitespace-normal' },
        cell: (info) => (
          <div>
            <div className="font-medium">{info.getValue()}</div>
            {info.row.original.sku && (
              <div className="text-sm text-muted-foreground">{info.row.original.sku}</div>
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
        meta: { className: 'text-right tabular-nums font-medium' },
        cell: (info) => info.getValue()
      }),
      columnHelper.accessor('cost_price', {
        header: 'Cost Price',
        meta: { className: 'text-right tabular-nums' },
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

          const isExpired = daysUntilExpiry < 0
          const isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 30

          return (
            <span className="inline-flex items-center gap-2">
              <span className={isExpired || isExpiringSoon ? 'font-semibold' : ''}>
                {localDisplayDate(expiryDate)}
              </span>
              {isExpired && <Badge variant="destructive">Expired</Badge>}
              {isExpiringSoon && !isExpired && (
                <Badge
                  variant="outline"
                  className="border-warning/30 bg-warning-muted text-warning"
                >
                  {daysUntilExpiry}d
                </Badge>
              )}
            </span>
          )
        }
      }),
      columnHelper.accessor('received_date', {
        header: 'Received',
        cell: (info) => {
          const value = info.getValue()
          // Same UTC trap as the expiry: a bare YYYY-MM-DD parsed with
          // `new Date()` printed the day before the stock arrived.
          return /^\d{4}-\d{2}-\d{2}$/.test(value)
            ? localDisplayDate(value)
            : new Date(value).toLocaleDateString()
        }
      }),
      columnHelper.accessor('supplier_name', {
        header: 'Supplier',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.display({
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        meta: { className: 'w-0 text-right' },
        cell: (info) => {
          const hasStock = info.row.original.quantity > 0
          return (
            <div className="flex items-center justify-end gap-2">
              {onViewHistory && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onViewHistory(info.row.original)}
                  aria-label="Batch history"
                >
                  <History className="size-5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onEdit(info.row.original)}
                aria-label="Edit batch"
              >
                <Pencil className="size-5" />
              </Button>
              {hasStock ? (
                // A disabled button plus a title tooltip explained nothing on a
                // touchscreen: hover never fires and pointer-events are off, so
                // the operator saw a dead grey control with no reason given.
                <span className="inline-flex w-12 justify-center text-sm leading-tight text-muted-foreground">
                  has stock
                </span>
              ) : (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => onDelete(info.row.original)}
                  aria-label="Delete batch"
                >
                  <Trash2 className="size-5" />
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
    <InventoryDataTable
      table={table}
      loading={loading}
      empty={
        searching
          ? {
              icon: <Boxes />,
              title: 'No batches match that',
              description: 'Search by product name or batch number.'
            }
          : {
              icon: <Boxes />,
              title: 'No stock batches found',
              description: 'Receive stock to get started.'
            }
      }
    />
  )
}
