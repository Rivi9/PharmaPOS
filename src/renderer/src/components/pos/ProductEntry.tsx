import { useState, useRef, useEffect } from 'react'
import { Search } from 'lucide-react'
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
            className="flex-1"
          />
          <Button type="button" variant="outline" size="icon" onClick={() => setSearchOpen(true)}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground">F2 to search • Enter to add</p>
      </form>

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(product) => {
          addItem(product, 1)
          setSearchOpen(false)
          inputRef.current?.focus()
        }}
      />
    </>
  )
}
