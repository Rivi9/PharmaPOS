import { AlertTriangle, CircleCheck, Clock, RefreshCw } from 'lucide-react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { cn } from '@renderer/lib/utils'
import type { LowStockAlert, ExpiryAlert } from '@renderer/types/analytics'

interface AlertsPanelProps {
  lowStockAlerts: LowStockAlert[]
  expiryAlerts: ExpiryAlert[]
  isLoading?: boolean
  /** Refresh just the alerts. Without this the only way to update them was the
   *  dashboard-wide Refresh, so they went stale the moment stock moved. */
  onRefresh?: () => void
  lastUpdated?: Date | null
}

function AlertsSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
      ))}
    </div>
  )
}

function AllClear({
  title,
  description
}: {
  title: string
  description: string
}): React.JSX.Element {
  return (
    <Empty className="border p-6">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-success-muted text-success">
          <CircleCheck />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

export function AlertsPanel({
  lowStockAlerts,
  expiryAlerts,
  isLoading,
  onRefresh,
  lastUpdated
}: AlertsPanelProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">Alerts</CardTitle>
        <CardDescription>
          Low stock and expiry notifications
          {lastUpdated && ` · updated ${lastUpdated.toLocaleTimeString()}`}
        </CardDescription>
        {onRefresh && (
          <CardAction>
            <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
              <RefreshCw className={cn(isLoading && 'animate-spin')} />
              Refresh
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="low-stock" className="gap-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="low-stock">Low Stock ({lowStockAlerts.length})</TabsTrigger>
            <TabsTrigger value="expiring">Expiring ({expiryAlerts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="low-stock" className="flex flex-col gap-3">
            {isLoading ? (
              <AlertsSkeleton />
            ) : lowStockAlerts.length === 0 ? (
              <AllClear
                title="No low stock alerts"
                description="Every product is above its reorder level."
              />
            ) : (
              lowStockAlerts.map((alert) => (
                <div
                  key={alert.product_id}
                  className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-3 dark:bg-destructive/10"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                    <AlertTriangle className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-medium">{alert.product_name}</p>
                    <p className="text-sm text-muted-foreground tabular-nums">
                      Current: {alert.current_stock} | Reorder at: {alert.reorder_level}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="h-7 shrink-0 bg-background px-2.5 text-sm tabular-nums"
                  >
                    Order {alert.reorder_qty}
                  </Badge>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="expiring" className="flex flex-col gap-3">
            {isLoading ? (
              <AlertsSkeleton />
            ) : expiryAlerts.length === 0 ? (
              <AllClear
                title="No expiring items"
                description="No batches expire within the next 30 days."
              />
            ) : (
              expiryAlerts.map((alert) => {
                const isExpired = alert.days_until_expiry < 0
                const isUrgent = alert.days_until_expiry <= 7

                return (
                  <div
                    key={alert.batch_id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border p-3',
                      isExpired
                        ? 'border-destructive/20 bg-destructive/5 dark:bg-destructive/10'
                        : isUrgent
                          ? 'border-warning/25 bg-warning-muted'
                          : 'bg-card'
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-10 shrink-0 items-center justify-center rounded-lg',
                        isExpired
                          ? 'bg-destructive/10 text-destructive'
                          : isUrgent
                            ? 'bg-warning/15 text-warning'
                            : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Clock className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-medium">{alert.product_name}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        Batch: {alert.batch_number || 'N/A'} | Qty: {alert.quantity} | Expires:{' '}
                        {alert.expiry_date}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'h-7 shrink-0 border-transparent px-2.5 text-sm font-semibold tabular-nums',
                        isExpired
                          ? 'bg-destructive text-destructive-foreground'
                          : isUrgent
                            ? 'bg-warning text-warning-foreground'
                            : 'bg-muted text-foreground'
                      )}
                    >
                      {isExpired
                        ? 'Expired'
                        : alert.days_until_expiry === 0
                          ? 'Today'
                          : `${alert.days_until_expiry}d`}
                    </Badge>
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
