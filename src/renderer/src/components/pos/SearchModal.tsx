import { useState, useEffect, useRef } from 'react'
import { PackageSearchIcon } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { SearchInput } from '@renderer/components/common/search-input'
import { ProductOption } from '@renderer/components/common/product-option'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import type { Product } from '@renderer/lib/types'
import { cn } from '@renderer/lib/utils'

interface SearchModalProps {
  open: boolean
  onClose: () => void
  onSelect: (product: Product) => void
  initialQuery?: string
}

/**
 * Full-height product list (F2 / Browse): the same ranked search as the till
 * box, with room for 50 results and big rows.
 */
export function SearchModal({
  open,
  onClose,
  onSelect,
  initialQuery
}: SearchModalProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [answered, setAnswered] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input when modal opens; pre-fill query if provided
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery(initialQuery ?? '')
      setResults([])
      setAnswered(null)
    }
  }, [open, initialQuery])

  // Same staleness guard as ProductEntry (M3): a response for an older query
  // must never replace the results for the current one.
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setAnswered(null)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const products = await window.electron.searchProducts(q, 50)
        if (!cancelled) {
          setResults(products)
          setAnswered(q)
        }
      } catch (err) {
        if (!cancelled) console.error('Search error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const trimmed = query.trim()

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[85vh] max-w-3xl flex-col gap-4 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Find a product</DialogTitle>
          <DialogDescription>
            Name, generic name, SKU or barcode — words in any order. Tap a product to add it.
          </DialogDescription>
        </DialogHeader>

        <SearchInput
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          loading={loading}
          placeholder="e.g. azithro 500"
          className="h-14 max-w-none rounded-xl text-lg"
        />

        <ScrollArea className="min-h-0 flex-1 rounded-xl border">
          {!trimmed && (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageSearchIcon />
                </EmptyMedia>
                <EmptyTitle>Start typing to search</EmptyTitle>
                <EmptyDescription>Results update as you type.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {trimmed && answered === trimmed && results.length === 0 && (
            <Empty className="py-16">
              <EmptyHeader>
                <EmptyTitle>No products match &ldquo;{trimmed}&rdquo;</EmptyTitle>
                <EmptyDescription>Check the spelling, or try the generic name.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <div className="divide-y">
            {results.map((product) => {
              const out = !product.total_stock || product.total_stock <= 0
              return (
                <button
                  key={product.id}
                  type="button"
                  // click, not pointerdown: scrolling the list must not add items.
                  onClick={() => onSelect(product)}
                  disabled={out}
                  className={cn(
                    'flex min-h-18 w-full touch-manipulation items-center px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-accent',
                    out && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <ProductOption product={product} query={trimmed} />
                </button>
              )
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
