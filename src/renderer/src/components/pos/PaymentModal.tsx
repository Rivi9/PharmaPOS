import { useState } from 'react'
import { CreditCard, Banknote, Split } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { usePOSStore } from '@renderer/stores/posStore'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { calculateChange, formatCurrency } from '@renderer/lib/calculations'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  onComplete: (saleId: string, receiptNumber: string) => void
}

type PaymentMethod = 'cash' | 'card' | 'mixed'

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

  const cashReceivedNum = parseFloat(cashReceived) || 0
  const cardAmountNum = parseFloat(cardAmount) || 0
  const change = paymentMethod === 'cash' ? calculateChange(cashReceivedNum, total) : 0

  const handlePaymentMethodChange = (method: PaymentMethod) => {
    setPaymentMethod(method)
    setError('')
    if (method === 'card') {
      setCashReceived('')
      setCardAmount(total.toFixed(2))
    } else if (method === 'mixed') {
      setCashReceived('')
      setCardAmount('')
    } else {
      setCashReceived('')
      setCardAmount('')
    }
  }

  const handleCashReceivedChange = (value: string) => {
    setCashReceived(value)
    setError('')

    // For mixed payments, auto-calculate card amount
    if (paymentMethod === 'mixed') {
      const cash = parseFloat(value) || 0
      const remaining = Math.max(0, total - cash)
      setCardAmount(remaining.toFixed(2))
    }
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
        setError(`Payment mismatch. Total: ${formatCurrency(total)}, Paid: ${formatCurrency(totalPaid)}`)
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
          line_total: item.line_total,
        })),
        subtotal,
        discount_amount: discountAmount,
        discount_type: saleDiscount?.type || null,
        discount_value: saleDiscount?.value || 0,
        tax_amount: taxAmount,
        total,
        payment_method: paymentMethod,
        cash_received: paymentMethod === 'cash' ? cashReceivedNum : paymentMethod === 'mixed' ? cashReceivedNum : 0,
        card_amount: paymentMethod === 'card' ? total : paymentMethod === 'mixed' ? cardAmountNum : 0,
        change_given: change,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
      }

      const result = await window.electron.createSale(saleData)

      // Update shift totals
      addToTodaySales(total)

      // Clear cart
      clearCart()

      // Reset form
      setCashReceived('')
      setCardAmount('')
      setCustomerName('')
      setCustomerPhone('')

      // Call completion handler
      onComplete(result.sale_id, result.receipt_number)
    } catch (err: any) {
      setError(err.message || 'Failed to complete sale')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Sale - {formatCurrency(total)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Payment Method Selection */}
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                onClick={() => handlePaymentMethodChange('cash')}
                className="flex flex-col items-center gap-1 h-auto py-3"
              >
                <Banknote className="h-5 w-5" />
                <span className="text-xs">Cash</span>
              </Button>
              <Button
                variant={paymentMethod === 'card' ? 'default' : 'outline'}
                onClick={() => handlePaymentMethodChange('card')}
                className="flex flex-col items-center gap-1 h-auto py-3"
              >
                <CreditCard className="h-5 w-5" />
                <span className="text-xs">Card</span>
              </Button>
              <Button
                variant={paymentMethod === 'mixed' ? 'default' : 'outline'}
                onClick={() => handlePaymentMethodChange('mixed')}
                className="flex flex-col items-center gap-1 h-auto py-3"
              >
                <Split className="h-5 w-5" />
                <span className="text-xs">Mixed</span>
              </Button>
            </div>
          </div>

          {/* Cash Payment */}
          {(paymentMethod === 'cash' || paymentMethod === 'mixed') && (
            <div className="space-y-2">
              <Label htmlFor="cash-received">Cash Received</Label>
              <Input
                id="cash-received"
                type="number"
                step="0.01"
                value={cashReceived}
                onChange={(e) => handleCashReceivedChange(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
              {paymentMethod === 'cash' && cashReceivedNum >= total && (
                <p className="text-sm font-medium text-green-600">
                  Change: {formatCurrency(change)}
                </p>
              )}
            </div>
          )}

          {/* Card Payment */}
          {paymentMethod === 'mixed' && (
            <div className="space-y-2">
              <Label htmlFor="card-amount">Card Amount</Label>
              <Input
                id="card-amount"
                type="number"
                step="0.01"
                value={cardAmount}
                onChange={(e) => setCardAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Customer Info (Optional) */}
          <div className="space-y-3 border-t pt-4">
            <Label className="text-muted-foreground">Customer Info (Optional)</Label>
            <Input
              placeholder="Customer name"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
            <Input
              placeholder="Phone number"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
            />
          </div>

          {/* Error Message */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={processing}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleComplete}
              disabled={processing}
              className="flex-1"
            >
              {processing ? 'Processing...' : 'Complete Sale'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
