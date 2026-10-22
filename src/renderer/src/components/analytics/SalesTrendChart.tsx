import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { LineChart as LineChartIcon } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
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
import { useSettingsStore } from '@renderer/stores/settingsStore'
import type { DailySalesMetric } from '@renderer/types/analytics'
import { compactMoney, moneyTooltipFormatter, parseLocalDate } from './chart-helpers'

interface SalesTrendChartProps {
  data: DailySalesMetric[]
  isLoading?: boolean
}

const chartConfig = {
  sales: { label: 'Net sales', color: 'var(--chart-1)' },
  profit: { label: 'Profit', color: 'var(--chart-2)' }
} satisfies ChartConfig

export function SalesTrendChart({ data, isLoading }: SalesTrendChartProps): React.JSX.Element {
  const sym = useSettingsStore((s) => s.settings.currency_symbol) || 'Rs.'

  // Dates are local calendar days ('YYYY-MM-DD'); parse them as such so the axis
  // label is not shifted a day by a UTC parse.
  const chartData = data.map((d) => ({
    date: (parseLocalDate(d.date) ?? new Date(d.date)).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    }),
    sales: d.total_sales,
    profit: d.total_profit
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Sales Trend</CardTitle>
        <CardDescription>Daily net sales (excl. VAT) and profit over the past week</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[300px] w-full rounded-xl" />
        ) : chartData.length === 0 ? (
          <Empty className="h-[300px] border p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <LineChartIcon />
              </EmptyMedia>
              <EmptyTitle>No sales yet</EmptyTitle>
              <EmptyDescription>
                Completed sales from the past week will appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ChartContainer config={chartConfig} className="aspect-auto h-[300px] w-full">
            <AreaChart data={chartData} margin={{ left: 4, right: 12, top: 8 }}>
              <defs>
                <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="fillProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-profit)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-profit)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={10}
                minTickGap={16}
                tick={{ fontSize: 13 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={72}
                tick={{ fontSize: 13 }}
                tickFormatter={(value: number) => compactMoney(value, sym)}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    formatter={moneyTooltipFormatter(chartConfig, sym)}
                  />
                }
              />
              <Area
                dataKey="sales"
                type="monotone"
                fill="url(#fillSales)"
                stroke="var(--color-sales)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'var(--color-sales)' }}
                activeDot={{ r: 5 }}
              />
              <Area
                dataKey="profit"
                type="monotone"
                fill="url(#fillProfit)"
                stroke="var(--color-profit)"
                strokeWidth={2.5}
                dot={{ r: 3, fill: 'var(--color-profit)' }}
                activeDot={{ r: 5 }}
              />
              <ChartLegend content={<ChartLegendContent className="text-sm" />} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
