import { formatCurrency } from '@renderer/lib/calculations'
import { useSettingsStore } from '@renderer/stores/settingsStore'

interface CartTotalsProps {
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  vatRate: string
}

export function CartTotals({
  subtotal,
  discountAmount,
  taxAmount,
  total,
  vatRate
}: CartTotalsProps): React.JSX.Element {
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal:</span>
        <span className="font-medium">{formatCurrency(subtotal, currencySymbol)}</span>
      </div>

      {discountAmount > 0 && (
        <div className="flex justify-between text-sm text-green-600">
          <span>Discount:</span>
          <span className="font-medium">-{formatCurrency(discountAmount, currencySymbol)}</span>
        </div>
      )}

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Tax ({vatRate}%):</span>
        <span className="font-medium">{formatCurrency(taxAmount, currencySymbol)}</span>
      </div>

      <div className="flex justify-between text-lg font-bold border-t pt-2">
        <span>Total:</span>
        <span>{formatCurrency(total, currencySymbol)}</span>
      </div>
    </div>
  )
}
