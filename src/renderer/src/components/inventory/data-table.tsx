import * as React from 'react'
import { flexRender, type Table as TanTable } from '@tanstack/react-table'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { cn } from '@renderer/lib/utils'

/** Per-column classes, set as `meta: { className }` on a column definition. */
export interface InventoryColumnMeta {
  className?: string
}

function columnClass(meta: unknown): string | undefined {
  return (meta as InventoryColumnMeta | undefined)?.className
}

interface InventoryDataTableProps<T> {
  table: TanTable<T>
  /** First load in flight: show placeholder rows instead of the empty state. */
  loading?: boolean
  empty: { icon: React.ReactNode; title: string; description?: string }
  className?: string
}

/**
 * The shared body of the inventory tables: shadcn Table, sticky header, an
 * Empty state and skeleton rows. The scroll container is the panel around it
 * (the page), so the table's own overflow wrapper is made visible — otherwise
 * it becomes the sticky header's scroll ancestor and the header scrolls away.
 */
export function InventoryDataTable<T>({
  table,
  loading,
  empty,
  className
}: InventoryDataTableProps<T>): React.JSX.Element {
  const rows = table.getRowModel().rows
  const columnCount = table.getVisibleLeafColumns().length

  return (
    <div className={cn('[&>[data-slot=table-container]]:overflow-visible', className)}>
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-muted shadow-[inset_0_-1px_0_var(--border)]">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="border-0 hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  className={cn(
                    'px-4 text-sm font-semibold text-muted-foreground',
                    columnClass(header.column.columnDef.meta)
                  )}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className={cn(loading && rows.length > 0 && 'opacity-60 transition-opacity')}>
          {rows.length === 0 ? (
            loading ? (
              Array.from({ length: 6 }, (_, i) => (
                <TableRow key={`skeleton-${i}`} className="hover:bg-transparent">
                  {Array.from({ length: columnCount }, (_, j) => (
                    <TableCell key={j} className="px-4">
                      <Skeleton className="h-5 w-full max-w-40" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columnCount} className="p-0 whitespace-normal">
                  <Empty className="py-16">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">{empty.icon}</EmptyMedia>
                      <EmptyTitle>{empty.title}</EmptyTitle>
                      {empty.description && (
                        <EmptyDescription className="text-base">
                          {empty.description}
                        </EmptyDescription>
                      )}
                    </EmptyHeader>
                  </Empty>
                </TableCell>
              </TableRow>
            )
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="active:bg-muted/60">
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn('px-4', columnClass(cell.column.columnDef.meta))}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
