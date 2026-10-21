import { useState } from 'react'
import { localDateString, localDateOffset } from '../../../../shared/dates'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { Spinner } from '@renderer/components/ui/spinner'
import { Boxes, Download, Receipt, Scale } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@renderer/lib/utils'
import { useAuthStore } from '@renderer/stores/authStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { DatePickerField } from './DatePickerField'
import { parseLocalDate } from './chart-helpers'
import type { jsPDF } from 'jspdf'
import {
  buildInventoryPdf,
  buildProfitLossPdf,
  buildSalesPdf,
  type InventoryValuationData,
  type ProfitLossData,
  type SalesReportData
} from '@renderer/lib/pdf-reports'

// ── Component ─────────────────────────────────────────────────────────────────

const PRESETS: { label: string; range: () => [string, string] }[] = [
  { label: 'Today', range: () => [localDateString(), localDateString()] },
  { label: 'Last 7 days', range: () => [localDateOffset(-7), localDateString()] },
  { label: 'Last 30 days', range: () => [localDateOffset(-30), localDateString()] },
  {
    label: 'This month',
    range: () => {
      const now = new Date()
      return [localDateString(new Date(now.getFullYear(), now.getMonth(), 1)), localDateString()]
    }
  },
  {
    label: 'Last month',
    range: () => {
      const now = new Date()
      return [
        localDateString(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        localDateString(new Date(now.getFullYear(), now.getMonth(), 0))
      ]
    }
  }
]

export function ReportsPanel(): React.JSX.Element {
  const { user } = useAuthStore()
  const userId = user?.id ?? ''
  const settings = useSettingsStore((s) => s.settings)
  const businessName = settings.business_name || 'PharmaPOS'
  const sym = settings.currency_symbol || 'Rs.'

  const [startDate, setStartDate] = useState(localDateOffset(-30))
  const [endDate, setEndDate] = useState(localDateString())
  const [loadingReport, setLoadingReport] = useState<'sales' | 'inventory' | 'pl' | null>(null)

  const run = async <T,>(
    key: 'sales' | 'inventory' | 'pl',
    fetch: () => Promise<T>,
    build: (data: T) => jsPDF,
    filename: string
  ): Promise<void> => {
    setLoadingReport(key)
    try {
      const data = await fetch()
      const doc = build(data)
      doc.save(filename)
      toast.success('Report generated', { description: filename })
    } catch (err) {
      toast.error((err as Error)?.message || 'Failed to generate report')
    } finally {
      setLoadingReport(null)
    }
  }

  const generateSalesReport = (): Promise<void> =>
    run(
      'sales',
      () => window.electron.analytics.reports.generateSalesReport(userId, startDate, endDate),
      (d) => buildSalesPdf(d as SalesReportData, businessName, sym),
      `sales-report-${startDate}-to-${endDate}.pdf`
    )

  const generateInventoryReport = (): Promise<void> =>
    run(
      'inventory',
      () => window.electron.analytics.reports.generateInventoryValuation(userId),
      (d) => buildInventoryPdf(d as InventoryValuationData, businessName, sym),
      `inventory-valuation-${new Date().toISOString().split('T')[0]}.pdf`
    )

  const generateProfitLossReport = (): Promise<void> =>
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
      icon: Receipt,
      usesPeriod: true,
      onGenerate: generateSalesReport
    },
    {
      key: 'inventory' as const,
      title: 'Inventory Valuation',
      description: 'Current stock value and breakdown by category and individual product',
      icon: Boxes,
      usesPeriod: false,
      onGenerate: generateInventoryReport
    },
    {
      key: 'pl' as const,
      title: 'Profit & Loss',
      description: 'P&L statement with category breakdown and monthly trend',
      icon: Scale,
      usesPeriod: true,
      onGenerate: generateProfitLossReport
    }
  ]

  const today = parseLocalDate(localDateString())
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Report Generator</CardTitle>
          <CardDescription>
            Generate and download comprehensive business reports as PDF
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="report-start-date">Start Date</FieldLabel>
              <DatePickerField
                id="report-start-date"
                value={startDate}
                onChange={setStartDate}
                disabled={[...(end ? [{ after: end }] : []), ...(today ? [{ after: today }] : [])]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="report-end-date">End Date</FieldLabel>
              <DatePickerField
                id="report-end-date"
                value={endDate}
                onChange={setEndDate}
                disabled={[
                  ...(start ? [{ before: start }] : []),
                  ...(today ? [{ after: today }] : [])
                ]}
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Quick date ranges">
            {PRESETS.map((preset) => {
              const [s, e] = preset.range()
              const active = s === startDate && e === endDate
              return (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  aria-pressed={active}
                  className={cn(
                    'px-4',
                    active && 'border-primary bg-accent text-accent-foreground hover:bg-accent'
                  )}
                  onClick={() => {
                    setStartDate(s)
                    setEndDate(e)
                  }}
                >
                  {preset.label}
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {reports.map(({ key, title, description, icon: Icon, usesPeriod, onGenerate }) => (
          <Card key={key}>
            <CardHeader className="gap-3">
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                  <Icon className="size-6" />
                </span>
                <Badge variant="outline" className="h-7 px-2.5 text-sm text-muted-foreground">
                  {usesPeriod ? 'Selected period' : 'As of today'}
                </Badge>
              </div>
              <CardTitle className="text-lg font-semibold">{title}</CardTitle>
              <CardDescription className="text-base">{description}</CardDescription>
            </CardHeader>
            <CardFooter className="mt-auto">
              <Button
                size="lg"
                onClick={onGenerate}
                disabled={loadingReport !== null}
                className="w-full"
              >
                {loadingReport === key ? <Spinner className="size-5" /> : <Download />}
                {loadingReport === key ? 'Generating…' : 'Generate PDF'}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
