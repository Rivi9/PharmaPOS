import * as React from 'react'
import { format } from 'date-fns'
import { CalendarIcon, XIcon } from 'lucide-react'
import { NumberInput } from '@renderer/components/common/number-input'
import { Button } from '@renderer/components/ui/button'
import { Calendar } from '@renderer/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'
import { localDateString } from '../../../../shared/dates'

/** Same rule as `valueAsNumber`: an empty box is NaN, not 0. */
function parseNumber(raw: string): number {
  return raw.trim() === '' ? NaN : Number(raw)
}

function sameNumber(a: number, b: number): boolean {
  return a === b || (Number.isNaN(a) && Number.isNaN(b))
}

function toDraft(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

export interface FormNumberInputProps extends Omit<
  React.ComponentProps<typeof NumberInput>,
  'value' | 'onValueChange' | 'onChange'
> {
  value: number | null | undefined
  /** Receives a number, or NaN for an empty box — what `valueAsNumber` gave. */
  onChange: (value: number) => void
}

/**
 * NumberInput for a react-hook-form `Controller` whose field holds a number.
 *
 * The typed text is kept as a local draft so "12." or "0.0" survive while the
 * operator is still typing; rebuilding the text from the number on every
 * keystroke would swallow the decimal point. The draft only resyncs when the
 * form changes the value itself (reset, edit another row).
 */
export const FormNumberInput = React.forwardRef<HTMLInputElement, FormNumberInputProps>(
  function FormNumberInput({ value, onChange, ...props }, ref) {
    const numeric = typeof value === 'number' ? value : NaN
    const [draft, setDraft] = React.useState(() => toDraft(value))
    // Resync during render (not in an effect) when the value moved without us.
    const [lastValue, setLastValue] = React.useState(numeric)
    if (!sameNumber(lastValue, numeric)) {
      setLastValue(numeric)
      if (!sameNumber(parseNumber(draft), numeric)) setDraft(toDraft(value))
    }

    return (
      <NumberInput
        ref={ref}
        value={draft}
        onValueChange={(raw) => {
          setDraft(raw)
          const n = parseNumber(raw)
          setLastValue(n)
          onChange(n)
        }}
        {...props}
      />
    )
  }
)

/** `YYYY-MM-DD` → a local Date (never `new Date(str)`, which parses as UTC). */
function parseLocalDate(value: string | null | undefined): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '')
  if (!match) return undefined
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export interface DatePickerInputProps {
  id?: string
  /** `YYYY-MM-DD`, or '' / undefined for no date. */
  value: string | null | undefined
  /** Always a local `YYYY-MM-DD` string, or '' when cleared. */
  onChange: (value: string) => void
  placeholder?: string
  /** Show a clear button (for optional dates such as expiry). */
  clearable?: boolean
  /** Years either side of today offered in the year dropdown. */
  yearsBack?: number
  yearsAhead?: number
  'aria-invalid'?: boolean
  className?: string
}

/**
 * Touch date picker (Popover + Calendar) replacing `<input type="date">`, whose
 * tiny spin fields and native popup were unusable with a finger. It emits the
 * same `YYYY-MM-DD` strings the native input did, built from the local
 * calendar (M21) — never `toISOString()`, which is the UTC date.
 */
export function DatePickerInput({
  id,
  value,
  onChange,
  placeholder = 'Pick a date',
  clearable = false,
  yearsBack = 5,
  yearsAhead = 10,
  'aria-invalid': ariaInvalid,
  className
}: DatePickerInputProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false)
  const selected = parseLocalDate(value)
  const thisYear = new Date().getFullYear()

  return (
    <div className={cn('flex gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-invalid={ariaInvalid}
            className={cn(
              'min-w-0 flex-1 justify-start gap-3 px-3 font-normal',
              !selected && 'text-muted-foreground'
            )}
          >
            <CalendarIcon className="size-5 text-muted-foreground" />
            <span className="truncate">
              {selected ? format(selected, 'd MMM yyyy') : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            captionLayout="dropdown"
            startMonth={new Date(thisYear - yearsBack, 0)}
            endMonth={new Date(thisYear + yearsAhead, 11)}
            onSelect={(date) => {
              if (date) onChange(localDateString(date))
              setOpen(false)
            }}
            // 48px day cells for a finger; the primitive's default is 32px.
            className="[--cell-size:--spacing(12)]"
          />
          <div className="flex gap-2 border-t p-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => {
                onChange(localDateString())
                setOpen(false)
              }}
            >
              Today
            </Button>
            {clearable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                No date
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {clearable && selected && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear date"
          onClick={() => onChange('')}
        >
          <XIcon className="size-5" />
        </Button>
      )}
    </div>
  )
}
