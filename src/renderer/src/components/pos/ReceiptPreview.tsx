import { useEffect, useState } from 'react'
import { Copy, X, Printer } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { buildReceipt, receiptToPlainText } from '../../../../shared/receipt'

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
    card_received: number | null
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
  const [printError, setPrintError] = useState('')
  const [hasPrinted, setHasPrinted] = useState(false)
  const settings = useSettingsStore((state) => state.settings)

  useEffect(() => {
    if (open && saleId) {
      loadReceipt()
    }
  }, [open, saleId])

  const loadReceipt = async () => {
    setLoading(true)
    setPrintError('')
    setHasPrinted(false)
    try {
      const data = await window.electron.getReceipt(saleId)
      setReceipt(data)
    } catch (err) {
      console.error('Failed to load receipt:', err)
    } finally {
      setLoading(false)
    }
  }

  // Built from the SAME shared layout the printer uses, so the preview is
  // literally the document that comes out of the printer.
  // Read from the same setting the printer uses, so a 58mm (32 col) configuration
  // previews at 32 columns too.
  const receiptWidth = parseInt(settings.printer_width, 10) || 42

  const formatReceiptText = (): string => {
    if (!receipt?.sale || !Array.isArray(receipt.items)) return ''
    return receiptToPlainText(
      buildReceipt({
        sale: receipt.sale,
        items: receipt.items,
        cashierName: receipt.sale.cashier_name,
        business: {
          name: settings.business_name || 'My Pharmacy',
          address: settings.business_address,
          phone: settings.business_phone,
          footer: settings.receipt_footer || 'Thank you for your purchase!',
          currency: settings.currency_symbol || 'Rs.',
          vatRate: settings.vat_rate
        },
        width: receiptWidth
      }),
      receiptWidth
    )
  }

  const handleCopyToClipboard = () => {
    const text = formatReceiptText()
    navigator.clipboard.writeText(text)
  }

  const handlePrint = async () => {
    if (!receipt) return
    setPrinting(true)
    setPrintError('')
    try {
      // The handler resolves { success:false } rather than rejecting, so a catch
      // block alone never fired and a failed print looked identical to a good one.
      const result = await window.electron.printer.printReceipt({
        sale: receipt.sale,
        items: receipt.items,
        user: { full_name: receipt.sale.cashier_name || 'Cashier' },
        reprint: hasPrinted
      })
      if (result && (result as { success?: boolean }).success === false) {
        setPrintError(
          (result as { error?: string }).error || 'Printer did not respond. Check power and cable.'
        )
        return
      }
      setHasPrinted(true)
    } catch (err: any) {
      setPrintError(err?.message || 'Printer did not respond. Check power and cable.')
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

            {printError && (
              <div className="flex-shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-sm font-medium text-destructive">
                  Not printed: {printError}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  The sale is saved. Fix the printer and tap Print again.
                </p>
              </div>
            )}

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
                {printing ? 'Printing...' : hasPrinted ? 'Reprint' : 'Print'}
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
