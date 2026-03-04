import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { FileText, Download } from 'lucide-react'
import { useAuthStore } from '@renderer/stores/authStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

// ── Local types mirroring the backend report shapes ───────────────────────────

interface SalesReportData {
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

interface InventoryValuationData {
  total_value: number
  total_cost: number
  total_items: number
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

interface ProfitLossData {
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

// ── PDF helpers ───────────────────────────────────────────────────────────────

const PRIMARY = [30, 64, 175] as const // blue-800
const HEADER_TEXT = [255, 255, 255] as const
const DARK = [15, 23, 42] as const // slate-900
const MUTED = [100, 116, 139] as const // slate-500
const SURFACE = [248, 250, 252] as const // slate-50
const BORDER = [226, 232, 240] as const // slate-200
const GREEN = [22, 163, 74] as const // green-600

function fmt(n: number, sym: string): string {
  return `${sym} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`
}

/** Draws the blue header band and returns the y-coordinate to continue from. */
function drawHeader(doc: jsPDF, title: string, subtitle: string, businessName: string): number {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...PRIMARY)
  doc.rect(0, 0, W, 34, 'F')

  doc.setTextColor(...HEADER_TEXT)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(businessName, 14, 14)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(title, 14, 24)
  doc.text(subtitle, W - 14, 24, { align: 'right' })

  doc.setFontSize(7.5)
  doc.setTextColor(180, 200, 240)
  doc.text(`Generated: ${new Date().toLocaleString()}`, W - 14, 31, { align: 'right' })

  return 44
}

/** Draws a small labelled KPI box. Returns nothing (mutates doc). */
function drawKpi(doc: jsPDF, label: string, value: string, x: number, y: number, w: number): void {
  const h = 22
  doc.setFillColor(...SURFACE)
  doc.setDrawColor(...BORDER)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')

  doc.setTextColor(...MUTED)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.text(label, x + w / 2, y + 7, { align: 'center' })

  doc.setTextColor(...DARK)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(value, x + w / 2, y + 17, { align: 'center' })
  doc.setFont('helvetica', 'normal')
}

/** Section heading line */
function sectionTitle(doc: jsPDF, label: string, y: number): number {
  const W = doc.internal.pageSize.getWidth()
  doc.setFillColor(...PRIMARY)
  doc.rect(14, y, W - 28, 0.5, 'F')
  doc.setTextColor(...PRIMARY)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.text(label.toUpperCase(), 14, y - 1.5)
  doc.setFont('helvetica', 'normal')
  return y + 4
}

// ── Sales Report PDF ──────────────────────────────────────────────────────────

function buildSalesPdf(data: SalesReportData, businessName: string, sym: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  const subtitle = `${data.start_date}  to  ${data.end_date}`
  let y = drawHeader(doc, 'Sales Report', subtitle, businessName)

  // KPI row
  const kpiW = (W - 28 - 10) / 6
  const kpis: [string, string][] = [
    ['Total Sales', fmt(data.total_sales, sym)],
    ['Total Profit', fmt(data.total_profit, sym)],
    ['Total Cost', fmt(data.total_cost, sym)],
    ['Transactions', String(data.total_transactions)],
    ['Items Sold', String(data.total_items_sold)],
    ['Avg. Sale', fmt(data.avg_transaction, sym)]
  ]
  kpis.forEach(([label, value], i) => drawKpi(doc, label, value, 14 + i * (kpiW + 2), y, kpiW))
  y += 30

  // Daily breakdown
  y = sectionTitle(doc, 'Daily Sales Breakdown', y)
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Sales', 'Profit', 'Transactions']],
    body: data.daily_breakdown.map((r) => [
      r.date,
      fmt(r.sales, sym),
      fmt(r.profit, sym),
      String(r.transactions)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [...PRIMARY], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [...DARK] },
    alternateRowStyles: { fillColor: [...SURFACE] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' }
    },
    didParseCell: ({ cell, column }: any) => {
      if (column.index > 0) cell.styles.halign = 'right'
    },
    margin: { left: 14, right: 14 }
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // Top products
  if (y > 240) {
    doc.addPage()
    y = 20
  }
  y = sectionTitle(doc, 'Top 10 Products by Revenue', y)
  autoTable(doc, {
    startY: y,
    head: [['Product', 'Qty Sold', 'Revenue', 'Profit']],
    body: data.top_products.map((r) => [
      r.product_name,
      String(r.quantity),
      fmt(r.revenue, sym),
      fmt(r.profit, sym)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [...PRIMARY], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [...DARK] },
    alternateRowStyles: { fillColor: [...SURFACE] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' }
    },
    didParseCell: ({ cell, column }: any) => {
      if (column.index > 0) cell.styles.halign = 'right'
    },
    margin: { left: 14, right: 14 }
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // Payment methods
  if (y > 240) {
    doc.addPage()
    y = 20
  }
  y = sectionTitle(doc, 'Payment Methods', y)
  autoTable(doc, {
    startY: y,
    head: [['Method', 'Count', 'Amount']],
    body: data.payment_methods.map((r) => [
      r.method.replace('_', ' ').toUpperCase(),
      String(r.count),
      fmt(r.amount, sym)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [...PRIMARY], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [...DARK] },
    alternateRowStyles: { fillColor: [...SURFACE] },
    columnStyles: { 0: { halign: 'left' }, 1: { halign: 'right' }, 2: { halign: 'right' } },
    didParseCell: ({ cell, column }: any) => {
      if (column.index > 0) cell.styles.halign = 'right'
    },
    margin: { left: 14, right: 14 }
  })

  addPageNumbers(doc)
  return doc
}

// ── Inventory Valuation PDF ───────────────────────────────────────────────────

function buildInventoryPdf(data: InventoryValuationData, businessName: string, sym: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  const today = new Date().toISOString().split('T')[0]
  let y = drawHeader(doc, 'Inventory Valuation Report', `As of ${today}`, businessName)

  // KPI row
  const kpiW = (W - 28 - 8) / 3
  drawKpi(doc, 'Total Stock Value', fmt(data.total_value, sym), 14, y, kpiW)
  drawKpi(doc, 'Total Cost Value', fmt(data.total_cost, sym), 14 + kpiW + 4, y, kpiW)
  drawKpi(doc, 'Active Products', String(data.total_items), 14 + (kpiW + 4) * 2, y, kpiW)

  // Potential margin
  const margin =
    data.total_value > 0 ? ((data.total_value - data.total_cost) / data.total_value) * 100 : 0
  y += 28
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(
    `Potential Gross Margin: ${pct(margin)}  ·  Potential Profit: ${fmt(data.total_value - data.total_cost, sym)}`,
    14,
    y
  )
  y += 8

  // By category
  y = sectionTitle(doc, 'By Category', y)
  autoTable(doc, {
    startY: y,
    head: [['Category', 'Products', 'Total Qty', 'Cost Value', 'Retail Value']],
    body: data.by_category.map((r) => [
      r.category_name,
      String(r.item_count),
      String(r.total_quantity),
      fmt(r.total_cost, sym),
      fmt(r.total_value, sym)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [...PRIMARY], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [...DARK] },
    alternateRowStyles: { fillColor: [...SURFACE] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' }
    },
    didParseCell: ({ cell, column }: any) => {
      if (column.index > 0) cell.styles.halign = 'right'
    },
    margin: { left: 14, right: 14 }
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // By product
  if (y > 230) {
    doc.addPage()
    y = 20
  }
  y = sectionTitle(doc, 'Product Breakdown', y)
  autoTable(doc, {
    startY: y,
    head: [['Product', 'Qty', 'Cost/Unit', 'Sell Price', 'Total Cost', 'Total Value']],
    body: data.by_product.map((r) => [
      r.product_name,
      String(r.quantity),
      fmt(r.cost_per_unit, sym),
      fmt(r.unit_price, sym),
      fmt(r.total_cost, sym),
      fmt(r.total_value, sym)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [...PRIMARY], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
    bodyStyles: { fontSize: 7.5, textColor: [...DARK] },
    alternateRowStyles: { fillColor: [...SURFACE] },
    columnStyles: {
      0: { halign: 'left', cellWidth: 50 },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' }
    },
    didParseCell: ({ cell, column }: any) => {
      if (column.index > 0) cell.styles.halign = 'right'
    },
    margin: { left: 14, right: 14 }
  })

  addPageNumbers(doc)
  return doc
}

// ── Profit & Loss PDF ─────────────────────────────────────────────────────────

function buildProfitLossPdf(data: ProfitLossData, businessName: string, sym: string): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  const subtitle = `${data.start_date}  to  ${data.end_date}`
  let y = drawHeader(doc, 'Profit & Loss Statement', subtitle, businessName)

  // KPI row
  const kpiW = (W - 28 - 10) / 4
  drawKpi(doc, 'Total Revenue', fmt(data.total_revenue, sym), 14, y, kpiW)
  drawKpi(doc, 'Total Cost', fmt(data.total_cost, sym), 14 + (kpiW + 3.33), y, kpiW)
  drawKpi(doc, 'Gross Profit', fmt(data.gross_profit, sym), 14 + (kpiW + 3.33) * 2, y, kpiW)
  drawKpi(doc, 'Gross Margin', pct(data.gross_margin_percent), 14 + (kpiW + 3.33) * 3, y, kpiW)
  y += 30

  // Profit indicator bar
  const barW = W - 28
  const profitRatio =
    data.total_revenue > 0 ? Math.min(data.gross_profit / data.total_revenue, 1) : 0
  doc.setFillColor(...BORDER)
  doc.roundedRect(14, y, barW, 5, 1, 1, 'F')
  doc.setFillColor(...GREEN)
  doc.roundedRect(14, y, barW * profitRatio, 5, 1, 1, 'F')
  y += 10

  // By category
  y = sectionTitle(doc, 'Profit by Category', y)
  autoTable(doc, {
    startY: y,
    head: [['Category', 'Revenue', 'Cost', 'Gross Profit', 'Margin %']],
    body: data.by_category.map((r) => [
      r.category_name,
      fmt(r.revenue, sym),
      fmt(r.cost, sym),
      fmt(r.profit, sym),
      pct(r.margin_percent)
    ]),
    theme: 'striped',
    headStyles: { fillColor: [...PRIMARY], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 8, textColor: [...DARK] },
    alternateRowStyles: { fillColor: [...SURFACE] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' }
    },
    didParseCell: ({ cell, column }: any) => {
      if (column.index > 0) cell.styles.halign = 'right'
    },
    margin: { left: 14, right: 14 }
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // By month
  if (data.by_month.length > 0) {
    if (y > 230) {
      doc.addPage()
      y = 20
    }
    y = sectionTitle(doc, 'Monthly Trend', y)
    autoTable(doc, {
      startY: y,
      head: [['Month', 'Revenue', 'Cost', 'Gross Profit']],
      body: data.by_month.map((r) => [
        r.month,
        fmt(r.revenue, sym),
        fmt(r.cost, sym),
        fmt(r.profit, sym)
      ]),
      theme: 'striped',
      headStyles: { fillColor: [...PRIMARY], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, textColor: [...DARK] },
      alternateRowStyles: { fillColor: [...SURFACE] },
      columnStyles: {
        0: { halign: 'left' },
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' }
      },
      foot: [
        [
          'TOTAL',
          fmt(data.total_revenue, sym),
          fmt(data.total_cost, sym),
          fmt(data.gross_profit, sym)
        ]
      ],
      footStyles: { fillColor: [...PRIMARY], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      margin: { left: 14, right: 14 }
    })
  }

  addPageNumbers(doc)
  return doc
}

// ── Page numbers ──────────────────────────────────────────────────────────────

function addPageNumbers(doc: jsPDF): void {
  const total = doc.getNumberOfPages()
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(`Page ${i} of ${total}`, W - 14, H - 8, { align: 'right' })
    doc.text('PharmaPOS — Confidential', 14, H - 8)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReportsPanel(): React.JSX.Element {
  const { user } = useAuthStore()
  const userId = user?.id ?? ''
  const settings = useSettingsStore((s) => s.settings)
  const businessName = settings.business_name || 'PharmaPOS'
  const sym = settings.currency_symbol || 'Rs.'

  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
  const [loadingReport, setLoadingReport] = useState<'sales' | 'inventory' | 'pl' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async <T,>(
    key: 'sales' | 'inventory' | 'pl',
    fetch: () => Promise<T>,
    build: (data: T) => jsPDF,
    filename: string
  ) => {
    setLoadingReport(key)
    setError(null)
    try {
      const data = await fetch()
      const doc = build(data)
      doc.save(filename)
    } catch (err: any) {
      setError(err.message || 'Failed to generate report')
    } finally {
      setLoadingReport(null)
    }
  }

  const generateSalesReport = () =>
    run(
      'sales',
      () => window.electron.analytics.reports.generateSalesReport(userId, startDate, endDate),
      (d) => buildSalesPdf(d as SalesReportData, businessName, sym),
      `sales-report-${startDate}-to-${endDate}.pdf`
    )

  const generateInventoryReport = () =>
    run(
      'inventory',
      () => window.electron.analytics.reports.generateInventoryValuation(userId),
      (d) => buildInventoryPdf(d as InventoryValuationData, businessName, sym),
      `inventory-valuation-${new Date().toISOString().split('T')[0]}.pdf`
    )

  const generateProfitLossReport = () =>
    run(
      'pl',
      () => window.electron.analytics.reports.generateProfitLossReport(userId, startDate, endDate),
      (d) => buildProfitLossPdf(d as ProfitLossData, businessName, sym),
      `profit-loss-${startDate}-to-${endDate}.pdf`
    )

  const reports = [
    {
      key: 'sales' as const,
      title: 'Sales Report',
      description:
        'Comprehensive sales analysis with daily breakdown, top products, and payment methods',
      onGenerate: generateSalesReport
    },
    {
      key: 'inventory' as const,
      title: 'Inventory Valuation',
      description: 'Current stock value and breakdown by category and individual product',
      onGenerate: generateInventoryReport
    },
    {
      key: 'pl' as const,
      title: 'Profit & Loss',
      description: 'P&L statement with category breakdown and monthly trend',
      onGenerate: generateProfitLossReport
    }
  ]

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Report Generator</CardTitle>
          <CardDescription>
            Generate and download comprehensive business reports as PDF
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Start Date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">End Date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {reports.map(({ key, title, description, onGenerate }) => (
          <Card key={key}>
            <CardHeader>
              <FileText className="h-8 w-8 mb-2 text-primary" />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={onGenerate} disabled={loadingReport !== null} className="w-full">
                <Download className="h-4 w-4 mr-2" />
                {loadingReport === key ? 'Generating…' : 'Generate PDF'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
