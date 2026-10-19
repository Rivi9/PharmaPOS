import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { QuantityStepper } from '@renderer/components/common/number-input'
import type { CartItem as CartItemType } from '@renderer/lib/types'
import { formatCurrency } from '@renderer/lib/calculations'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { daysUntil } from '../../../../shared/dates'

/**
 * L9: `new Date('2026-03-15')` parses as UTC midnight, which compared against
 * local midnight made every countdown a day optimistic — so "expires today"
 * never appeared, on the one day it matters most. `daysUntil` compares local
 * calendar dates.
 */
function getDaysUntilExpiry(expiryDate: string): number {
  return daysUntil(expiryDate) ?? 0
}

interface CartItemProps {
  item: CartItemType
  index: number
  onUpdateQuantity: (index: number, quantity: number) => void
  onRemove: (index: number) => void
}

export function CartItem({
  item,
  index,
  onUpdateQuantity,
  onRemove
}: CartItemProps): React.JSX.Element {
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)
  const maxStock =
    item.product.total_stock != null ? Math.max(0, Math.floor(item.product.total_stock)) : undefined
  const days = item.product.nearest_expiry ? getDaysUntilExpiry(item.product.nearest_expiry) : null

  return (
    <div className="flex items-center gap-3 border-b py-3 last:border-b-0">
      {/* Product Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold">{item.product.name}</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <span className="truncate text-sm text-muted-foreground tabular-nums">
            {formatCurrency(item.unit_price, currencySymbol)} each
            {item.product.generic_name ? ` · ${item.product.generic_name}` : ''}
          </span>
          {days !== null && days <= 0 && (
            <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
              Expired
            </Badge>
          )}
          {days !== null && days > 0 && days <= 30 && (
            <Badge variant="outline" className="border-warning/30 bg-warning-muted text-warning">
              Expires in {days}d
            </Badge>
          )}
        </div>
      </div>

      {/* The store clamps to available stock; the toast says why the number stopped. */}
      <QuantityStepper
        value={item.quantity}
        max={maxStock}
        onChange={(qty) => onUpdateQuantity(index, qty)}
        onExceedMax={() =>
          toast.warning(`Only ${maxStock} ${item.product.name} in stock`, { id: `limit-${item.product.id}` })
        }
        aria-label={`Quantity of ${item.product.name}`}
      />

      {/* Line total */}
      <p className="w-28 shrink-0 text-right text-lg font-semibold tabular-nums">
        {formatCurrency(item.line_total, currencySymbol)}
      </p>

      <Button
        size="icon"
        variant="ghost"
        className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive active:bg-destructive/20"
        onClick={() => onRemove(index)}
        aria-label={`Remove ${item.product.name}`}
      >
        <Trash2 />
      </Button>
    </div>
  )
}
