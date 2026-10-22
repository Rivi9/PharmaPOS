import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Button } from '@renderer/components/ui/button'
import { Bell, FileText, LayoutDashboard, RefreshCw } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { localDateString, localDateOffset } from '../../../shared/dates'
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

  const loadDashboardData = async (): Promise<void> => {
    setIsLoading(true)
    try {
      // Run aggregation first. It rebuilds the past week of product_sales_daily
      // from the sales ledger, refunds included, so it repairs rather than
      // overwrites what createSale and createRefund maintained live.
      await window.electron.analytics.runAggregation(userId)

      // Local dates, the way product_sales_daily is keyed. The UTC "today" showed
      // yesterday's figures until 05:30 every morning.
      const today = localDateString()
      const weekAgo = localDateOffset(-7)

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
    // Load once on mount; Refresh reloads on demand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep alerts current without needing a manual dashboard refresh.
  useEffect(() => {
    const timer = setInterval(loadAlerts, 5 * 60_000)
    return () => clearInterval(timer)
    // Re-arm only when the user changes; loadAlerts closes over userId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  return (
    <div className="flex h-full flex-col gap-4 bg-canvas p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Analytics & Reports</h1>
          <p className="text-base text-muted-foreground">Sales insights and reports</p>
        </div>
        <Button size="lg" onClick={loadDashboardData} disabled={isLoading}>
          <RefreshCw className={cn(isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="dashboard" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="grid w-full max-w-2xl grid-cols-3">
          <TabsTrigger value="dashboard">
            <LayoutDashboard />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="reports">
            <FileText />
            Reports
          </TabsTrigger>
          <TabsTrigger value="alerts">
            <Bell />
            Alerts
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="dashboard"
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain pt-4 pb-6 pr-1"
        >
          <KPICards metrics={todayMetrics} history={weekMetrics} isLoading={isLoading} />

          <div className="grid gap-6 lg:grid-cols-2">
            <SalesTrendChart data={weekMetrics} isLoading={isLoading} />
            <CategoryBreakdownChart data={categoryBreakdown} isLoading={isLoading} />
          </div>

          <div className="grid items-start gap-6 lg:grid-cols-2">
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

        <TabsContent
          value="reports"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4 pb-6 pr-1"
        >
          <ReportsPanel />
        </TabsContent>

        <TabsContent
          value="alerts"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-4 pb-6 pr-1"
        >
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
