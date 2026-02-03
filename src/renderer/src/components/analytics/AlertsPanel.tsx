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
