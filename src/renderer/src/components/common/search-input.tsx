import * as React from 'react'
import { SearchIcon, XIcon } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from '@renderer/components/ui/input-group'
import { Spinner } from '@renderer/components/ui/spinner'
import { cn } from '@renderer/lib/utils'

/**
 * Filter box for tables and lists (no dropdown — the table below is the result).
 * Same look as SearchCombobox so every search in the app reads the same, with a
 * 40px clear button instead of the old "select all and delete" on a touchscreen.
 */
export interface SearchInputProps extends Omit<React.ComponentProps<'input'>, 'onChange' | 'value' | 'size'> {
  value: string
  onValueChange: (value: string) => void
  loading?: boolean
  className?: string
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, loading, className, placeholder = 'Search…', ...props },
  ref
) {
  const innerRef = React.useRef<HTMLInputElement>(null)
  React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)
  return (
    <InputGroup className={cn('max-w-md', className)}>
      <InputGroupAddon>
        <SearchIcon className="size-5 text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput
        ref={innerRef}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="[&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      <InputGroupAddon align="inline-end">
        {loading && <Spinner className="size-5 text-muted-foreground" />}
        {value && (
          <InputGroupButton
            size="icon-sm"
            aria-label="Clear search"
            onClick={() => {
              onValueChange('')
              innerRef.current?.focus()
            }}
          >
            <XIcon className="size-5" />
          </InputGroupButton>
        )}
      </InputGroupAddon>
    </InputGroup>
  )
})
