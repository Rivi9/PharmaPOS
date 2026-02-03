import { TrendingUp, DollarSign, ShoppingCart, Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import type { DailySalesMetric } from '@renderer/types/analytics'

interface KPICardsProps {
  metrics: DailySalesMetric | null
  isLoading?: boolean
}

export function KPICards({ metrics, isLoading }: KPICardsProps): React.JSX.Element {
  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-32 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">Rs. {(metrics?.total_sales || 0).toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">
            {metrics?.transaction_count || 0} transactions
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Profit</CardTitle>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            Rs. {(metrics?.total_profit || 0).toFixed(2)}
          </div>
          <p className="text-xs text-muted-foreground">
            {metrics
              ? `${((metrics.total_profit / metrics.total_sales) * 100).toFixed(1)}% margin`
              : 'No data'}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{metrics?.items_sold || 0}</div>
          <p className="text-xs text-muted-foreground">
            Avg. {((metrics?.items_sold || 0) / (metrics?.transaction_count || 1)).toFixed(1)} per
            sale
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Avg Transaction</CardTitle>
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">Rs. {(metrics?.avg_transaction || 0).toFixed(2)}</div>
          <p className="text-xs text-muted-foreground">Per customer</p>
        </CardContent>
      </Card>
    </div>
  )
}
