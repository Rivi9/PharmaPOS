import { useEffect, useState } from 'react'
import { ProductEntry } from '@renderer/components/pos/ProductEntry'
import { QuickItems } from '@renderer/components/pos/QuickItems'
import { ShoppingCart } from '@renderer/components/pos/ShoppingCart'
import { PaymentModal } from '@renderer/components/pos/PaymentModal'
import { ReceiptPreview } from '@renderer/components/pos/ReceiptPreview'
import { CashMovementDialog } from '@renderer/components/pos/CashMovementDialog'
import { Button } from '@renderer/components/ui/button'
import { Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { usePOSStore } from '@renderer/stores/posStore'
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts'
import { useCustomerDisplay } from '@renderer/hooks/useCustomerDisplay'
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
    toast.warning(lastRejection, { duration: 4000 })
    clearRejection()
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
    <div className="flex h-full gap-4 bg-canvas p-4">
      {/* Left — find products */}
      <section className="flex w-[44%] min-w-0 flex-col gap-4">
        <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Find product</h2>
            <Button variant="outline" onClick={() => setCashMovementOpen(true)}>
              <Wallet />
              Cash In / Out
            </Button>
          </div>
          <ProductEntry searchOpen={searchModalOpen} onSearchOpenChange={setSearchModalOpen} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col rounded-2xl border bg-card shadow-xs">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-lg font-semibold">Quick items</h2>
            <span className="text-sm text-muted-foreground">Best sellers</span>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="p-4">
              <QuickItems refreshTrigger={quickItemsRefreshKey} />
            </div>
          </ScrollArea>
        </div>
      </section>

      {/* Right — the cart */}
      <section className="flex min-w-0 flex-1 flex-col">
        <ShoppingCart
          onPayment={() => setPaymentModalOpen(true)}
          onHold={() => void handleHold()}
          clearConfirmOpen={clearConfirmOpen}
          onClearConfirmOpenChange={setClearConfirmOpen}
        />
      </section>

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
