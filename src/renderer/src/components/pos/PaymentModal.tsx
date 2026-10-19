import { useState, useEffect, useRef } from 'react'
import { CreditCard, Banknote, CircleAlert, CircleCheck, UserCheck } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle
} from '@renderer/components/ui/item'
import { Spinner } from '@renderer/components/ui/spinner'
import { CashNumpad } from '@renderer/components/ui/cash-numpad'
import { NumberInput } from '@renderer/components/common/number-input'
import { cn } from '@renderer/lib/utils'
import { usePOSStore } from '@renderer/stores/posStore'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { calculateChange, formatCurrency } from '@renderer/lib/calculations'
import { isAtLeast } from '../../../../shared/money'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onComplete: (saleId: string, receiptNumber: string) => void
}

type PaymentMethod = 'cash' | 'card' | 'mixed'

interface PurchaseHistoryEntry {
  id: string
  receiptNumber: string
  total: number
  paymentMethod: string
  createdAt: string
  items: { productName: string; quantity: number; lineTotal: number }[]
}

/**
 * Quick-tender amounts for this total: the next round 100, 500, 1,000 and 5,000
 * above it, plus the 5,000 after that, deduplicated, first three. These used to
 * be fixed denominations (100 … 5,000), so a Rs. 1,520 sale offered "100" and
 * "500" — buttons that could only ever produce an "Insufficient cash" error.
 */
function quickTenderAmounts(total: number): number[] {
  if (!(total > 0)) return []
  const roundUp = (step: number): number => Math.ceil(total / step) * step
  const candidates = [
    roundUp(100),
    roundUp(500),
    roundUp(1000),
    roundUp(5000),
    roundUp(5000) + 5000
  ]
  return [...new Set(candidates)].filter((a) => a > total + 0.005).slice(0, 3)
}

export function PaymentModal({ open, onClose, onComplete }: PaymentModalProps): React.JSX.Element {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [cardAmount, setCardAmount] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [foundCustomer, setFoundCustomer] = useState<{ id: string; name: string } | null>(null)
  const [purchaseHistory, setPurchaseHistory] = useState<PurchaseHistoryEntry[]>([])
  const inFlight = useRef(false)

  const items = usePOSStore((state) => state.items)
  const saleDiscount = usePOSStore((state) => state.saleDiscount)
  const subtotal = usePOSStore((state) => state.subtotal())
  const discountAmount = usePOSStore((state) => state.discountAmount())
  const taxAmount = usePOSStore((state) => state.taxAmount())
  const total = usePOSStore((state) => state.total())
  const clearCart = usePOSStore((state) => state.clearCart)
  const currentShift = useShiftStore((state) => state.currentShift)
  const addToTodaySales = useShiftStore((state) => state.addToTodaySales)
  const refreshTodaySales = useShiftStore((state) => state.refreshTodaySales)
  const currencySymbol = useSettingsStore((state) => state.settings.currency_symbol)
  const cardEnabled = useSettingsStore((state) => state.settings.card_payment_enabled !== '0')

  // Clear stale errors each time the dialog opens
  useEffect(() => {
    if (open) setError('')
  }, [open])

  // If card payment is turned off while a card sale is part-entered, fall back to cash
  // so the dialog can never submit a method the pharmacy does not accept.
  useEffect(() => {
    if (!cardEnabled && paymentMethod !== 'cash') {
      setPaymentMethod('cash')
      setCardAmount('')
    }
  }, [cardEnabled, paymentMethod])

  useEffect(() => {
    if (customerPhone.length < 7) {
      setFoundCustomer(null)
      setPurchaseHistory([])
      return
    }

    const timer = setTimeout(async () => {
      try {
        const customer = await window.electron.customers.getByPhone(customerPhone)
        if (customer) {
          setFoundCustomer({ id: customer.id, name: customer.name })
          setCustomerName(customer.name)
          const history = await window.electron.customers.purchaseHistory(customer.id)
          setPurchaseHistory(history ?? [])
        } else {
          setFoundCustomer(null)
          setPurchaseHistory([])
        }
      } catch {
        setFoundCustomer(null)
        setPurchaseHistory([])
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [customerPhone])

  const cashReceivedNum = parseFloat(cashReceived) || 0
  const cardAmountNum = parseFloat(cardAmount) || 0
  const change = paymentMethod === 'cash' ? calculateChange(cashReceivedNum, total) : 0

  const handlePaymentMethodChange = (method: PaymentMethod): void => {
    setPaymentMethod(method)
    setError('')
    setCashReceived('')
    if (method === 'card') {
      setCardAmount(total.toFixed(2))
    } else {
      setCardAmount('')
    }
  }

  const updateCash = (value: string): void => {
    setCashReceived(value)
    setError('')
    if (paymentMethod === 'mixed') {
      const cash = parseFloat(value) || 0
      const remaining = Math.max(0, total - cash)
      setCardAmount(remaining.toFixed(2))
    }
  }

  const validatePayment = (): boolean => {
    if (paymentMethod === 'cash') {
      // Half-cent tolerance so an exact tender is never rejected by float drift —
      // this used to fail with "Insufficient cash. Need Rs. 0.00 more."
      if (!isAtLeast(cashReceivedNum, total)) {
        setError(
          `Insufficient cash. Need ${formatCurrency(total - cashReceivedNum, currencySymbol)} more.`
        )
        return false
      }
    } else if (paymentMethod === 'mixed') {
      const totalPaid = cashReceivedNum + cardAmountNum
      if (Math.abs(totalPaid - total) > 0.01) {
        setError(
          `Payment mismatch. Total: ${formatCurrency(total, currencySymbol)}, Paid: ${formatCurrency(totalPaid, currencySymbol)}`
        )
        return false
      }
    }
    return true
  }

  const handleComplete = async (): Promise<void> => {
    // In-flight latch. `processing` only disables the button, and the numpad's
    // global Enter handler bypasses the button entirely — so key-repeat or a
    // double tap re-entered here during the stock-recheck await and committed
    // the sale twice: two receipts, stock deducted twice, drawer double-counted.
    if (inFlight.current) return
    if (!validatePayment()) return
    if (!currentShift) {
      setError('No active shift found')
      return
    }

    inFlight.current = true
    setProcessing(true)
    setError('')

    try {
      // H7: Pre-payment stock recheck — verify every cart item still has enough
      // stock before committing the sale. Catches concurrent inventory adjustments.
      // M15: this used to search by NAME against a LIMIT 20 result set and look
      // for the id in it, so a product whose name sorts late among its matches —
      // "Zinc", behind a dozen "… + Zinc" combinations — simply was not in the
      // page, `fresh` was undefined, and a perfectly stocked item was reported
      // out of stock, blocking the sale with no way for the cashier to proceed.
      // Look it up by id.
      const outOfStockNames: string[] = []
      for (const item of items) {
        const stock = await window.electron.checkStockAvailability(item.product.id)
        if ((stock?.available ?? 0) < item.quantity) {
          outOfStockNames.push(item.product.name)
        }
      }
      if (outOfStockNames.length > 0) {
        setError(`Insufficient stock: ${outOfStockNames.join(', ')}. Please adjust quantities.`)
        setProcessing(false)
        return
      }

      // shift_id and user_id are deliberately not sent: the main process resolves
      // both from the authenticated session, so a sale cannot be booked against
      // someone else or against a shift that has already been counted and closed.
      const saleData = {
        items: items.map((item) => ({
          product_id: item.product.id,
          product_name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total
        })),
        subtotal,
        discount_amount: discountAmount,
        discount_type: saleDiscount?.type || null,
        discount_value: saleDiscount?.value || 0,
        tax_amount: taxAmount,
        total,
        payment_method: paymentMethod,
        cash_received:
          paymentMethod === 'cash'
            ? cashReceivedNum
            : paymentMethod === 'mixed'
              ? cashReceivedNum
              : 0,
        card_received:
          paymentMethod === 'card' ? total : paymentMethod === 'mixed' ? cardAmountNum : 0,
        change_given: change,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined
      }

      const result = await window.electron.createSale(saleData)

      // C2: Only proceed if the sale was actually committed
      if (!result?.sale_id) {
        setError(result?.error || 'Failed to complete sale. Please try again.')
        return
      }

      addToTodaySales(total)
      // Then reconcile against the database, so the header cannot drift from what
      // the shift actually took (L4).
      void refreshTodaySales(currentShift.id)

      // Drawer is kicked independently of printing. It used to ride inside the
      // receipt byte stream, so a cashier who pressed Close instead of Print — or
      // hit any printer fault — got a committed cash sale with a locked till.
      if (paymentMethod !== 'card') {
        window.electron.printer.openDrawer().catch(() => {
          /* no drawer attached, or printer offline — the sale is already committed */
        })
      }

      window.electron.display
        .saleComplete({
          total,
          cash_received:
            paymentMethod === 'cash' || paymentMethod === 'mixed' ? cashReceivedNum : 0,
          change_given: change,
          currency: currencySymbol
        })
        .catch(() => {})

      clearCart()
      setCashReceived('')
      setCardAmount('')
      setCustomerName('')
      setCustomerPhone('')
      setFoundCustomer(null)
      setPurchaseHistory([])

      onComplete(result.sale_id, result.receipt_number)
    } catch (err) {
      setError((err as Error)?.message || 'Failed to complete sale')
    } finally {
      setProcessing(false)
      // Release the latch on EVERY exit, not just the happy path. It was only
      // ever set, so an out-of-stock refusal or any thrown error left it true and
      // the Complete Sale button dead for the rest of the modal's life — the till
      // looked frozen with a full basket on screen.
      inFlight.current = false
    }
  }

  const showCashEntry = paymentMethod === 'cash' || paymentMethod === 'mixed'
  const quickAmounts = quickTenderAmounts(total)
  // Same half-cent tolerance as validatePayment, so the panel never shows
  // "Short Rs. 0.00" for a tender that Complete Sale would accept.
  const cashCovers = isAtLeast(cashReceivedNum, total)
  const itemCount = items.reduce((n, item) => n + item.quantity, 0)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* A mis-tap on the overlay used to discard a keyed-in payment silently —
          payment is dismissed only via the explicit Cancel button. */}
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 flex-row items-end justify-between gap-4 border-b px-6 pt-5 pb-4 pr-16">
          <div className="space-y-1">
            <DialogTitle className="text-2xl font-semibold">Complete Sale</DialogTitle>
            <DialogDescription className="text-base">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
              {discountAmount > 0 && ` · ${formatCurrency(discountAmount, currencySymbol)} off`}
            </DialogDescription>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-muted-foreground">Total due</p>
            <p className="text-4xl font-bold tracking-tight tabular-nums text-primary">
              {formatCurrency(total, currencySymbol)}
            </p>
          </div>
        </DialogHeader>

        <div
          className={cn(
            'grid min-h-0 flex-1 gap-6 overflow-y-auto overscroll-contain p-6',
            'md:grid-cols-[minmax(0,1fr)_20rem]'
          )}
        >
          {/* Left: method, tender, change, customer */}
          <div className="min-w-0 space-y-5">
            {/* Payment Method — large touch buttons. Kept first in the DOM: Radix
                focuses the first tabbable element, and it must be a button, not the
                cash field (see the scanner guard in CashNumpad). */}
            <div
              role="group"
              aria-label="Payment method"
              className={cn('grid gap-3', cardEnabled ? 'grid-cols-2' : 'grid-cols-1')}
            >
              <Button
                variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                aria-pressed={paymentMethod === 'cash'}
                onClick={() => handlePaymentMethodChange('cash')}
                className="h-16 text-lg"
              >
                <Banknote className="size-6" />
                Cash
              </Button>
              {cardEnabled && (
                <Button
                  variant={paymentMethod === 'card' ? 'default' : 'outline'}
                  aria-pressed={paymentMethod === 'card'}
                  onClick={() => handlePaymentMethodChange('card')}
                  className="h-16 text-lg"
                >
                  <CreditCard className="size-6" />
                  Card
                </Button>
              )}
              {/* <Button
                variant={paymentMethod === 'mixed' ? 'default' : 'outline'}
                onClick={() => handlePaymentMethodChange('mixed')}
                className="h-16 grow flex flex-col items-center gap-1"
              >
                <Split className="h-6 w-6" />
                <span>Mixed</span>
              </Button> */}
            </div>

            {/* Cash entry section */}
            {showCashEntry && (
              <div className="space-y-3">
                <Field>
                  <FieldLabel htmlFor="cash-received" className="text-base">
                    Cash Received
                  </FieldLabel>
                  <NumberInput
                    id="cash-received"
                    decimal
                    value={cashReceived}
                    onValueChange={updateCash}
                    placeholder="0.00"
                    className="h-16 pr-4 text-right text-3xl font-bold"
                  />
                </Field>

                {/* Quick tender: exact, then the next round amounts above the total */}
                <div className="grid grid-cols-4 gap-2">
                  <Button
                    variant="secondary"
                    size="lg"
                    className="text-base font-semibold"
                    onClick={() => updateCash(total.toFixed(2))}
                  >
                    Exact
                  </Button>
                  {quickAmounts.map((amount) => (
                    <Button
                      key={amount}
                      variant="outline"
                      size="lg"
                      className="px-2 text-base font-semibold tabular-nums"
                      onClick={() => updateCash(String(amount))}
                    >
                      {amount.toLocaleString('en-US')}
                    </Button>
                  ))}
                </div>

                {/* Change display — always present so the layout never jumps */}
                {paymentMethod === 'cash' && (
                  <div
                    aria-live="polite"
                    className={cn(
                      'flex items-center justify-between gap-4 rounded-xl px-5 py-4',
                      cashReceivedNum <= 0
                        ? 'bg-muted/50 text-muted-foreground'
                        : cashCovers
                          ? 'bg-success-muted text-success'
                          : 'bg-destructive/10 text-destructive'
                    )}
                  >
                    <span className="text-lg font-semibold">
                      {cashReceivedNum > 0 && !cashCovers ? 'Short' : 'Change due'}
                    </span>
                    <span className="truncate text-5xl font-bold tracking-tight tabular-nums">
                      {cashReceivedNum > 0 && !cashCovers
                        ? formatCurrency(total - cashReceivedNum, currencySymbol)
                        : formatCurrency(change, currencySymbol)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Mixed payment — card amount (auto-calculated) */}
            {paymentMethod === 'mixed' && (
              <Field>
                <FieldLabel htmlFor="card-amount" className="text-base">
                  Card Amount (auto)
                </FieldLabel>
                <NumberInput
                  id="card-amount"
                  decimal
                  value={cardAmount}
                  onValueChange={setCardAmount}
                  className="text-lg"
                  placeholder="0.00"
                />
              </Field>
            )}

            {/* Customer Info */}
            <div className="space-y-3 border-t pt-4">
              <p className="text-base font-medium text-muted-foreground">Customer (Optional)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="customer-phone">Phone</FieldLabel>
                  <Input
                    id="customer-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="off"
                    placeholder="Phone number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-name">Name</FieldLabel>
                  <Input
                    id="customer-name"
                    autoComplete="off"
                    placeholder="Customer name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                  />
                </Field>
              </div>

              {foundCustomer && (
                <Item variant="muted" size="sm" className="bg-success-muted">
                  <ItemMedia variant="icon" className="text-success">
                    <UserCheck className="size-5" />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle className="text-base">{foundCustomer.name}</ItemTitle>
                    <ItemDescription>
                      Returning customer
                      {purchaseHistory.length > 0 &&
                        ` · ${purchaseHistory.length} recent ${purchaseHistory.length === 1 ? 'purchase' : 'purchases'}`}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              )}

              {purchaseHistory.length > 0 && (
                <div className="max-h-48 overflow-y-auto overscroll-contain rounded-xl border">
                  <p className="sticky top-0 border-b bg-card px-3 py-2 text-sm font-semibold text-muted-foreground">
                    Purchase History
                  </p>
                  <div className="divide-y">
                    {purchaseHistory.map((sale) => (
                      <div key={sale.id} className="px-3 py-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {new Date(sale.createdAt).toLocaleDateString()}
                          </span>
                          <span className="font-medium tabular-nums">
                            {formatCurrency(sale.total, currencySymbol)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-sm text-muted-foreground">
                          {sale.items.map((item, i) => (
                            <span key={i}>
                              {item.productName} &times; {item.quantity}
                              {i < sale.items.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: numpad for cash, terminal prompt for card. The numpad only
              mounts for cash entry — its global Enter handler is what submits, so
              a card sale is never committed by a stray keypress. */}
          {showCashEntry ? (
            <CashNumpad
              value={cashReceived}
              onChange={updateCash}
              onSubmit={handleComplete}
              className="content-start"
            />
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-muted/40 p-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <CreditCard className="size-7" />
              </div>
              <p className="text-lg font-semibold">
                Charge {formatCurrency(total, currencySymbol)} on the card terminal
              </p>
              <p className="text-base text-muted-foreground">
                Tap Complete Sale once the terminal shows the payment approved.
              </p>
            </div>
          )}
        </div>

        {/* Action row — outside the scroll region. "Complete Sale" used to start
            ~215px below the fold on every sale, and the only thing under the
            finger in the scroll region was the numpad: a drag inside Chromium's
            ~8px touch slop registers as a click, injecting a stray digit into the
            amount being confirmed. The error lives here too, so a refusal is
            always on screen next to the button that caused it. */}
        <div className="shrink-0 space-y-3 border-t bg-background p-4">
          {error && (
            <Alert variant="destructive" className="bg-destructive/10">
              <CircleAlert />
              <AlertDescription className="text-base font-medium text-destructive">
                {error}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-3">
            <Button
              variant="outline"
              size="xl"
              onClick={onClose}
              disabled={processing}
              className="flex-1 font-medium"
            >
              Cancel
            </Button>
            <Button
              size="xl"
              onClick={handleComplete}
              disabled={processing}
              className="flex-[2] font-bold"
            >
              {processing ? <Spinner className="size-6" /> : <CircleCheck />}
              {processing ? 'Processing...' : 'Complete Sale'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
