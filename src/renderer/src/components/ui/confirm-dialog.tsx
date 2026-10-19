import { TriangleAlert } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { cn } from '@renderer/lib/utils'
import type { ConfirmDialogProps } from '@renderer/hooks/useConfirm'

/**
 * Renders whatever `useConfirm` currently has pending. Mount one per screen and
 * spread the hook's `confirmProps` into it; see `useConfirm` for the rationale.
 */
export function ConfirmDialog({ request, onSettle }: ConfirmDialogProps): React.JSX.Element {
  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && onSettle(false)}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          {request?.destructive && (
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <TriangleAlert />
            </AlertDialogMedia>
          )}
          <AlertDialogTitle className="text-xl font-semibold">{request?.title}</AlertDialogTitle>
          {/* Radix warns when Content has no Description, so it is always
              rendered and simply hidden when there is no detail line. */}
          <AlertDialogDescription className={cn('text-base', !request?.description && 'sr-only')}>
            {request?.description ?? ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-3">
          {!request?.acknowledge && (
            <AlertDialogCancel size="lg" className="sm:min-w-36" onClick={() => onSettle(false)}>
              {request?.cancelLabel ?? 'Cancel'}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            autoFocus
            size="lg"
            variant={request?.destructive ? 'destructive-solid' : 'default'}
            className="sm:min-w-36"
            onClick={() => onSettle(true)}
          >
            {request?.confirmLabel ?? (request?.acknowledge ? 'OK' : 'Confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
