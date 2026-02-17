import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Sparkles, TrendingDown, MessageSquare, RefreshCw } from 'lucide-react'
import { useAuthStore } from '@renderer/stores/authStore'

export function AIInsightsPanel(): React.JSX.Element {
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const [isLoading, setIsLoading] = useState(false)
  const [reorderSuggestions, setReorderSuggestions] = useState<any[]>([])
  const [deadStock, setDeadStock] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [queryResponse, setQueryResponse] = useState('')

  const loadReorderSuggestions = async () => {
    setIsLoading(true)
    try {
      const suggestions = await window.electron.ai.getReorderSuggestions(userId)
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
      const items = await window.electron.ai.getDeadStockDetection(userId)
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
      const response = await window.electron.ai.naturalQuery(userId, query)
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
