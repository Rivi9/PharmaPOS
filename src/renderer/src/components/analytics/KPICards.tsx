import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  ShoppingCart,
  Package,
  PiggyBank
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { formatCurrency } from '@renderer/lib/calculations'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { cn } from '@renderer/lib/utils'
import type { DailySalesMetric } from '@renderer/types/analytics'

interface KPICardsProps {
  metrics: DailySalesMetric | null
  isLoading?: boolean
  /** Recent daily metrics (may include today). Used for the "vs recent average"
   *  trend badges; days other than today's are the baseline. */
  history?: DailySalesMetric[]
}

interface Baseline {
  sales: number
  profit: number
  items: number
  avgTransaction: number
}

/** Average per trading day over the history, excluding today. */
function baselineFrom(history: DailySalesMetric[], today: string | undefined): Baseline | null {
  const prior = history.filter((d) => d.date !== today)
  if (prior.length === 0) return null
  const sum = prior.reduce(
    (acc, d) => ({
      sales: acc.sales + d.total_sales,
      profit: acc.profit + d.total_profit,
      items: acc.items + d.items_sold,
      tx: acc.tx + d.transaction_count
    }),
    { sales: 0, profit: 0, items: 0, tx: 0 }
  )
  return {
    sales: sum.sales / prior.length,
    profit: sum.profit / prior.length,
    items: sum.items / prior.length,
    avgTransaction: sum.tx > 0 ? sum.sales / sum.tx : 0
  }
}

function TrendBadge({
  current,
  baseline
}: {
  current: number
  baseline?: number
}): React.JSX.Element | null {
  if (baseline === undefined || baseline <= 0) return null
  const change = ((current - baseline) / baseline) * 100
  const flat = Math.abs(change) < 0.5
  const up = change > 0
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown

  return (
    <Badge
      variant="outline"
      className={cn(
        'h-7 gap-1 border-transparent px-2.5 text-sm tabular-nums [&>svg]:size-4!',
        flat
          ? 'bg-muted text-muted-foreground'
          : up
            ? 'bg-success-muted text-success'
            : 'bg-destructive/10 text-destructive dark:bg-destructive/20'
      )}
    >
      <Icon />
      {flat ? '0%' : `${up ? '+' : ''}${change.toFixed(0)}%`}
    </Badge>
  )
}

interface TileProps {
  title: string
  icon: React.ComponentType<{ className?: string }>
  value: string
  valueClassName?: string
  footnote: string
  current: number
  baseline?: number
}

function KpiTile({
  title,
  icon: Icon,
  value,
  valueClassName,
  footnote,
  current,
  baseline
}: TileProps): React.JSX.Element {
  return (
    <Card className="gap-3">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-medium text-muted-foreground">{title}</CardTitle>
        <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-5" />
        </span>
      </CardHeader>
      <CardContent className="@container/kpi gap-2">
        <div
          className={cn(
            'text-2xl font-semibold tracking-tight tabular-nums @[15rem]/kpi:text-3xl',
            valueClassName
          )}
        >
          {value}
        </div>
        <p className="text-sm text-muted-foreground">{footnote}</p>
        {baseline !== undefined && baseline > 0 && (
          <div className="flex items-center gap-2">
            <TrendBadge current={current} baseline={baseline} />
            <span className="text-sm text-muted-foreground">vs. daily avg this week</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function KPICards({ metrics, isLoading, history = [] }: KPICardsProps): React.JSX.Element {
  const sym = useSettingsStore((s) => s.settings.currency_symbol) || 'Rs.'

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="gap-3">
            <CardHeader className="flex flex-row items-center justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="size-10 rounded-lg" />
            </CardHeader>
            <CardContent className="gap-2">
              <Skeleton className="h-9 w-40" />
              <Skeleton className="h-7 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const baseline = baselineFrom(history, metrics?.date)
  const sales = metrics?.total_sales || 0
  const profit = metrics?.total_profit || 0
  const items = metrics?.items_sold || 0
  const avgTx = metrics?.avg_transaction || 0
  const txCount = metrics?.transaction_count || 0

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <KpiTile
        title="Total Sales"
        icon={DollarSign}
        value={formatCurrency(sales, sym)}
        footnote={`${txCount} transactions`}
        current={sales}
        baseline={baseline?.sales}
      />
      <KpiTile
        title="Profit"
        icon={PiggyBank}
        value={formatCurrency(profit, sym)}
        valueClassName={profit < 0 ? 'text-destructive' : 'text-success'}
        footnote={
          !metrics || metrics.total_sales <= 0
            ? 'No data'
            : metrics.total_cost <= 0
              ? 'Cost price not set'
              : `${((metrics.total_profit / metrics.total_sales) * 100).toFixed(1)}% margin`
        }
        current={profit}
        baseline={baseline?.profit}
      />
      <KpiTile
        title="Items Sold"
        icon={Package}
        value={String(items)}
        footnote={`Avg. ${(items / (txCount || 1)).toFixed(1)} per sale`}
        current={items}
        baseline={baseline?.items}
      />
      <KpiTile
        title="Avg Transaction"
        icon={ShoppingCart}
        value={formatCurrency(avgTx, sym)}
        footnote="Per customer"
        current={avgTx}
        baseline={baseline?.avgTransaction}
      />
    </div>
  )
}
