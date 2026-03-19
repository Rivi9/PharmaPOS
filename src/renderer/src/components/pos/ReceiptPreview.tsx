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
    const vatRate = settings.vat_rate || '0'
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

    // Column helper — matches tableRow() in receipt-formatter.ts
    const col = (text: string, width: number, align: 'L' | 'C' | 'R'): string => {
      const t = text.length > width ? text.substring(0, width) : text
      if (align === 'R') return t.padStart(width)
      if (align === 'C') {
        const pad = Math.floor((width - t.length) / 2)
        return ' '.repeat(pad) + t + ' '.repeat(width - t.length - pad)
      }
      return t.padEnd(width)
    }
    // Amount row: left label 29 chars, right amount 12 chars = 41 (matches print 0.7/0.3 split)
    const amtRow = (label: string, amount: string): string =>
      label.padEnd(29) + amount.padStart(12) + '\n'

    let text = `\n${LINE}\n`
    text += `${centered(businessName)}\n`
    text += '\n'
    if (businessAddress) text += `${centered(businessAddress)}\n`
    if (businessPhone) text += `${centered('Tel: ' + businessPhone)}\n`
    text += `${LINE}\n\n`

    text += `Receipt #: ${receipt.sale.receipt_number}\n`
    text += `Date: ${dateStr}  Time: ${timeStr}\n`
    text += `Cashier: ${receipt.sale.cashier_name}\n\n`

    // Items — 4 columns matching print: Item(16) Qty(4) Price(11) Total(11) = 42
    text += `${line}\n`
    text +=
      col('Item', 16, 'L') +
      col('Qty', 4, 'C') +
      col(`Price(${currency})`, 11, 'R') +
      col(`Total(${currency})`, 11, 'R') +
      '\n'
    text += `${line}\n`
    receipt.items.forEach((item) => {
      text +=
        col(item.product_name, 16, 'L') +
        col(item.quantity.toString(), 4, 'C') +
        col(item.unit_price.toFixed(2), 11, 'R') +
        col(item.line_total.toFixed(2), 11, 'R') +
        '\n'
    })

    text += `${line}\n`
    text += amtRow('Subtotal:', `${currency}${receipt.sale.subtotal.toFixed(2)}`)
    if (receipt.sale.discount_amount > 0) {
      text += amtRow('Discount:', `-${currency}${receipt.sale.discount_amount.toFixed(2)}`)
    }
    if (receipt.sale.tax_amount > 0) {
      text += amtRow(`VAT (${vatRate}%):`, `${currency}${receipt.sale.tax_amount.toFixed(2)}`)
    }
    text += `${LINE}\n`
    text += amtRow('TOTAL:', `${currency}${receipt.sale.total.toFixed(2)}`)
    text += `${LINE}\n`

    if (receipt.sale.payment_method === 'cash') {
      text += amtRow('Cash:', `${currency}${receipt.sale.cash_received.toFixed(2)}`)
      text += amtRow('Change:', `${currency}${receipt.sale.change_given.toFixed(2)}`)
    } else if (receipt.sale.payment_method === 'card') {
      text += amtRow('Card:', `${currency}${receipt.sale.card_amount.toFixed(2)}`)
    } else if (receipt.sale.payment_method === 'mixed') {
      text += amtRow('Cash:', `${currency}${receipt.sale.cash_received.toFixed(2)}`)
      text += amtRow('Card:', `${currency}${receipt.sale.card_amount.toFixed(2)}`)
    }

    if (receipt.sale.customer_name || receipt.sale.customer_phone) {
      text += `${line}\n`
      if (receipt.sale.customer_name) text += `Customer: ${receipt.sale.customer_name}\n`
      if (receipt.sale.customer_phone) text += `Phone: ${receipt.sale.customer_phone}\n`
    }

    text += `${line}\n`
    text += `${centered(footer)}\n`
    text += `${centered('Powered by PharmaPOS')}\n`
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
        user: { full_name: (receipt.sale as any).cashier_name || 'Cashier' }
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
