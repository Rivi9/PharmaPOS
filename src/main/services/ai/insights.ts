import { getDatabase } from '../database'
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
