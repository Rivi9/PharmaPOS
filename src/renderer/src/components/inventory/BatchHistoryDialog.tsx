import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { useAuthStore } from '@renderer/stores/authStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { formatCurrency } from '@renderer/lib/calculations'
import type { StockBatch } from '@renderer/stores/inventoryStore'

interface Ledger {
  batch: {
    id: string
    batch_number: string | null
    product_name: string
    expiry_date: string | null
    received_date: string
    cost_price: number
    selling_price: number | null
    quantity_remaining: number
  } | null
  sold: Array<{
    sale_id: string
    receipt_number: string
    created_at: string
    quantity: number
    cost_price: number
    selling_price: number
    status: string
  }>
  totals: { quantitySold: number; revenue: number; cost: number; margin: number }
}

interface BatchHistoryDialogProps {
  batch: StockBatch | null
  onClose: () => void
}

/**
 * A stored date for display. A bare `YYYY-MM-DD` is read on the local calendar:
 * `new Date('2027-03-01')` is UTC midnight, which prints the previous day west
 * of UTC. Full timestamps (sales) are real instants and parse normally.
 */
function displayDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  const date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
  return date.toLocaleDateString()
}

/**
 * R2: the life of one batch — what it cost, what it sold for, and to which
 * sales. The last part is what makes a manufacturer recall traceable.
 */
export function BatchHistoryDialog({ batch, onClose }: BatchHistoryDialogProps): React.JSX.Element {
  // The parent remounts this per batch (via `key`), so initial state is already
  // correct and the effect never has to reset anything synchronously.
  const [ledger, setLedger] = useState<Ledger | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const userId = useAuthStore((s) => s.user?.id)
  const currency = useSettingsStore((s) => s.settings.currency_symbol)

  useEffect(() => {
    if (!batch || !userId) return
    let cancelled = false
    window.electron
      .batchLedger(userId, batch.id)
      .then((res: { success?: boolean; data?: Ledger; error?: string }) => {
        if (cancelled) return
        if (res?.success === false) setError(res.error || 'Could not load batch history')
        else setLedger((res?.data ?? res) as Ledger)
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Could not load batch history')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [batch, userId])

  const b = ledger?.batch

  return (
    <Dialog open={batch !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b p-6 pr-16">
          <DialogTitle className="text-xl font-semibold">Batch history</DialogTitle>
          <DialogDescription className="text-base">
            {b ? `${b.product_name}${b.batch_number ? ` · ${b.batch_number}` : ''}` : 'Loading…'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-6">
          {loading && (
            <div className="flex items-center gap-3 py-8 text-muted-foreground">
              <Spinner className="size-5" />
              <span className="text-base">Loading…</span>
            </div>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription className="text-base font-medium">{error}</AlertDescription>
            </Alert>
          )}

          {b && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Received', displayDate(b.received_date)],
                  ['Expires', b.expiry_date ? displayDate(b.expiry_date) : '—'],
                  ['Cost each', formatCurrency(b.cost_price, currency)],
                  [
                    'Price each',
                    b.selling_price != null
                      ? formatCurrency(b.selling_price, currency)
                      : 'product price'
                  ]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border bg-card p-3">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-base font-semibold">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Remaining', String(b.quantity_remaining)],
                  ['Sold', String(ledger.totals.quantitySold)],
                  ['Revenue', formatCurrency(ledger.totals.revenue, currency)],
                  ['Realised margin', formatCurrency(ledger.totals.margin, currency)]
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border bg-muted/40 p-3">
                    <p className="text-sm text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold tabular-nums">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="mb-2 text-base font-medium">
                  Sales from this batch ({ledger.sold.length})
                </p>
                {ledger.sold.length === 0 ? (
                  <p className="rounded-xl border border-dashed p-6 text-center text-base text-muted-foreground">
                    Nothing has been sold from it yet.
                  </p>
                ) : (
                  <div className="max-h-72 overflow-auto overscroll-contain rounded-xl border [&>[data-slot=table-container]]:overflow-visible">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="px-4">Receipt</TableHead>
                          <TableHead className="px-4">Date</TableHead>
                          <TableHead className="px-4 text-right">Qty</TableHead>
                          <TableHead className="px-4 text-right">Price</TableHead>
                          <TableHead className="px-4">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {ledger.sold.map((row, i) => (
                          <TableRow key={`${row.sale_id}-${i}`}>
                            <TableCell className="px-4 font-mono text-sm">
                              {row.receipt_number}
                            </TableCell>
                            <TableCell className="px-4">
                              {new Date(row.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="px-4 text-right tabular-nums">
                              {row.quantity}
                            </TableCell>
                            <TableCell className="px-4 text-right tabular-nums">
                              {formatCurrency(row.selling_price, currency)}
                            </TableCell>
                            <TableCell className="px-4">
                              {row.status === 'completed' ? (
                                <span className="text-muted-foreground">sold</span>
                              ) : (
                                <Badge
                                  variant="outline"
                                  className="border-warning/30 bg-warning-muted text-warning"
                                >
                                  {row.status}
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <p className="mt-2 text-sm text-muted-foreground">
                  Voided and refunded sales are listed but excluded from the totals, so the recall
                  trail stays complete.
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="border-t p-4">
          <Button size="lg" className="w-full sm:w-auto sm:min-w-44" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
