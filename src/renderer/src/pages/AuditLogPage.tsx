import { useState, useEffect, useCallback, useMemo } from 'react'
import { endOfDay, startOfDay } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Download, RefreshCw, ScrollText } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { SearchInput } from '@renderer/components/common/search-input'
import { DateRangeFilter } from '@renderer/components/audit/DateRangeFilter'
import { useAuthStore } from '@renderer/stores/authStore'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { cn } from '@renderer/lib/utils'

interface AuditEntry {
  id: string
  timestamp: string
  user_name: string | null
  action: string
  entity_type: string
  entity_id: string | null
  details: string | null
}

type Tone = 'success' | 'destructive' | 'warning' | 'info' | 'primary' | 'neutral'

const TONE_CLASSES: Record<Tone, string> = {
  success: 'bg-success-muted text-success',
  destructive: 'bg-destructive/10 text-destructive dark:bg-destructive/20',
  warning: 'bg-warning-muted text-warning',
  info: 'bg-info-muted text-info',
  primary: 'bg-primary/10 text-primary',
  neutral: 'bg-muted text-muted-foreground'
}

const ACTION_TONES: Record<string, Tone> = {
  SALE_CREATED: 'success',
  SALE_VOIDED: 'destructive',
  SALE_REFUNDED: 'warning',
  USER_LOGIN: 'info',
  USER_LOGOUT: 'neutral',
  STOCK_ADJUSTED: 'warning',
  PRODUCT_CREATED: 'primary',
  PRODUCT_UPDATED: 'primary',
  PRODUCT_DELETED: 'destructive',
  SHIFT_STARTED: 'info',
  SHIFT_ENDED: 'info',
  SETTINGS_UPDATED: 'info',
  // Newly emitted (H13). An unlisted action still renders — the lookup falls
  // back to grey — but a price change and a deletion should be findable by eye.
  PRICE_CHANGED: 'warning',
  STOCK_BATCH_CREATED: 'primary',
  STOCK_BATCH_UPDATED: 'primary',
  STOCK_BATCH_DELETED: 'destructive',
  CATEGORY_CREATED: 'primary',
  CATEGORY_UPDATED: 'primary',
  CATEGORY_DELETED: 'destructive',
  SUPPLIER_CREATED: 'primary',
  SUPPLIER_UPDATED: 'primary',
  SUPPLIER_DELETED: 'destructive',
  CUSTOMER_ERASED: 'destructive',
  USER_LOGIN_FAILED: 'warning',
  USER_LOCKED_OUT: 'destructive'
}

/**
 * Every action the main process can write (AuditAction in services/audit.ts).
 * The query matches the action exactly, so the filter is a pick-list rather than
 * free text — typing "SALE" used to return nothing until the whole name was in.
 */
const AUDIT_ACTIONS = [
  'SALE_CREATED',
  'SALE_VOIDED',
  'SALE_REFUNDED',
  'PRODUCT_CREATED',
  'PRODUCT_UPDATED',
  'PRODUCT_DELETED',
  'PRICE_CHANGED',
  'PRODUCTS_IMPORTED_EXCEL',
  'STOCK_ADJUSTED',
  'STOCK_BATCH_CREATED',
  'STOCK_BATCH_UPDATED',
  'STOCK_BATCH_DELETED',
  'CATEGORY_CREATED',
  'CATEGORY_UPDATED',
  'CATEGORY_DELETED',
  'SUPPLIER_CREATED',
  'SUPPLIER_UPDATED',
  'SUPPLIER_DELETED',
  'CUSTOMER_ERASED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_DELETED',
  'USER_LOGIN',
  'USER_LOGIN_FAILED',
  'USER_LOCKED_OUT',
  'USER_LOGOUT',
  'SHIFT_STARTED',
  'SHIFT_ENDED',
  'CASH_MOVEMENT',
  'SETTINGS_UPDATED',
  'BACKUP_CREATED',
  'BACKUP_RESTORED'
]

const ALL_ACTIONS = '__all__'

export function AuditLogPage(): React.JSX.Element {
  const { user } = useAuthStore()
  const userId = user?.id ?? ''

  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [actionFilter, setActionFilter] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [pageSearch, setPageSearch] = useState('')
  const PAGE_SIZE = 50

  // Day boundaries in local time, sent as ISO UTC to match the stored timestamps.
  const startDate = dateRange?.from ? startOfDay(dateRange.from).toISOString() : undefined
  const endDate = dateRange?.from
    ? endOfDay(dateRange.to ?? dateRange.from).toISOString()
    : undefined

  const loadEntries = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await window.electron.audit.query(userId, {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        action: actionFilter || undefined,
        startDate,
        endDate
      })
      setEntries(result.entries)
      setTotal(result.total)
    } catch (error) {
      toast.error('Could not load the audit log', { description: ipcErrorMessage(error) })
    } finally {
      setIsLoading(false)
    }
  }, [page, actionFilter, startDate, endDate, userId])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const handleExport = async (): Promise<void> => {
    try {
      const result = (await window.electron.audit.exportCsv(userId, {
        action: actionFilter || undefined,
        startDate,
        endDate
      })) as { success?: boolean; cancelled?: boolean; filePath?: string } | undefined
      if (result?.success) {
        toast.success('Audit log exported', { description: result.filePath })
      }
    } catch (error) {
      toast.error('Could not export the audit log', { description: ipcErrorMessage(error) })
    }
  }

  const formatTimestamp = (ts: string): string => {
    return new Date(ts).toLocaleString('en-LK', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const parseDetails = (details: string | null): string => {
    if (!details) return ''
    try {
      const obj = JSON.parse(details)
      return Object.entries(obj)
        .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? JSON.stringify(v) : v}`)
        .join(', ')
    } catch {
      return details
    }
  }

  // Narrows only the page already on screen; the server-side filters are the
  // action and date pickers.
  const visibleEntries = useMemo(() => {
    const q = pageSearch.trim().toLowerCase()
    if (!q) return entries
    return entries.filter((e) =>
      [e.user_name ?? 'system', e.action, e.entity_type, e.entity_id ?? '', e.details ?? '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    )
  }, [entries, pageSearch])

  const hasFilters = Boolean(actionFilter || dateRange?.from)

  return (
    <div className="flex h-full flex-col gap-4 bg-canvas p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Audit Log</h1>
          <p className="text-base text-muted-foreground">
            Immutable record of all system actions — {total.toLocaleString()} entries
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={loadEntries} disabled={isLoading}>
            <RefreshCw className={cn('size-5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="size-5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-xs">
        <Select
          value={actionFilter || ALL_ACTIONS}
          onValueChange={(value) => {
            setActionFilter(value === ALL_ACTIONS ? '' : value)
            setPage(0)
          }}
        >
          <SelectTrigger className="w-72" aria-label="Filter by action">
            <SelectValue placeholder="All actions" />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-96">
            <SelectItem value={ALL_ACTIONS}>All actions</SelectItem>
            {AUDIT_ACTIONS.map((action) => (
              <SelectItem key={action} value={action}>
                {action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DateRangeFilter
          value={dateRange}
          onChange={(range) => {
            setDateRange(range)
            setPage(0)
          }}
        />

        <SearchInput
          value={pageSearch}
          onValueChange={setPageSearch}
          placeholder="Search this page (user, entity, details)…"
          className="min-w-64 flex-1"
        />
      </div>

      {/* Log Table */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs *:data-[slot=table-container]:min-h-0 *:data-[slot=table-container]:flex-1 *:data-[slot=table-container]:overflow-auto *:data-[slot=table-container]:overscroll-contain">
        {isLoading && entries.length === 0 ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : visibleEntries.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ScrollText />
              </EmptyMedia>
              <EmptyTitle>No audit entries found</EmptyTitle>
              <EmptyDescription>
                {pageSearch
                  ? 'Nothing on this page matches your search.'
                  : hasFilters
                    ? 'Try a different action or date range.'
                    : 'Actions will appear here as the system is used.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className={cn('table-fixed', isLoading && 'opacity-60')}>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-56 pl-4 text-muted-foreground">Timestamp</TableHead>
                <TableHead className="w-40 text-muted-foreground">User</TableHead>
                <TableHead className="w-60 text-muted-foreground">Action</TableHead>
                <TableHead className="w-32 text-muted-foreground">Entity</TableHead>
                <TableHead className="pr-4 text-muted-foreground">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEntries.map((entry) => {
                const details = parseDetails(entry.details)
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="pl-4 text-sm tabular-nums text-muted-foreground">
                      {formatTimestamp(entry.timestamp)}
                    </TableCell>
                    <TableCell className="truncate font-medium">
                      {entry.user_name ?? (
                        <span className="font-normal italic text-muted-foreground">system</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          'h-7 rounded-md px-2.5 font-mono text-xs',
                          TONE_CLASSES[ACTION_TONES[entry.action] ?? 'neutral']
                        )}
                      >
                        {entry.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.entity_type}
                    </TableCell>
                    <TableCell
                      className="truncate pr-4 text-sm text-muted-foreground"
                      title={details}
                    >
                      {details}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-4">
          <span className="text-base text-muted-foreground tabular-nums">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-3">
            <Button
              variant="outline"
              disabled={page === 0 || isLoading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="size-5" />
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={(page + 1) * PAGE_SIZE >= total || isLoading}
              onClick={() => setPage((p) => p + 1)}
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
