import { useState } from 'react'
import { LogOut, Clock, ShoppingBag, Banknote, Delete } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { formatCurrency } from '@renderer/lib/calculations'

interface EndShiftModalProps {
  open: boolean
  onClose: () => void
}

/** Parse a SQLite datetime string (UTC, no timezone marker) into a Date object. */
function parseSqliteDate(dt: string): Date {
  // SQLite datetime('now') → "2026-02-17 03:28:56" (UTC, space separator, no Z)
  // Convert to ISO 8601 so V8 parses it correctly as UTC.
  return new Date(dt.includes('T') ? dt : dt.replace(' ', 'T') + 'Z')
}

function formatDuration(startedAt: string): string {
  const ms = Date.now() - parseSqliteDate(startedAt).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * Dialog for ending the current shift at close-of-day.
 * Shows a shift summary (duration, total sales) and asks for
 * the closing cash count before closing the shift and logging out.
 */
export function EndShiftModal({ open, onClose }: EndShiftModalProps): React.JSX.Element {
  const [closingCash, setClosingCash] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const currentShift = useShiftStore((s) => s.currentShift)
  const todaySalesTotal = useShiftStore((s) => s.todaySalesTotal)
  const setCurrentShift = useShiftStore((s) => s.setCurrentShift)
  const logout = useAuthStore((s) => s.logout)
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)

  const closingCashNum = parseFloat(closingCash) || 0
  const openingCash = (currentShift as any)?.opening_cash ?? 0
  const expectedCash = openingCash + todaySalesTotal
  const cashDifference = closingCashNum - expectedCash

  const handleNumpadKey = (key: string) => {
    if (key === 'backspace') {
      setClosingCash((v) => v.slice(0, -1))
      return
    }
    if (key === '.' && closingCash.includes('.')) return
    const dotIndex = closingCash.indexOf('.')
    if (dotIndex !== -1 && closingCash.length - dotIndex > 2) return
    setClosingCash((v) => v + key)
  }

  const handleEndShift = async () => {
    if (!currentShift) return
    setLoading(true)
    try {
      await window.electron.endShift({
        shiftId: currentShift.id,
        closingCash: closingCashNum,
        notes: notes.trim() || undefined
      })
      setCurrentShift(null)
      logout()
    } finally {
      setLoading(false)
    }
  }

  if (!currentShift) return <></>

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <LogOut className="h-5 w-5" />
            End Shift
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Shift summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="border rounded-lg p-3 text-center space-y-1">
              <Clock className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-base font-bold">{formatDuration(currentShift.started_at)}</p>
            </div>
            <div className="border rounded-lg p-3 text-center space-y-1">
              <ShoppingBag className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Sales Total</p>
              <p className="text-base font-bold">{formatCurrency(todaySalesTotal)}</p>
            </div>
            <div className="border rounded-lg p-3 text-center space-y-1">
              <Banknote className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Opening Cash</p>
              <p className="text-base font-bold">{formatCurrency(openingCash)}</p>
            </div>
          </div>

          {/* Expected vs actual */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expected in drawer</span>
              <span className="font-semibold">
                {currencySymbol} {expectedCash.toFixed(2)}
              </span>
            </div>
            {closingCashNum > 0 && (
              <div
                className={`flex justify-between font-semibold ${
                  Math.abs(cashDifference) < 1
                    ? 'text-green-600'
                    : cashDifference > 0
                      ? 'text-blue-600'
                      : 'text-red-600'
                }`}
              >
                <span>
                  {Math.abs(cashDifference) < 1
                    ? 'Balanced'
                    : cashDifference > 0
                      ? 'Over'
                      : 'Short'}
                </span>
                <span>
                  {cashDifference >= 0 ? '+' : ''}
                  {currencySymbol} {cashDifference.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Closing cash numpad */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Closing Cash Count</Label>
            <div className="border rounded-lg p-3 text-center bg-muted/20">
              <p className="text-3xl font-bold font-mono">
                {currencySymbol}&nbsp;{closingCash || '0.00'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'backspace'].map((key) => (
                <Button
                  key={key}
                  variant="outline"
                  className="h-11 text-lg font-semibold"
                  onClick={() => handleNumpadKey(key)}
                >
                  {key === 'backspace' ? <Delete className="h-4 w-4" /> : key}
                </Button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Notes (optional)</Label>
            <Input
              placeholder="Any notes for this shift…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 h-12">
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleEndShift}
              disabled={loading}
              className="flex-1 h-12 font-semibold"
            >
              <LogOut className="mr-2 h-4 w-4" />
              {loading ? 'Closing…' : 'End Shift & Logout'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
