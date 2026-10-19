import { useEffect } from 'react'
import { Package } from 'lucide-react'
import { useProductStore } from '@renderer/stores/productStore'
import { usePOSStore } from '@renderer/stores/posStore'
import { StockBadge } from '@renderer/components/common/product-option'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { formatCurrency } from '@renderer/lib/calculations'

interface QuickItemsProps {
  refreshTrigger?: number
}

export function QuickItems({ refreshTrigger }: QuickItemsProps = {}): React.JSX.Element {
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)
  const quickItems = useProductStore((state) => state.quickItems)
  const setQuickItems = useProductStore((state) => state.setQuickItems)
  const addItem = usePOSStore((state) => state.addItem)

  // Load quick items on mount and whenever a sale completes (refreshTrigger changes)
  useEffect(() => {
    const loadQuickItems = async (): Promise<void> => {
      try {
        const items = await window.electron.getQuickItems()
        setQuickItems(items)
      } catch (err) {
        console.error('Failed to load quick items:', err)
      }
    }
    void loadQuickItems()
  }, [refreshTrigger, setQuickItems])

  const handleQuickAdd = (product: (typeof quickItems)[0]): void => {
    if (!product.total_stock || product.total_stock === 0) {
      return // Silently ignore out-of-stock items
    }
    addItem(product, 1)
  }

  if (quickItems.length === 0) {
    return (
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Package />
          </EmptyMedia>
          <EmptyTitle>No quick items yet</EmptyTitle>
          <EmptyDescription>Best-selling products appear here after a few sales.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(13.5rem,1fr))] content-start gap-3">
      {quickItems.map((product) => {
        const out = !product.total_stock || product.total_stock === 0
        return (
          <button
            key={product.id}
            type="button"
            onClick={() => handleQuickAdd(product)}
            disabled={out}
            className="group flex h-28 touch-manipulation flex-col items-start justify-between rounded-xl border bg-card p-3 text-left shadow-xs transition-all hover:border-primary/40 hover:bg-accent/40 active:scale-[0.97] active:bg-accent disabled:opacity-50"
          >
            <div className="w-full min-w-0">
              <p className="line-clamp-2 text-base leading-tight font-semibold">{product.name}</p>
              {product.generic_name && (
                <p className="mt-0.5 truncate text-sm text-muted-foreground">
                  {product.generic_name}
                </p>
              )}
            </div>
            <div className="flex w-full items-end justify-between gap-2">
              <span className="text-base font-bold whitespace-nowrap tabular-nums">
                {formatCurrency(product.unit_price, currencySymbol)}
              </span>
              <StockBadge stock={product.total_stock} />
            </div>
          </button>
        )
      })}
    </div>
  )
}
