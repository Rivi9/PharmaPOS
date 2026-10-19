import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { SearchIcon, XIcon } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from '@renderer/components/ui/popover'
import { CommandEmpty, CommandItem, CommandList } from '@renderer/components/ui/command'
import { InputGroup, InputGroupAddon, InputGroupButton } from '@renderer/components/ui/input-group'
import { Spinner } from '@renderer/components/ui/spinner'
import { cn } from '@renderer/lib/utils'
import { tokenize } from '../../../../shared/product-search'

/**
 * The one search-with-suggestions box used across the app (till, stock receive,
 * customer lookup). Built on shadcn Command (cmdk) + Popover.
 *
 * Touch rules it exists to enforce:
 *  - A row is chosen on `click`, never `pointerdown`. A finger that lands on the
 *    list to scroll it used to add whatever medicine was under it; the browser
 *    cancels the click when the touch turns into a pan, so scrolling is safe.
 *  - Rows are at least 56px tall and the list scrolls inside the popover with
 *    `overscroll-contain`, so a fling does not scroll the page behind it.
 *  - Results for an older query never replace the current one (M3).
 *
 * Keyboard: ↑/↓ move, Enter picks the highlighted row. Enter *without* having
 * moved calls `onSubmit` with the typed text — a barcode scanner types the code
 * and Enter faster than the suggestions arrive, and must not pick row one.
 */
export interface SearchComboboxProps<T> {
  query: string
  onQueryChange: (query: string) => void
  /** Called debounced with the trimmed query; resolve to the rows to show. */
  fetchItems: (query: string) => Promise<T[]>
  getKey: (item: T) => string
  renderItem: (item: T, query: string) => React.ReactNode
  onSelect: (item: T) => void
  /** Enter pressed without arrowing into the list. */
  onSubmit?: (query: string) => void
  isItemDisabled?: (item: T) => boolean
  /** 0 lists results for an empty box (browse); default 1. */
  minChars?: number
  debounceMs?: number
  placeholder?: string
  emptyText?: string
  /** Shown under the rows, e.g. "keep typing to narrow". */
  footer?: (items: T[]) => React.ReactNode
  /** Extra controls at the end of the box (e.g. an "all results" button). */
  trailing?: React.ReactNode
  size?: 'default' | 'lg'
  autoFocus?: boolean
  /** Select the text on focus so typing replaces a previous choice. */
  selectOnFocus?: boolean
  id?: string
  className?: string
  inputRef?: React.Ref<HTMLInputElement>
  'aria-invalid'?: boolean
}

export function SearchCombobox<T>({
  query,
  onQueryChange,
  fetchItems,
  getKey,
  renderItem,
  onSelect,
  onSubmit,
  isItemDisabled,
  minChars = 1,
  debounceMs = 120,
  placeholder = 'Search…',
  emptyText = 'No matches',
  footer,
  trailing,
  size = 'default',
  autoFocus,
  selectOnFocus,
  id,
  className,
  inputRef,
  'aria-invalid': ariaInvalid
}: SearchComboboxProps<T>): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<T[]>([])
  const [loading, setLoading] = React.useState(false)
  // The query the current `items` belong to, so "no matches" is never shown for
  // a query that has not been answered yet.
  const [answeredQuery, setAnsweredQuery] = React.useState<string | null>(null)
  const [highlight, setHighlight] = React.useState('')
  // Ref for the key handler (same event as the arrow press), state for styling.
  const navigated = React.useRef(false)
  const [isNavigating, setIsNavigating] = React.useState(false)
  const anchorRef = React.useRef<HTMLDivElement>(null)
  const localInputRef = React.useRef<HTMLInputElement>(null)
  React.useImperativeHandle(inputRef, () => localInputRef.current as HTMLInputElement)

  const trimmed = query.trim()
  const active = trimmed.length >= minChars

  React.useEffect(() => {
    navigated.current = false
    setIsNavigating(false)
    setHighlight('')
    if (!active) {
      setItems([])
      setAnsweredQuery(null)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(
      () => {
        fetchItems(trimmed)
          .then((rows) => {
            if (cancelled) return
            setItems(rows)
            setAnsweredQuery(trimmed)
          })
          .catch(() => {
            if (cancelled) return
            setItems([])
            setAnsweredQuery(trimmed)
          })
          .finally(() => {
            if (!cancelled) setLoading(false)
          })
      },
      trimmed ? debounceMs : 0
    )
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // fetchItems is usually an inline arrow; re-running on its identity would
    // refetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmed, active, debounceMs])

  const answered = answeredQuery === trimmed
  const showList = open && active && (items.length > 0 || answered)

  const choose = (item: T): void => {
    if (isItemDisabled?.(item)) return
    setOpen(false)
    onSelect(item)
  }

  const big = size === 'lg'
  const footerContent = footer && items.length > 0 ? footer(items) : null

  return (
    <CommandPrimitive
      shouldFilter={false}
      loop
      value={highlight}
      onValueChange={(v) => {
        // cmdk highlights row one on mount and rows under the pointer; that
        // highlight is only shown, and only used by Enter, once the user has
        // arrowed into the list — until then Enter means "submit what I typed".
        if (navigated.current) setHighlight(v)
      }}
      data-navigating={isNavigating}
      className={cn('group/search relative w-full', className)}
    >
      <Popover open={showList} onOpenChange={(o) => !o && setOpen(false)}>
        <PopoverAnchor asChild>
          <div ref={anchorRef}>
            <InputGroup className={cn(big && 'h-14 rounded-xl')}>
              <InputGroupAddon>
                <SearchIcon className={cn('text-muted-foreground', big ? 'size-6' : 'size-5')} />
              </InputGroupAddon>
              <CommandPrimitive.Input
                ref={localInputRef}
                id={id}
                data-slot="input-group-control"
                value={query}
                onValueChange={(v) => {
                  onQueryChange(v)
                  setOpen(true)
                }}
                onFocus={(e) => {
                  setOpen(true)
                  if (selectOnFocus) e.currentTarget.select()
                }}
                onClick={() => setOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    navigated.current = true
                    setIsNavigating(true)
                    setOpen(true)
                  } else if (e.key === 'Escape') {
                    setOpen(false)
                  } else if (e.key === 'Enter' && !(navigated.current && highlight)) {
                    // Stop cmdk from picking row one; the caller decides.
                    e.preventDefault()
                    if (trimmed) {
                      setOpen(false)
                      onSubmit?.(trimmed)
                    }
                  }
                }}
                placeholder={placeholder}
                autoFocus={autoFocus}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={ariaInvalid}
                className={cn(
                  'h-full flex-1 bg-transparent px-1 outline-hidden placeholder:text-muted-foreground',
                  big ? 'text-lg' : 'text-base'
                )}
              />
              <InputGroupAddon align="inline-end">
                {loading && <Spinner className="size-5 text-muted-foreground" />}
                {query && (
                  <InputGroupButton
                    size="icon-sm"
                    aria-label="Clear search"
                    onClick={() => {
                      onQueryChange('')
                      localInputRef.current?.focus()
                    }}
                  >
                    <XIcon className="size-5" />
                  </InputGroupButton>
                )}
                {trailing}
              </InputGroupAddon>
            </InputGroup>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="w-(--radix-popover-trigger-width) gap-0 overflow-hidden rounded-xl p-0"
          // Keep the caret in the box: the cashier may keep typing.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (anchorRef.current?.contains(e.target as Node)) e.preventDefault()
          }}
        >
          <CommandList className="max-h-[min(28rem,var(--radix-popover-content-available-height))] overscroll-contain p-1.5">
            {answered && items.length === 0 && <CommandEmpty>{emptyText}</CommandEmpty>}
            {items.map((item) => {
              const key = getKey(item)
              return (
                <CommandItem
                  key={key}
                  value={key}
                  disabled={isItemDisabled?.(item)}
                  onSelect={() => choose(item)}
                  // Mouse: don't pull focus out of the input.
                  onMouseDown={(e) => e.preventDefault()}
                  className="min-h-14 rounded-lg px-3 py-2 hover:bg-muted/60 active:bg-accent data-selected:bg-transparent group-data-[navigating=true]/search:data-selected:bg-accent group-data-[navigating=true]/search:data-selected:text-accent-foreground [&>svg:last-child]:hidden"
                >
                  {renderItem(item, trimmed)}
                </CommandItem>
              )
            })}
          </CommandList>
          {footerContent && (
            <div className="border-t bg-muted/40 px-4 py-2 text-sm text-muted-foreground">
              {footerContent}
            </div>
          )}
        </PopoverContent>
      </Popover>
    </CommandPrimitive>
  )
}

/** Bold the parts of `text` that start with a search word, as the ranking does. */
export function HighlightMatch({
  text,
  query
}: {
  text: string
  query: string
}): React.JSX.Element {
  const tokens = tokenize(query)
  if (!tokens.length || !text) return <>{text}</>
  const escaped = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const re = new RegExp(`(${escaped.join('|')})`, 'ig')
  const parts = text.split(re)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-transparent font-semibold text-primary">
            {part}
          </mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  )
}
