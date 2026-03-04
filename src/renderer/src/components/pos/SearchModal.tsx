import { useState, useEffect, useRef } from 'react'
import { Search, Package } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import type { Product } from '@renderer/lib/types'

interface SearchModalProps {
  open: boolean
  onClose: () => void
  onSelect: (product: Product) => void
  initialQuery?: string
}

export function SearchModal({
  open,
  onClose,
  onSelect,
  initialQuery
}: SearchModalProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when modal opens; pre-fill query if provided
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setQuery(initialQuery ?? '')
      setResults([])
    }
  }, [open, initialQuery])

  // Search on query change (debounced)
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const products = await window.electron.searchProducts(query.trim())
        setResults(products)
      } catch (err) {
        console.error('Search error:', err)
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const handleSelect = (product: Product) => {
    onSelect(product)
  }

  const getStockColor = (stock: number | undefined): string => {
    if (!stock || stock === 0) return 'text-destructive'
    if (stock < 10) return 'text-amber-600'
    return 'text-green-600'
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">Search Products</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input — tall for touch */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, generic name, barcode, or SKU..."
              className="pl-12 h-12 text-base"
            />
          </div>

          {/* Results — tall rows for touch */}
          <div className="min-h-[300px] max-h-[55vh] overflow-auto border rounded-lg">
            {loading && (
              <div className="p-8 text-center text-muted-foreground text-base">Searching...</div>
            )}

            {!loading && results.length === 0 && query && (
              <div className="p-8 text-center text-muted-foreground text-base">
                No products found for "{query}"
              </div>
            )}

            {!loading && results.length === 0 && !query && (
              <div className="p-8 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-base">Start typing to search products</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="divide-y">
                {results.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleSelect(product)}
                    disabled={!product.total_stock || product.total_stock === 0}
                    className="w-full p-5 text-left hover:bg-muted/50 active:bg-muted transition-colors min-h-[72px] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base truncate">{product.name}</p>
                        {product.generic_name && (
                          <p className="text-sm text-muted-foreground truncate mt-0.5">
                            {product.generic_name}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-1">
                          SKU: {product.sku}
                          {product.barcode && ` • ${product.barcode}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-base">Rs. {product.unit_price.toFixed(2)}</p>
                        <p
                          className={`text-sm font-medium mt-0.5 ${getStockColor(product.total_stock)}`}
                        >
                          {product.total_stock || 0} in stock
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-sm text-muted-foreground text-center">Tap a product to add to cart</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
