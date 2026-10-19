import { useState } from 'react'
import { format, startOfDay, subDays } from 'date-fns'
import type { DateRange } from 'react-day-picker'
import { CalendarDays, XIcon } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Calendar } from '@renderer/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import { cn } from '@renderer/lib/utils'

interface DateRangeFilterProps {
  value: DateRange | undefined
  onChange: (range: DateRange | undefined) => void
  className?: string
}

const PRESETS: { label: string; days: number }[] = [
  { label: 'Today', days: 0 },
  { label: 'Last 7 days', days: 6 },
  { label: 'Last 30 days', days: 29 }
]

function describe(range: DateRange | undefined): string {
  if (!range?.from) return 'Any date'
  const from = format(range.from, 'd MMM yyyy')
  if (!range.to || range.to.getTime() === range.from.getTime()) return from
  return `${from} – ${format(range.to, 'd MMM yyyy')}`
}

/**
 * Tap-friendly date range picker: one tap picks a single day, a second tap
 * extends it to a range. Calendar cells are enlarged to 48px for the touchscreen.
 */
export function DateRangeFilter({
  value,
  onChange,
  className
}: DateRangeFilterProps): React.JSX.Element {
  const [open, setOpen] = useState(false)

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'min-w-56 justify-start font-normal',
              !value?.from && 'text-muted-foreground'
            )}
          >
            <CalendarDays className="size-5" />
            {describe(value)}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <div className="flex flex-wrap gap-2 border-b p-3">
            {PRESETS.map((preset) => (
              <Button
                key={preset.label}
                variant="secondary"
                size="sm"
                onClick={() => {
                  const today = startOfDay(new Date())
                  onChange({ from: subDays(today, preset.days), to: today })
                  setOpen(false)
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={value}
            onSelect={onChange}
            numberOfMonths={1}
            defaultMonth={value?.from}
            disabled={{ after: new Date() }}
            className="[--cell-size:--spacing(12)]"
          />
        </PopoverContent>
      </Popover>
      {value?.from && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Clear date filter"
          onClick={() => onChange(undefined)}
        >
          <XIcon className="size-5" />
        </Button>
      )}
    </div>
  )
}
