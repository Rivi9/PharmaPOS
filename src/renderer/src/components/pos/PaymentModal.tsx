import { useState } from 'react'
import { CreditCard, Banknote, Split, Delete } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { usePOSStore } from '@renderer/stores/posStore'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { calculateChange, formatCurrency } from '@renderer/lib/calculations'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onComplete: (saleId: string, receiptNumber: string) => void
}

type PaymentMethod = 'cash' | 'card' | 'mixed'

// Common cash denominations for quick-select
const QUICK_AMOUNTS = [100, 500, 1000, 2000, 5000]

export function PaymentModal({ open, onClose, onComplete }: PaymentModalProps): React.JSX.Element {
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [cashReceived, setCashReceived] = useState('')
  const [cardAmount, setCardAmount] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)

  const items = usePOSStore((state) => state.items)
  const saleDiscount = usePOSStore((state) => state.saleDiscount)
  const subtotal = usePOSStore((state) => state.subtotal())
  const discountAmount = usePOSStore((state) => state.discountAmount())
  const taxAmount = usePOSStore((state) => state.taxAmount())
  const total = usePOSStore((state) => state.total())
  const clearCart = usePOSStore((state) => state.clearCart)
  const currentShift = useShiftStore((state) => state.currentShift)
  const addToTodaySales = useShiftStore((state) => state.addToTodaySales)
  const currencySymbol = useSettingsStore((state) => state.settings.currency_symbol)

  const cashReceivedNum = parseFloat(cashReceived) || 0
  const cardAmountNum = parseFloat(cardAmount) || 0
  const change = paymentMethod === 'cash' ? calculateChange(cashReceivedNum, total) : 0

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setPaymentMethod(method)
    setError('')
    setCashReceived('')
    if (method === 'card') {
      setCardAmount(total.toFixed(2))
    } else {
      setCardAmount('')
    }
  }

  const updateCash = (value: string) => {
    setCashReceived(value)
    setError('')
    if (paymentMethod === 'mixed') {
      const cash = parseFloat(value) || 0
      const remaining = Math.max(0, total - cash)
      setCardAmount(remaining.toFixed(2))
    }
  }

  // Numpad key handler — builds cash string digit by digit
  const handleNumpadKey = (key: string) => {
    if (key === 'backspace') {
      updateCash(cashReceived.slice(0, -1))
      return
    }
    if (key === '.' && cashReceived.includes('.')) return
    // Limit to 2 decimal places
    const dotIndex = cashReceived.indexOf('.')
    if (dotIndex !== -1 && cashReceived.length - dotIndex > 2) return
    updateCash(cashReceived + key)
  }

  const validatePayment = (): boolean => {
    if (paymentMethod === 'cash') {
      if (cashReceivedNum < total) {
        setError(`Insufficient cash. Need ${formatCurrency(total - cashReceivedNum)} more.`)
        return false
      }
    } else if (paymentMethod === 'mixed') {
      const totalPaid = cashReceivedNum + cardAmountNum
      if (Math.abs(totalPaid - total) > 0.01) {
        setError(
          `Payment mismatch. Total: ${formatCurrency(total)}, Paid: ${formatCurrency(totalPaid)}`
        )
        return false
      }
    }
    return true
  }

  const handleComplete = async () => {
    if (!validatePayment()) return
    if (!currentShift) {
      setError('No active shift found')
      return
    }

    setProcessing(true)
    setError('')

    try {
      const saleData = {
        shift_id: currentShift.id,
        user_id: currentShift.user_id,
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

      addToTodaySales(total)

      window.electron.display.saleComplete({
        total,
        cash_received: paymentMethod === 'cash' || paymentMethod === 'mixed' ? cashReceivedNum : 0,
        change_given: change,
        currency: currencySymbol
      }).catch(() => {})

      clearCart()
      setCashReceived('')
      setCardAmount('')
      setCustomerName('')
      setCustomerPhone('')

      onComplete(result.sale_id, result.receipt_number)
    } catch (err: any) {
      setError(err.message || 'Failed to complete sale')
    } finally {
      setProcessing(false)
    }
  }

  const showCashEntry = paymentMethod === 'cash' || paymentMethod === 'mixed'

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Complete Sale — {formatCurrency(total)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payment Method — large touch buttons */}
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant={paymentMethod === 'cash' ? 'default' : 'outline'}
              onClick={() => handlePaymentMethodChange('cash')}
              className="h-16 flex flex-col items-center gap-1"
            >
              <Banknote className="h-6 w-6" />
              <span>Cash</span>
            </Button>
            <Button
              variant={paymentMethod === 'card' ? 'default' : 'outline'}
              onClick={() => handlePaymentMethodChange('card')}
              className="h-16 flex flex-col items-center gap-1"
            >
              <CreditCard className="h-6 w-6" />
              <span>Card</span>
            </Button>
            <Button
              variant={paymentMethod === 'mixed' ? 'default' : 'outline'}
              onClick={() => handlePaymentMethodChange('mixed')}
              className="h-16 flex flex-col items-center gap-1"
            >
              <Split className="h-6 w-6" />
              <span>Mixed</span>
            </Button>
          </div>

          {/* Cash entry section */}
          {showCashEntry && (
            <div className="space-y-3">
              <Label className="text-base">Cash Received</Label>

              {/* Cash display */}
              <Input
                id="cash-received"
                type="number"
                step="0.01"
                value={cashReceived}
                onChange={(e) => updateCash(e.target.value)}
                placeholder="0.00"
                className="h-14 text-2xl font-bold text-right pr-4"
              />

              {/* Quick preset amounts */}
              <div className="grid grid-cols-5 gap-2">
                <Button
                  variant="outline"
                  className="h-11 font-medium"
                  onClick={() => updateCash(total.toFixed(2))}
                >
                  Exact
                </Button>
                {QUICK_AMOUNTS.map((amount) => (
                  <Button
                    key={amount}
                    variant="outline"
                    className="h-11 font-medium"
                    onClick={() => updateCash(String(amount))}
                  >
                    {amount >= 1000 ? `${amount / 1000}K` : amount}
                  </Button>
                ))}
              </div>

              {/* Touch Numpad */}
              <div className="grid grid-cols-3 gap-2">
                {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'backspace'].map(
                  (key) => (
                    <Button
                      key={key}
                      variant="outline"
                      className="h-14 text-xl font-semibold"
                      onClick={() => handleNumpadKey(key)}
                    >
                      {key === 'backspace' ? <Delete className="h-5 w-5" /> : key}
                    </Button>
                  )
                )}
              </div>

              {/* Change display */}
              {paymentMethod === 'cash' && cashReceivedNum > 0 && (
                <div
                  className={`p-3 rounded-lg text-center text-lg font-bold ${
                    cashReceivedNum >= total
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {cashReceivedNum >= total
                    ? `Change: ${formatCurrency(change)}`
                    : `Short: ${formatCurrency(total - cashReceivedNum)}`}
                </div>
              )}
            </div>
          )}

          {/* Mixed payment — card amount (auto-calculated) */}
          {paymentMethod === 'mixed' && (
            <div className="space-y-2">
              <Label className="text-base">Card Amount (auto)</Label>
              <Input
                type="number"
                step="0.01"
                value={cardAmount}
                onChange={(e) => setCardAmount(e.target.value)}
                className="h-12 text-lg"
                placeholder="0.00"
              />
            </div>
          )}

          {/* Customer Info */}
          <div className="space-y-3 border-t pt-3">
            <Label className="text-muted-foreground">Customer (Optional)</Label>
            <Input
              placeholder="Customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="h-12 text-base"
            />
            <Input
              placeholder="Phone number"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="h-12 text-base"
            />
          </div>

          {error && <p className="text-base text-destructive font-medium">{error}</p>}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={processing}
              className="flex-1 h-14 text-base"
            >
              Cancel
            </Button>
            <Button
              onClick={handleComplete}
              disabled={processing}
              className="flex-1 h-14 text-lg font-bold"
            >
              {processing ? 'Processing...' : 'Complete Sale'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
