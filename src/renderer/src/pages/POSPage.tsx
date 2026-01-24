export function POSPage(): React.JSX.Element {
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
            <div className="p-4 border rounded-lg bg-muted/20">
              <p className="text-sm text-muted-foreground">
                Product Entry Component - Coming soon
              </p>
            </div>
          </div>

          {/* Quick Items Section */}
          <div className="flex-1 flex flex-col space-y-2 min-h-0">
            <h2 className="text-sm font-semibold">Quick Items</h2>
            <div className="flex-1 p-4 border rounded-lg bg-muted/20 overflow-auto">
              <p className="text-sm text-muted-foreground">
                Quick Items Grid - Coming soon
              </p>
            </div>
          </div>
        </div>

        {/* Right Side - Shopping Cart */}
        <div className="flex-1 flex flex-col p-4">
          <h2 className="text-sm font-semibold mb-2">Shopping Cart</h2>
          <div className="flex-1 flex flex-col border rounded-lg bg-muted/20 p-4">
            <div className="flex-1 overflow-auto mb-4">
              <p className="text-sm text-muted-foreground">
                Cart Items - Coming soon
              </p>
            </div>

            {/* Cart Footer - Totals & Actions */}
            <div className="space-y-4 border-t pt-4">
              {/* Totals */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium">Rs. 0.00</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Tax (18%):</span>
                  <span className="font-medium">Rs. 0.00</span>
                </div>
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>Rs. 0.00</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  className="flex-1 px-4 py-2 text-sm border rounded-md hover:bg-muted"
                  disabled
                >
                  Hold (F4)
                </button>
                <button
                  className="flex-1 px-4 py-2 text-sm border rounded-md hover:bg-muted"
                  disabled
                >
                  Clear (F8)
                </button>
                <button
                  className="flex-1 px-4 py-3 text-base font-semibold bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                  disabled
                >
                  Pay Now (F9)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
