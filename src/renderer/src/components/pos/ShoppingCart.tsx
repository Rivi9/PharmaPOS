import { ShoppingCart as ShoppingCartIcon } from 'lucide-react'
import { usePOSStore } from '@renderer/stores/posStore'
import { CartItem } from './CartItem'
import { CartTotals } from './CartTotals'
import { CartActions } from './CartActions'

interface ShoppingCartProps {
  onPayment: () => void
}

export function ShoppingCart({ onPayment }: ShoppingCartProps): React.JSX.Element {
  const items = usePOSStore((state) => state.items)
  const heldSale = usePOSStore((state) => state.heldSale)
  const updateQuantity = usePOSStore((state) => state.updateQuantity)
  const removeItem = usePOSStore((state) => state.removeItem)
  const clearCart = usePOSStore((state) => state.clearCart)
  const holdCurrentSale = usePOSStore((state) => state.holdCurrentSale)
  const recallHeldSale = usePOSStore((state) => state.recallHeldSale)

  // Computed totals
  const subtotal = usePOSStore((state) => state.subtotal())
  const discountAmount = usePOSStore((state) => state.discountAmount())
  const taxAmount = usePOSStore((state) => state.taxAmount())
  const total = usePOSStore((state) => state.total())

  const hasItems = items.length > 0
  const hasHeldSale = heldSale !== null

  return (
    <div className="flex-1 flex flex-col border rounded-lg bg-card p-4">
      {/* Cart Items List */}
      <div className="flex-1 overflow-auto mb-4">
        {items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <ShoppingCartIcon className="h-16 w-16 mx-auto mb-3 opacity-50" />
              <p className="font-medium">Cart is empty</p>
              <p className="text-sm mt-1">Scan or search for products to begin</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, index) => (
              <CartItem
                key={`${item.product.id}-${index}`}
                item={item}
                index={index}
                onUpdateQuantity={updateQuantity}
                onRemove={removeItem}
              />
            ))}
          </div>
        )}
      </div>

      {/* Cart Footer - Totals & Actions */}
      <div className="space-y-4 border-t pt-4">
        {/* Totals */}
        <CartTotals
          subtotal={subtotal}
          discountAmount={discountAmount}
          taxAmount={taxAmount}
          total={total}
        />

        {/* Actions */}
        <CartActions
          hasItems={hasItems}
          hasHeldSale={hasHeldSale}
          onHold={holdCurrentSale}
          onRecall={recallHeldSale}
          onClear={clearCart}
          onPayment={onPayment}
        />
      </div>
    </div>
  )
}
