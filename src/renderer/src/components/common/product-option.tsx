import { Badge } from '@renderer/components/ui/badge'
import { HighlightMatch } from './search-combobox'
import { formatCurrency } from '@renderer/lib/calculations'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { daysUntil } from '../../../../shared/dates'
import type { Product } from '@renderer/lib/types'

/** Stock badge with the shop's thresholds: out, low (< 10), in stock. */
export function StockBadge({ stock }: { stock: number | undefined }): React.JSX.Element {
  const n = stock ?? 0
  if (n <= 0)
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-destructive">
        Out of stock
      </Badge>
    )
  if (n < 10)
    return (
      <Badge variant="outline" className="border-warning/30 bg-warning-muted text-warning">
        {n} left
      </Badge>
    )
  return (
    <Badge variant="outline" className="border-success/30 bg-success-muted text-success">
      {n} in stock
    </Badge>
  )
}

/** One product row in a SearchCombobox: name, generic · SKU, price, stock, expiry. */
export function ProductOption({
  product,
  query,
  showPrice = true
}: {
  product: Product
  query: string
  showPrice?: boolean
}): React.JSX.Element {
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)
  const days = product.nearest_expiry ? daysUntil(product.nearest_expiry) : null
  const meta = [product.generic_name, product.sku].filter(Boolean).join(' · ')

  return (
    <div className="flex w-full min-w-0 items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium">
          <HighlightMatch text={product.name} query={query} />
        </p>
        {meta && (
          <p className="truncate text-sm text-muted-foreground">
            <HighlightMatch text={meta} query={query} />
          </p>
        )}
      </div>
      {days !== null && days <= 30 && (
        <Badge
          variant="outline"
          className={
            days <= 0
              ? 'border-destructive/30 bg-destructive/10 text-destructive'
              : 'border-warning/30 bg-warning-muted text-warning'
          }
        >
          {days <= 0 ? 'Expired' : `Exp ${days}d`}
        </Badge>
      )}
      <div className="flex shrink-0 flex-col items-end gap-1">
        {showPrice && (
          <span className="text-base font-semibold tabular-nums">
            {formatCurrency(product.unit_price, currencySymbol)}
          </span>
        )}
        <StockBadge stock={product.total_stock} />
      </div>
    </div>
  )
}
