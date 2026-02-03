import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import type { DailySalesMetric } from '@renderer/types/analytics'

interface SalesTrendChartProps {
  data: DailySalesMetric[]
  isLoading?: boolean
}

export function SalesTrendChart({ data, isLoading }: SalesTrendChartProps): React.JSX.Element {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sales Trend</CardTitle>
          <CardDescription>Daily sales and profit over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-muted-foreground">Loading chart...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sales Trend</CardTitle>
          <CardDescription>Daily sales and profit over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-muted-foreground">No data available</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Format data for chart
  const chartData = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    sales: d.total_sales,
    profit: d.total_profit
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sales Trend</CardTitle>
        <CardDescription>Daily sales and profit over the selected period</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12 }}
              tickMargin={10}
            />
            <YAxis
              tick={{ fontSize: 12 }}
              tickMargin={10}
              tickFormatter={(value) => `Rs. ${value}`}
            />
            <Tooltip
              formatter={(value: number) => `Rs. ${value.toFixed(2)}`}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="sales"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              name="Sales"
              dot={{ r: 3 }}
            />
            <Line
              type="monotone"
              dataKey="profit"
              stroke="hsl(142, 76%, 36%)"
              strokeWidth={2}
              name="Profit"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
