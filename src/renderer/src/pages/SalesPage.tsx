import { useCallback, useEffect, useRef, useState } from 'react'
import type { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, ReceiptText, RefreshCw } from 'lucide-react'
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
import { SaleDetailSheet } from '@renderer/components/sales/SaleDetailSheet'
import {
  PAYMENT_LABELS,
  STATUS_LABELS,
  formatDateTime
} from '@renderer/components/sales/sale-format'
import { SaleStatusBadge } from '@renderer/components/sales/SaleStatusBadge'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { formatCurrency } from '@renderer/lib/calculations'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { cn } from '@renderer/lib/utils'
import { localDateString } from '../../../shared/dates'
import {
  SALE_LIST_STATUSES,
  type SaleDetail,
  type SaleListRow,
  type SaleListStatus
} from '../../../shared/sales-history'

const PAGE_SIZE = 50
const ALL = '__all__'

/**
 * Every sale, newest first: find one by receipt number or the customer's phone,
 * reprint its receipt, and — for managers and admins — void or refund it.
 *
 * Paged, searched and filtered in the main process (listSalesPage), like the
 * inventory list. Dates are local calendar days (shared/dates), matched against
 * the sale's local date, the way every report counts them.
 */
export function SalesPage(): React.JSX.Element {
  const currency = useSettingsStore((s) => s.settings.currency_symbol) || 'Rs.'
  const currentShiftId = useShiftStore((s) => s.currentShift?.id)
  const refreshTodaySales = useShiftStore((s) => s.refreshTodaySales)

  const [rows, setRows] = useState<SaleListRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [status, setStatus] = useState<SaleListStatus | ''>('')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SaleDetail | null>(null)
  // The sale whose detail is wanted, so a slow response for a row tapped
  // earlier cannot overwrite the one now on screen.
  const detailFor = useRef<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const startDate = dateRange?.from ? localDateString(dateRange.from) : undefined
  const endDate = dateRange?.from ? localDateString(dateRange.to ?? dateRange.from) : undefined

  const loadPage = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await window.electron.sales.listPage({
        search: debouncedSearch || undefined,
        startDate,
        endDate,
        status: status || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE
      })
      setRows(result.rows)
      setTotal(result.total)
    } catch (error) {
      toast.error('Could not load sales', { description: ipcErrorMessage(error) })
    } finally {
      setIsLoading(false)
      setHasLoaded(true)
    }
  }, [debouncedSearch, startDate, endDate, status, page])

  useEffect(() => {
    void loadPage()
  }, [loadPage])

  const loadDetail = useCallback(async (saleId: string) => {
    detailFor.current = saleId
    try {
      const data = await window.electron.sales.detail(saleId)
      if (detailFor.current === saleId) setDetail(data)
    } catch (error) {
      if (detailFor.current === saleId) {
        toast.error('Could not load the sale', { description: ipcErrorMessage(error) })
        setSelectedId(null)
      }
    }
  }, [])

  const openSale = (saleId: string): void => {
    setSelectedId(saleId)
    setDetail(null)
    void loadDetail(saleId)
  }

  /** After a void or refund: the list, the open sale, and the header's takings. */
  const afterChange = async (): Promise<void> => {
    if (selectedId) await loadDetail(selectedId)
    await loadPage()
    // The header's "Today" figure is the shift's takings less its refunds, read
    // from the database. The drawer's expected cash is computed fresh when End
    // Shift is opened, so it needs no nudge.
    if (currentShiftId) await refreshTodaySales(currentShiftId)
  }

  const money = (n: number): string => formatCurrency(n, currency)
  const hasFilters = Boolean(debouncedSearch || dateRange?.from || status)

  return (
    <div className="flex h-full flex-col gap-4 bg-canvas p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Sales</h1>
          <p className="text-base text-muted-foreground">
            {hasLoaded ? `${total.toLocaleString()} ${total === 1 ? 'sale' : 'sales'}` : 'Loading…'}
          </p>
        </div>
        <Button variant="outline" onClick={() => void loadPage()} disabled={isLoading}>
          <RefreshCw className={cn('size-5', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 shadow-xs">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          loading={isLoading && hasLoaded}
          placeholder="Receipt number or customer phone…"
          aria-label="Search sales"
          className="min-w-64 flex-1"
        />
        <DateRangeFilter
          value={dateRange}
          onChange={(range) => {
            setDateRange(range)
            setPage(0)
          }}
        />
        <Select
          value={status || ALL}
          onValueChange={(value) => {
            setStatus(value === ALL ? '' : (value as SaleListStatus))
            setPage(0)
          }}
        >
          <SelectTrigger className="w-52" aria-label="Filter by status">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent position="popper">
            <SelectItem value={ALL}>All statuses</SelectItem>
            {SALE_LIST_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs *:data-[slot=table-container]:min-h-0 *:data-[slot=table-container]:flex-1 *:data-[slot=table-container]:overflow-auto *:data-[slot=table-container]:overscroll-contain">
        {!hasLoaded ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ReceiptText />
              </EmptyMedia>
              <EmptyTitle>No sales found</EmptyTitle>
              <EmptyDescription>
                {hasFilters
                  ? 'Try another receipt number, phone, date or status.'
                  : 'Sales appear here as they are rung up at the till.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table className={cn(isLoading && 'opacity-60')}>
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]">
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4 text-muted-foreground">Receipt</TableHead>
                <TableHead className="text-muted-foreground">Date &amp; time</TableHead>
                <TableHead className="text-muted-foreground">Cashier</TableHead>
                <TableHead className="text-muted-foreground">Customer</TableHead>
                <TableHead className="text-muted-foreground">Payment</TableHead>
                <TableHead className="text-right text-muted-foreground">Total</TableHead>
                <TableHead className="pr-4 text-muted-foreground">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={row.id}
                  tabIndex={0}
                  aria-selected={row.id === selectedId}
                  className="cursor-pointer touch-manipulation"
                  onClick={() => openSale(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openSale(row.id)
                    }
                  }}
                >
                  <TableCell className="pl-4 font-medium tabular-nums">
                    {row.receipt_number}
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {formatDateTime(row.created_at)}
                  </TableCell>
                  <TableCell className="max-w-40 truncate">{row.cashier_name ?? '—'}</TableCell>
                  <TableCell className="max-w-56">
                    {row.customer_name || row.customer_phone ? (
                      <>
                        <p className="truncate">{row.customer_name ?? row.customer_phone}</p>
                        {row.customer_name && row.customer_phone && (
                          <p className="truncate text-sm text-muted-foreground">
                            {row.customer_phone}
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{PAYMENT_LABELS[row.payment_method] ?? row.payment_method}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <p className={cn('font-medium', row.status === 'voided' && 'line-through')}>
                      {money(row.total)}
                    </p>
                    {row.refunded > 0 && (
                      <p className="text-sm text-muted-foreground">
                        −{money(row.refunded)} refunded
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="pr-4">
                    <SaleStatusBadge status={row.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

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

      <SaleDetailSheet
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null)
            detailFor.current = null
          }
        }}
        detail={detail}
        onVoided={() => {
          toast.success(`${detail?.sale.receipt_number ?? 'Sale'} voided`, {
            description: 'The items are back in stock.'
          })
          void afterChange()
        }}
        onRefunded={(amount, cash) => {
          toast.success(`Refunded ${money(amount)}`, {
            description:
              cash > 0
                ? `Pay ${money(cash)} from the drawer${cash < amount ? `; ${money(amount - cash)} goes back to the card` : ''}.`
                : 'It goes back to the card.'
          })
          void afterChange()
        }}
      />
    </div>
  )
}
