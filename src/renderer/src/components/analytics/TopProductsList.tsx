import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Trophy } from 'lucide-react'
import type { TopProduct } from '@renderer/types/analytics'

interface TopProductsListProps {
  products: TopProduct[]
  isLoading?: boolean
}

export function TopProductsList({ products, isLoading }: TopProductsListProps): React.JSX.Element {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Products</CardTitle>
          <CardDescription>Best sellers by revenue</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-4 w-4 bg-muted animate-pulse rounded" />
                <div className="flex-1">
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                </div>
                <div className="h-4 w-20 bg-muted animate-pulse rounded" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (products.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Top Products</CardTitle>
          <CardDescription>Best sellers by revenue</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">No sales data available</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Products</CardTitle>
        <CardDescription>Best sellers by revenue</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {products.map((product, index) => (
            <div key={product.product_id} className="flex items-center gap-3">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full font-bold ${
                  index === 0
                    ? 'bg-yellow-500 text-yellow-950'
                    : index === 1
                      ? 'bg-gray-400 text-gray-950'
                      : index === 2
                        ? 'bg-orange-600 text-orange-950'
                        : 'bg-muted text-muted-foreground'
                }`}
              >
                {index < 3 ? <Trophy className="h-4 w-4" /> : index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{product.product_name}</p>
                <p className="text-sm text-muted-foreground">
                  {product.total_quantity} units sold
                </p>
              </div>
              <div className="text-right">
                <p className="font-medium">Rs. {product.total_revenue.toFixed(2)}</p>
                <p className="text-sm text-green-600">+Rs. {product.total_profit.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
