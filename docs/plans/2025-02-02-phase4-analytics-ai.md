# Phase 4: Analytics & AI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build comprehensive analytics dashboard with KPIs, charts, reports, and AI-powered insights using Gemini API for reorder suggestions, sales forecasting, and natural language queries.

**Architecture:** Daily aggregation job populates product_sales_daily table for fast queries. Dashboard with KPI cards, trend charts (Recharts), and alert panels. Report generation with print support. Gemini API integration for AI insights with fallback to local statistics when offline.

**Tech Stack:** React 19, TypeScript, Recharts v2, Gemini API, better-sqlite3, jsPDF, node-schedule

---

## Part 1: Dashboard Infrastructure

### Task 1: Create Analytics Page Layout

**Files:**
- Create: `src/renderer/src/pages/AnalyticsPage.tsx`
- Modify: `src/renderer/src/App.tsx:20,35`

**Step 1: Create analytics page structure**

```typescript
// src/renderer/src/pages/AnalyticsPage.tsx
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'

export function AnalyticsPage(): React.JSX.Element {
  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Analytics & Reports</h1>
        <p className="text-muted-foreground">Sales insights, reports, and AI recommendations</p>
      </div>

      <Tabs defaultValue="dashboard" className="flex-1">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="ai">AI Insights</TabsTrigger>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="flex-1">
          <div className="text-muted-foreground">Dashboard content will go here</div>
        </TabsContent>

        <TabsContent value="reports" className="flex-1">
          <div className="text-muted-foreground">Reports content will go here</div>
        </TabsContent>

        <TabsContent value="ai" className="flex-1">
          <div className="text-muted-foreground">AI insights content will go here</div>
        </TabsContent>

        <TabsContent value="alerts" className="flex-1">
          <div className="text-muted-foreground">Alerts content will go here</div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

**Step 2: Add route to App.tsx**

```typescript
// Add import
import { AnalyticsPage } from './pages/AnalyticsPage'

// Add route in router configuration
<Route path="/analytics" element={<AnalyticsPage />} />
```

**Step 3: Add analytics link to sidebar**

Modify: `src/renderer/src/components/layout/Sidebar.tsx:40-50` to add analytics navigation item

**Step 4: Run dev server to verify**

Run: `npm run dev`
Expected: Analytics page loads, tabs render correctly

**Step 5: Commit**

```bash
git add src/renderer/src/pages/AnalyticsPage.tsx src/renderer/src/App.tsx src/renderer/src/components/layout/Sidebar.tsx
git commit -m "feat: add analytics page layout with tabs"
```

---

### Task 2: Create Analytics Store

**Files:**
- Create: `src/renderer/src/stores/analyticsStore.ts`
- Create: `src/renderer/src/types/analytics.ts`

**Step 1: Create analytics types**

```typescript
// src/renderer/src/types/analytics.ts
export interface DailySalesMetric {
  date: string
  total_sales: number
  total_profit: number
  total_cost: number
  transaction_count: number
  items_sold: number
  avg_transaction: number
}

export interface ProductSalesDaily {
  id: string
  date: string
  product_id: string
  product_name?: string
  quantity_sold: number
  revenue: number
  cost: number
  profit: number
}

export interface TopProduct {
  product_id: string
  product_name: string
  total_quantity: number
  total_revenue: number
  total_profit: number
}

export interface CategoryBreakdown {
  category_id: string
  category_name: string
  total_revenue: number
  total_profit: number
  percentage: number
}

export interface LowStockAlert {
  product_id: string
  product_name: string
  current_stock: number
  reorder_level: number
  reorder_qty: number
}

export interface ExpiryAlert {
  batch_id: string
  product_name: string
  batch_number: string
  quantity: number
  expiry_date: string
  days_until_expiry: number
}

export interface AIInsight {
  id: string
  type: 'reorder' | 'forecast' | 'dead_stock' | 'trend'
  title: string
  description: string
  confidence: number
  data: any
  created_at: string
}
```

**Step 2: Create analytics Zustand store**

```typescript
// src/renderer/src/stores/analyticsStore.ts
import { create } from 'zustand'
import type {
  DailySalesMetric,
  ProductSalesDaily,
  TopProduct,
  CategoryBreakdown,
  LowStockAlert,
  ExpiryAlert,
  AIInsight
} from '@renderer/types/analytics'

interface AnalyticsStore {
  // Dashboard KPIs
  todayMetrics: DailySalesMetric | null
  setTodayMetrics: (metrics: DailySalesMetric) => void

  weekMetrics: DailySalesMetric[]
  setWeekMetrics: (metrics: DailySalesMetric[]) => void

  monthMetrics: DailySalesMetric[]
  setMonthMetrics: (metrics: DailySalesMetric[]) => void

  // Product insights
  topProducts: TopProduct[]
  setTopProducts: (products: TopProduct[]) => void

  categoryBreakdown: CategoryBreakdown[]
  setCategoryBreakdown: (breakdown: CategoryBreakdown[]) => void

  // Alerts
  lowStockAlerts: LowStockAlert[]
  setLowStockAlerts: (alerts: LowStockAlert[]) => void

  expiryAlerts: ExpiryAlert[]
  setExpiryAlerts: (alerts: ExpiryAlert[]) => void

  // AI Insights
  aiInsights: AIInsight[]
  setAIInsights: (insights: AIInsight[]) => void

  // Date range filter
  dateRange: { start: string; end: string }
  setDateRange: (range: { start: string; end: string }) => void
}

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  todayMetrics: null,
  setTodayMetrics: (metrics) => set({ todayMetrics: metrics }),

  weekMetrics: [],
  setWeekMetrics: (metrics) => set({ weekMetrics: metrics }),

  monthMetrics: [],
  setMonthMetrics: (metrics) => set({ monthMetrics: metrics }),

  topProducts: [],
  setTopProducts: (products) => set({ topProducts: products }),

  categoryBreakdown: [],
  setCategoryBreakdown: (breakdown) => set({ categoryBreakdown: breakdown }),

  lowStockAlerts: [],
  setLowStockAlerts: (alerts) => set({ lowStockAlerts: alerts }),

  expiryAlerts: [],
  setExpiryAlerts: (alerts) => set({ expiryAlerts: alerts }),

  aiInsights: [],
  setAIInsights: (insights) => set({ aiInsights: insights }),

  dateRange: {
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  },
  setDateRange: (range) => set({ dateRange: range })
}))
```

**Step 3: Export types from index**

```typescript
// Add to src/renderer/src/types/index.ts
export * from './analytics'
```

**Step 4: Commit**

```bash
git add src/renderer/src/stores/analyticsStore.ts src/renderer/src/types/analytics.ts src/renderer/src/types/index.ts
git commit -m "feat: add analytics store and types"
```

---

### Task 3: Create IPC Channels for Analytics

**Files:**
- Modify: `src/main/ipc/channels.ts:40-80`

**Step 1: Add analytics IPC channels**

```typescript
// Add to src/main/ipc/channels.ts
export const IPC_CHANNELS = {
  // ... existing channels ...

  // Analytics - Dashboard
  ANALYTICS_DAILY_METRICS: 'analytics:daily-metrics',
  ANALYTICS_PERIOD_METRICS: 'analytics:period-metrics',
  ANALYTICS_TOP_PRODUCTS: 'analytics:top-products',
  ANALYTICS_CATEGORY_BREAKDOWN: 'analytics:category-breakdown',
  ANALYTICS_LOW_STOCK_ALERTS: 'analytics:low-stock-alerts',
  ANALYTICS_EXPIRY_ALERTS: 'analytics:expiry-alerts',

  // Analytics - Reports
  ANALYTICS_SALES_REPORT: 'analytics:sales-report',
  ANALYTICS_INVENTORY_VALUATION: 'analytics:inventory-valuation',
  ANALYTICS_PROFIT_LOSS_REPORT: 'analytics:profit-loss-report',

  // Analytics - Aggregation
  ANALYTICS_RUN_AGGREGATION: 'analytics:run-aggregation',

  // AI - Gemini Integration
  AI_REORDER_SUGGESTIONS: 'ai:reorder-suggestions',
  AI_SALES_FORECAST: 'ai:sales-forecast',
  AI_DEAD_STOCK_DETECTION: 'ai:dead-stock-detection',
  AI_NATURAL_QUERY: 'ai:natural-query'
} as const
```

**Step 2: Commit**

```bash
git add src/main/ipc/channels.ts
git commit -m "feat: add analytics and AI IPC channels"
```

---

### Task 4: Create Daily Aggregation Service

**Files:**
- Create: `src/main/services/analytics/aggregation.ts`

**Step 1: Create aggregation service**

```typescript
// src/main/services/analytics/aggregation.ts
import { getDatabase } from '../../db'

/**
 * Aggregates sales data for a specific date into product_sales_daily table.
 * This is the core analytics aggregation job that should run daily.
 */
export function aggregateDailySales(date?: string): { processed: number } {
  const db = getDatabase()
  const targetDate = date || new Date().toISOString().split('T')[0]

  // Delete existing aggregations for the date (idempotent)
  db.prepare('DELETE FROM product_sales_daily WHERE date = ?').run(targetDate)

  // Aggregate sales by product for the date
  const stmt = db.prepare(`
    INSERT INTO product_sales_daily (id, date, product_id, quantity_sold, revenue, cost, profit)
    SELECT
      lower(hex(randomblob(16))) as id,
      date(s.created_at) as date,
      si.product_id,
      SUM(si.quantity) as quantity_sold,
      SUM(si.line_total) as revenue,
      SUM(si.cost_price * si.quantity) as cost,
      SUM(si.line_total - (si.cost_price * si.quantity)) as profit
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE date(s.created_at) = ?
      AND s.status = 'completed'
    GROUP BY date(s.created_at), si.product_id
  `)

  const result = stmt.run(targetDate)
  return { processed: result.changes }
}

/**
 * Run aggregation for a date range (useful for backfilling or historical corrections)
 */
export function aggregateDateRange(startDate: string, endDate: string): { daysProcessed: number } {
  const start = new Date(startDate)
  const end = new Date(endDate)
  let daysProcessed = 0

  for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0]
    aggregateDailySales(dateStr)
    daysProcessed++
  }

  return { daysProcessed }
}

/**
 * Get the last aggregated date
 */
export function getLastAggregatedDate(): string | null {
  const db = getDatabase()
  const result = db
    .prepare('SELECT MAX(date) as last_date FROM product_sales_daily')
    .get() as { last_date: string | null }

  return result.last_date
}

/**
 * Run incremental aggregation (only missing dates since last aggregation)
 */
export function runIncrementalAggregation(): { daysProcessed: number } {
  const lastDate = getLastAggregatedDate()
  const today = new Date().toISOString().split('T')[0]

  if (!lastDate) {
    // No previous aggregations, run for last 30 days
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    return aggregateDateRange(startDate, today)
  }

  // Aggregate from day after last aggregation to today
  const nextDate = new Date(lastDate)
  nextDate.setDate(nextDate.getDate() + 1)
  const startDate = nextDate.toISOString().split('T')[0]

  if (startDate > today) {
    return { daysProcessed: 0 } // Already up to date
  }

  return aggregateDateRange(startDate, today)
}
```

**Step 2: Run dev to verify it compiles**

Run: `npm run dev`
Expected: No compilation errors

**Step 3: Commit**

```bash
git add src/main/services/analytics/aggregation.ts
git commit -m "feat: add daily sales aggregation service"
```

---

### Task 5: Create Analytics Query Service

**Files:**
- Create: `src/main/services/analytics/queries.ts`

**Step 1: Create analytics queries service**

```typescript
// src/main/services/analytics/queries.ts
import { getDatabase } from '../../db'
import type {
  DailySalesMetric,
  ProductSalesDaily,
  TopProduct,
  CategoryBreakdown,
  LowStockAlert,
  ExpiryAlert
} from '../../../renderer/src/types/analytics'

/**
 * Get aggregated metrics for a specific date
 */
export function getDailyMetrics(date: string): DailySalesMetric | null {
  const db = getDatabase()

  const metrics = db
    .prepare(
      `
    SELECT
      ? as date,
      COALESCE(SUM(psd.revenue), 0) as total_sales,
      COALESCE(SUM(psd.profit), 0) as total_profit,
      COALESCE(SUM(psd.cost), 0) as total_cost,
      COUNT(DISTINCT s.id) as transaction_count,
      COALESCE(SUM(psd.quantity_sold), 0) as items_sold,
      CASE
        WHEN COUNT(DISTINCT s.id) > 0 THEN COALESCE(SUM(psd.revenue), 0) / COUNT(DISTINCT s.id)
        ELSE 0
      END as avg_transaction
    FROM product_sales_daily psd
    LEFT JOIN sales s ON date(s.created_at) = psd.date AND s.status = 'completed'
    WHERE psd.date = ?
  `
    )
    .get(date, date) as DailySalesMetric | undefined

  return metrics || null
}

/**
 * Get metrics for a date range (for trend charts)
 */
export function getPeriodMetrics(startDate: string, endDate: string): DailySalesMetric[] {
  const db = getDatabase()

  const metrics = db
    .prepare(
      `
    SELECT
      psd.date,
      COALESCE(SUM(psd.revenue), 0) as total_sales,
      COALESCE(SUM(psd.profit), 0) as total_profit,
      COALESCE(SUM(psd.cost), 0) as total_cost,
      COUNT(DISTINCT s.id) as transaction_count,
      COALESCE(SUM(psd.quantity_sold), 0) as items_sold,
      CASE
        WHEN COUNT(DISTINCT s.id) > 0 THEN COALESCE(SUM(psd.revenue), 0) / COUNT(DISTINCT s.id)
        ELSE 0
      END as avg_transaction
    FROM product_sales_daily psd
    LEFT JOIN sales s ON date(s.created_at) = psd.date AND s.status = 'completed'
    WHERE psd.date BETWEEN ? AND ?
    GROUP BY psd.date
    ORDER BY psd.date ASC
  `
    )
    .all(startDate, endDate) as DailySalesMetric[]

  return metrics
}

/**
 * Get top selling products for a date range
 */
export function getTopProducts(startDate: string, endDate: string, limit: number = 10): TopProduct[] {
  const db = getDatabase()

  const products = db
    .prepare(
      `
    SELECT
      psd.product_id,
      p.name as product_name,
      SUM(psd.quantity_sold) as total_quantity,
      SUM(psd.revenue) as total_revenue,
      SUM(psd.profit) as total_profit
    FROM product_sales_daily psd
    JOIN products p ON psd.product_id = p.id
    WHERE psd.date BETWEEN ? AND ?
    GROUP BY psd.product_id, p.name
    ORDER BY total_revenue DESC
    LIMIT ?
  `
    )
    .all(startDate, endDate, limit) as TopProduct[]

  return products
}

/**
 * Get sales breakdown by category for a date range
 */
export function getCategoryBreakdown(startDate: string, endDate: string): CategoryBreakdown[] {
  const db = getDatabase()

  const breakdown = db
    .prepare(
      `
    WITH category_totals AS (
      SELECT
        COALESCE(c.id, 'uncategorized') as category_id,
        COALESCE(c.name, 'Uncategorized') as category_name,
        SUM(psd.revenue) as total_revenue,
        SUM(psd.profit) as total_profit
      FROM product_sales_daily psd
      JOIN products p ON psd.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE psd.date BETWEEN ? AND ?
      GROUP BY c.id, c.name
    ),
    grand_total AS (
      SELECT SUM(total_revenue) as grand_total_revenue
      FROM category_totals
    )
    SELECT
      ct.category_id,
      ct.category_name,
      ct.total_revenue,
      ct.total_profit,
      CASE
        WHEN gt.grand_total_revenue > 0 THEN ROUND((ct.total_revenue / gt.grand_total_revenue) * 100, 2)
        ELSE 0
      END as percentage
    FROM category_totals ct, grand_total gt
    ORDER BY ct.total_revenue DESC
  `
    )
    .all(startDate, endDate) as CategoryBreakdown[]

  return breakdown
}

/**
 * Get low stock alerts
 */
export function getLowStockAlerts(): LowStockAlert[] {
  const db = getDatabase()

  const alerts = db
    .prepare(
      `
    SELECT
      p.id as product_id,
      p.name as product_name,
      COALESCE(SUM(sb.quantity), 0) as current_stock,
      p.reorder_level,
      p.reorder_qty
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
    GROUP BY p.id
    HAVING current_stock <= p.reorder_level
    ORDER BY (current_stock - p.reorder_level) ASC
  `
    )
    .all() as LowStockAlert[]

  return alerts
}

/**
 * Get expiry alerts (batches expiring within 30 days)
 */
export function getExpiryAlerts(daysAhead: number = 30): ExpiryAlert[] {
  const db = getDatabase()

  const cutoffDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const alerts = db
    .prepare(
      `
    SELECT
      sb.id as batch_id,
      p.name as product_name,
      sb.batch_number,
      sb.quantity,
      sb.expiry_date,
      CAST(julianday(sb.expiry_date) - julianday('now') AS INTEGER) as days_until_expiry
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    WHERE sb.expiry_date IS NOT NULL
      AND sb.expiry_date <= ?
      AND sb.quantity > 0
    ORDER BY sb.expiry_date ASC
  `
    )
    .all(cutoffDate) as ExpiryAlert[]

  return alerts
}
```

**Step 2: Commit**

```bash
git add src/main/services/analytics/queries.ts
git commit -m "feat: add analytics query service"
```

---

### Task 6: Register Analytics IPC Handlers

**Files:**
- Create: `src/main/ipc/analytics-handlers.ts`
- Modify: `src/main/ipc/handlers.ts:10,30`

**Step 1: Create analytics handlers**

```typescript
// src/main/ipc/analytics-handlers.ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  aggregateDailySales,
  aggregateDateRange,
  runIncrementalAggregation
} from '../services/analytics/aggregation'
import {
  getDailyMetrics,
  getPeriodMetrics,
  getTopProducts,
  getCategoryBreakdown,
  getLowStockAlerts,
  getExpiryAlerts
} from '../services/analytics/queries'

export function registerAnalyticsHandlers(): void {
  // Dashboard queries
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_DAILY_METRICS, (_event, date: string) => {
    return getDailyMetrics(date)
  })

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_PERIOD_METRICS,
    (_event, { startDate, endDate }: { startDate: string; endDate: string }) => {
      return getPeriodMetrics(startDate, endDate)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_TOP_PRODUCTS,
    (_event, { startDate, endDate, limit }: { startDate: string; endDate: string; limit?: number }) => {
      return getTopProducts(startDate, endDate, limit)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.ANALYTICS_CATEGORY_BREAKDOWN,
    (_event, { startDate, endDate }: { startDate: string; endDate: string }) => {
      return getCategoryBreakdown(startDate, endDate)
    }
  )

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_LOW_STOCK_ALERTS, () => {
    return getLowStockAlerts()
  })

  ipcMain.handle(IPC_CHANNELS.ANALYTICS_EXPIRY_ALERTS, (_event, daysAhead?: number) => {
    return getExpiryAlerts(daysAhead)
  })

  // Aggregation control
  ipcMain.handle(IPC_CHANNELS.ANALYTICS_RUN_AGGREGATION, (_event, date?: string) => {
    if (date) {
      return aggregateDailySales(date)
    } else {
      return runIncrementalAggregation()
    }
  })
}
```

**Step 2: Register in main handlers**

```typescript
// Modify src/main/ipc/handlers.ts
import { registerAnalyticsHandlers } from './analytics-handlers'

export function registerHandlers(): void {
  // ... existing handlers ...
  registerAnalyticsHandlers()
}
```

**Step 3: Commit**

```bash
git add src/main/ipc/analytics-handlers.ts src/main/ipc/handlers.ts
git commit -m "feat: register analytics IPC handlers"
```

---

### Task 7: Expose Analytics API in Preload

**Files:**
- Modify: `src/preload/index.ts:80-120`

**Step 1: Add analytics API to preload**

```typescript
// Add to src/preload/index.ts window.electron object
analytics: {
  getDailyMetrics: (date: string) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_DAILY_METRICS, date),
  getPeriodMetrics: (startDate: string, endDate: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_PERIOD_METRICS, { startDate, endDate }),
  getTopProducts: (startDate: string, endDate: string, limit?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_TOP_PRODUCTS, { startDate, endDate, limit }),
  getCategoryBreakdown: (startDate: string, endDate: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_CATEGORY_BREAKDOWN, { startDate, endDate }),
  getLowStockAlerts: () => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_LOW_STOCK_ALERTS),
  getExpiryAlerts: (daysAhead?: number) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_EXPIRY_ALERTS, daysAhead),
  runAggregation: (date?: string) => ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_RUN_AGGREGATION, date)
},

ai: {
  getReorderSuggestions: () => ipcRenderer.invoke(IPC_CHANNELS.AI_REORDER_SUGGESTIONS),
  getSalesForecast: (productId: string, days: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.AI_SALES_FORECAST, { productId, days }),
  getDeadStockDetection: () => ipcRenderer.invoke(IPC_CHANNELS.AI_DEAD_STOCK_DETECTION),
  naturalQuery: (query: string) => ipcRenderer.invoke(IPC_CHANNELS.AI_NATURAL_QUERY, query)
}
```

**Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose analytics and AI APIs in preload"
```

---

## Part 1 Complete - Infrastructure

Tasks 1-7 establish the analytics infrastructure:
- ✅ Analytics page layout with tabs
- ✅ Analytics store and types
- ✅ IPC channels for analytics and AI
- ✅ Daily aggregation service
- ✅ Analytics query service
- ✅ IPC handlers registration
- ✅ Preload API exposure

---

## Part 2: Dashboard Components

### Task 8: Create KPI Cards Component

**Files:**
- Create: `src/renderer/src/components/analytics/KPICards.tsx`

**Step 1: Create KPI cards component**

```typescript
// src/renderer/src/components/analytics/KPICards.tsx
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
```

**Step 2: Run dev to verify it compiles**

Run: `npm run dev`
Expected: No compilation errors

**Step 3: Commit**

```bash
git add src/renderer/src/components/analytics/KPICards.tsx
git commit -m "feat: add KPI cards component"
```

---

### Task 9: Create Sales Trend Chart

**Files:**
- Create: `src/renderer/src/components/analytics/SalesTrendChart.tsx`

**Step 1: Install Recharts**

Run: `npm install recharts`

**Step 2: Create sales trend chart component**

```typescript
// src/renderer/src/components/analytics/SalesTrendChart.tsx
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
```

**Step 3: Commit**

```bash
git add src/renderer/src/components/analytics/SalesTrendChart.tsx package.json package-lock.json
git commit -m "feat: add sales trend chart with Recharts"
```

---

### Task 10: Create Top Products List

**Files:**
- Create: `src/renderer/src/components/analytics/TopProductsList.tsx`

**Step 1: Create top products component**

```typescript
// src/renderer/src/components/analytics/TopProductsList.tsx
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
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/analytics/TopProductsList.tsx
git commit -m "feat: add top products list component"
```

---

### Task 11: Create Category Breakdown Pie Chart

**Files:**
- Create: `src/renderer/src/components/analytics/CategoryBreakdownChart.tsx`

**Step 1: Create pie chart component**

```typescript
// src/renderer/src/components/analytics/CategoryBreakdownChart.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import type { CategoryBreakdown } from '@renderer/types/analytics'

interface CategoryBreakdownChartProps {
  data: CategoryBreakdown[]
  isLoading?: boolean
}

const COLORS = [
  'hsl(var(--primary))',
  'hsl(142, 76%, 36%)',
  'hsl(221, 83%, 53%)',
  'hsl(25, 95%, 53%)',
  'hsl(280, 67%, 50%)',
  'hsl(340, 82%, 52%)',
  'hsl(48, 96%, 53%)',
  'hsl(173, 80%, 40%)'
]

export function CategoryBreakdownChart({
  data,
  isLoading
}: CategoryBreakdownChartProps): React.JSX.Element {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
          <CardDescription>Sales distribution by category</CardDescription>
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
          <CardTitle>Category Breakdown</CardTitle>
          <CardDescription>Sales distribution by category</CardDescription>
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
    name: d.category_name,
    value: d.total_revenue,
    percentage: d.percentage
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Breakdown</CardTitle>
        <CardDescription>Sales distribution by product category</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percentage }) => `${name} ${percentage}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => `Rs. ${value.toFixed(2)}`}
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }}
            />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/analytics/CategoryBreakdownChart.tsx
git commit -m "feat: add category breakdown pie chart"
```

---

### Task 12: Create Alerts Panel

**Files:**
- Create: `src/renderer/src/components/analytics/AlertsPanel.tsx`

**Step 1: Create alerts panel component**

```typescript
// src/renderer/src/components/analytics/AlertsPanel.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { AlertTriangle, Clock } from 'lucide-react'
import type { LowStockAlert, ExpiryAlert } from '@renderer/types/analytics'

interface AlertsPanelProps {
  lowStockAlerts: LowStockAlert[]
  expiryAlerts: ExpiryAlert[]
  isLoading?: boolean
}

export function AlertsPanel({
  lowStockAlerts,
  expiryAlerts,
  isLoading
}: AlertsPanelProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Alerts</CardTitle>
        <CardDescription>Low stock and expiry notifications</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="low-stock">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="low-stock">
              Low Stock ({lowStockAlerts.length})
            </TabsTrigger>
            <TabsTrigger value="expiring">Expiring ({expiryAlerts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="low-stock" className="space-y-3">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : lowStockAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No low stock alerts
              </div>
            ) : (
              lowStockAlerts.map((alert) => (
                <div
                  key={alert.product_id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-destructive/10"
                >
                  <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{alert.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      Current: {alert.current_stock} | Reorder at: {alert.reorder_level}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">Order {alert.reorder_qty}</p>
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="expiring" className="space-y-3">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : expiryAlerts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No expiring items
              </div>
            ) : (
              expiryAlerts.map((alert) => {
                const isExpired = alert.days_until_expiry < 0
                const isUrgent = alert.days_until_expiry <= 7

                return (
                  <div
                    key={alert.batch_id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      isExpired
                        ? 'bg-destructive/20'
                        : isUrgent
                          ? 'bg-orange-500/10'
                          : 'bg-yellow-500/10'
                    }`}
                  >
                    <Clock
                      className={`h-5 w-5 mt-0.5 ${
                        isExpired
                          ? 'text-destructive'
                          : isUrgent
                            ? 'text-orange-600'
                            : 'text-yellow-600'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{alert.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Batch: {alert.batch_number || 'N/A'} | Qty: {alert.quantity}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Expires: {alert.expiry_date}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-sm font-medium ${
                          isExpired
                            ? 'text-destructive'
                            : isUrgent
                              ? 'text-orange-600'
                              : 'text-yellow-600'
                        }`}
                      >
                        {isExpired ? 'Expired' : `${alert.days_until_expiry}d`}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/analytics/AlertsPanel.tsx
git commit -m "feat: add alerts panel for low stock and expiry"
```

---

### Task 13: Wire Up Dashboard Components

**Files:**
- Modify: `src/renderer/src/pages/AnalyticsPage.tsx:1-100`

**Step 1: Import components and add state management**

```typescript
// src/renderer/src/pages/AnalyticsPage.tsx
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
    setExpiryAlerts,
    dateRange
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
```

**Step 2: Run dev and test dashboard**

Run: `npm run dev`
Expected: Dashboard loads with KPIs, charts, top products, and alerts

**Step 3: Commit**

```bash
git add src/renderer/src/pages/AnalyticsPage.tsx
git commit -m "feat: wire up dashboard with all analytics components"
```

---

## Part 2 Complete - Dashboard UI

Tasks 8-13 build the dashboard interface:
- ✅ KPI cards (sales, profit, items, avg transaction)
- ✅ Sales trend line chart
- ✅ Top products list with rankings
- ✅ Category breakdown pie chart
- ✅ Alerts panel (low stock + expiry)
- ✅ Wired up dashboard with data loading

---

## Part 3: Reports & AI Integration

### Task 14: Create Report Generator Service

**Files:**
- Create: `src/main/services/analytics/reports.ts`

**Step 1: Install jsPDF for PDF generation**

Run: `npm install jspdf`

**Step 2: Create reports service**

```typescript
// src/main/services/analytics/reports.ts
import { getDatabase } from '../../db'

export interface SalesReportData {
  start_date: string
  end_date: string
  total_sales: number
  total_profit: number
  total_cost: number
  total_transactions: number
  total_items_sold: number
  avg_transaction: number
  daily_breakdown: Array<{
    date: string
    sales: number
    profit: number
    transactions: number
  }>
  top_products: Array<{
    product_name: string
    quantity: number
    revenue: number
    profit: number
  }>
  payment_methods: Array<{
    method: string
    count: number
    amount: number
  }>
}

export interface InventoryValuationData {
  total_value: number
  total_cost: number
  total_items: number
  by_category: Array<{
    category_name: string
    item_count: number
    total_quantity: number
    total_value: number
    total_cost: number
  }>
  by_product: Array<{
    product_name: string
    quantity: number
    cost_per_unit: number
    unit_price: number
    total_cost: number
    total_value: number
  }>
}

export interface ProfitLossData {
  start_date: string
  end_date: string
  total_revenue: number
  total_cost: number
  gross_profit: number
  gross_margin_percent: number
  by_category: Array<{
    category_name: string
    revenue: number
    cost: number
    profit: number
    margin_percent: number
  }>
  by_month: Array<{
    month: string
    revenue: number
    cost: number
    profit: number
  }>
}

/**
 * Generate comprehensive sales report for date range
 */
export function generateSalesReport(startDate: string, endDate: string): SalesReportData {
  const db = getDatabase()

  // Summary metrics
  const summary = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(total), 0) as total_sales,
      COALESCE(SUM(total - (
        SELECT SUM(si.cost_price * si.quantity)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )), 0) as total_profit,
      COALESCE(SUM((
        SELECT SUM(si.cost_price * si.quantity)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )), 0) as total_cost,
      COUNT(*) as total_transactions,
      COALESCE(SUM((
        SELECT SUM(si.quantity)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )), 0) as total_items_sold
    FROM sales s
    WHERE date(s.created_at) BETWEEN ? AND ?
      AND s.status = 'completed'
  `
    )
    .get(startDate, endDate) as any

  const avgTransaction = summary.total_transactions > 0 ? summary.total_sales / summary.total_transactions : 0

  // Daily breakdown
  const dailyBreakdown = db
    .prepare(
      `
    SELECT
      date(s.created_at) as date,
      COALESCE(SUM(s.total), 0) as sales,
      COALESCE(SUM(s.total - (
        SELECT SUM(si.cost_price * si.quantity)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )), 0) as profit,
      COUNT(*) as transactions
    FROM sales s
    WHERE date(s.created_at) BETWEEN ? AND ?
      AND s.status = 'completed'
    GROUP BY date(s.created_at)
    ORDER BY date ASC
  `
    )
    .all(startDate, endDate) as any[]

  // Top products
  const topProducts = db
    .prepare(
      `
    SELECT
      p.name as product_name,
      SUM(si.quantity) as quantity,
      SUM(si.line_total) as revenue,
      SUM(si.line_total - (si.cost_price * si.quantity)) as profit
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    WHERE date(s.created_at) BETWEEN ? AND ?
      AND s.status = 'completed'
    GROUP BY p.id, p.name
    ORDER BY revenue DESC
    LIMIT 10
  `
    )
    .all(startDate, endDate) as any[]

  // Payment methods breakdown
  const paymentMethods = db
    .prepare(
      `
    SELECT
      payment_method as method,
      COUNT(*) as count,
      SUM(total) as amount
    FROM sales
    WHERE date(created_at) BETWEEN ? AND ?
      AND status = 'completed'
    GROUP BY payment_method
  `
    )
    .all(startDate, endDate) as any[]

  return {
    start_date: startDate,
    end_date: endDate,
    total_sales: summary.total_sales,
    total_profit: summary.total_profit,
    total_cost: summary.total_cost,
    total_transactions: summary.total_transactions,
    total_items_sold: summary.total_items_sold,
    avg_transaction: avgTransaction,
    daily_breakdown: dailyBreakdown,
    top_products: topProducts,
    payment_methods: paymentMethods
  }
}

/**
 * Generate inventory valuation report (current stock value)
 */
export function generateInventoryValuation(): InventoryValuationData {
  const db = getDatabase()

  // Overall summary
  const summary = db
    .prepare(
      `
    SELECT
      COUNT(DISTINCT p.id) as total_items,
      COALESCE(SUM(sb.quantity * p.cost_price), 0) as total_cost,
      COALESCE(SUM(sb.quantity * p.unit_price), 0) as total_value
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
  `
    )
    .get() as any

  // By category
  const byCategory = db
    .prepare(
      `
    SELECT
      COALESCE(c.name, 'Uncategorized') as category_name,
      COUNT(DISTINCT p.id) as item_count,
      COALESCE(SUM(sb.quantity), 0) as total_quantity,
      COALESCE(SUM(sb.quantity * p.cost_price), 0) as total_cost,
      COALESCE(SUM(sb.quantity * p.unit_price), 0) as total_value
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
    GROUP BY c.id, c.name
    ORDER BY total_value DESC
  `
    )
    .all() as any[]

  // By product (with stock)
  const byProduct = db
    .prepare(
      `
    SELECT
      p.name as product_name,
      COALESCE(SUM(sb.quantity), 0) as quantity,
      p.cost_price as cost_per_unit,
      p.unit_price as unit_price,
      COALESCE(SUM(sb.quantity), 0) * p.cost_price as total_cost,
      COALESCE(SUM(sb.quantity), 0) * p.unit_price as total_value
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
    GROUP BY p.id
    HAVING quantity > 0
    ORDER BY total_value DESC
  `
    )
    .all() as any[]

  return {
    total_value: summary.total_value,
    total_cost: summary.total_cost,
    total_items: summary.total_items,
    by_category: byCategory,
    by_product: byProduct
  }
}

/**
 * Generate profit & loss report for date range
 */
export function generateProfitLossReport(startDate: string, endDate: string): ProfitLossData {
  const db = getDatabase()

  // Overall P&L
  const overall = db
    .prepare(
      `
    SELECT
      COALESCE(SUM(psd.revenue), 0) as total_revenue,
      COALESCE(SUM(psd.cost), 0) as total_cost,
      COALESCE(SUM(psd.profit), 0) as gross_profit
    FROM product_sales_daily psd
    WHERE psd.date BETWEEN ? AND ?
  `
    )
    .get(startDate, endDate) as any

  const grossMarginPercent =
    overall.total_revenue > 0 ? (overall.gross_profit / overall.total_revenue) * 100 : 0

  // By category
  const byCategory = db
    .prepare(
      `
    SELECT
      COALESCE(c.name, 'Uncategorized') as category_name,
      SUM(psd.revenue) as revenue,
      SUM(psd.cost) as cost,
      SUM(psd.profit) as profit,
      CASE
        WHEN SUM(psd.revenue) > 0 THEN (SUM(psd.profit) / SUM(psd.revenue)) * 100
        ELSE 0
      END as margin_percent
    FROM product_sales_daily psd
    JOIN products p ON psd.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE psd.date BETWEEN ? AND ?
    GROUP BY c.id, c.name
    ORDER BY profit DESC
  `
    )
    .all(startDate, endDate) as any[]

  // By month (for trend)
  const byMonth = db
    .prepare(
      `
    SELECT
      strftime('%Y-%m', psd.date) as month,
      SUM(psd.revenue) as revenue,
      SUM(psd.cost) as cost,
      SUM(psd.profit) as profit
    FROM product_sales_daily psd
    WHERE psd.date BETWEEN ? AND ?
    GROUP BY month
    ORDER BY month ASC
  `
    )
    .all(startDate, endDate) as any[]

  return {
    start_date: startDate,
    end_date: endDate,
    total_revenue: overall.total_revenue,
    total_cost: overall.total_cost,
    gross_profit: overall.gross_profit,
    gross_margin_percent: grossMarginPercent,
    by_category: byCategory,
    by_month: byMonth
  }
}
```

**Step 3: Commit**

```bash
git add src/main/services/analytics/reports.ts package.json package-lock.json
git commit -m "feat: add report generator service"
```

---

### Task 15: Register Report Handlers

**Files:**
- Modify: `src/main/ipc/analytics-handlers.ts:50-70`

**Step 1: Add report handlers**

```typescript
// Add to src/main/ipc/analytics-handlers.ts
import {
  generateSalesReport,
  generateInventoryValuation,
  generateProfitLossReport
} from '../services/analytics/reports'

// Add in registerAnalyticsHandlers function:
ipcMain.handle(
  IPC_CHANNELS.ANALYTICS_SALES_REPORT,
  (_event, { startDate, endDate }: { startDate: string; endDate: string }) => {
    return generateSalesReport(startDate, endDate)
  }
)

ipcMain.handle(IPC_CHANNELS.ANALYTICS_INVENTORY_VALUATION, () => {
  return generateInventoryValuation()
})

ipcMain.handle(
  IPC_CHANNELS.ANALYTICS_PROFIT_LOSS_REPORT,
  (_event, { startDate, endDate }: { startDate: string; endDate: string }) => {
    return generateProfitLossReport(startDate, endDate)
  }
)
```

**Step 2: Update preload API**

```typescript
// Add to src/preload/index.ts analytics section
reports: {
  generateSalesReport: (startDate: string, endDate: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_SALES_REPORT, { startDate, endDate }),
  generateInventoryValuation: () =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_INVENTORY_VALUATION),
  generateProfitLossReport: (startDate: string, endDate: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.ANALYTICS_PROFIT_LOSS_REPORT, { startDate, endDate })
}
```

**Step 3: Commit**

```bash
git add src/main/ipc/analytics-handlers.ts src/preload/index.ts
git commit -m "feat: register report generation handlers"
```

---

### Task 16: Create Gemini AI Service

**Files:**
- Create: `src/main/services/ai/gemini.ts`
- Create: `src/main/services/ai/insights.ts`

**Step 1: Install Google Generative AI SDK**

Run: `npm install @google/generative-ai`

**Step 2: Create Gemini service wrapper**

```typescript
// src/main/services/ai/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getDatabase } from '../../db'

let genAI: GoogleGenerativeAI | null = null

/**
 * Initialize Gemini API with key from settings
 */
export function initializeGemini(): boolean {
  const db = getDatabase()
  const setting = db.prepare('SELECT value FROM settings WHERE key = ?').get('gemini_api_key') as
    | { value: string }
    | undefined

  if (!setting || !setting.value) {
    console.warn('Gemini API key not configured')
    return false
  }

  try {
    genAI = new GoogleGenerativeAI(setting.value)
    return true
  } catch (error) {
    console.error('Failed to initialize Gemini:', error)
    return false
  }
}

/**
 * Generate content using Gemini
 */
export async function generateContent(prompt: string): Promise<string> {
  if (!genAI) {
    const initialized = initializeGemini()
    if (!initialized) {
      throw new Error('Gemini API not configured. Add API key in settings.')
    }
  }

  try {
    const model = genAI!.getGenerativeModel({ model: 'gemini-pro' })
    const result = await model.generateContent(prompt)
    const response = await result.response
    return response.text()
  } catch (error: any) {
    throw new Error(`Gemini API error: ${error.message}`)
  }
}

/**
 * Check if Gemini is configured and available
 */
export function isGeminiAvailable(): boolean {
  if (!genAI) {
    return initializeGemini()
  }
  return true
}
```

**Step 3: Create AI insights service**

```typescript
// src/main/services/ai/insights.ts
import { getDatabase } from '../../db'
import { generateContent, isGeminiAvailable } from './gemini'
import { getLowStockAlerts } from '../analytics/queries'

export interface ReorderSuggestion {
  product_id: string
  product_name: string
  current_stock: number
  suggested_order_qty: number
  reason: string
  confidence: number
  priority: 'high' | 'medium' | 'low'
}

export interface SalesForecast {
  product_id: string
  product_name: string
  forecast_days: number
  predicted_sales: number
  confidence_interval: { low: number; high: number }
  trend: 'increasing' | 'stable' | 'decreasing'
}

export interface DeadStockItem {
  product_id: string
  product_name: string
  current_stock: number
  days_since_last_sale: number
  suggested_action: string
}

/**
 * Generate AI-powered reorder suggestions
 */
export async function generateReorderSuggestions(): Promise<ReorderSuggestion[]> {
  const db = getDatabase()
  const lowStockItems = getLowStockAlerts()

  if (!isGeminiAvailable()) {
    // Fallback: simple rule-based suggestions
    return lowStockItems.map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      current_stock: item.current_stock,
      suggested_order_qty: item.reorder_qty,
      reason: `Stock level (${item.current_stock}) is below reorder point (${item.reorder_level})`,
      confidence: 0.8,
      priority: item.current_stock === 0 ? 'high' : item.current_stock < item.reorder_level / 2 ? 'medium' : 'low'
    }))
  }

  // Get historical sales data for context
  const salesHistory = db
    .prepare(
      `
    SELECT
      p.id,
      p.name,
      SUM(psd.quantity_sold) as total_sold_30d,
      AVG(psd.quantity_sold) as avg_daily_sales
    FROM products p
    JOIN product_sales_daily psd ON p.id = psd.product_id
    WHERE psd.date >= date('now', '-30 days')
      AND p.id IN (${lowStockItems.map(() => '?').join(',')})
    GROUP BY p.id
  `
    )
    .all(...lowStockItems.map((i) => i.product_id)) as any[]

  const prompt = `As a pharmacy inventory AI assistant, analyze these low-stock items and provide reorder recommendations:

Low Stock Items:
${lowStockItems.map((item, i) => `${i + 1}. ${item.product_name}: Current stock ${item.current_stock}, Reorder level ${item.reorder_level}, Default reorder qty ${item.reorder_qty}`).join('\n')}

30-Day Sales History:
${salesHistory.map((s) => `- ${s.name}: Total sold ${s.total_sold_30d}, Avg ${s.avg_daily_sales}/day`).join('\n')}

For each item, provide:
1. Suggested order quantity (considering sales velocity)
2. Priority (high/medium/low)
3. Brief reason

Format as JSON array: [{"product_name": "X", "suggested_order_qty": N, "priority": "high", "reason": "..."}]`

  try {
    const response = await generateContent(prompt)
    const jsonMatch = response.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const suggestions = JSON.parse(jsonMatch[0])
      return suggestions.map((s: any) => {
        const item = lowStockItems.find((i) => i.product_name === s.product_name)
        return {
          product_id: item?.product_id || '',
          product_name: s.product_name,
          current_stock: item?.current_stock || 0,
          suggested_order_qty: s.suggested_order_qty,
          reason: s.reason,
          confidence: 0.85,
          priority: s.priority
        }
      })
    }
  } catch (error) {
    console.error('AI reorder suggestions failed, using fallback:', error)
  }

  // Fallback to rule-based
  return lowStockItems.map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    current_stock: item.current_stock,
    suggested_order_qty: item.reorder_qty,
    reason: `Stock below reorder level`,
    confidence: 0.7,
    priority: item.current_stock === 0 ? 'high' : 'medium'
  }))
}

/**
 * Detect dead stock items (not selling)
 */
export async function detectDeadStock(): Promise<DeadStockItem[]> {
  const db = getDatabase()

  const deadStockQuery = db
    .prepare(
      `
    SELECT
      p.id as product_id,
      p.name as product_name,
      COALESCE(SUM(sb.quantity), 0) as current_stock,
      COALESCE(
        julianday('now') - julianday(MAX(s.created_at)),
        999
      ) as days_since_last_sale
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    LEFT JOIN sale_items si ON p.id = si.product_id
    LEFT JOIN sales s ON si.sale_id = s.id AND s.status = 'completed'
    WHERE p.is_active = 1
    GROUP BY p.id
    HAVING current_stock > 0 AND days_since_last_sale > 60
    ORDER BY days_since_last_sale DESC
  `
    )
    .all() as any[]

  return deadStockQuery.map((item) => ({
    product_id: item.product_id,
    product_name: item.product_name,
    current_stock: item.current_stock,
    days_since_last_sale: Math.floor(item.days_since_last_sale),
    suggested_action:
      item.days_since_last_sale > 180
        ? 'Consider discontinuing or promotional pricing'
        : 'Monitor closely, may need promotion'
  }))
}

/**
 * Natural language query handler
 */
export async function handleNaturalQuery(query: string): Promise<string> {
  if (!isGeminiAvailable()) {
    return 'AI features require Gemini API key configuration. Please add your API key in settings.'
  }

  const db = getDatabase()

  // Get relevant context
  const today = new Date().toISOString().split('T')[0]
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const contextData = {
    recent_sales: db
      .prepare(
        `
      SELECT date, SUM(revenue) as sales, SUM(profit) as profit
      FROM product_sales_daily
      WHERE date BETWEEN ? AND ?
      GROUP BY date
    `
      )
      .all(weekAgo, today),
    top_products: db
      .prepare(
        `
      SELECT p.name, SUM(psd.quantity_sold) as qty, SUM(psd.revenue) as revenue
      FROM product_sales_daily psd
      JOIN products p ON psd.product_id = p.id
      WHERE psd.date BETWEEN ? AND ?
      GROUP BY p.name
      ORDER BY revenue DESC
      LIMIT 5
    `
      )
      .all(weekAgo, today),
    low_stock_count: db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM (
        SELECT p.id
        FROM products p
        LEFT JOIN stock_batches sb ON p.id = sb.product_id
        GROUP BY p.id
        HAVING COALESCE(SUM(sb.quantity), 0) <= p.reorder_level
      )
    `
      )
      .get() as { count: number }
  }

  const prompt = `You are a pharmacy POS AI assistant. Answer this question based on the data:

Question: ${query}

Context Data:
- Recent 7-day sales: ${JSON.stringify(contextData.recent_sales)}
- Top products: ${JSON.stringify(contextData.top_products)}
- Low stock items: ${contextData.low_stock_count.count}

Provide a concise, helpful answer.`

  try {
    return await generateContent(prompt)
  } catch (error: any) {
    return `Unable to process query: ${error.message}`
  }
}
```

**Step 4: Commit**

```bash
git add src/main/services/ai/gemini.ts src/main/services/ai/insights.ts package.json package-lock.json
git commit -m "feat: add Gemini AI service and insights"
```

---

### Task 17: Register AI Handlers

**Files:**
- Create: `src/main/ipc/ai-handlers.ts`
- Modify: `src/main/ipc/handlers.ts:15,35`

**Step 1: Create AI handlers**

```typescript
// src/main/ipc/ai-handlers.ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  generateReorderSuggestions,
  detectDeadStock,
  handleNaturalQuery
} from '../services/ai/insights'

export function registerAIHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AI_REORDER_SUGGESTIONS, async () => {
    return await generateReorderSuggestions()
  })

  ipcMain.handle(IPC_CHANNELS.AI_SALES_FORECAST, async (_event, { productId, days }) => {
    // Placeholder - complex forecasting would require ML model
    return {
      product_id: productId,
      forecast_days: days,
      predicted_sales: 0,
      message: 'Sales forecasting coming soon'
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_DEAD_STOCK_DETECTION, async () => {
    return await detectDeadStock()
  })

  ipcMain.handle(IPC_CHANNELS.AI_NATURAL_QUERY, async (_event, query: string) => {
    return await handleNaturalQuery(query)
  })
}
```

**Step 2: Register in main handlers**

```typescript
// Add to src/main/ipc/handlers.ts
import { registerAIHandlers } from './ai-handlers'

export function registerHandlers(): void {
  // ... existing
  registerAIHandlers()
}
```

**Step 3: Commit**

```bash
git add src/main/ipc/ai-handlers.ts src/main/ipc/handlers.ts
git commit -m "feat: register AI insight handlers"
```

---

### Task 18: Create AI Insights UI Components

**Files:**
- Create: `src/renderer/src/components/analytics/AIInsightsPanel.tsx`
- Create: `src/renderer/src/components/analytics/ReportsPanel.tsx`

**Step 1: Create AI insights panel**

```typescript
// src/renderer/src/components/analytics/AIInsightsPanel.tsx
import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Sparkles, TrendingDown, MessageSquare, RefreshCw } from 'lucide-react'

export function AIInsightsPanel(): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(false)
  const [reorderSuggestions, setReorderSuggestions] = useState<any[]>([])
  const [deadStock, setDeadStock] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [queryResponse, setQueryResponse] = useState('')

  const loadReorderSuggestions = async () => {
    setIsLoading(true)
    try {
      const suggestions = await window.electron.ai.getReorderSuggestions()
      setReorderSuggestions(suggestions)
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const loadDeadStock = async () => {
    setIsLoading(true)
    try {
      const items = await window.electron.ai.getDeadStockDetection()
      setDeadStock(items)
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleNaturalQuery = async () => {
    if (!query.trim()) return

    setIsLoading(true)
    try {
      const response = await window.electron.ai.naturalQuery(query)
      setQueryResponse(response)
    } catch (error: any) {
      setQueryResponse(`Error: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI-Powered Insights
          </CardTitle>
          <CardDescription>
            Smart recommendations powered by Gemini AI (requires API key in settings)
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="reorder">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="reorder">Reorder Suggestions</TabsTrigger>
          <TabsTrigger value="dead-stock">Dead Stock</TabsTrigger>
          <TabsTrigger value="query">Ask AI</TabsTrigger>
        </TabsList>

        <TabsContent value="reorder" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={loadReorderSuggestions} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Generate Suggestions
            </Button>
          </div>

          {reorderSuggestions.length > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                {reorderSuggestions.map((item) => (
                  <div key={item.product_id} className="p-4 rounded-lg border">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Current stock: {item.current_stock}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded ${
                          item.priority === 'high'
                            ? 'bg-destructive/10 text-destructive'
                            : item.priority === 'medium'
                              ? 'bg-orange-500/10 text-orange-600'
                              : 'bg-blue-500/10 text-blue-600'
                        }`}
                      >
                        {item.priority}
                      </span>
                    </div>
                    <p className="text-sm mb-2">{item.reason}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        Suggested order: {item.suggested_order_qty} units
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Confidence: {(item.confidence * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dead-stock" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={loadDeadStock} disabled={isLoading}>
              <TrendingDown className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Detect Dead Stock
            </Button>
          </div>

          {deadStock.length > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                {deadStock.map((item) => (
                  <div key={item.product_id} className="p-4 rounded-lg border bg-orange-500/5">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Stock: {item.current_stock} | Last sale: {item.days_since_last_sale}{' '}
                          days ago
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-orange-600">{item.suggested_action}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="query" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Ask anything about your pharmacy data..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleNaturalQuery()}
                />
                <Button onClick={handleNaturalQuery} disabled={isLoading}>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Ask
                </Button>
              </div>

              {queryResponse && (
                <div className="p-4 rounded-lg border bg-muted/50">
                  <p className="whitespace-pre-wrap">{queryResponse}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

**Step 2: Create reports panel**

```typescript
// src/renderer/src/components/analytics/ReportsPanel.tsx
import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { FileText, Download } from 'lucide-react'

export function ReportsPanel(): React.JSX.Element {
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [isLoading, setIsLoading] = useState(false)

  const generateSalesReport = async () => {
    setIsLoading(true)
    try {
      const report = await window.electron.analytics.reports.generateSalesReport(
        startDate,
        endDate
      )
      console.log('Sales Report:', report)
      alert(`Sales Report Generated!\nTotal Sales: Rs. ${report.total_sales.toFixed(2)}`)
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const generateInventoryReport = async () => {
    setIsLoading(true)
    try {
      const report = await window.electron.analytics.reports.generateInventoryValuation()
      console.log('Inventory Valuation:', report)
      alert(`Inventory Valuation Generated!\nTotal Value: Rs. ${report.total_value.toFixed(2)}`)
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const generateProfitLossReport = async () => {
    setIsLoading(true)
    try {
      const report = await window.electron.analytics.reports.generateProfitLossReport(
        startDate,
        endDate
      )
      console.log('P&L Report:', report)
      alert(
        `Profit & Loss Report Generated!\nGross Profit: Rs. ${report.gross_profit.toFixed(2)} (${report.gross_margin_percent.toFixed(1)}%)`
      )
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Report Generator</CardTitle>
          <CardDescription>Generate comprehensive business reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <FileText className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Sales Report</CardTitle>
            <CardDescription>Comprehensive sales analysis with daily breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={generateSalesReport} disabled={isLoading} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Generate
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <FileText className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Inventory Valuation</CardTitle>
            <CardDescription>Current stock value and breakdown by category</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={generateInventoryReport} disabled={isLoading} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Generate
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <FileText className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Profit & Loss</CardTitle>
            <CardDescription>P&L statement with category breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={generateProfitLossReport} disabled={isLoading} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Generate
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

**Step 3: Wire up in Analytics page**

```typescript
// Update src/renderer/src/pages/AnalyticsPage.tsx
import { AIInsightsPanel } from '@renderer/components/analytics/AIInsightsPanel'
import { ReportsPanel } from '@renderer/components/analytics/ReportsPanel'

// Replace placeholder tabs:
<TabsContent value="reports" className="flex-1">
  <ReportsPanel />
</TabsContent>

<TabsContent value="ai" className="flex-1">
  <AIInsightsPanel />
</TabsContent>
```

**Step 4: Commit**

```bash
git add src/renderer/src/components/analytics/AIInsightsPanel.tsx src/renderer/src/components/analytics/ReportsPanel.tsx src/renderer/src/pages/AnalyticsPage.tsx
git commit -m "feat: add AI insights and reports UI panels"
```

---

## Part 3 Complete - Reports & AI

Tasks 14-18 complete reports and AI features:
- ✅ Report generator service (sales, inventory, P&L)
- ✅ Report IPC handlers
- ✅ Gemini AI service integration
- ✅ AI insights (reorder suggestions, dead stock, natural query)
- ✅ AI IPC handlers
- ✅ AI insights UI panel
- ✅ Reports UI panel

---

## Phase 4 Complete - Summary

**Total Tasks:** 18
**Infrastructure:** Tasks 1-7
**Dashboard Components:** Tasks 8-13
**Reports & AI:** Tasks 14-18

**What We Built:**
- Daily sales aggregation system
- Analytics dashboard with KPIs, charts, alerts
- Comprehensive report generation (sales, inventory, P&L)
- AI-powered insights using Gemini API
- Natural language query support
- Reorder suggestions and dead stock detection

**Tech Stack Used:**
- React 19 + TypeScript
- Recharts v2 (charts and visualizations)
- better-sqlite3 (database queries)
- @google/generative-ai (Gemini API)
- jsPDF (PDF generation)
- Zustand (state management)

**Key Features:**
- Real-time dashboard with 7-day trends
- Category breakdown pie chart
- Top products ranking with medals
- Low stock and expiry alerts
- Printable business reports
- AI reorder optimization
- Dead stock detection
- Natural language data queries

**Ready For:**
- Phase 5: Polish & Deployment (backup, user management, printer setup)

---

_Plan completed: 2025-02-02_
