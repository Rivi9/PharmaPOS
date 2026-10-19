import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { ListIcon } from 'lucide-react'
import { InputGroupButton } from '@renderer/components/ui/input-group'
import { SearchCombobox } from '@renderer/components/common/search-combobox'
import { ProductOption } from '@renderer/components/common/product-option'
import { usePOSStore } from '@renderer/stores/posStore'
import { SearchModal } from './SearchModal'
import type { Product } from '@renderer/lib/types'
import { daysUntil } from '../../../../shared/dates'

interface ProductEntryProps {
  searchOpen?: boolean
  onSearchOpenChange?: (open: boolean) => void
}

const SUGGESTION_LIMIT = 8

/** Expiry notice for a product that was just added; local calendar days (L9). */
function warnIfExpiring(product: Product): void {
  if (!product.nearest_expiry) return
  const days = daysUntil(product.nearest_expiry) ?? 0
  if (days <= 0) {
    toast.error(`${product.name} is EXPIRED`, { description: `Expiry ${product.nearest_expiry}` })
  } else if (days <= 30) {
    toast.warning(`${product.name} expires in ${days} day${days === 1 ? '' : 's'}`, {
      description: `Expiry ${product.nearest_expiry}`
    })
  }
}

export function ProductEntry({
  searchOpen: externalSearchOpen,
  onSearchOpenChange
}: ProductEntryProps = {}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [internalSearchOpen, setInternalSearchOpen] = useState(false)
  const [modalQuery, setModalQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const addItem = usePOSStore((state) => state.addItem)

  // Use external control if provided, otherwise use internal state
  const searchOpen = externalSearchOpen !== undefined ? externalSearchOpen : internalSearchOpen
  const setSearchOpen = onSearchOpenChange || setInternalSearchOpen

  // Auto-focus on mount and after scan
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  /** Every path into the cart goes through here: tap, scan, or the full search. */
  const addToCart = (product: Product): void => {
    setQuery('')
    if (!product.total_stock || product.total_stock <= 0) {
      toast.error(`${product.name} has no stock`)
      inputRef.current?.focus()
      return
    }
    warnIfExpiring(product)
    addItem(product, 1)
    inputRef.current?.focus()
  }

  /**
   * Enter without choosing a row: a scanner, or a typed code. Exact barcode is
   * the fast path; otherwise the ranked search decides — one hit (or an exact
   * SKU/barcode at rank 0) goes straight in, several open the full search list.
   */
  const handleSubmit = async (typed: string): Promise<void> => {
    try {
      const exact = await window.electron.getProductByBarcode(typed)
      if (exact) {
        addToCart(exact)
        return
      }
      const matches: (Product & { search_rank?: number })[] = await window.electron.searchProducts(
        typed,
        SUGGESTION_LIMIT
      )
      if (matches.length === 0) {
        toast.error(`Nothing matches "${typed}"`)
        setQuery('')
        return
      }
      if (matches.length === 1 || matches[0].search_rank === 0) {
        addToCart(matches[0])
        return
      }
      setModalQuery(typed)
      setQuery('')
      setSearchOpen(true)
    } catch (err) {
      toast.error((err as Error)?.message || 'Could not look that up')
    }
  }

  return (
    <>
      <SearchCombobox<Product>
        size="lg"
        inputRef={inputRef}
        query={query}
        onQueryChange={setQuery}
        // Two letters: one letter matches most of a catalogue and ranks nothing.
        minChars={2}
        fetchItems={(q) => window.electron.searchProducts(q, SUGGESTION_LIMIT)}
        getKey={(p) => p.id}
        renderItem={(p, q) => <ProductOption product={p} query={q} />}
        isItemDisabled={(p) => !p.total_stock || p.total_stock <= 0}
        onSelect={addToCart}
        onSubmit={(q) => void handleSubmit(q)}
        placeholder="Scan a barcode or type a product name"
        emptyText="No products match"
        footer={(items) =>
          items.length >= SUGGESTION_LIMIT ? 'Keep typing to narrow, or open the full list.' : null
        }
        trailing={
          <InputGroupButton
            size="sm"
            variant="secondary"
            className="h-10 gap-1.5 px-3"
            onClick={() => {
              setModalQuery(query)
              setSearchOpen(true)
            }}
          >
            <ListIcon className="size-5" />
            Browse
          </InputGroupButton>
        }
      />

      <SearchModal
        open={searchOpen}
        onClose={() => {
          setSearchOpen(false)
          inputRef.current?.focus()
        }}
        initialQuery={modalQuery}
        onSelect={(product) => {
          setSearchOpen(false)
          addToCart(product)
        }}
      />
    </>
  )
}
