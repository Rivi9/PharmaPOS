import type * as React from 'react'
import type { ChartConfig } from '@renderer/components/ui/chart'
import { formatCurrency } from '@renderer/lib/calculations'

/**
 * Tooltip row formatter for money series.
 *
 * Typed against the loosest shape recharts can hand us (`unknown` value/name and a
 * structural `item`) so it is assignable to ChartTooltipContent's intersected
 * `Formatter<ValueType, NameType>` type. The old inline
 * `(value: number | undefined) => string` was not, and failed typecheck.
 *
 * A formatter replaces the whole tooltip row, so it draws the colour swatch and the
 * series label itself (looked up in the chart config by series/slice key).
 */
export function moneyTooltipFormatter(config: ChartConfig, sym: string) {
  return function MoneyTooltipRow(
    value: unknown,
    name: unknown,
    item: { color?: string; payload?: unknown }
  ): React.ReactNode {
    const key = String(name ?? '')
    const label = config[key]?.label ?? key
    const fill =
      typeof item.payload === 'object' && item.payload !== null && 'fill' in item.payload
        ? String((item.payload as { fill: unknown }).fill)
        : undefined
    const color = fill ?? item.color
    const amount = typeof value === 'number' ? value : Number(value) || 0

    return (
      <div className="flex w-full min-w-40 items-center gap-2 text-sm">
        <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
        <span className="text-muted-foreground">{label}</span>
        <span className="ml-auto pl-4 font-mono font-medium text-foreground tabular-nums">
          {formatCurrency(amount, sym)}
        </span>
      </div>
    )
  }
}

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

/** Short axis tick for money, e.g. "Rs. 12.5K". Full amounts are in the tooltip. */
export function compactMoney(value: number, sym: string): string {
  return `${sym} ${compact.format(value)}`
}

/**
 * Parses a `YYYY-MM-DD` string as a LOCAL calendar date.
 *
 * `new Date('2026-10-19')` is UTC midnight, which is the previous evening in any
 * timezone west of UTC — the same UTC-vs-local trap documented in shared/dates (M21).
 */
export function parseLocalDate(isoDate: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? '')
  if (!match) return undefined
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}
