import { Label, Pie, PieChart } from 'recharts'
import { PieChart as PieChartIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from '@renderer/components/ui/chart'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { formatCurrency } from '@renderer/lib/calculations'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import type { CategoryBreakdown } from '@renderer/types/analytics'
import { compactMoney, moneyTooltipFormatter } from './chart-helpers'

interface CategoryBreakdownChartProps {
  data: CategoryBreakdown[]
  isLoading?: boolean
}

/** One slice per chart token. Anything past the fourth category is grouped as "Other". */
const MAX_SLICES = 5

interface Slice {
  key: string
  name: string
  value: number
  percentage: number
  fill: string
  /** The raw token, for swatches drawn outside the ChartContainer scope. */
  color: string
}

function toSlices(data: CategoryBreakdown[]): Slice[] {
  const sorted = [...data].sort((a, b) => b.total_revenue - a.total_revenue)
  const head = sorted.length > MAX_SLICES ? sorted.slice(0, MAX_SLICES - 1) : sorted
  const tail = sorted.length > MAX_SLICES ? sorted.slice(MAX_SLICES - 1) : []

  const slices: Slice[] = head.map((d, i) => ({
    key: `cat${i}`,
    name: d.category_name,
    value: d.total_revenue,
    percentage: d.percentage,
    fill: `var(--color-cat${i})`,
    color: `var(--chart-${i + 1})`
  }))
  if (tail.length > 0) {
    const i = slices.length
    slices.push({
      key: `cat${i}`,
      name: `Other (${tail.length})`,
      value: tail.reduce((sum, d) => sum + d.total_revenue, 0),
      percentage: tail.reduce((sum, d) => sum + d.percentage, 0),
      fill: `var(--color-cat${i})`,
      color: `var(--chart-${i + 1})`
    })
  }
  return slices
}

export function CategoryBreakdownChart({
  data,
  isLoading
}: CategoryBreakdownChartProps): React.JSX.Element {
  const sym = useSettingsStore((s) => s.settings.currency_symbol) || 'Rs.'

  const slices = toSlices(data)
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  const chartConfig: ChartConfig = Object.fromEntries(
    slices.map((s, i) => [s.key, { label: s.name, color: `var(--chart-${i + 1})` }])
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Category Breakdown</CardTitle>
        <CardDescription>Sales by product category over the past week</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-[300px] items-center gap-6">
            <Skeleton className="size-52 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-col gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-6 w-full" />
              ))}
            </div>
          </div>
        ) : slices.length === 0 ? (
          <Empty className="h-[300px] border p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PieChartIcon />
              </EmptyMedia>
              <EmptyTitle>No category sales</EmptyTitle>
              <EmptyDescription>
                Revenue split by category appears once sales are recorded.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="@container">
            <div className="flex flex-col items-center gap-4 @md:min-h-[300px] @md:flex-row">
              <ChartContainer
                config={chartConfig}
                className="aspect-square h-[240px] w-[240px] shrink-0"
              >
                <PieChart>
                  <ChartTooltip
                    cursor={false}
                    content={
                      <ChartTooltipContent
                        hideLabel
                        nameKey="key"
                        formatter={moneyTooltipFormatter(chartConfig, sym)}
                      />
                    }
                  />
                  <Pie
                    data={slices}
                    dataKey="value"
                    nameKey="key"
                    innerRadius={68}
                    outerRadius={110}
                    paddingAngle={2}
                  >
                    <Label
                      content={({ viewBox }) => {
                        if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null
                        const cx = Number(viewBox.cx)
                        const cy = Number(viewBox.cy)
                        return (
                          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                            <tspan
                              x={cx}
                              y={cy - 10}
                              className="fill-foreground text-xl font-semibold tabular-nums"
                            >
                              {compactMoney(total, sym)}
                            </tspan>
                            <tspan x={cx} y={cy + 14} className="fill-muted-foreground text-sm">
                              Total
                            </tspan>
                          </text>
                        )
                      }}
                    />
                  </Pie>
                </PieChart>
              </ChartContainer>

              <ul className="flex w-full min-w-0 flex-1 flex-col gap-1">
                {slices.map((s) => (
                  <li
                    key={s.key}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 text-base"
                  >
                    <span
                      className="size-3 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {s.percentage.toFixed(0)}%
                    </span>
                    <span className="w-28 text-right font-medium tabular-nums">
                      {formatCurrency(s.value, sym)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
