import { useState } from 'react'
import { ProductEntry } from '@renderer/components/pos/ProductEntry'
import { QuickItems } from '@renderer/components/pos/QuickItems'
import { ShoppingCart } from '@renderer/components/pos/ShoppingCart'

export function POSPage(): React.JSX.Element {
  const [paymentModalOpen, setPaymentModalOpen] = useState(false)

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Status Bar */}
      <div className="border-b p-4 bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">POS Terminal</p>
            <p className="text-xs text-muted-foreground">
              Ready for checkout
            </p>
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
            <ProductEntry />
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
    </div>
  )
}
