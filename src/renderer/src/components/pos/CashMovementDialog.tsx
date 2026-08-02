import { useEffect, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { CashNumpad } from '@renderer/components/ui/cash-numpad'
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
      const result = await window.electron.shifts.recordCashMovement({
        userId: user.id,
        shiftId: currentShift.id,
        type,
        amount: value,
        reason: reason.trim()
      })
      if (result && result.success === false) {
        setError(result.error || 'Could not record the cash movement')
        return
      }
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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cash In / Out</DialogTitle>
          <DialogDescription>
            Record money added to or taken from the drawer so the end-of-shift count balances.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-3">
            <Button
              variant={type === 'in' ? 'default' : 'outline'}
              className="h-14 flex-1 flex items-center gap-2"
              onClick={() => setType('in')}
            >
              <ArrowDownCircle className="h-5 w-5" />
              Cash In
            </Button>
            <Button
              variant={type === 'out' ? 'default' : 'outline'}
              className="h-14 flex-1 flex items-center gap-2"
              onClick={() => setType('out')}
            >
              <ArrowUpCircle className="h-5 w-5" />
              Cash Out
            </Button>
          </div>

          <div className="border rounded-lg p-3 text-center bg-muted/20">
            <p className="text-3xl font-bold font-mono">
              {currencySymbol}&nbsp;{amount || '0.00'}
            </p>
          </div>

          <CashNumpad value={amount} onChange={setAmount} buttonClassName="h-12" />

          <div className="space-y-2">
            <Label htmlFor="cash-reason">Reason</Label>
            <Input
              id="cash-reason"
              placeholder="e.g. float top-up, supplier payment, bank drop"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-12"
            />
          </div>

          {error && <p className="text-sm text-destructive font-medium">{error}</p>}

          <div className="flex gap-3">
            <Button variant="outline" className="flex-1 h-12" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1 h-12 font-semibold" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Record'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
