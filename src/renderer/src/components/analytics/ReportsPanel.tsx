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
