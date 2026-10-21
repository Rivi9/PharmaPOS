import { useEffect, useState } from 'react'
import { Copy, X, Printer, TriangleAlert, PrinterCheck, FileX } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { buildReceipt, receiptToPlainText } from '../../../../shared/receipt'

interface ReceiptPreviewProps {
  open: boolean
  onClose: () => void
  saleId: string
  receiptNumber: string
  /**
   * A copy of an earlier sale (the Sales screen), not the receipt being handed
   * over at checkout: it previews and prints marked *** REPRINT ***.
   */
  reprint?: boolean
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
  receiptNumber,
  reprint = false
}: ReceiptPreviewProps): React.JSX.Element {
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [loading, setLoading] = useState(true)
  const [printing, setPrinting] = useState(false)
  const [printError, setPrintError] = useState('')
  const [printWarning, setPrintWarning] = useState('')
  const [hasPrinted, setHasPrinted] = useState(reprint)
  const settings = useSettingsStore((state) => state.settings)

  useEffect(() => {
    if (!open || !saleId) return
    let cancelled = false
    setLoading(true)
    // The previous sale's receipt and print notices are cleared too: a failed
    // load used to leave the LAST customer's receipt on screen under this
    // sale's receipt number, one tap away from being printed.
    setReceipt(null)
    setPrintError('')
    setPrintWarning('')
    setHasPrinted(reprint)
    window.electron
      .getReceipt(saleId)
      .then((data: ReceiptData) => {
        if (!cancelled) setReceipt(data)
      })
      .catch((err: unknown) => console.error('Failed to load receipt:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, saleId, reprint])

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
        width: receiptWidth,
        reprint
      }),
      receiptWidth
    )
  }

  const handleCopyToClipboard = (): void => {
    const text = formatReceiptText()
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success('Receipt copied'))
      .catch(() => toast.error('Could not copy the receipt'))
  }

  const handlePrint = async (): Promise<void> => {
    if (!receipt) return
    setPrinting(true)
    setPrintError('')
    setPrintWarning('')
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
      // Printed, but not faithfully: characters the printer cannot represent came
      // out as "?" (M11). Shown as a warning rather than an error — the receipt is
      // in the customer's hand either way, and the operator needs to know why.
      const warning = (result as { warning?: string })?.warning
      setPrintWarning(warning ?? '')
    } catch (err) {
      setPrintError((err as Error)?.message || 'Printer did not respond. Check power and cable.')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 sm:max-w-lg">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-2xl font-semibold">Receipt - {receiptNumber}</DialogTitle>
          <DialogDescription className="text-base">
            Exactly what the receipt printer produces.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center gap-3 p-8 text-base text-muted-foreground">
            <Spinner className="size-5" />
            Loading receipt...
          </div>
        )}

        {!loading && !receipt && (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileX />
              </EmptyMedia>
              <EmptyTitle>Receipt could not be loaded</EmptyTitle>
              <EmptyDescription>
                The sale is saved. Only the preview failed to load.
              </EmptyDescription>
            </EmptyHeader>
            <Button size="lg" onClick={onClose}>
              Close
            </Button>
          </Empty>
        )}

        {!loading && receipt && (
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            {/* Receipt Display — a slip of paper on the muted backdrop */}
            <div className="min-h-0 flex-1 overflow-auto rounded-xl bg-muted/60 p-4">
              <div className="mx-auto w-fit rounded-md border bg-background px-4 py-5 text-foreground shadow-sm">
                <pre className="font-mono text-sm leading-snug whitespace-pre">
                  {formatReceiptText()}
                </pre>
              </div>
            </div>

            {printWarning && (
              <Alert className="shrink-0 border-warning/30 bg-warning-muted text-warning">
                <TriangleAlert />
                <AlertTitle className="text-base">Printed, but not exactly</AlertTitle>
                <AlertDescription className="text-warning">{printWarning}</AlertDescription>
              </Alert>
            )}

            {printError && (
              <Alert variant="destructive" className="shrink-0 bg-destructive/10">
                <Printer />
                <AlertTitle className="text-base">Not printed: {printError}</AlertTitle>
                <AlertDescription>
                  The sale is saved. Fix the printer and tap Print again.
                </AlertDescription>
              </Alert>
            )}

            {/* Actions */}
            <div className="grid shrink-0 grid-cols-3 gap-3">
              <Button variant="outline" size="lg" onClick={handleCopyToClipboard}>
                <Copy />
                Copy
              </Button>
              <Button variant="outline" size="lg" onClick={handlePrint} disabled={printing}>
                {printing ? (
                  <Spinner className="size-5" />
                ) : hasPrinted ? (
                  <PrinterCheck />
                ) : (
                  <Printer />
                )}
                {printing ? 'Printing...' : hasPrinted ? 'Reprint' : 'Print'}
              </Button>
              <Button size="lg" onClick={onClose}>
                <X />
                Close
              </Button>
            </div>

            <p className="shrink-0 text-center text-sm text-muted-foreground">
              Business info is configured in Settings
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
