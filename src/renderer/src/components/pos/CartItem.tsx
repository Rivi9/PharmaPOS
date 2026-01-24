import { Minus, Plus, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import type { CartItem as CartItemType } from '@renderer/lib/types'
import { formatCurrency } from '@renderer/lib/calculations'

interface CartItemProps {
  item: CartItemType
  index: number
  onUpdateQuantity: (index: number, quantity: number) => void
  onRemove: (index: number) => void
}

export function CartItem({ item, index, onUpdateQuantity, onRemove }: CartItemProps): React.JSX.Element {
  const handleQuantityChange = (delta: number) => {
    const newQty = item.quantity + delta
    if (newQty < 1) return
    onUpdateQuantity(index, newQty)
  }

  const handleManualQuantityChange = (value: string) => {
    const qty = parseInt(value, 10)
    if (isNaN(qty) || qty < 1) return
    onUpdateQuantity(index, qty)
  }

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg bg-card">
      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.product.name}</p>
        {item.product.generic_name && (
          <p className="text-xs text-muted-foreground truncate">
            {item.product.generic_name}
          </p>
        )}
      </div>

      {/* Quantity Controls */}
      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          onClick={() => handleQuantityChange(-1)}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Input
          type="number"
          value={item.quantity}
          onChange={(e) => handleManualQuantityChange(e.target.value)}
          className="w-16 h-8 text-center"
          min="1"
        />
        <Button
          size="icon"
          variant="outline"
          className="h-8 w-8"
          onClick={() => handleQuantityChange(1)}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Price */}
      <div className="text-right w-24">
        <p className="text-xs text-muted-foreground">
          @ {formatCurrency(item.unit_price)}
        </p>
        <p className="font-semibold">
          {formatCurrency(item.line_total)}
        </p>
      </div>

      {/* Remove Button */}
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={() => onRemove(index)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
