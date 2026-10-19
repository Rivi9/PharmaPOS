import { Trophy, PackageSearch } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { formatCurrency } from '@renderer/lib/calculations'
import { cn } from '@renderer/lib/utils'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import type { TopProduct } from '@renderer/types/analytics'

interface TopProductsListProps {
  products: TopProduct[]
  isLoading?: boolean
}

export function TopProductsList({ products, isLoading }: TopProductsListProps): React.JSX.Element {
  const sym = useSettingsStore((s) => s.settings.currency_symbol) || 'Rs.'
  const topRevenue = products.reduce((max, p) => Math.max(max, p.total_revenue), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Top Products</CardTitle>
        <CardDescription>Best sellers by revenue over the past week</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex flex-col gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-2 w-full" />
                </div>
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <Empty className="border p-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <PackageSearch />
              </EmptyMedia>
              <EmptyTitle>No sales data available</EmptyTitle>
              <EmptyDescription>Best sellers appear here once sales are recorded.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ol className="flex flex-col gap-1">
            {products.map((product, index) => {
              const share = topRevenue > 0 ? (product.total_revenue / topRevenue) * 100 : 0
              return (
                <li key={product.product_id} className="flex items-center gap-3 py-2">
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold tabular-nums',
                      index === 0
                        ? 'bg-primary text-primary-foreground'
                        : index < 3
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-muted text-muted-foreground'
                    )}
                    aria-label={`Rank ${index + 1}`}
                  >
                    {index < 3 ? <Trophy className="size-5" /> : index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-base font-medium">{product.product_name}</p>
                      <p className="shrink-0 text-base font-semibold tabular-nums">
                        {formatCurrency(product.total_revenue, sym)}
                      </p>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">
                        {product.total_quantity} units sold
                      </span>
                      <span
                        className={cn(
                          'tabular-nums',
                          product.total_profit < 0 ? 'text-destructive' : 'text-success'
                        )}
                      >
                        {product.total_profit < 0 ? '−' : '+'}
                        {formatCurrency(Math.abs(product.total_profit), sym)} profit
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
