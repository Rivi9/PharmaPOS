import { useEffect } from 'react'
import { Package } from 'lucide-react'
import { useProductStore } from '@renderer/stores/productStore'
import { usePOSStore } from '@renderer/stores/posStore'
import { Button } from '@renderer/components/ui/button'

export function QuickItems(): React.JSX.Element {
  const quickItems = useProductStore((state) => state.quickItems)
  const setQuickItems = useProductStore((state) => state.setQuickItems)
  const addItem = usePOSStore((state) => state.addItem)

  // Load quick items on mount
  useEffect(() => {
    loadQuickItems()
  }, [])

  const loadQuickItems = async () => {
    try {
      const items = await window.electron.getQuickItems()
      setQuickItems(items)
    } catch (err) {
      console.error('Failed to load quick items:', err)
    }
  }

  const handleQuickAdd = (product: (typeof quickItems)[0]) => {
    if (!product.total_stock || product.total_stock === 0) {
      return // Silently ignore out-of-stock items
    }
    addItem(product, 1)
  }

  const getStockIndicator = (stock: number | undefined): string => {
    if (!stock || stock === 0) return 'bg-destructive'
    if (stock < 10) return 'bg-amber-500'
    return 'bg-green-500'
  }

  if (quickItems.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No quick items available</p>
          <p className="text-xs mt-1">Best-selling products will appear here</p>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      {quickItems.map((product) => (
        <Button
          key={product.id}
          onClick={() => handleQuickAdd(product)}
          variant="outline"
          className="h-24 p-3 flex flex-col items-start gap-1.5 relative overflow-hidden"
          disabled={!product.total_stock || product.total_stock === 0}
        >
          {/* Stock indicator dot */}
          <div
            className={`absolute top-2 right-2 w-3 h-3 rounded-full ${getStockIndicator(product.total_stock)}`}
            title={`${product.total_stock || 0} in stock`}
          />

          {/* Product info */}
          <div className="w-full text-left">
            <p className="font-semibold text-sm line-clamp-2 pr-4 leading-tight">{product.name}</p>
            {product.generic_name && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {product.generic_name}
              </p>
            )}
          </div>

          {/* Price */}
          <div className="w-full flex items-end justify-between mt-auto">
            <span className="font-bold">Rs. {product.unit_price.toFixed(2)}</span>
            <span className="text-xs text-muted-foreground">{product.total_stock || 0}</span>
          </div>
        </Button>
      ))}
    </div>
  )
}
