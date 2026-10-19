import { ShoppingCart as ShoppingCartIcon } from 'lucide-react'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { Badge } from '@renderer/components/ui/badge'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { formatCurrency } from '@renderer/lib/calculations'
import { usePOSStore } from '@renderer/stores/posStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { CartItem } from './CartItem'
import { CartTotals } from './CartTotals'
import { CartActions } from './CartActions'

interface ShoppingCartProps {
  onPayment: () => void
  /** Lets the F8 shortcut open the same clear-confirmation dialog as the Clear button. */
  clearConfirmOpen?: boolean
  onClearConfirmOpenChange?: (open: boolean) => void
  /**
   * Owned by POSPage so the button and the F4 shortcut share one confirmation:
   * there is a single hold slot, and holding used to overwrite it silently (M1).
   */
  onHold: () => void
}

export function ShoppingCart({
  onPayment,
  clearConfirmOpen,
  onClearConfirmOpenChange,
  onHold
}: ShoppingCartProps): React.JSX.Element {
  const items = usePOSStore((state) => state.items)
  const heldSale = usePOSStore((state) => state.heldSale)
  const updateQuantity = usePOSStore((state) => state.updateQuantity)
  const removeItem = usePOSStore((state) => state.removeItem)
  const clearCart = usePOSStore((state) => state.clearCart)
  const recallHeldSale = usePOSStore((state) => state.recallHeldSale)

  // Computed totals
  const subtotal = usePOSStore((state) => state.subtotal())
  const discountAmount = usePOSStore((state) => state.discountAmount())
  const taxAmount = usePOSStore((state) => state.taxAmount())
  const total = usePOSStore((state) => state.total())
  const vatRate = useSettingsStore((state) => state.settings.vat_rate)
  const currencySymbol = useSettingsStore((state) => state.settings.currency_symbol)
  const unitCount = items.reduce((n, i) => n + i.quantity, 0)

  const hasItems = items.length > 0
  const hasHeldSale = heldSale !== null

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="flex items-center justify-between border-b px-5 py-3">
        <h2 className="text-lg font-semibold">Cart</h2>
        {hasItems && (
          <Badge variant="secondary" className="text-sm">
            {items.length} line{items.length === 1 ? '' : 's'} · {unitCount} item
            {unitCount === 1 ? '' : 's'}
          </Badge>
        )}
        {!hasItems && hasHeldSale && (
          <Badge variant="outline" className="border-info/30 bg-info-muted text-info">
            1 sale on hold
          </Badge>
        )}
      </div>

      {/* Cart Items List */}
      <ScrollArea className="min-h-0 flex-1">
        {items.length === 0 ? (
          <Empty className="h-full min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShoppingCartIcon />
              </EmptyMedia>
              <EmptyTitle>Cart is empty</EmptyTitle>
              <EmptyDescription>Scan a barcode or search for a product to begin.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="px-5">
            {items.map((item, index) => (
              <CartItem
                key={item.product.id}
                item={item}
                index={index}
                onUpdateQuantity={updateQuantity}
                onRemove={removeItem}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Cart Footer - Totals & Actions */}
      <div className="space-y-4 border-t bg-muted/30 px-5 py-4">
        {/* Totals */}
        <CartTotals
          subtotal={subtotal}
          discountAmount={discountAmount}
          taxAmount={taxAmount}
          total={total}
          vatRate={vatRate}
        />

        {/* Actions */}
        <CartActions
          hasItems={hasItems}
          hasHeldSale={hasHeldSale}
          onHold={onHold}
          onRecall={recallHeldSale}
          onClear={clearCart}
          onPayment={onPayment}
          payLabel={hasItems ? `Pay ${formatCurrency(total, currencySymbol)}` : 'Pay'}
          clearConfirmOpen={clearConfirmOpen}
          onClearConfirmOpenChange={onClearConfirmOpenChange}
        />
      </div>
    </div>
  )
}
