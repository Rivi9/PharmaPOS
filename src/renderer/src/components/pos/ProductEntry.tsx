import { useState, useRef, useEffect } from 'react'
import { Search, AlertTriangle } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { usePOSStore } from '@renderer/stores/posStore'
import { SearchModal } from './SearchModal'
import type { Product } from '@renderer/lib/types'

interface ProductEntryProps {
  searchOpen?: boolean
  onSearchOpenChange?: (open: boolean) => void
}

export function ProductEntry({
  searchOpen: externalSearchOpen,
  onSearchOpenChange
}: ProductEntryProps = {}): React.JSX.Element {
  const [barcode, setBarcode] = useState('')
  const [internalSearchOpen, setInternalSearchOpen] = useState(false)
  const [modalQuery, setModalQuery] = useState('')
  const [error, setError] = useState('')
  const [expiryWarning, setExpiryWarning] = useState('')
  const [suggestions, setSuggestions] = useState<Product[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const addItem = usePOSStore((state) => state.addItem)

  // Use external control if provided, otherwise use internal state
  const searchOpen = externalSearchOpen !== undefined ? externalSearchOpen : internalSearchOpen
  const setSearchOpen = onSearchOpenChange || setInternalSearchOpen

  // Auto-focus on mount and after scan
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Debounced inline suggestions while typing
  useEffect(() => {
    if (barcode.trim().length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const results = await window.electron.searchProducts(barcode.trim())
        setSuggestions(results.slice(0, 6))
        setShowSuggestions(results.length > 0)
      } catch {
        setSuggestions([])
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [barcode])

  const handleSuggestionSelect = (product: Product) => {
    setShowSuggestions(false)
    setSuggestions([])
    setBarcode('')
    setError('')
    setExpiryWarning('')

    if (!product.total_stock || product.total_stock === 0) {
      setError('No stock available')
      inputRef.current?.focus()
      return
    }

    if (product.nearest_expiry) {
      const expiry = new Date(product.nearest_expiry)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (days <= 0) {
        setExpiryWarning(`⚠ ${product.name} is EXPIRED (${product.nearest_expiry})`)
      } else if (days <= 30) {
        setExpiryWarning(
          `⚠ ${product.name} expires in ${days} day${days === 1 ? '' : 's'} (${product.nearest_expiry})`
        )
      }
    }

    addItem(product, 1)
    inputRef.current?.focus()
  }

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcode.trim()) return

    setError('')
    setExpiryWarning('')
    setShowSuggestions(false)
    setSuggestions([])

    try {
      // First try exact barcode match (fast path for barcode scanners)
      let product = await window.electron.getProductByBarcode(barcode.trim())

      // Fallback: search by name/SKU so staff can also type product names
      if (!product) {
        const matches = await window.electron.searchProducts(barcode.trim())
        if (matches.length === 0) {
          setError('Product not found')
          setBarcode('')
          return
        }
        if (matches.length > 1) {
          // Multiple matches — open search modal pre-filled with the query
          setModalQuery(barcode.trim())
          setBarcode('')
          setSearchOpen(true)
          return
        }
        product = matches[0]
      }

      if (!product) {
        setError('Product not found')
        setBarcode('')
        return
      }

      // Check stock
      if (!product.total_stock || product.total_stock === 0) {
        setError('No stock available')
        setBarcode('')
        return
      }

      // Check near-expiry
      if (product.nearest_expiry) {
        const expiry = new Date(product.nearest_expiry)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        if (days <= 0) {
          setExpiryWarning(`⚠ ${product.name} is EXPIRED (${product.nearest_expiry})`)
        } else if (days <= 30) {
          setExpiryWarning(
            `⚠ ${product.name} expires in ${days} day${days === 1 ? '' : 's'} (${product.nearest_expiry})`
          )
        }
      }

      // Add to cart
      addItem(product, 1)

      // Clear and refocus
      setBarcode('')
      inputRef.current?.focus()
    } catch (err: any) {
      setError(err.message || 'Error loading product')
    }
  }

  return (
    <>
      <form onSubmit={handleBarcodeSubmit} className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              ref={inputRef}
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Scan or enter barcode..."
              className="h-12 text-base"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden">
                {suggestions.map((product) => {
                  const outOfStock = !product.total_stock || product.total_stock === 0
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={outOfStock}
                      onMouseDown={() => handleSuggestionSelect(product)}
                      className="w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 hover:bg-muted/60 active:bg-muted disabled:opacity-50 disabled:cursor-not-allowed border-b last:border-b-0"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{product.name}</p>
                        {product.generic_name && (
                          <p className="text-xs text-muted-foreground truncate">
                            {product.generic_name}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">
                          Rs. {product.unit_price.toFixed(2)}
                        </p>
                        <p
                          className={`text-xs ${outOfStock ? 'text-destructive' : product.total_stock! < 10 ? 'text-amber-600' : 'text-green-600'}`}
                        >
                          {product.total_stock || 0} in stock
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setShowSuggestions(false)
              setModalQuery('')
              setSearchOpen(true)
            }}
            className="h-12 w-12 shrink-0"
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>

        {error && <p className="text-base text-destructive">{error}</p>}
        {expiryWarning && (
          <p className="text-base text-orange-600 flex items-center gap-1">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            {expiryWarning}
          </p>
        )}
      </form>

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialQuery={modalQuery}
        onSelect={(product) => {
          setError('')
          setExpiryWarning('')

          // Block 0-stock products
          if (!product.total_stock || product.total_stock === 0) {
            setError('No stock available')
            setSearchOpen(false)
            return
          }

          // Check near-expiry when selecting via search
          if (product.nearest_expiry) {
            const expiry = new Date(product.nearest_expiry)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            if (days <= 0) {
              setExpiryWarning(`⚠ ${product.name} is EXPIRED (${product.nearest_expiry})`)
            } else if (days <= 30) {
              setExpiryWarning(`⚠ ${product.name} expires in ${days} day${days === 1 ? '' : 's'}`)
            }
          }
          addItem(product, 1)
          setSearchOpen(false)
          inputRef.current?.focus()
        }}
      />
    </>
  )
}
