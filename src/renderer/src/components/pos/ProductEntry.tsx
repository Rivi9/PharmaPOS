import { useState, useRef, useEffect } from 'react'
import { Search, AlertTriangle } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { usePOSStore } from '@renderer/stores/posStore'
import { SearchModal } from './SearchModal'

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
  const [error, setError] = useState('')
  const [expiryWarning, setExpiryWarning] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const addItem = usePOSStore((state) => state.addItem)

  // Use external control if provided, otherwise use internal state
  const searchOpen = externalSearchOpen !== undefined ? externalSearchOpen : internalSearchOpen
  const setSearchOpen = onSearchOpenChange || setInternalSearchOpen

  // Auto-focus on mount and after scan
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!barcode.trim()) return

    setError('')
    setExpiryWarning('')

    try {
      const product = await window.electron.getProductByBarcode(barcode.trim())

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
          setExpiryWarning(`⚠ ${product.name} expires in ${days} day${days === 1 ? '' : 's'} (${product.nearest_expiry})`)
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
          <Input
            ref={inputRef}
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="Scan or enter barcode..."
            className="flex-1 h-12 text-base"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setSearchOpen(true)}
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
        onSelect={(product) => {
          // Check near-expiry when selecting via search
          setExpiryWarning('')
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
