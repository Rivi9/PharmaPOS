import { useEffect, useState } from 'react'
import { Minus, Plus, X, AlertTriangle } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
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
  const [limitNotice, setLimitNotice] = useState('')
  const maxStock =
    item.product.total_stock != null ? Math.max(0, Math.floor(item.product.total_stock)) : undefined
  const isAtStockLimit = maxStock !== undefined && item.quantity >= maxStock

  // The store clamps the quantity to available stock; without this the value just
  // snaps back and the cashier has no idea why.
  useEffect(() => {
    if (!limitNotice) return
    const timer = setTimeout(() => setLimitNotice(''), 2500)
    return () => clearTimeout(timer)
  }, [limitNotice])

  const handleQuantityChange = (delta: number) => {
    const newQty = item.quantity + delta
    if (newQty < 1) return
    onUpdateQuantity(index, newQty)
  }

  const handleManualQuantityChange = (value: string) => {
    const qty = parseInt(value, 10)
    if (isNaN(qty) || qty < 1) return
    setLimitNotice(maxStock !== undefined && qty > maxStock ? `Only ${maxStock} in stock` : '')
    onUpdateQuantity(index, qty)
  }

  return (
    <div className="flex items-center gap-2 py-2 border-b last:border-b-0">
      {/* Product Info */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{item.product.name}</p>
        {item.product.generic_name && (
          <p className="text-xs text-muted-foreground truncate">{item.product.generic_name}</p>
        )}
        {item.product.nearest_expiry &&
          (() => {
            const days = getDaysUntilExpiry(item.product.nearest_expiry!)
            if (days <= 0) {
              return (
                <p className="text-sm text-red-600 flex items-center gap-1 mt-0.5 font-medium">
                  <AlertTriangle className="h-4 w-4" /> EXPIRED
                </p>
              )
            }
            if (days <= 30) {
              return (
                <p className="text-sm text-orange-500 flex items-center gap-1 mt-0.5">
                  <AlertTriangle className="h-4 w-4" /> Expires in {days}d
                </p>
              )
            }
            return null
          })()}
        {limitNotice && <p className="text-sm text-amber-600 mt-0.5 font-medium">{limitNotice}</p>}
      </div>

      {/* Quantity Controls */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9"
          onClick={() => handleQuantityChange(-1)}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input
          type="number"
          value={item.quantity}
          onChange={(e) => handleManualQuantityChange(e.target.value)}
          className="w-16 h-9 text-center text-sm"
          min="1"
          max={maxStock}
        />
        <Button
          size="icon"
          variant="outline"
          className="h-9 w-9"
          onClick={() => handleQuantityChange(1)}
          disabled={isAtStockLimit}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Price */}
      <div className="text-right w-20 shrink-0">
        <p className="text-xs text-muted-foreground">
          @ {formatCurrency(item.unit_price, currencySymbol)}
        </p>
        <p className="text-sm font-semibold">{formatCurrency(item.line_total, currencySymbol)}</p>
      </div>

      {/* Remove Button */}
      <Button
        size="icon"
        variant="ghost"
        className="h-11 w-11 text-destructive hover:text-destructive hover:bg-destructive/10 active:bg-destructive/20 shrink-0"
        onClick={() => onRemove(index)}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
