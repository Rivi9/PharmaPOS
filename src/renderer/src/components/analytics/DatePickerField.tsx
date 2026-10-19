import { useState } from 'react'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import type { Matcher } from 'react-day-picker'
import { Button } from '@renderer/components/ui/button'
import { Calendar } from '@renderer/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { localDateString } from '../../../../shared/dates'
import { parseLocalDate } from './chart-helpers'

interface DatePickerFieldProps {
  id: string
  /** `YYYY-MM-DD`, local calendar date. */
  value: string
  /** Called with a `YYYY-MM-DD` local calendar date (shared/dates.localDateString). */
  onChange: (value: string) => void
  disabled?: Matcher | Matcher[]
}

/**
 * Touch-sized date picker that speaks the same 'YYYY-MM-DD' strings the old
 * `<input type="date">` did. Conversion is local-calendar both ways: parsing with
 * `new Date('YYYY-MM-DD')` or formatting with toISOString() would shift the day by
 * the UTC offset (M21).
 */
export function DatePickerField({
  id,
  value,
  onChange,
  disabled
}: DatePickerFieldProps): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const selected = parseLocalDate(value)
  const thisYear = new Date().getFullYear()

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          className="w-full justify-start gap-3 px-4 text-left font-normal tabular-nums"
        >
          <CalendarDays className="text-muted-foreground" />
          {selected ? format(selected, 'EEE, d MMM yyyy') : 'Pick a date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={new Date(thisYear - 10, 0)}
          endMonth={new Date(thisYear, 11)}
          disabled={disabled}
          onSelect={(date) => {
            if (!date) return
            onChange(localDateString(date))
            setOpen(false)
          }}
          className="[--cell-size:--spacing(12)] text-base"
        />
      </PopoverContent>
    </Popover>
  )
}
