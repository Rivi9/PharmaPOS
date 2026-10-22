import { useEffect, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { toast } from 'sonner'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Field, FieldDescription, FieldError, FieldLabel } from '@renderer/components/ui/field'
import { Spinner } from '@renderer/components/ui/spinner'
import { CashNumpad } from '@renderer/components/ui/cash-numpad'
import { formatCurrency } from '@renderer/lib/calculations'
import { cn } from '@renderer/lib/utils'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'

interface CashMovementDialogProps {
  open: boolean
  onClose: () => void
  onRecorded?: () => void
}

/**
 * Records cash added to or removed from the drawer during a shift — a float
 * top-up, a petty-cash payout, a bank drop. Without this any such movement
 * surfaced at End Shift as an unexplained discrepancy.
 */
export function CashMovementDialog({
  open,
  onClose,
  onRecorded
}: CashMovementDialogProps): React.JSX.Element {
  const [type, setType] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const currentShift = useShiftStore((s) => s.currentShift)
  const user = useAuthStore((s) => s.user)
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)

  useEffect(() => {
    if (!open) return
    setType('in')
    setAmount('')
    setReason('')
    setError('')
  }, [open])

  const handleSave = async (): Promise<void> => {
    if (!currentShift || !user) return
    const value = parseFloat(amount)
    if (!(value > 0)) {
      setError('Enter an amount greater than zero')
      return
    }
    if (!reason.trim()) {
      setError('Enter a reason — this appears on the shift reconciliation')
      return
    }

    setSaving(true)
    setError('')
    try {
      // Who and which shift are resolved from the session in the main process.
      const result = await window.electron.shifts.recordCashMovement({
        type,
        amount: value,
        reason: reason.trim()
      })
      if (result && result.success === false) {
        setError(result.error || 'Could not record the cash movement')
        return
      }
      toast.success(
        `${type === 'in' ? 'Cash in' : 'Cash out'} of ${formatCurrency(value, currencySymbol)} recorded`
      )
      onRecorded?.()
      onClose()
    } catch (err) {
      setError((err as Error)?.message || 'Could not record the cash movement')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* Header and action row fixed, middle scrolls — same layout as End Shift,
          so the Record button can never be pushed below a 768px-tall screen. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle className="text-2xl font-semibold">Cash In / Out</DialogTitle>
          <DialogDescription className="text-base">
            Record money added to or taken from the drawer so the end-of-shift count balances.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto overscroll-contain p-6 md:grid-cols-2">
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="Movement type">
              <Button
                variant={type === 'in' ? 'default' : 'outline'}
                aria-pressed={type === 'in'}
                className="h-16 flex-col gap-1 text-base"
                onClick={() => setType('in')}
              >
                <ArrowDownCircle className="size-6" />
                Cash In
              </Button>
              <Button
                variant={type === 'out' ? 'default' : 'outline'}
                aria-pressed={type === 'out'}
                className="h-16 flex-col gap-1 text-base"
                onClick={() => setType('out')}
              >
                <ArrowUpCircle className="size-6" />
                Cash Out
              </Button>
            </div>

            <Field data-invalid={!!error && !reason.trim()}>
              <FieldLabel htmlFor="cash-reason">Reason</FieldLabel>
              <Input
                id="cash-reason"
                placeholder="e.g. float top-up, supplier payment, bank drop"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-invalid={!!error && !reason.trim()}
              />
              <FieldDescription>Shown on the shift reconciliation.</FieldDescription>
            </Field>

            <FieldError className="text-base font-medium">{error || null}</FieldError>
          </div>

          <div className="space-y-3">
            <div
              className={cn(
                'rounded-xl border p-3 text-center',
                type === 'in' ? 'bg-success-muted' : 'bg-warning-muted'
              )}
            >
              <p className="text-sm font-medium text-muted-foreground">
                {type === 'in' ? 'Adding to drawer' : 'Taking from drawer'}
              </p>
              <p
                className={cn(
                  'truncate font-mono text-4xl font-bold tabular-nums',
                  type === 'in' ? 'text-success' : 'text-warning'
                )}
              >
                {currencySymbol}&nbsp;{amount || '0.00'}
              </p>
            </div>

            <CashNumpad value={amount} onChange={setAmount} />
          </div>
        </div>

        <div className="shrink-0 flex gap-3 border-t bg-background p-4">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            size="lg"
            className="flex-[2] font-semibold"
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Spinner className="size-5" />}
            {saving ? 'Saving…' : 'Record'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
