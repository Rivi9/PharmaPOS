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
}

export const useAnalyticsStore = create<AnalyticsStore>((set) => ({
  // Dashboard KPIs
  todayMetrics: null,
  setTodayMetrics: (metrics) => set({ todayMetrics: metrics }),

  weekMetrics: [],
  setWeekMetrics: (metrics) => set({ weekMetrics: metrics }),

  monthMetrics: [],
  setMonthMetrics: (metrics) => set({ monthMetrics: metrics }),

  // Product insights
  topProducts: [],
  setTopProducts: (products) => set({ topProducts: products }),

  categoryBreakdown: [],
  setCategoryBreakdown: (breakdown) => set({ categoryBreakdown: breakdown }),

  // Alerts
  lowStockAlerts: [],
  setLowStockAlerts: (alerts) => set({ lowStockAlerts: alerts }),

  expiryAlerts: [],
  setExpiryAlerts: (alerts) => set({ expiryAlerts: alerts }),

  // AI Insights
  aiInsights: [],
  setAIInsights: (insights) => set({ aiInsights: insights })
}))
