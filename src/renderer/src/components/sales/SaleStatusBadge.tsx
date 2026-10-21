import { Badge } from '@renderer/components/ui/badge'
import { cn } from '@renderer/lib/utils'
import type { SaleListStatus } from '../../../../shared/sales-history'
import { STATUS_LABELS } from './sale-format'

const STATUS_TONES: Record<SaleListStatus, string> = {
  completed: 'bg-success-muted text-success',
  part_refunded: 'bg-warning-muted text-warning',
  refunded: 'bg-info-muted text-info',
  voided: 'bg-destructive/10 text-destructive dark:bg-destructive/20'
}

export function SaleStatusBadge({
  status,
  className
}: {
  status: SaleListStatus
  className?: string
}): React.JSX.Element {
  return (
    <Badge className={cn('h-7 rounded-md px-2.5 text-sm', STATUS_TONES[status], className)}>
      {STATUS_LABELS[status]}
    </Badge>
  )
}
