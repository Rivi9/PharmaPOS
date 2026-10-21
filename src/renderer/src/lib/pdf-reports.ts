import type { jsPDF } from 'jspdf'
import { localDateString } from '../../../shared/dates'
import {
  drawCallout,
  drawKpiGrid,
  drawMeter,
  drawReportTable,
  drawSectionTitle,
  ensureSpace,
  finishReport,
  formatMoney as fmt,
  formatPercent as pct,
  formatPeriod,
  formatReportDate,
  signTone,
  startReport,
  type ReportMeta
} from './pdf-theme'

// The Analytics → Reports PDFs. Layout and colours come from ./pdf-theme so the
// three reports share one design; the figures are exactly what the backend
// report channels return.

// ── Local types mirroring the backend report shapes ───────────────────────────

export interface SalesReportData {
  start_date: string
  end_date: string
  total_sales: number
  total_profit: number
  total_cost: number
  total_transactions: number
  total_items_sold: number
  avg_transaction: number
  daily_breakdown: { date: string; sales: number; profit: number; transactions: number }[]
  top_products: { product_name: string; quantity: number; revenue: number; profit: number }[]
  payment_methods: { method: string; count: number; amount: number }[]
}

export interface InventoryValuationData {
  total_value: number
  total_cost: number
  total_items: number
  expired_value: number
  expired_cost: number
  expired_units: number
  by_category: {
    category_name: string
    item_count: number
    total_quantity: number
    total_value: number
    total_cost: number
  }[]
  by_product: {
    product_name: string
    quantity: number
    cost_per_unit: number
    unit_price: number
    total_cost: number
    total_value: number
  }[]
}

export interface ProfitLossData {
  start_date: string
  end_date: string
  total_revenue: number
  total_cost: number
  gross_profit: number
  gross_margin_percent: number
  by_category: {
    category_name: string
    revenue: number
    cost: number
    profit: number
    margin_percent: number
  }[]
  by_month: { month: string; revenue: number; cost: number; profit: number }[]
}

// ── Sales Report PDF ──────────────────────────────────────────────────────────

export function buildSalesPdf(data: SalesReportData, businessName: string, sym: string): jsPDF {
  const meta: ReportMeta = {
    businessName,
    title: 'Sales Report',
    period: formatPeriod(data.start_date, data.end_date)
  }
  const report = startReport(meta)
  const doc = report.doc
  let y = report.y

  y = drawKpiGrid(
    doc,
    [
      { label: 'Total Sales', value: fmt(data.total_sales, sym) },
      {
        label: 'Total Profit',
        value: fmt(data.total_profit, sym),
        tone: data.total_profit < 0 ? 'destructive' : 'success',
        valueTone: signTone(data.total_profit)
      },
      { label: 'Total Cost', value: fmt(data.total_cost, sym), tone: 'neutral' },
      { label: 'Transactions', value: String(data.total_transactions), tone: 'info' },
      { label: 'Items Sold', value: String(data.total_items_sold), tone: 'info' },
      { label: 'Avg. Sale', value: fmt(data.avg_transaction, sym) }
    ],
    y,
    3
  )

  y = drawSectionTitle(doc, 'Daily Sales Breakdown', y)
  y = drawReportTable(doc, {
    startY: y,
    head: ['Date', 'Sales', 'Profit', 'Transactions'],
    body: data.daily_breakdown.map((r) => [
      r.date,
      fmt(r.sales, sym),
      fmt(r.profit, sym),
      String(r.transactions)
    ]),
    cellTone: (i, col) => (col === 2 ? signTone(data.daily_breakdown[i].profit) : undefined),
    emptyText: 'No sales in this period'
  })

  y = ensureSpace(doc, y, 40)
  y = drawSectionTitle(doc, 'Top 10 Products by Revenue', y)
  y = drawReportTable(doc, {
    startY: y,
    head: ['Product', 'Qty Sold', 'Revenue', 'Profit'],
    body: data.top_products.map((r) => [
      r.product_name,
      String(r.quantity),
      fmt(r.revenue, sym),
      fmt(r.profit, sym)
    ]),
    cellTone: (i, col) => (col === 3 ? signTone(data.top_products[i].profit) : undefined),
    emptyText: 'No products sold in this period'
  })

  y = ensureSpace(doc, y, 40)
  y = drawSectionTitle(doc, 'Payment Methods', y)
  drawReportTable(doc, {
    startY: y,
    head: ['Method', 'Count', 'Amount'],
    body: data.payment_methods.map((r) => [
      r.method.replace('_', ' ').toUpperCase(),
      String(r.count),
      fmt(r.amount, sym)
    ]),
    emptyText: 'No payments in this period'
  })

  return finishReport(doc, meta)
}

// ── Inventory Valuation PDF ───────────────────────────────────────────────────

export function buildInventoryPdf(
  data: InventoryValuationData,
  businessName: string,
  sym: string
): jsPDF {
  const meta: ReportMeta = {
    businessName,
    title: 'Inventory Valuation Report',
    period: `As of ${formatReportDate(localDateString())}`
  }
  const report = startReport(meta)
  const doc = report.doc
  let y = report.y

  y = drawKpiGrid(
    doc,
    [
      { label: 'Total Stock Value', value: fmt(data.total_value, sym) },
      { label: 'Total Cost Value', value: fmt(data.total_cost, sym), tone: 'neutral' },
      { label: 'Active Products', value: String(data.total_items), tone: 'info' }
    ],
    y,
    3
  )

  // Potential margin
  const margin =
    data.total_value > 0 ? ((data.total_value - data.total_cost) / data.total_value) * 100 : 0
  // Sellable stock only. The figures above used to include expired batches and
  // batches already sold to zero, valued at the product's current price rather
  // than what each batch cost — so "Total Stock Value" counted goods that cannot
  // legally be sold as an asset (H28).
  y = drawCallout(
    doc,
    {
      tone: 'info',
      lines: [
        `Potential Gross Margin: ${pct(margin)}  ·  Potential Profit: ${fmt(data.total_value - data.total_cost, sym)}`,
        'Figures cover sellable stock only: quantity remaining, not past its expiry, priced per batch.'
      ]
    },
    y - 2
  )
  if (data.expired_units > 0) {
    y = drawCallout(
      doc,
      {
        tone: 'destructive',
        title: 'Expired stock',
        lines: [
          `Excluded as expired: ${data.expired_units} unit${data.expired_units === 1 ? '' : 's'} — ` +
            `${fmt(data.expired_cost, sym)} at cost, ${fmt(data.expired_value, sym)} at retail. Write these off.`
        ]
      },
      y - 2
    )
  }
  y += 2

  y = drawSectionTitle(doc, 'By Category', y)
  y = drawReportTable(doc, {
    startY: y,
    head: ['Category', 'Products', 'Total Qty', 'Cost Value', 'Retail Value'],
    body: data.by_category.map((r) => [
      r.category_name,
      String(r.item_count),
      String(r.total_quantity),
      fmt(r.total_cost, sym),
      fmt(r.total_value, sym)
    ]),
    emptyText: 'No sellable stock'
  })

  y = ensureSpace(doc, y, 50)
  y = drawSectionTitle(doc, 'Product Breakdown', y)
  drawReportTable(doc, {
    startY: y,
    head: ['Product', 'Qty', 'Cost/Unit', 'Sell Price', 'Total Cost', 'Total Value'],
    body: data.by_product.map((r) => [
      r.product_name,
      String(r.quantity),
      fmt(r.cost_per_unit, sym),
      fmt(r.unit_price, sym),
      fmt(r.total_cost, sym),
      fmt(r.total_value, sym)
    ]),
    fontSize: 7.5,
    columnStyles: { 0: { cellWidth: 50 } },
    emptyText: 'No sellable stock'
  })

  return finishReport(doc, meta)
}

// ── Profit & Loss PDF ─────────────────────────────────────────────────────────

export function buildProfitLossPdf(data: ProfitLossData, businessName: string, sym: string): jsPDF {
  const meta: ReportMeta = {
    businessName,
    title: 'Profit & Loss Statement',
    period: formatPeriod(data.start_date, data.end_date)
  }
  const report = startReport(meta)
  const doc = report.doc
  let y = report.y

  const loss = data.gross_profit < 0
  y = drawKpiGrid(
    doc,
    [
      { label: 'Total Revenue', value: fmt(data.total_revenue, sym) },
      { label: 'Total Cost', value: fmt(data.total_cost, sym), tone: 'neutral' },
      {
        label: 'Gross Profit',
        value: fmt(data.gross_profit, sym),
        tone: loss ? 'destructive' : 'success',
        valueTone: signTone(data.gross_profit)
      },
      {
        label: 'Gross Margin',
        value: pct(data.gross_margin_percent),
        tone: loss ? 'destructive' : 'success',
        valueTone: signTone(data.gross_margin_percent)
      }
    ],
    y,
    4
  )

  // Profit indicator bar
  const profitRatio =
    data.total_revenue > 0 ? Math.min(data.gross_profit / data.total_revenue, 1) : 0
  y = drawMeter(
    doc,
    {
      label: 'Gross profit as a share of revenue',
      value: pct(profitRatio * 100),
      ratio: profitRatio,
      tone: loss ? 'destructive' : 'success'
    },
    y - 2
  )

  y = drawSectionTitle(doc, 'Profit by Category', y)
  y = drawReportTable(doc, {
    startY: y,
    head: ['Category', 'Revenue', 'Cost', 'Gross Profit', 'Margin %'],
    body: data.by_category.map((r) => [
      r.category_name,
      fmt(r.revenue, sym),
      fmt(r.cost, sym),
      fmt(r.profit, sym),
      pct(r.margin_percent)
    ]),
    cellTone: (i, col) => (col >= 3 ? signTone(data.by_category[i].profit) : undefined),
    emptyText: 'No sales in this period'
  })

  if (data.by_month.length > 0) {
    y = ensureSpace(doc, y, 50)
    y = drawSectionTitle(doc, 'Monthly Trend', y)
    drawReportTable(doc, {
      startY: y,
      head: ['Month', 'Revenue', 'Cost', 'Gross Profit'],
      body: data.by_month.map((r) => [
        r.month,
        fmt(r.revenue, sym),
        fmt(r.cost, sym),
        fmt(r.profit, sym)
      ]),
      cellTone: (i, col) => (col === 3 ? signTone(data.by_month[i].profit) : undefined),
      foot: [
        'TOTAL',
        fmt(data.total_revenue, sym),
        fmt(data.total_cost, sym),
        fmt(data.gross_profit, sym)
      ]
    })
  }

  return finishReport(doc, meta)
}
