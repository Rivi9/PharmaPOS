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
