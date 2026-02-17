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
      const [todayData, weekData, topProds, categoryData, lowStock, expiring] =
        await Promise.all([
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
          <ReportsPanel />
        </TabsContent>

        <TabsContent value="ai" className="flex-1">
          <AIInsightsPanel userId={userId} />
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

function AIInsightsPanel({ userId }: { userId: string }): React.JSX.Element {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<{
    reorderSuggestions: any[]
    deadStock: any[]
  } | null>(null)

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      const [reorderSuggestions, deadStock] = await Promise.all([
        window.electron.ai.getReorderSuggestions(userId),
        window.electron.ai.getDeadStockDetection(userId)
      ])
      setResults({
        reorderSuggestions: reorderSuggestions ?? [],
        deadStock: deadStock ?? []
      })
    } catch (err: any) {
      setError(err.message || 'Failed to generate insights')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">AI Insights</h3>
          <p className="text-sm text-muted-foreground">
            Analyse inventory with AI-powered recommendations
          </p>
        </div>
        <Button onClick={generate} disabled={loading}>
          {loading ? 'Generating...' : 'Generate Insights'}
        </Button>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      {!results && !loading && (
        <div className="text-center py-12 text-muted-foreground">
          Click Generate Insights to analyse inventory with AI
        </div>
      )}

      {results && (
        <div className="space-y-6">
          <InsightSection title="Reorder Suggestions" items={results.reorderSuggestions} />
          <InsightSection title="Dead Stock Detection" items={results.deadStock} />
        </div>
      )}
    </div>
  )
}

function InsightSection({ title, items }: { title: string; items: any[] }): React.JSX.Element {
  if (items.length === 0)
    return (
      <div>
        <h4 className="font-medium mb-2">{title}</h4>
        <p className="text-sm text-muted-foreground">No items flagged.</p>
      </div>
    )
  return (
    <div>
      <h4 className="font-medium mb-2">{title}</h4>
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={i} className="border rounded-md p-3 text-sm">
            <pre className="whitespace-pre-wrap font-sans">{JSON.stringify(item, null, 2)}</pre>
          </div>
        ))}
      </div>
    </div>
  )
}
