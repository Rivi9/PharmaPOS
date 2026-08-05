import { useEffect, useState } from 'react'
import { ProductEntry } from '@renderer/components/pos/ProductEntry'
import { QuickItems } from '@renderer/components/pos/QuickItems'
import { ShoppingCart } from '@renderer/components/pos/ShoppingCart'
import { PaymentModal } from '@renderer/components/pos/PaymentModal'
import { ReceiptPreview } from '@renderer/components/pos/ReceiptPreview'
import { CashMovementDialog } from '@renderer/components/pos/CashMovementDialog'
import { Button } from '@renderer/components/ui/button'
import { Wallet } from 'lucide-react'
import { usePOSStore } from '@renderer/stores/posStore'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts'
import { useCustomerDisplay } from '@renderer/hooks/useCustomerDisplay'
import { formatCurrency } from '@renderer/lib/calculations'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { useConfirm } from '@renderer/hooks/useConfirm'

export function POSPage(): React.JSX.Element {
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false)
  const [completedSale, setCompletedSale] = useState<{
    saleId: string
    receiptNumber: string
  } | null>(null)
  const [searchModalOpen, setSearchModalOpen] = useState(false)
  const [quickItemsRefreshKey, setQuickItemsRefreshKey] = useState(0)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const { confirm, confirmProps } = useConfirm()
  const [cashMovementOpen, setCashMovementOpen] = useState(false)

  // Sync cart state to customer display window
  useCustomerDisplay()

  const items = usePOSStore((state) => state.items)
  const holdCurrentSale = usePOSStore((state) => state.holdCurrentSale)
  const holdWouldOverwrite = usePOSStore((state) => state.holdWouldOverwrite)
  const recallHeldSale = usePOSStore((state) => state.recallHeldSale)
  const heldSale = usePOSStore((state) => state.heldSale)
  const lastRejection = usePOSStore((state) => state.lastRejection)
  const clearRejection = usePOSStore((state) => state.clearRejection)
  const todaySalesTotal = useShiftStore((s) => s.todaySalesTotal)
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)

  const handlePaymentComplete = (saleId: string, receiptNumber: string) => {
    setCompletedSale({ saleId, receiptNumber })
    setPaymentModalOpen(false)
    setReceiptPreviewOpen(true)
    setQuickItemsRefreshKey((k) => k + 1)
  }

  const handleReceiptClose = () => {
    setReceiptPreviewOpen(false)
    setCompletedSale(null)
  }

  const handlePayment = () => {
    if (items.length > 0) {
      setPaymentModalOpen(true)
    }
  }

  /**
   * M5: a rejected scan was a silent no-op, so the cashier rescanned or assumed
   * the item went in. The message clears itself — it is a transient notice, not a
   * state the cashier has to dismiss mid-queue.
   */
  useEffect(() => {
    if (!lastRejection) return
    const timer = setTimeout(clearRejection, 4000)
    return () => clearTimeout(timer)
  }, [lastRejection, clearRejection])

  /**
   * M1: one hold slot, overwritten unconditionally — holding a second sale
   * destroyed the first with no warning, while Recall did confirm.
   */
  const handleHold = async (): Promise<void> => {
    if (items.length === 0) return
    if (holdWouldOverwrite()) {
      const ok = await confirm({
        title: 'Replace the sale already on hold?',
        description:
          'There is only one hold slot. The basket currently held will be discarded and cannot be recovered.',
        confirmLabel: 'Replace it',
        destructive: true
      })
      if (!ok) return
    }
    holdCurrentSale()
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onF2: () => setSearchModalOpen(true),
    onF4: () => void handleHold(),
    onF5: () => heldSale !== null && recallHeldSale(),
    // F8 goes through the same confirmation dialog as the Clear button
    onF8: () => items.length > 0 && setClearConfirmOpen(true),
    onF9: handlePayment,
    onEscape: () => {
      if (searchModalOpen) setSearchModalOpen(false)
      if (paymentModalOpen) setPaymentModalOpen(false)
      if (receiptPreviewOpen) handleReceiptClose()
    }
  })

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Status Bar */}
      <div className="border-b p-4 bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">POS Terminal</p>
            <p className="text-xs text-muted-foreground">Ready for checkout</p>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              className="h-11 gap-2"
              onClick={() => setCashMovementOpen(true)}
            >
              <Wallet className="h-4 w-4" />
              Cash In / Out
            </Button>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Today&apos;s Sales</p>
              <p className="text-lg font-bold">{formatCurrency(todaySalesTotal, currencySymbol)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side - Product Entry + Quick Items */}
        <div className="w-2/5 border-r flex flex-col p-4 gap-4">
          {/* Product Entry Section */}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Product Entry</h2>
            <ProductEntry searchOpen={searchModalOpen} onSearchOpenChange={setSearchModalOpen} />
          </div>

          {/* Quick Items Section */}
          <div className="flex-1 flex flex-col space-y-2 min-h-0">
            <h2 className="text-sm font-semibold">Quick Items</h2>
            <div className="flex-1 overflow-auto">
              <QuickItems refreshTrigger={quickItemsRefreshKey} />
            </div>
          </div>
        </div>

        {/* Right Side - Shopping Cart */}
        <div className="flex-1 flex flex-col p-4 min-h-0">
          <h2 className="text-sm font-semibold mb-2">Shopping Cart</h2>
          {/* A rejected scan used to be a silent no-op (M5). */}
          {lastRejection && (
            <p
              role="status"
              className="mb-2 rounded-md bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900"
            >
              {lastRejection}
            </p>
          )}
          <ShoppingCart
            onPayment={() => setPaymentModalOpen(true)}
            onHold={() => void handleHold()}
            clearConfirmOpen={clearConfirmOpen}
            onClearConfirmOpenChange={setClearConfirmOpen}
          />
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onComplete={handlePaymentComplete}
      />

      <CashMovementDialog open={cashMovementOpen} onClose={() => setCashMovementOpen(false)} />

      {/* Receipt Preview */}
      {completedSale && (
        <ReceiptPreview
          open={receiptPreviewOpen}
          onClose={handleReceiptClose}
          saleId={completedSale.saleId}
          receiptNumber={completedSale.receiptNumber}
        />
      )}

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}
