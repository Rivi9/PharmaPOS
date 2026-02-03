import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Button } from '@renderer/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useAnalyticsStore } from '@renderer/stores/analyticsStore'
import { KPICards } from '@renderer/components/analytics/KPICards'
import { SalesTrendChart } from '@renderer/components/analytics/SalesTrendChart'
import { TopProductsList } from '@renderer/components/analytics/TopProductsList'
import { CategoryBreakdownChart } from '@renderer/components/analytics/CategoryBreakdownChart'
import { AlertsPanel } from '@renderer/components/analytics/AlertsPanel'

export function AnalyticsPage(): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true)

  const {
    todayMetrics,
    setTodayMetrics,
    weekMetrics,
    setWeekMetrics,
    topProducts,
    setTopProducts,
    categoryBreakdown,
    setCategoryBreakdown,
    lowStockAlerts,
    setLowStockAlerts,
    expiryAlerts,
    setExpiryAlerts
  } = useAnalyticsStore()

  const loadDashboardData = async () => {
    setIsLoading(true)
    try {
      // Run aggregation first
      await window.electron.analytics.runAggregation()

      // Get today's date
      const today = new Date().toISOString().split('T')[0]

      // Get last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      // Load all dashboard data in parallel
      const [todayData, weekData, topProds, categoryData, lowStock, expiring] =
        await Promise.all([
          window.electron.analytics.getDailyMetrics(today),
          window.electron.analytics.getPeriodMetrics(weekAgo, today),
          window.electron.analytics.getTopProducts(weekAgo, today, 10),
          window.electron.analytics.getCategoryBreakdown(weekAgo, today),
          window.electron.analytics.getLowStockAlerts(),
          window.electron.analytics.getExpiryAlerts(30)
        ])

      setTodayMetrics(todayData)
      setWeekMetrics(weekData)
      setTopProducts(topProds)
      setCategoryBreakdown(categoryData)
      setLowStockAlerts(lowStock)
      setExpiryAlerts(expiring)
    } catch (error) {
      console.error('Failed to load analytics:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics & Reports</h1>
          <p className="text-muted-foreground">Sales insights, reports, and AI recommendations</p>
        </div>
        <Button onClick={loadDashboardData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="dashboard" className="flex-1">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="ai">AI Insights</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <KPICards metrics={todayMetrics} isLoading={isLoading} />

          <div className="grid gap-6 md:grid-cols-2">
            <SalesTrendChart data={weekMetrics} isLoading={isLoading} />
            <CategoryBreakdownChart data={categoryBreakdown} isLoading={isLoading} />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <TopProductsList products={topProducts} isLoading={isLoading} />
            <AlertsPanel
              lowStockAlerts={lowStockAlerts}
              expiryAlerts={expiryAlerts}
              isLoading={isLoading}
            />
          </div>
        </TabsContent>

        <TabsContent value="reports" className="flex-1">
          <div className="text-muted-foreground">Reports functionality will be added in Part 3</div>
        </TabsContent>

        <TabsContent value="ai" className="flex-1">
          <div className="text-muted-foreground">AI insights will be added in Part 3</div>
        </TabsContent>

        <TabsContent value="alerts" className="flex-1">
          <AlertsPanel
            lowStockAlerts={lowStockAlerts}
            expiryAlerts={expiryAlerts}
            isLoading={isLoading}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
