import { useState } from 'react'
import { ProductEntry } from '@renderer/components/pos/ProductEntry'
import { QuickItems } from '@renderer/components/pos/QuickItems'
import { ShoppingCart } from '@renderer/components/pos/ShoppingCart'
import { PaymentModal } from '@renderer/components/pos/PaymentModal'
import { ReceiptPreview } from '@renderer/components/pos/ReceiptPreview'
import { usePOSStore } from '@renderer/stores/posStore'
import { useKeyboardShortcuts } from '@renderer/hooks/useKeyboardShortcuts'
import { useCustomerDisplay } from '@renderer/hooks/useCustomerDisplay'

export function POSPage(): React.JSX.Element {
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false)
  const [completedSale, setCompletedSale] = useState<{
    saleId: string
    receiptNumber: string
  } | null>(null)
  const [searchModalOpen, setSearchModalOpen] = useState(false)

  // Sync cart state to customer display window
  useCustomerDisplay()

  const items = usePOSStore((state) => state.items)
  const holdCurrentSale = usePOSStore((state) => state.holdCurrentSale)
  const recallHeldSale = usePOSStore((state) => state.recallHeldSale)
  const clearCart = usePOSStore((state) => state.clearCart)
  const heldSale = usePOSStore((state) => state.heldSale)

  const handlePaymentComplete = (saleId: string, receiptNumber: string) => {
    setCompletedSale({ saleId, receiptNumber })
    setPaymentModalOpen(false)
    setReceiptPreviewOpen(true)
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

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onF2: () => setSearchModalOpen(true),
    onF4: () => items.length > 0 && holdCurrentSale(),
    onF5: () => heldSale !== null && recallHeldSale(),
    onF8: () => items.length > 0 && clearCart(),
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
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Today's Sales</p>
            <p className="text-lg font-bold">Rs. 0.00</p>
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
              <QuickItems />
            </div>
          </div>
        </div>

        {/* Right Side - Shopping Cart */}
        <div className="flex-1 flex flex-col p-4">
          <h2 className="text-sm font-semibold mb-2">Shopping Cart</h2>
          <ShoppingCart onPayment={() => setPaymentModalOpen(true)} />
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onComplete={handlePaymentComplete}
      />

      {/* Receipt Preview */}
      {completedSale && (
        <ReceiptPreview
          open={receiptPreviewOpen}
          onClose={handleReceiptClose}
          saleId={completedSale.saleId}
          receiptNumber={completedSale.receiptNumber}
        />
      )}
    </div>
  )
}
