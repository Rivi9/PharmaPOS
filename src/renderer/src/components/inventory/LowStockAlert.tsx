import { TriangleAlert } from 'lucide-react'
import type { Product } from '@renderer/stores/inventoryStore'

interface LowStockAlertProps {
  lowStockProducts: Product[]
}

export function LowStockAlert({ lowStockProducts }: LowStockAlertProps): React.JSX.Element | null {
  if (lowStockProducts.length === 0) {
    return null
  }

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-muted px-4 py-3"
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold text-warning">Low Stock Alert ({lowStockProducts.length})</h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {lowStockProducts.slice(0, 5).map((product) => (
            <li
              key={product.id}
              className="rounded-lg border border-warning/20 bg-card px-3 py-1.5 text-sm text-foreground"
            >
              <span className="font-medium">{product.name}</span>
              {product.sku && <span className="text-muted-foreground"> ({product.sku})</span>}
              {' — '}
              <span className="font-semibold text-destructive tabular-nums">
                {product.total_stock || 0} {product.unit}
              </span>
              <span className="text-muted-foreground"> (reorder at {product.reorder_level})</span>
            </li>
          ))}
          {lowStockProducts.length > 5 && (
            <li className="self-center px-1 text-sm text-warning">
              and {lowStockProducts.length - 5} more products...
            </li>
          )}
        </ul>
      </div>
    </div>
  )
}
