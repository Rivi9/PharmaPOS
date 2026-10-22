import { useEffect, useState } from 'react'
import { Ban } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Textarea } from '@renderer/components/ui/textarea'
import { Field, FieldError, FieldLabel } from '@renderer/components/ui/field'
import { Spinner } from '@renderer/components/ui/spinner'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

interface VoidSaleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  saleId: string
  receiptNumber: string
  /** Formatted sale total, for the warning. */
  totalLabel: string
  onVoided: () => void
}

/**
 * Void a mis-rung sale. The main process requires a reason (it goes on the sale
 * and into the audit log) and refuses anything but an untouched sale from today;
 * the detail panel only offers this when those hold.
 */
export function VoidSaleDialog({
  open,
  onOpenChange,
  saleId,
  receiptNumber,
  totalLabel,
  onVoided
}: VoidSaleDialogProps): React.JSX.Element {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setReason('')
    setError('')
  }, [open])

  const submit = async (): Promise<void> => {
    if (!reason.trim()) {
      setError('Say why the sale is being voided')
      return
    }
    setSaving(true)
    setError('')
    try {
      // `userId` is vestigial: the handler voids as the signed-in user.
      await window.electron.void({ userId: '', saleId, reason: reason.trim() })
    } catch (err) {
      setError(ipcErrorMessage(err, 'The sale could not be voided'))
      return
    } finally {
      setSaving(false)
    }
    onOpenChange(false)
    onVoided()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">Void {receiptNumber}?</DialogTitle>
          <DialogDescription className="text-base">
            The whole sale is cancelled: every item goes back into stock, and the {totalLabel} comes
            off today&apos;s takings and the drawer. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-6"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field data-invalid={error ? true : undefined}>
            <FieldLabel htmlFor="void-reason">Reason</FieldLabel>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Rang up the wrong item"
              rows={2}
              className="min-h-12 md:text-base"
              aria-invalid={error ? true : undefined}
            />
            {error && <FieldError>{error}</FieldError>}
          </Field>
          <DialogFooter className="gap-3">
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive-solid"
              size="lg"
              className="flex-1"
              disabled={saving}
            >
              {saving ? <Spinner className="size-5" /> : <Ban />}
              Void sale
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
