import { useMemo } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable
} from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Edit, Trash2 } from 'lucide-react'
import type { Supplier } from '@renderer/stores/inventoryStore'

const columnHelper = createColumnHelper<Supplier>()

interface SuppliersTableProps {
  suppliers: Supplier[]
  onEdit: (supplier: Supplier) => void
  onDelete: (supplier: Supplier) => void
}

export function SuppliersTable({ suppliers, onEdit, onDelete }: SuppliersTableProps) {
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
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('lead_time_days', {
        header: 'Lead Time',
        cell: (info) => `${info.getValue()} days`
      }),
      columnHelper.accessor('product_count', {
        header: 'Products',
        cell: (info) => info.getValue() || 0
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
    data: suppliers,
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
                No suppliers found. Create your first supplier to get started.
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
