import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
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
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{request?.title}</AlertDialogTitle>
          {/* Radix warns when Content has no Description, so it is always
              rendered and simply hidden when there is no detail line. */}
          <AlertDialogDescription className={cn(!request?.description && 'sr-only')}>
            {request?.description ?? ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {!request?.acknowledge && (
            <AlertDialogCancel onClick={() => onSettle(false)}>
              {request?.cancelLabel ?? 'Cancel'}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            autoFocus
            className={cn(
              request?.destructive &&
                'bg-destructive text-white hover:bg-destructive/90 active:bg-destructive/80'
            )}
            onClick={() => onSettle(true)}
          >
            {request?.confirmLabel ?? (request?.acknowledge ? 'OK' : 'Confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
