import { useState, useEffect, useRef } from 'react'
import { LogOut, Clock, ShoppingBag, Banknote, Receipt, Printer } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Field, FieldError, FieldLabel } from '@renderer/components/ui/field'
import { Alert, AlertDescription, AlertTitle } from '@renderer/components/ui/alert'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Spinner } from '@renderer/components/ui/spinner'
import { cn } from '@renderer/lib/utils'
import { CashNumpad } from '@renderer/components/ui/cash-numpad'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { formatCurrency } from '@renderer/lib/calculations'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

/** How long the 'press Enter again' confirmation stays armed. */
const CONFIRM_ZERO_MS = 5000

interface EndShiftModalProps {
  open: boolean
  onClose: () => void
  /** Called after the shift is successfully ended and the user is logged out. */
  onShiftEnded?: () => void
}

/** The store's Shift type omits the float; the IPC row carries it. */
type WithOpeningCash = { opening_cash?: number }

/** Parse a SQLite datetime string (UTC, no timezone marker) into a Date object. */
function parseSqliteDate(dt: string): Date {
  // SQLite datetime('now') → "2026-02-17 03:28:56" (UTC, space separator, no Z)
  // Convert to ISO 8601 so V8 parses it correctly as UTC.
  return new Date(dt.includes('T') ? dt : dt.replace(' ', 'T') + 'Z')
}

/** One figure in the shift summary grid. */
function StatTile({
  icon: Icon,
  label,
  children
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-muted/50 p-3">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </span>
      <span className="text-lg font-semibold tabular-nums">{children}</span>
    </div>
  )
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
  /** Shown after a bare Enter on an empty count; a second Enter confirms Rs. 0.00. */
  const [confirmZeroHint, setConfirmZeroHint] = useState(false)
  const confirmZeroUntil = useRef(0)
  /** Set when the shift closed but its report did not print; sign-out waits for an OK. */
  const [printWarning, setPrintWarning] = useState('')
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

  const openingCash = (currentShift as WithOpeningCash | null)?.opening_cash ?? 0

  // The "press Enter again" prompt lapses with the confirmation window.
  useEffect(() => {
    if (!confirmZeroHint) return
    const timer = setTimeout(() => setConfirmZeroHint(false), CONFIRM_ZERO_MS)
    return () => clearTimeout(timer)
  }, [confirmZeroHint])

  // Reset the entry fields each time the dialog opens so a previous (cancelled)
  // count can never be submitted against a later shift.
  useEffect(() => {
    if (!open) return
    setClosingCash('')
    setNotes('')
    confirmZeroUntil.current = 0
    setConfirmZeroHint(false)
    setCountError('')
    setPrintWarning('')
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
      .computeExpectedCash(currentShift.id)
      .then((cash: number) => {
        setComputedExpectedCash(cash)
      })
      .catch(() => {
        setComputedExpectedCash((currentShift as WithOpeningCash).opening_cash ?? 0)
      })
      .finally(() => {
        setLoadingExpectedCash(false)
      })
  }, [open, currentShift])

  const closingCashNum = parseFloat(closingCash) || 0
  const expectedCash = computedExpectedCash ?? 0
  const cashDifference = closingCashNum - expectedCash

  const finishSignOut = (): void => {
    setPrintWarning('')
    setCurrentShift(null)
    logout()
    onShiftEnded?.()
  }

  const handleEndShift = async (fromKeyboard = false): Promise<void> => {
    if (!currentShift || loading || printWarning) return
    // The numpad binds a bare Enter to this. Without a guard one stray keypress
    // — a scanner suffix, a leaning elbow — closed the shift with a Rs. 0 count
    // and logged the whole drawer as a shortage. Only Enter is guarded: tapping
    // End Shift is deliberate, and an empty count is the Rs. 0.00 on screen.
    // A second Enter within CONFIRM_ZERO_MS is the confirmation; one stray
    // Enter only arms it, so the protection stays but the keyboard is not a dead
    // end for a drawer that really is empty.
    if (fromKeyboard && closingCash.trim() === '') {
      if (Date.now() > confirmZeroUntil.current) {
        confirmZeroUntil.current = Date.now() + CONFIRM_ZERO_MS
        setConfirmZeroHint(true)
        return
      }
    }
    confirmZeroUntil.current = 0
    setConfirmZeroHint(false)
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
      // the failure is reported and the sign-out continues once acknowledged.
      // It used to be set and then unmounted in the same tick by the sign-out,
      // so nobody ever saw it.
      let warning = ''
      try {
        const printed = await window.electron.printer.printShiftReport({
          shift_id: currentShift.id,
          user_name: currentUser?.full_name ?? 'Cashier',
          started_at: currentShift.started_at,
          ended_at: new Date().toISOString(),
          opening_cash: openingCash,
          closing_cash: closingCashNum,
          expected_cash: expectedCash
          // Sales totals are not passed: printShiftReport computes them from the
          // shift's own sales rows. The zeros that used to be sent were ignored.
        })
        if (printed && (printed as { success?: boolean }).success === false) {
          warning = `Shift closed, but the report did not print: ${(printed as { error?: string }).error ?? 'printer did not respond'}`
        }
      } catch {
        warning = 'Shift closed, but the report did not print.'
      }

      if (warning) {
        setPrintWarning(warning)
        return
      }
      finishSignOut()
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

  const cashSales =
    // Cash actually retained: back out the float and any
    // mid-shift movements from the expected drawer figure.
    computedExpectedCash !== null
      ? computedExpectedCash - openingCash - cashMovements.cashIn + cashMovements.cashOut
      : 0
  const balanced = Math.abs(cashDifference) < 1

  return (
    <Dialog open={open} onOpenChange={printWarning ? finishSignOut : onClose}>
      {/* Three regions, not one scrolling blob: header and action row are fixed,
          only the middle scrolls. `sticky bottom-0` with negative margins was the
          first attempt and was wrong — the row floated mid-dialog with the Notes
          field clipped behind it and the dialog's own p-6 left a dead gap below.
          p-0/gap-0/overflow-hidden override the base DialogContent so the padding
          lives on the three regions instead. max-h keeps the whole dialog on a
          768px-tall till screen so the middle region is what scrolls. */}
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onInteractOutside={(e) => e.preventDefault()}
        // Radix focuses the first field, which in this layout is Notes — and the
        // numpad ignores the keyboard while a text field has focus, so a typed
        // count went into the notes. Focus the dialog itself instead.
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          ;(e.currentTarget as HTMLElement | null)?.focus()
        }}
      >
        <DialogHeader className="shrink-0 border-b px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2 text-2xl font-semibold">
            <LogOut className="size-6" />
            End Shift
          </DialogTitle>
          <DialogDescription className="text-base">
            Count the cash in the drawer, enter the total, then end the shift.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto overscroll-contain p-6 md:grid-cols-2">
          {/* Left: summary, reconciliation, notes */}
          <div className="space-y-5">
            {/* Shift summary */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile icon={Clock} label="Duration">
                {formatDuration(currentShift.started_at)}
              </StatTile>
              <StatTile icon={Receipt} label="Total Sales">
                {formatCurrency(todaySalesTotal, currencySymbol)}
              </StatTile>
              <StatTile icon={ShoppingBag} label="Cash Sales">
                {loadingExpectedCash ? (
                  <Skeleton className="mt-1 h-6 w-24" />
                ) : (
                  formatCurrency(cashSales, currencySymbol)
                )}
              </StatTile>
              <StatTile icon={Banknote} label="Opening Cash">
                {formatCurrency(openingCash, currencySymbol)}
              </StatTile>
            </div>

            {/* Expected vs actual */}
            <div className="space-y-2 rounded-xl border p-4 text-base">
              {cashMovements.cashIn > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Cash added during shift</span>
                  <span className="font-medium tabular-nums text-info">
                    +{formatCurrency(cashMovements.cashIn, currencySymbol)}
                  </span>
                </div>
              )}
              {cashMovements.cashOut > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Cash removed during shift</span>
                  <span className="font-medium tabular-nums text-warning">
                    −{formatCurrency(cashMovements.cashOut, currencySymbol)}
                  </span>
                </div>
              )}
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Expected in drawer</span>
                <span className="font-semibold tabular-nums">
                  {loadingExpectedCash
                    ? 'Calculating…'
                    : `${currencySymbol} ${expectedCash.toFixed(2)}`}
                </span>
              </div>
              {/* Shown at zero too — a 0 count is what End Shift records when the
                  field is empty, and hiding the shortage then is when it matters. */}
              {!loadingExpectedCash && (
                <div
                  className={cn(
                    '-mx-2 flex justify-between gap-3 rounded-lg px-2 py-1.5 text-lg font-semibold',
                    balanced
                      ? 'bg-success-muted text-success'
                      : cashDifference > 0
                        ? 'bg-info-muted text-info'
                        : 'bg-destructive/10 text-destructive'
                  )}
                >
                  <span>{balanced ? 'Balanced' : cashDifference > 0 ? 'Over' : 'Short'}</span>
                  <span className="tabular-nums">
                    {cashDifference >= 0 ? '+' : ''}
                    {currencySymbol} {cashDifference.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Notes */}
            <Field>
              <FieldLabel htmlFor="end-shift-notes" className="text-muted-foreground">
                Notes (optional)
              </FieldLabel>
              <Input
                id="end-shift-notes"
                placeholder="Any notes for this shift…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>

          {/* Right: closing cash numpad */}
          <div className="space-y-3">
            <p className="text-base font-medium">Closing Cash Count</p>
            <div
              className={cn(
                'rounded-xl border bg-muted/40 p-3 text-center',
                countError && 'border-destructive'
              )}
            >
              <p className="truncate font-mono text-4xl font-bold tabular-nums">
                {currencySymbol}&nbsp;{closingCash || '0.00'}
              </p>
            </div>
            <CashNumpad
              value={closingCash}
              onChange={(v) => {
                setClosingCash(v)
                if (countError) setCountError('')
                confirmZeroUntil.current = 0
                setConfirmZeroHint(false)
              }}
              onSubmit={() => handleEndShift(true)}
            />
            {confirmZeroHint && !countError && (
              <p role="status" className="rounded-lg bg-warning-muted px-3 py-2 text-base text-warning">
                No count entered. Press <kbd className="font-semibold">Enter</kbd> again to end with{' '}
                {currencySymbol}&nbsp;0.00, or type the amount counted.
              </p>
            )}
            <FieldError className="text-base font-medium">{countError || null}</FieldError>
          </div>
        </div>

        {/* Action row — outside the scroll region, so it is pinned to the bottom
            edge of the dialog however tall the summary above it grows. On a
            1366×768 till this row used to fall off the screen entirely, and with
            outside-interaction prevented and the X clipped, the shift could not
            be closed by touch at all. */}
        {printWarning ? (
          // The shift is already closed — Cancel would leave the till on a closed
          // shift, so the only way out is signing out.
          <div className="shrink-0 space-y-3 border-t bg-background p-4">
            <Alert variant="destructive" className="bg-destructive/10">
              <Printer />
              <AlertTitle className="text-base">Report not printed</AlertTitle>
              <AlertDescription className="text-base">{printWarning}</AlertDescription>
            </Alert>
            <Button size="lg" onClick={finishSignOut} className="w-full font-semibold">
              <LogOut />
              OK, sign out
            </Button>
          </div>
        ) : (
          <div className="shrink-0 flex gap-3 border-t bg-background p-4">
            <Button
              variant="outline"
              size="lg"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              variant="destructive-solid"
              size="lg"
              onClick={() => handleEndShift()}
              disabled={loading}
              className="flex-[2] font-semibold"
            >
              {loading ? <Spinner className="size-5" /> : <LogOut />}
              {loading ? 'Closing…' : 'End Shift & Logout'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
