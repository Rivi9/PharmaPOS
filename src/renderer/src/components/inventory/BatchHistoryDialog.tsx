import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
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
 * R2: the life of one batch — what it cost, what it sold for, and to which
 * sales. The last part is what makes a manufacturer recall traceable.
 */
export function BatchHistoryDialog({
  batch,
  onClose
}: BatchHistoryDialogProps): React.JSX.Element {
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Batch history</DialogTitle>
          <DialogDescription>
            {b ? `${b.product_name}${b.batch_number ? ` · ${b.batch_number}` : ''}` : 'Loading…'}
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive font-medium">{error}</p>}

        {b && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Received', new Date(b.received_date).toLocaleDateString()],
                ['Expires', b.expiry_date ? new Date(b.expiry_date).toLocaleDateString() : '—'],
                ['Cost each', formatCurrency(b.cost_price, currency)],
                [
                  'Price each',
                  b.selling_price != null ? formatCurrency(b.selling_price, currency) : 'product price'
                ]
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold">{value}</p>
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
                <div key={label} className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-sm font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div>
              <p className="text-sm font-medium mb-2">
                Sales from this batch ({ledger.sold.length})
              </p>
              {ledger.sold.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing has been sold from it yet.</p>
              ) : (
                <div className="border rounded-lg overflow-auto max-h-64 overscroll-contain">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Receipt</th>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-right font-medium">Qty</th>
                        <th className="px-3 py-2 text-right font-medium">Price</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.sold.map((row, i) => (
                        <tr key={`${row.sale_id}-${i}`} className="border-t">
                          <td className="px-3 py-2 font-mono text-xs">{row.receipt_number}</td>
                          <td className="px-3 py-2">
                            {new Date(row.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.quantity}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatCurrency(row.selling_price, currency)}
                          </td>
                          <td className="px-3 py-2">
                            {row.status === 'completed' ? (
                              <span className="text-muted-foreground">sold</span>
                            ) : (
                              <span className="text-amber-600">{row.status}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Voided and refunded sales are listed but excluded from the totals, so the recall
                trail stays complete.
              </p>
            </div>
          </div>
        )}

        <Button className="w-full h-12" onClick={onClose}>
          Close
        </Button>
      </DialogContent>
    </Dialog>
  )
}
