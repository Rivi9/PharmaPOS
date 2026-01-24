import { useEffect, useState } from 'react'
import { Copy, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { formatCurrency } from '@renderer/lib/calculations'

interface ReceiptPreviewProps {
  open: boolean
  onClose: () => void
  saleId: string
  receiptNumber: string
}

interface ReceiptData {
  sale: {
    receipt_number: string
    created_at: string
    cashier_name: string
    subtotal: number
    discount_amount: number
    tax_amount: number
    total: number
    payment_method: string
    cash_received: number
    card_amount: number
    change_given: number
    customer_name?: string
    customer_phone?: string
  }
  items: Array<{
    product_name: string
    quantity: number
    unit_price: number
    line_total: number
  }>
}

export function ReceiptPreview({ open, onClose, saleId, receiptNumber }: ReceiptPreviewProps): React.JSX.Element {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (open && saleId) {
      loadReceipt()
    }
  }, [open, saleId])

  const loadReceipt = async () => {
    setLoading(true)
    try {
      const data = await window.electron.getReceipt(saleId)
      setReceipt(data)
    } catch (err) {
      console.error('Failed to load receipt:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatReceiptText = (): string => {
    if (!receipt) return ''

    const date = new Date(receipt.sale.created_at)
    const dateStr = date.toLocaleDateString()
    const timeStr = date.toLocaleTimeString()

    let text = `
════════════════════════════════
        MY PHARMACY
    123 Main Street, Colombo
      Tel: 011-2345678
════════════════════════════════

Receipt #: ${receipt.sale.receipt_number}
Date: ${dateStr}  Time: ${timeStr}
Cashier: ${receipt.sale.cashier_name}

────────────────────────────────
Item              Qty    Price
────────────────────────────────
`

    receipt.items.forEach((item) => {
      const name = item.product_name.padEnd(16).substring(0, 16)
      const qty = item.quantity.toString().padStart(3)
      const price = formatCurrency(item.line_total).padStart(10)
      text += `${name} ${qty} ${price}\n`
    })

    text += `────────────────────────────────
Subtotal:         ${formatCurrency(receipt.sale.subtotal).padStart(10)}
`

    if (receipt.sale.discount_amount > 0) {
      text += `Discount:        -${formatCurrency(receipt.sale.discount_amount).padStart(10)}
`
    }

    text += `VAT (18%):        ${formatCurrency(receipt.sale.tax_amount).padStart(10)}
════════════════════════════════
TOTAL:            ${formatCurrency(receipt.sale.total).padStart(10)}
════════════════════════════════
`

    if (receipt.sale.payment_method === 'cash') {
      text += `Cash:             ${formatCurrency(receipt.sale.cash_received).padStart(10)}
Change:           ${formatCurrency(receipt.sale.change_given).padStart(10)}
`
    } else if (receipt.sale.payment_method === 'card') {
      text += `Card:             ${formatCurrency(receipt.sale.card_amount).padStart(10)}
`
    } else if (receipt.sale.payment_method === 'mixed') {
      text += `Cash:             ${formatCurrency(receipt.sale.cash_received).padStart(10)}
Card:             ${formatCurrency(receipt.sale.card_amount).padStart(10)}
`
    }

    if (receipt.sale.customer_name || receipt.sale.customer_phone) {
      text += `────────────────────────────────
`
      if (receipt.sale.customer_name) {
        text += `Customer: ${receipt.sale.customer_name}
`
      }
      if (receipt.sale.customer_phone) {
        text += `Phone: ${receipt.sale.customer_phone}
`
      }
    }

    text += `────────────────────────────────
  Thank you for your purchase!
════════════════════════════════
`

    return text
  }

  const handleCopyToClipboard = () => {
    const text = formatReceiptText()
    navigator.clipboard.writeText(text)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Receipt - {receiptNumber}</DialogTitle>
        </DialogHeader>

        {loading && (
          <div className="p-8 text-center text-muted-foreground">
            Loading receipt...
          </div>
        )}

        {!loading && receipt && (
          <div className="space-y-4">
            {/* Receipt Display */}
            <div className="border rounded-lg p-4 bg-white text-black overflow-auto max-h-[60vh]">
              <pre className="font-mono text-xs whitespace-pre">
                {formatReceiptText()}
              </pre>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleCopyToClipboard}
                className="flex-1 flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy to Clipboard
              </Button>
              <Button
                onClick={onClose}
                className="flex-1 flex items-center gap-2"
              >
                <X className="h-4 w-4" />
                New Sale
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground">
              This dialog will auto-close in 30 seconds or on next scan
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
