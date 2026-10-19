import { useMemo } from 'react'
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Pencil, Trash2, Truck } from 'lucide-react'
import type { Supplier } from '@renderer/stores/inventoryStore'
import { InventoryDataTable } from './data-table'

const columnHelper = createColumnHelper<Supplier>()

interface SuppliersTableProps {
  suppliers: Supplier[]
  onEdit: (supplier: Supplier) => void
  onDelete: (supplier: Supplier) => void
  /** A search is active — the empty state should say "no match". */
  searching?: boolean
}

export function SuppliersTable({
  suppliers,
  onEdit,
  onDelete,
  searching
}: SuppliersTableProps): React.JSX.Element {
  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Supplier Name',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>
      }),
      columnHelper.accessor('contact_person', {
        header: 'Contact Person',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('phone', {
        header: 'Phone',
        meta: { className: 'tabular-nums' },
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('lead_time_days', {
        header: 'Lead Time',
        meta: { className: 'text-right tabular-nums' },
        cell: (info) => `${info.getValue()} days`
      }),
      columnHelper.accessor('product_count', {
        header: 'Products',
        meta: { className: 'text-right tabular-nums' },
        cell: (info) => info.getValue() || 0
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
              Inactive
            </Badge>
          )
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
              aria-label="Edit supplier"
            >
              <Pencil className="size-5" />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={() => onDelete(info.row.original)}
              aria-label="Deactivate supplier"
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
    data: suppliers,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  return (
    <InventoryDataTable
      table={table}
      empty={
        searching
          ? { icon: <Truck />, title: 'No suppliers match that' }
          : {
              icon: <Truck />,
              title: 'No suppliers found',
              description: 'Create your first supplier to get started.'
            }
      }
    />
  )
}
