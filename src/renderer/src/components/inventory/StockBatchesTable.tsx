import { useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Edit, Trash2 } from 'lucide-react'
import type { StockBatch } from '@renderer/stores/inventoryStore'

const columnHelper = createColumnHelper<StockBatch>()

interface StockBatchesTableProps {
  batches: StockBatch[]
  onEdit: (batch: StockBatch) => void
  onDelete: (batch: StockBatch) => void
}

export function StockBatchesTable({ batches, onEdit, onDelete }: StockBatchesTableProps) {
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

          const date = new Date(expiryDate)
          const today = new Date()
          const daysUntilExpiry = Math.floor(
            (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          )

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
              {date.toLocaleDateString()}
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
              disabled={info.row.original.quantity > 0}
              title={
                info.row.original.quantity > 0
                  ? 'Cannot delete batch with remaining stock'
                  : 'Delete batch'
              }
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
