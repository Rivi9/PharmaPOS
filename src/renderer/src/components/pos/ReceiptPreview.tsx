import { useEffect, useState } from 'react'
import { Copy, X, Printer } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { useSettingsStore } from '@renderer/stores/settingsStore'

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

export function ReceiptPreview({
  open,
  onClose,
  saleId,
  receiptNumber
}: ReceiptPreviewProps): React.JSX.Element {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const settings = useSettingsStore((state) => state.settings)

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

    const businessName = settings.business_name || 'My Pharmacy'
    const businessAddress = settings.business_address || ''
    const businessPhone = settings.business_phone || ''
    const currency = settings.currency_symbol || 'Rs.'
    const vatRate = settings.vat_rate || '18'
    const footer = settings.receipt_footer || 'Thank you for your purchase!'

    const date = new Date(receipt.sale.created_at)
    const dateStr = date.toLocaleDateString('en-LK')
    const timeStr = date.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit' })

    const W = 42
    const LINE = '═'.repeat(W)
    const line = '─'.repeat(W)

    const centered = (s: string): string => {
      if (s.length <= W) {
        return s.padStart(Math.floor((W + s.length) / 2)).padEnd(W)
      }
      // Word-wrap long strings onto multiple centered lines
      const words = s.split(' ')
      const lines: string[] = []
      let current = ''
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word
        if (candidate.length <= W) {
          current = candidate
        } else {
          if (current) lines.push(current)
          current = word.length <= W ? word : word.slice(0, W)
        }
      }
      if (current) lines.push(current)
      return lines.map((l) => l.padStart(Math.floor((W + l.length) / 2)).padEnd(W)).join('\n')
    }

    let text = `\n${LINE}\n`
    text += `${centered(businessName)}\n`
    if (businessAddress) text += `${centered(businessAddress)}\n`
    if (businessPhone) text += `${centered('Tel: ' + businessPhone)}\n`
    text += `${LINE}\n\n`

    text += `Receipt #: ${receipt.sale.receipt_number}\n`
    text += `Date: ${dateStr}  Time: ${timeStr}\n`
    text += `Cashier: ${receipt.sale.cashier_name}\n\n`

    text += `${line}\n`
    text += `Item              Qty    Price\n`
    text += `${line}\n`

    receipt.items.forEach((item) => {
      const name = item.product_name.padEnd(16).substring(0, 16)
      const qty = item.quantity.toString().padStart(3)
      const price = `${currency} ${item.line_total.toFixed(2)}`.padStart(9)
      text += `${name} ${qty} ${price}\n`
    })

    text += `${line}\n`
    text += `Subtotal:         ${`${currency} ${receipt.sale.subtotal.toFixed(2)}`.padStart(9)}\n`

    if (receipt.sale.discount_amount > 0) {
      text += `Discount:        -${`${currency} ${receipt.sale.discount_amount.toFixed(2)}`.padStart(9)}\n`
    }

    text += `VAT (${vatRate}%):      ${`${currency} ${receipt.sale.tax_amount.toFixed(2)}`.padStart(9)}\n`
    text += `${LINE}\n`
    text += `TOTAL:            ${`${currency} ${receipt.sale.total.toFixed(2)}`.padStart(9)}\n`
    text += `${LINE}\n`

    if (receipt.sale.payment_method === 'cash') {
      text += `Cash:             ${`${currency} ${receipt.sale.cash_received.toFixed(2)}`.padStart(9)}\n`
      text += `Change:           ${`${currency} ${receipt.sale.change_given.toFixed(2)}`.padStart(9)}\n`
    } else if (receipt.sale.payment_method === 'card') {
      text += `Card:             ${`${currency} ${receipt.sale.card_amount.toFixed(2)}`.padStart(9)}\n`
    } else if (receipt.sale.payment_method === 'mixed') {
      text += `Cash:             ${`${currency} ${receipt.sale.cash_received.toFixed(2)}`.padStart(9)}\n`
      text += `Card:             ${`${currency} ${receipt.sale.card_amount.toFixed(2)}`.padStart(9)}\n`
    }

    if (receipt.sale.customer_name || receipt.sale.customer_phone) {
      text += `${line}\n`
      if (receipt.sale.customer_name) text += `Customer: ${receipt.sale.customer_name}\n`
      if (receipt.sale.customer_phone) text += `Phone: ${receipt.sale.customer_phone}\n`
    }

    text += `${line}\n`
    text += `${centered(footer)}\n`
    text += `${LINE}\n`

    return text
  }

  const handleCopyToClipboard = () => {
    const text = formatReceiptText()
    navigator.clipboard.writeText(text)
  }

  const handlePrint = async () => {
    if (!receipt) return
    setPrinting(true)
    try {
      await window.electron.printer.printReceipt({
        sale: receipt.sale,
        items: receipt.items,
        business_name: settings.business_name,
        business_address: settings.business_address,
        business_phone: settings.business_phone,
        currency_symbol: settings.currency_symbol,
        vat_rate: settings.vat_rate,
        receipt_footer: settings.receipt_footer
      })
    } catch (err) {
      console.error('Print failed:', err)
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md flex flex-col" style={{ maxHeight: '90vh' }}>
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Receipt - {receiptNumber}</DialogTitle>
        </DialogHeader>

        {loading && <div className="p-8 text-center text-muted-foreground">Loading receipt...</div>}

        {!loading && receipt && (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* Receipt Display */}
            <div className="border rounded-lg p-4 bg-white text-black overflow-auto flex-1 min-h-0">
              <pre className="font-mono text-xs whitespace-pre">{formatReceiptText()}</pre>
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant="outline"
                onClick={handleCopyToClipboard}
                className="flex-1 flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy
              </Button>
              <Button
                variant="outline"
                onClick={handlePrint}
                disabled={printing}
                className="flex-1 flex items-center gap-2"
              >
                <Printer className="h-4 w-4" />
                {printing ? 'Printing...' : 'Print'}
              </Button>
              <Button onClick={onClose} className="flex-1 flex items-center gap-2">
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>

            <p className="text-xs text-center text-muted-foreground flex-shrink-0">
              Business info is configured in Settings
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
