import { AlertTriangle } from 'lucide-react'
import type { Product } from '@renderer/stores/inventoryStore'

interface LowStockAlertProps {
  lowStockProducts: Product[]
}

export function LowStockAlert({ lowStockProducts }: LowStockAlertProps) {
  if (lowStockProducts.length === 0) {
    return null
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="font-semibold text-orange-900 mb-2">
            Low Stock Alert ({lowStockProducts.length})
          </h3>
          <div className="space-y-1">
            {lowStockProducts.slice(0, 5).map((product) => (
              <div key={product.id} className="text-sm text-orange-800">
                <span className="font-medium">{product.name}</span>
                {product.sku && <span className="text-orange-600"> ({product.sku})</span>} -
                <span className="font-semibold text-red-600 ml-1">
                  {product.total_stock || 0} {product.unit}
                </span>
                <span className="text-orange-600 ml-1">(reorder at {product.reorder_level})</span>
              </div>
            ))}
            {lowStockProducts.length > 5 && (
              <div className="text-sm text-orange-600 mt-2">
                and {lowStockProducts.length - 5} more products...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
