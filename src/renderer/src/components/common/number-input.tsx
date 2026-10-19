import * as React from 'react'
import { Minus, Plus } from 'lucide-react'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

/**
 * Numeric field for the touchscreen.
 *
 * `<input type="number">` cannot be given a caret position — `setSelectionRange`
 * throws on it — so a tap left the caret wherever the finger landed, often
 * before the digits, and typing "5" into "1" gave "51" or "15" at random. This
 * is a text input with a numeric keypad hint that always puts the caret at the
 * end on focus and on every tap, and only accepts digits (and one decimal point
 * when `decimal`).
 *
 * The value is a string, like a native input; parse it at the call site.
 */
export interface NumberInputProps extends Omit<
  React.ComponentProps<'input'>,
  'type' | 'inputMode' | 'onChange' | 'value'
> {
  value: string | number
  onValueChange: (value: string) => void
  /** Allow one decimal point (money, fractional stock). */
  decimal?: boolean
  /** Allow a leading minus (stock adjustments). */
  allowNegative?: boolean
}

function caretToEnd(el: HTMLInputElement): void {
  // After the browser has placed the caret from the tap.
  requestAnimationFrame(() => {
    const end = el.value.length
    try {
      el.setSelectionRange(end, end)
    } catch {
      // Not focusable any more (unmounted between frames).
    }
  })
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      value,
      onValueChange,
      decimal = false,
      allowNegative = false,
      className,
      onFocus,
      onPointerUp,
      ...props
    },
    ref
  ) {
    const pattern = React.useMemo(
      () => new RegExp(`^${allowNegative ? '-?' : ''}\\d*${decimal ? '(\\.\\d*)?' : ''}$`),
      [decimal, allowNegative]
    )

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={decimal ? 'decimal' : 'numeric'}
        autoComplete="off"
        value={value}
        onChange={(e) => {
          const next = e.target.value.replace(/,/g, '')
          if (pattern.test(next)) onValueChange(next)
        }}
        onFocus={(e) => {
          caretToEnd(e.currentTarget)
          onFocus?.(e)
        }}
        onPointerUp={(e) => {
          caretToEnd(e.currentTarget)
          onPointerUp?.(e)
        }}
        className={cn('tabular-nums', className)}
        {...props}
      />
    )
  }
)

export interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  size?: 'default' | 'lg'
  className?: string
  'aria-label'?: string
  /** Typed or stepped past `max`; the value is held at max. */
  onExceedMax?: (attempted: number) => void
}

/**
 * − [qty] + for the cart and stock screens. Typing is allowed in the middle box;
 * an empty or out-of-range entry snaps back to the last valid value on blur.
 */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max,
  size = 'default',
  className,
  'aria-label': ariaLabel = 'Quantity',
  onExceedMax
}: QuantityStepperProps): React.JSX.Element {
  const [draft, setDraft] = React.useState(String(value))
  React.useEffect(() => setDraft(String(value)), [value])

  const clamp = (n: number): number => Math.max(min, max !== undefined ? Math.min(max, n) : n)
  const commit = (raw: string): void => {
    const n = parseInt(raw, 10)
    if (Number.isNaN(n)) {
      setDraft(String(value))
      return
    }
    const next = clamp(n)
    if (max !== undefined && n > max) onExceedMax?.(n)
    setDraft(String(next))
    if (next !== value) onChange(next)
  }

  const big = size === 'lg'
  return (
    <div
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-lg border bg-background',
        className
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size={big ? 'icon-lg' : 'icon'}
        className="rounded-none"
        aria-label="Decrease"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus />
      </Button>
      <NumberInput
        aria-label={ariaLabel}
        value={draft}
        onValueChange={(raw) => {
          setDraft(raw)
          const n = parseInt(raw, 10)
          // Apply as they type so totals follow; clamping waits for blur so
          // "1" on the way to "12" is not rejected against a max of 10.
          if (Number.isNaN(n) || n < min) return
          if (max !== undefined && n > max) onExceedMax?.(n)
          onChange(max !== undefined ? Math.min(max, n) : n)
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className={cn(
          'rounded-none border-0 border-x text-center font-semibold shadow-none focus-visible:ring-0',
          big ? 'h-14 w-20 text-xl' : 'h-12 w-16 text-lg'
        )}
      />
      <Button
        type="button"
        variant="ghost"
        size={big ? 'icon-lg' : 'icon'}
        className="rounded-none"
        aria-label="Increase"
        disabled={max !== undefined && value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus />
      </Button>
    </div>
  )
}
