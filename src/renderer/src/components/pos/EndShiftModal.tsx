import { useState, useEffect } from 'react'
import { LogOut, Clock, ShoppingBag, Banknote, Receipt } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import { Input } from '@renderer/components/ui/input'
import { CashNumpad } from '@renderer/components/ui/cash-numpad'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { formatCurrency } from '@renderer/lib/calculations'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

interface EndShiftModalProps {
  open: boolean
  onClose: () => void
  /** Called after the shift is successfully ended and the user is logged out. */
  onShiftEnded?: () => void
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
export function EndShiftModal({
  open,
  onClose,
  onShiftEnded
}: EndShiftModalProps): React.JSX.Element {
  const [closingCash, setClosingCash] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [countError, setCountError] = useState('')
  const [computedExpectedCash, setComputedExpectedCash] = useState<number | null>(null)
  const [cashMovements, setCashMovements] = useState<{ cashIn: number; cashOut: number }>({
    cashIn: 0,
    cashOut: 0
  })
  const [loadingExpectedCash, setLoadingExpectedCash] = useState(false)

  const currentShift = useShiftStore((s) => s.currentShift)
  const setCurrentShift = useShiftStore((s) => s.setCurrentShift)
  const todaySalesTotal = useShiftStore((s) => s.todaySalesTotal)
  const logout = useAuthStore((s) => s.logout)
  const currentUser = useAuthStore((s) => s.user)
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)

  const openingCash = (currentShift as any)?.opening_cash ?? 0

  // Reset the entry fields each time the dialog opens so a previous (cancelled)
  // count can never be submitted against a later shift.
  useEffect(() => {
    if (!open) return
    setClosingCash('')
    setNotes('')
    setCountError('')
  }, [open])

  useEffect(() => {
    if (!open || !currentShift) return
    window.electron.shifts
      .cashMovements(currentShift.id)
      .then((m: { cashIn: number; cashOut: number }) => setCashMovements(m))
      .catch(() => setCashMovements({ cashIn: 0, cashOut: 0 }))
  }, [open, currentShift])

  useEffect(() => {
    if (!open || !currentShift) return

    setLoadingExpectedCash(true)
    window.electron.shifts
      .computeExpectedCash(currentShift.id, (currentShift as any).opening_cash ?? 0)
      .then((cash: number) => {
        setComputedExpectedCash(cash)
      })
      .catch(() => {
        setComputedExpectedCash((currentShift as any).opening_cash ?? 0)
      })
      .finally(() => {
        setLoadingExpectedCash(false)
      })
  }, [open, currentShift])

  const closingCashNum = parseFloat(closingCash) || 0
  const expectedCash = computedExpectedCash ?? 0
  const cashDifference = closingCashNum - expectedCash

  const handleEndShift = async (fromKeyboard = false) => {
    if (!currentShift || loading) return
    // The numpad binds a bare Enter to this. Without a guard one stray keypress
    // — a scanner suffix, a leaning elbow — closed the shift with a Rs. 0 count
    // and logged the whole drawer as a shortage. Only Enter is guarded: tapping
    // End Shift is deliberate, and an empty count is the Rs. 0.00 on screen.
    if (fromKeyboard && closingCash.trim() === '') {
      setCountError('Enter the closing cash count before ending the shift')
      return
    }
    setCountError('')
    setLoading(true)
    try {
      await window.electron.endShift({
        shiftId: currentShift.id,
        closingCash: closingCashNum,
        notes: notes.trim() || undefined
      })
      // L6: `printShiftReport` was implemented and exposed over IPC but nothing
      // ever called it, so the report handed over with the drawer was never
      // produced. Printed before signing out, while the figures are still in
      // scope. A printer fault must not trap the cashier in a closed shift, so
      // the failure is reported and the sign-out continues.
      try {
        const printed = await window.electron.printer.printShiftReport({
          shift_id: currentShift.id,
          user_name: currentUser?.full_name ?? 'Cashier',
          started_at: currentShift.started_at,
          ended_at: new Date().toISOString(),
          opening_cash: openingCash,
          closing_cash: closingCashNum,
          expected_cash: expectedCash,
          total_sales: todaySalesTotal,
          // Cash actually taken: the expected drawer less the opening float and
          // the mid-shift movements. Same basis as the Cash Sales tile.
          cash_sales: Math.max(
            0,
            expectedCash - openingCash - cashMovements.cashIn + cashMovements.cashOut
          ),
          card_sales: 0,
          transaction_count: 0
        })
        if (printed && (printed as { success?: boolean }).success === false) {
          setCountError(
            `Shift closed, but the report did not print: ${(printed as { error?: string }).error ?? 'printer did not respond'}`
          )
        }
      } catch {
        setCountError('Shift closed, but the report did not print.')
      }

      setCurrentShift(null)
      logout()
      onShiftEnded?.()
    } catch (error) {
      // The handler now rejects on an already-closed or someone-else's shift
      // rather than reporting success. Without this the button just stopped
      // working and the cashier had no idea why.
      setCountError(ipcErrorMessage(error, 'Could not end the shift'))
    } finally {
      setLoading(false)
    }
  }

  if (!currentShift) return <></>

  return (
    <Dialog open={open} onOpenChange={onClose}>
      {/* Three regions, not one scrolling blob: header and action row are fixed,
          only the middle scrolls. `sticky bottom-0` with negative margins was the
          first attempt and was wrong — the row floated mid-dialog with the Notes
          field clipped behind it and the dialog's own p-6 left a dead gap below.
          p-0/gap-0/overflow-hidden override the base DialogContent so the padding
          lives on the three regions instead. */}
      <DialogContent
        className="max-w-md flex flex-col gap-0 p-0 overflow-hidden"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3">
          <DialogTitle className="text-xl flex items-center gap-2">
            <LogOut className="h-5 w-5" />
            End Shift
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-4 space-y-5">
          {/* Shift summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="border rounded-lg p-3 text-center space-y-1">
              <Clock className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-base font-bold">{formatDuration(currentShift.started_at)}</p>
            </div>
            <div className="border rounded-lg p-3 text-center space-y-1">
              <Receipt className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Total Sales</p>
              <p className="text-base font-bold">
                {formatCurrency(todaySalesTotal, currencySymbol)}
              </p>
            </div>
            <div className="border rounded-lg p-3 text-center space-y-1">
              <ShoppingBag className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Cash Sales</p>
              <p className="text-base font-bold">
                {loadingExpectedCash
                  ? 'Calc…'
                  : formatCurrency(
                      // Cash actually retained: back out the float and any
                      // mid-shift movements from the expected drawer figure.
                      computedExpectedCash !== null
                        ? computedExpectedCash -
                            openingCash -
                            cashMovements.cashIn +
                            cashMovements.cashOut
                        : 0,
                      currencySymbol
                    )}
              </p>
            </div>
            <div className="border rounded-lg p-3 text-center space-y-1">
              <Banknote className="h-4 w-4 mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Opening Cash</p>
              <p className="text-base font-bold">{formatCurrency(openingCash, currencySymbol)}</p>
            </div>
          </div>

          {/* Expected vs actual */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
            {cashMovements.cashIn > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash added during shift</span>
                <span className="font-medium text-blue-600">
                  +{formatCurrency(cashMovements.cashIn, currencySymbol)}
                </span>
              </div>
            )}
            {cashMovements.cashOut > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Cash removed during shift</span>
                <span className="font-medium text-amber-600">
                  −{formatCurrency(cashMovements.cashOut, currencySymbol)}
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expected in drawer</span>
              <span className="font-semibold">
                {loadingExpectedCash
                  ? 'Calculating…'
                  : `${currencySymbol} ${expectedCash.toFixed(2)}`}
              </span>
            </div>
            {/* Shown at zero too — a 0 count is what End Shift records when the
                field is empty, and hiding the shortage then is when it matters. */}
            {!loadingExpectedCash && (
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
            <CashNumpad
              value={closingCash}
              onChange={(v) => {
                setClosingCash(v)
                if (countError) setCountError('')
              }}
              onSubmit={() => handleEndShift(true)}
              buttonClassName="h-11"
            />
            {countError && <p className="text-sm text-destructive font-medium">{countError}</p>}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-sm text-muted-foreground">Notes (optional)</Label>
            <Input
              placeholder="Any notes for this shift…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-12"
            />
          </div>
        </div>

        {/* Action row — outside the scroll region, so it is pinned to the bottom
            edge of the dialog however tall the summary above it grows. On a
            1366×768 till this row used to fall off the screen entirely, and with
            outside-interaction prevented and the X clipped, the shift could not
            be closed by touch at all. */}
        <div className="shrink-0 flex gap-3 border-t bg-background p-4">
          <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1 h-12">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => handleEndShift()}
            disabled={loading}
            className="flex-1 h-12 font-semibold"
          >
            <LogOut className="mr-2 h-4 w-4" />
            {loading ? 'Closing…' : 'End Shift & Logout'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
