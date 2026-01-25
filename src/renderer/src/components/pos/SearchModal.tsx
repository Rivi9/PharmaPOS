import { useState, useEffect, useRef } from 'react'
import { Search, Package } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import type { Product } from '@renderer/lib/types'

interface SearchModalProps {
  open: boolean
  onClose: () => void
  onSelect: (product: Product) => void
}

export function SearchModal({ open, onClose, onSelect }: SearchModalProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100)
      setQuery('')
      setResults([])
    }
  }, [open])

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
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Search Products</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, generic name, barcode, or SKU..."
              className="pl-10"
            />
          </div>

          {/* Results */}
          <div className="min-h-[300px] max-h-[400px] overflow-auto border rounded-lg">
            {loading && <div className="p-8 text-center text-muted-foreground">Searching...</div>}

            {!loading && results.length === 0 && query && (
              <div className="p-8 text-center text-muted-foreground">
                No products found for "{query}"
              </div>
            )}

            {!loading && results.length === 0 && !query && (
              <div className="p-8 text-center text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Start typing to search products</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="divide-y">
                {results.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => handleSelect(product)}
                    className="w-full p-4 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{product.name}</p>
                        {product.generic_name && (
                          <p className="text-sm text-muted-foreground truncate">
                            {product.generic_name}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          SKU: {product.sku}
                          {product.barcode && ` • Barcode: ${product.barcode}`}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-semibold">Rs. {product.unit_price.toFixed(2)}</p>
                        <p className={`text-sm font-medium ${getStockColor(product.total_stock)}`}>
                          {product.total_stock || 0} in stock
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Click a product to add to cart • ESC to close
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
