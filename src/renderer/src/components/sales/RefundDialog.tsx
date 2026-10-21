import { useEffect, useMemo, useState } from 'react'
import { Banknote, CreditCard, RotateCcw, TriangleAlert } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { Switch } from '@renderer/components/ui/switch'
import { Label } from '@renderer/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { Field, FieldError, FieldLabel } from '@renderer/components/ui/field'
import { Spinner } from '@renderer/components/ui/spinner'
import { QuantityStepper } from '@renderer/components/common/number-input'
import { formatCurrency } from '@renderer/lib/calculations'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import type { RefundPreview, SaleDetail } from '../../../../shared/sales-history'

interface RefundDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  detail: SaleDetail
  onRefunded: (amount: number, cash: number) => void
}

/**
 * Refund some or all of what is left on a sale.
 *
 * The amount is never worked out here. Every change of quantity asks the main
 * process for a quote from `quoteRefund` — the function `createRefund` prices
 * with — so the figure on the button is the figure booked, discount share and
 * all, and the cash / card split is the one the drawer will be reconciled on.
 */
export function RefundDialog({
  open,
  onOpenChange,
  detail,
  onRefunded
}: RefundDialogProps): React.JSX.Element {
  const currency = useSettingsStore((s) => s.settings.currency_symbol) || 'Rs.'
  const money = (n: number): string => formatCurrency(n, currency)

  const lines = useMemo(() => detail.items.filter((i) => i.refundable_quantity > 0), [detail])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(true)
  const [preview, setPreview] = useState<RefundPreview | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuantities({})
    setReason('')
    setRestock(true)
    setSubmitError('')
  }, [open])

  const chosen = useMemo(
    () =>
      lines
        .filter((l) => (quantities[l.id] ?? 0) > 0)
        .map((l) => ({
          product_id: l.product_id,
          product_name: l.product_name,
          quantity: quantities[l.id]
        })),
    [lines, quantities]
  )

  // Quote on open (for the shift check) and on every change of quantity.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    window.electron.sales
      .refundPreview({ saleId: detail.sale.id, items: chosen })
      .then((p) => {
        if (cancelled) return
        setPreview(p)
        setPreviewError('')
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setPreviewError(ipcErrorMessage(err, 'The refund could not be priced'))
      })
    return () => {
      cancelled = true
    }
  }, [open, detail.sale.id, chosen])

  const amount = chosen.length > 0 && preview ? preview.amount : 0
  const shiftOpen = preview?.shift_open !== false
  const canSubmit = chosen.length > 0 && !!preview && !previewError && shiftOpen && !saving

  const submit = async (): Promise<void> => {
    if (!canSubmit || !preview) return
    setSaving(true)
    setSubmitError('')
    try {
      await window.electron.refund({
        // Vestigial: the handler refunds as the signed-in user.
        userId: '',
        saleId: detail.sale.id,
        items: chosen.map((c) => {
          const quoted = preview.lines.find((l) => l.product_id === c.product_id)
          const line = lines.find((l) => l.product_id === c.product_id)!
          return {
            product_id: c.product_id,
            product_name: c.product_name,
            quantity: c.quantity,
            unit_price: line.unit_price,
            // Recorded with the refund for reference only; the server prices it.
            line_total: quoted?.gross ?? 0
          }
        }),
        reason: reason.trim() || undefined,
        restock
      })
    } catch (err) {
      setSubmitError(ipcErrorMessage(err, 'The refund could not be processed'))
      return
    } finally {
      setSaving(false)
    }
    onOpenChange(false)
    onRefunded(preview.amount, preview.cash)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle className="text-xl">Refund {detail.sale.receipt_number}</DialogTitle>
          <DialogDescription className="text-base">
            Choose what is coming back. Prices are what the customer paid, after any discount.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 py-5">
          {!shiftOpen && (
            <Alert variant="destructive" className="bg-destructive/10">
              <TriangleAlert />
              <AlertTitle className="text-base">No open shift</AlertTitle>
              <AlertDescription>
                A refund is paid from your drawer, so it needs your shift to be open. Start a shift
                and try again.
              </AlertDescription>
            </Alert>
          )}

          <ul className="flex flex-col divide-y rounded-xl border">
            {lines.map((l) => {
              const qty = quantities[l.id] ?? 0
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">{l.product_name}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      {money(l.paid / l.quantity)} each · {l.refundable_quantity} of {l.quantity}{' '}
                      refundable
                    </p>
                  </div>
                  <QuantityStepper
                    value={qty}
                    min={0}
                    max={l.refundable_quantity}
                    onChange={(n) => setQuantities((q) => ({ ...q, [l.id]: n }))}
                    aria-label={`Refund quantity for ${l.product_name}`}
                  />
                </li>
              )
            })}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setQuantities(Object.fromEntries(lines.map((l) => [l.id, l.refundable_quantity])))
              }
            >
              Refund everything left
            </Button>
            <div className="flex items-center gap-3">
              <Switch id="refund-restock" checked={restock} onCheckedChange={setRestock} />
              <Label htmlFor="refund-restock" className="text-base">
                Put the items back in stock
              </Label>
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor="refund-reason">Reason</FieldLabel>
            <Textarea
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer returned unopened"
              rows={2}
              className="min-h-12 md:text-base"
            />
          </Field>

          <dl className="grid grid-cols-3 gap-3" aria-label="Refund amount">
            <div className="rounded-xl bg-muted px-4 py-3">
              <dt className="text-sm text-muted-foreground">Refund</dt>
              <dd className="text-xl font-semibold tabular-nums" data-testid="refund-amount">
                {money(amount)}
              </dd>
            </div>
            <div className="rounded-xl bg-muted px-4 py-3">
              <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Banknote className="size-4" />
                Cash from drawer
              </dt>
              <dd className="text-xl font-semibold tabular-nums">
                {money(chosen.length > 0 && preview ? preview.cash : 0)}
              </dd>
            </div>
            <div className="rounded-xl bg-muted px-4 py-3">
              <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CreditCard className="size-4" />
                Back to card
              </dt>
              <dd className="text-xl font-semibold tabular-nums">
                {money(chosen.length > 0 && preview ? preview.card : 0)}
              </dd>
            </div>
          </dl>
          {chosen.length > 0 && preview && preview.tax > 0 && (
            <p className="-mt-3 text-sm text-muted-foreground tabular-nums">
              Includes VAT of {money(preview.tax)}
            </p>
          )}

          {(previewError || submitError) && (
            <FieldError className="font-medium">{submitError || previewError}</FieldError>
          )}
        </div>

        <DialogFooter className="shrink-0 gap-3 border-t px-6 py-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="lg" className="flex-1" disabled={!canSubmit} onClick={submit}>
            {saving ? <Spinner className="size-5" /> : <RotateCcw />}
            {chosen.length > 0 ? `Refund ${money(amount)}` : 'Refund'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
