import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Button } from '@renderer/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { useAnalyticsStore } from '@renderer/stores/analyticsStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { KPICards } from '@renderer/components/analytics/KPICards'
import { SalesTrendChart } from '@renderer/components/analytics/SalesTrendChart'
import { TopProductsList } from '@renderer/components/analytics/TopProductsList'
import { CategoryBreakdownChart } from '@renderer/components/analytics/CategoryBreakdownChart'
import { AlertsPanel } from '@renderer/components/analytics/AlertsPanel'
import { ReportsPanel } from '@renderer/components/analytics/ReportsPanel'

export function AnalyticsPage(): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true)
  const [alertsLoading, setAlertsLoading] = useState(false)
  const [alertsUpdatedAt, setAlertsUpdatedAt] = useState<Date | null>(null)
  const { user } = useAuthStore()
  const userId = user?.id ?? ''

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
      await window.electron.analytics.runAggregation(userId)

      // Get today's date
      const today = new Date().toISOString().split('T')[0]

      // Get last 7 days
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

      // Load all dashboard data in parallel
      const [todayData, weekData, topProds, categoryData, lowStock, expiring] = await Promise.all([
        window.electron.analytics.getDailyMetrics(userId, today),
        window.electron.analytics.getPeriodMetrics(userId, weekAgo, today),
        window.electron.analytics.getTopProducts(userId, weekAgo, today, 10),
        window.electron.analytics.getCategoryBreakdown(userId, weekAgo, today),
        window.electron.analytics.getLowStockAlerts(userId),
        window.electron.analytics.getExpiryAlerts(userId, 30)
      ])

      setTodayMetrics(todayData)
      setWeekMetrics(weekData)
      setTopProducts(topProds)
      setCategoryBreakdown(categoryData)
      setLowStockAlerts(lowStock)
      setExpiryAlerts(expiring)
      setAlertsUpdatedAt(new Date())
    } catch (error) {
      console.error('Failed to load analytics:', error)
    } finally {
      setIsLoading(false)
    }
  }

  /** Alerts only — cheap enough to poll, and the numbers that actually change
   *  during trading. The dashboard-wide Refresh re-runs aggregation as well. */
  const loadAlerts = async (): Promise<void> => {
    if (!userId) return
    setAlertsLoading(true)
    try {
      const [lowStock, expiring] = await Promise.all([
        window.electron.analytics.getLowStockAlerts(userId),
        window.electron.analytics.getExpiryAlerts(userId, 30)
      ])
      setLowStockAlerts(lowStock)
      setExpiryAlerts(expiring)
      setAlertsUpdatedAt(new Date())
    } catch (error) {
      console.error('Failed to refresh alerts:', error)
    } finally {
      setAlertsLoading(false)
    }
  }

  useEffect(() => {
    loadDashboardData()
  }, [])

  // Keep alerts current without needing a manual dashboard refresh.
  useEffect(() => {
    const timer = setInterval(loadAlerts, 5 * 60_000)
    return () => clearInterval(timer)
  }, [userId])

  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics & Reports</h1>
          <p className="text-muted-foreground">Sales insights and reports</p>
        </div>
        <Button onClick={loadDashboardData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="dashboard" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="grid w-full grid-cols-3 max-w-2xl">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent
          value="dashboard"
          className="space-y-6 flex-1 min-h-0 overflow-y-auto overscroll-contain pt-4 pb-6 pr-1"
        >
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
              isLoading={isLoading || alertsLoading}
              onRefresh={loadAlerts}
              lastUpdated={alertsUpdatedAt}
            />
          </div>
        </TabsContent>

        <TabsContent value="reports" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pt-4 pb-6 pr-1">
          <ReportsPanel />
        </TabsContent>

        <TabsContent value="alerts" className="flex-1 min-h-0 overflow-y-auto overscroll-contain pt-4 pb-6 pr-1">
          <AlertsPanel
            lowStockAlerts={lowStockAlerts}
            expiryAlerts={expiryAlerts}
            isLoading={isLoading || alertsLoading}
            onRefresh={loadAlerts}
            lastUpdated={alertsUpdatedAt}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
