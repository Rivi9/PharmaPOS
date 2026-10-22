import { useState } from 'react'
import { Ban, Phone, Printer, RotateCcw, User, UserRound } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from '@renderer/components/ui/sheet'
import { Button } from '@renderer/components/ui/button'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { ReceiptPreview } from '@renderer/components/pos/ReceiptPreview'
import { usePermission } from '@renderer/hooks/usePermission'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { formatCurrency } from '@renderer/lib/calculations'
import { cn } from '@renderer/lib/utils'
import type { SaleDetail } from '../../../../shared/sales-history'
import { PAYMENT_LABELS, formatDateTime } from './sale-format'
import { SaleStatusBadge } from './SaleStatusBadge'
import { VoidSaleDialog } from './VoidSaleDialog'
import { RefundDialog } from './RefundDialog'

interface SaleDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** null while loading. */
  detail: SaleDetail | null
  onVoided: () => void
  onRefunded: (amount: number, cash: number) => void
}

/**
 * One sale in full: what was sold and at what, how it was paid, what has been
 * refunded, and the actions the signed-in role may take on it. Void and Refund
 * are offered only to roles holding `sales:void` / `sales:refund`, and only
 * when the main process says the sale allows it (`void_blocked` /
 * `refund_blocked` come from the same rules voidSale and createRefund enforce).
 */
export function SaleDetailSheet({
  open,
  onOpenChange,
  detail,
  onVoided,
  onRefunded
}: SaleDetailSheetProps): React.JSX.Element {
  const currency = useSettingsStore((s) => s.settings.currency_symbol) || 'Rs.'
  const money = (n: number): string => formatCurrency(n, currency)
  const canVoid = usePermission('sales:void')
  const canRefund = usePermission('sales:refund')
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [refundOpen, setRefundOpen] = useState(false)

  const sale = detail?.sale
  const voided = sale?.status === 'voided'
  // Why an offered action is greyed out, so a disabled button is never a mystery.
  const actionHint = voided
    ? ''
    : [canVoid && detail?.void_blocked, canRefund && detail?.refund_blocked]
        .filter(Boolean)
        .join(' · ')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <div className="flex flex-wrap items-center gap-3 pr-10">
            <SheetTitle className="text-2xl font-semibold">
              {sale?.receipt_number ?? 'Sale'}
            </SheetTitle>
            {sale && <SaleStatusBadge status={sale.status} />}
          </div>
          <SheetDescription className="text-base">
            {sale
              ? `${formatDateTime(sale.created_at)} · served by ${sale.cashier_name ?? 'unknown'}`
              : 'Loading…'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-6 py-5">
          {!detail || !sale ? (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              {(sale.customer_name || sale.customer_phone) && (
                <section className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground">
                    <UserRound className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{sale.customer_name ?? 'Customer'}</p>
                    {sale.customer_phone && (
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Phone className="size-4" />
                        {sale.customer_phone}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {voided && (
                <section className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-base">
                  <p className="font-medium text-destructive">Voided</p>
                  <p className="text-muted-foreground">
                    {sale.voided_at && formatDateTime(sale.voided_at)}
                    {sale.voided_by_name && ` by ${sale.voided_by_name}`}
                    {sale.void_reason && ` — ${sale.void_reason}`}
                  </p>
                </section>
              )}

              {/* Items */}
              <section className="overflow-hidden rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="pl-4 text-muted-foreground">Item</TableHead>
                      <TableHead className="text-right text-muted-foreground">Qty</TableHead>
                      <TableHead className="text-right text-muted-foreground">Price</TableHead>
                      <TableHead className="text-right text-muted-foreground">Disc.</TableHead>
                      <TableHead className="pr-4 text-right text-muted-foreground">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.items.map((item) => (
                      <TableRow key={item.id} className="hover:bg-transparent">
                        <TableCell className="max-w-56 pl-4">
                          <p className="truncate font-medium">{item.product_name}</p>
                          {item.refunded_quantity > 0 && (
                            <p className="text-sm text-warning">
                              {item.refunded_quantity} refunded
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {money(item.unit_price)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {item.discount_amount > 0 ? `−${money(item.discount_amount)}` : '—'}
                        </TableCell>
                        <TableCell className="pr-4 text-right font-medium tabular-nums">
                          {money(item.paid)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Totals */}
                <dl className="flex flex-col gap-2 rounded-xl border p-4 text-base">
                  <Row label="Subtotal" value={money(sale.subtotal)} />
                  {sale.discount_amount > 0 && (
                    <Row label="Discount" value={`−${money(sale.discount_amount)}`} />
                  )}
                  <Row
                    label={`VAT${sale.vat_rate > 0 ? ` (${sale.vat_rate}%)` : ''} included`}
                    value={money(sale.tax_amount)}
                    muted
                  />
                  <Row label="Total" value={money(sale.total)} strong />
                  {sale.refunded > 0 && (
                    <>
                      <Row label="Refunded" value={`−${money(sale.refunded)}`} />
                      <Row label="Kept" value={money(sale.net_total)} strong />
                    </>
                  )}
                </dl>

                {/* Payment */}
                <dl className="flex flex-col gap-2 rounded-xl border p-4 text-base">
                  <Row
                    label="Paid by"
                    value={PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}
                    strong
                  />
                  {sale.cash_received > 0 && (
                    <Row label="Cash received" value={money(sale.cash_received)} />
                  )}
                  {sale.card_received > 0 && <Row label="Card" value={money(sale.card_received)} />}
                  {sale.change_given > 0 && <Row label="Change" value={money(sale.change_given)} />}
                </dl>
              </div>

              {/* Refund history */}
              {detail.refunds.length > 0 && (
                <section className="flex flex-col gap-3">
                  <h3 className="text-lg font-semibold">Refunds</h3>
                  <ul className="flex flex-col divide-y rounded-xl border">
                    {detail.refunds.map((r) => (
                      <li key={r.id} className="flex flex-col gap-1 px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <User className="size-4" />
                            {formatDateTime(r.created_at)}
                            {r.user_name && ` · ${r.user_name}`}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {money(r.total_refunded)}
                          </span>
                        </div>
                        <p className="text-base">
                          {r.items.map((i) => `${i.product_name} × ${i.quantity}`).join(', ')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {r.cash_refunded > 0 ? `${money(r.cash_refunded)} cash` : 'Back to card'}
                          {r.cash_refunded > 0 &&
                            r.cash_refunded < r.total_refunded &&
                            `, ${money(r.total_refunded - r.cash_refunded)} to card`}
                          {r.restocked ? ' · back in stock' : ' · not restocked'}
                          {r.reason && ` · ${r.reason}`}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        {detail && sale && (
          <SheetFooter className="shrink-0 gap-3 border-t px-6 py-4">
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setReceiptOpen(true)}
                // A copy of a voided sale's receipt would be a receipt for money
                // the shop no longer holds.
                disabled={voided}
              >
                <Printer />
                Reprint
              </Button>
              {canRefund && (
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={() => setRefundOpen(true)}
                  disabled={!!detail.refund_blocked}
                >
                  <RotateCcw />
                  Refund
                </Button>
              )}
              {canVoid && (
                <Button
                  variant="destructive"
                  size="lg"
                  className="flex-1"
                  onClick={() => setVoidOpen(true)}
                  disabled={!!detail.void_blocked}
                >
                  <Ban />
                  Void
                </Button>
              )}
            </div>
            {actionHint && (
              <p className="text-sm text-muted-foreground" data-testid="sale-action-hint">
                {actionHint}
              </p>
            )}
          </SheetFooter>
        )}

        {detail && sale && (
          <>
            <ReceiptPreview
              open={receiptOpen}
              onClose={() => setReceiptOpen(false)}
              saleId={sale.id}
              receiptNumber={sale.receipt_number}
              reprint
            />
            <VoidSaleDialog
              open={voidOpen}
              onOpenChange={setVoidOpen}
              saleId={sale.id}
              receiptNumber={sale.receipt_number}
              totalLabel={money(sale.total)}
              onVoided={onVoided}
            />
            {canRefund && !detail.refund_blocked && (
              <RefundDialog
                open={refundOpen}
                onOpenChange={setRefundOpen}
                detail={detail}
                onRefunded={onRefunded}
              />
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Row({
  label,
  value,
  strong,
  muted
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={cn('text-muted-foreground', strong && 'font-medium text-foreground')}>
        {label}
      </dt>
      <dd
        className={cn(
          'tabular-nums',
          strong && 'text-lg font-semibold',
          muted && 'text-muted-foreground'
        )}
      >
        {value}
      </dd>
    </div>
  )
}
