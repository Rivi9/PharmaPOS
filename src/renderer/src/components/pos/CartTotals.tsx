import { formatCurrency } from '@renderer/lib/calculations'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { Separator } from '@renderer/components/ui/separator'

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
    <div className="space-y-1.5 tabular-nums">
      <div className="flex justify-between text-base">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-medium">{formatCurrency(subtotal, currencySymbol)}</span>
      </div>

      {discountAmount > 0 && (
        <div className="flex justify-between text-base text-success">
          <span>Discount</span>
          <span className="font-medium">-{formatCurrency(discountAmount, currencySymbol)}</span>
        </div>
      )}

      {/* Prices include VAT, so this is a breakdown of the total — not an addition. */}
      {taxAmount > 0 && (
        <div className="flex justify-between text-base">
          <span className="text-muted-foreground">incl. VAT ({vatRate}%)</span>
          <span className="font-medium">{formatCurrency(taxAmount, currencySymbol)}</span>
        </div>
      )}

      <Separator className="my-2" />
      <div className="flex items-baseline justify-between">
        <span className="text-lg font-semibold">Total</span>
        <span className="text-3xl font-bold tracking-tight">
          {formatCurrency(total, currencySymbol)}
        </span>
      </div>
    </div>
  )
}
