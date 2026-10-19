import { useEffect, useRef, useState } from 'react'
import { CircleAlert, LogIn } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Spinner } from '@renderer/components/ui/spinner'
import { CashNumpad } from '@renderer/components/ui/cash-numpad'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { formatCurrency } from '@renderer/lib/calculations'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

/**
 * Full-page screen shown between login and the main POS whenever
 * the logged-in user has no active shift. The cashier enters their
 * opening cash float and confirms to start the shift.
 */
export function StartShiftModal(): React.JSX.Element {
  const [openingCash, setOpeningCash] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => new Date())

  // The POS sits idle on this screen between shifts — tick so the clock stays honest.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const user = useAuthStore((s) => s.user)
  const setCurrentShift = useShiftStore((s) => s.setCurrentShift)
  const setTodaySalesTotal = useShiftStore((s) => s.setTodaySalesTotal)
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)

  const cashAmount = parseFloat(openingCash) || 0

  // The numpad's Enter calls this directly, bypassing the disabled button, so a
  // double Enter used to send two start requests.
  const inFlight = useRef(false)
  const handleStartShift = async (): Promise<void> => {
    if (!user || inFlight.current) return
    inFlight.current = true
    setError('')
    setLoading(true)
    try {
      await window.electron.startShift({ openingCash: cashAmount })
      const shift = await window.electron.getActiveShift()
      setTodaySalesTotal(0)
      setCurrentShift(shift)
    } catch (err) {
      // A duplicate-shift rejection used to leave the button doing nothing
      // forever, with the operator convinced the till was broken.
      setError(ipcErrorMessage(err, 'Could not start the shift'))
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  const initials = (user?.full_name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center p-4 sm:p-6">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl border bg-card shadow-xs md:grid-cols-[1fr_minmax(0,22rem)]">
        {/* Greeting */}
        <div className="flex flex-col items-center justify-center gap-6 bg-accent/40 p-6 text-center md:p-8">
          <div className="space-y-1">
            <p className="text-base text-muted-foreground">{dateStr}</p>
            <p className="text-5xl font-semibold tracking-tight tabular-nums text-primary">
              {timeStr}
            </p>
          </div>
          <div className="flex flex-col items-center gap-2">
            <div
              aria-hidden
              className="flex size-16 items-center justify-center rounded-full bg-primary text-2xl font-semibold text-primary-foreground"
            >
              {initials || '?'}
            </div>
            <p className="text-xl font-semibold">{user?.full_name}</p>
            {user?.role && (
              <Badge variant="secondary" className="h-6 px-3 text-sm capitalize">
                {user.role}
              </Badge>
            )}
          </div>
          <p className="max-w-xs text-base text-muted-foreground">
            Count the cash float in the drawer and enter it to open your shift.
          </p>
        </div>

        {/* Entry */}
        <div className="flex flex-col gap-4 p-6">
          {/* Opening cash display */}
          <div className="rounded-xl border bg-muted/40 p-4 text-center">
            <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Opening Cash
            </p>
            <p className="mt-1 truncate font-mono text-4xl font-bold tracking-tight tabular-nums">
              {currencySymbol}&nbsp;{openingCash || '0.00'}
            </p>
            <p className="mt-1 h-5 text-sm text-muted-foreground">
              {cashAmount > 0 ? formatCurrency(cashAmount, currencySymbol) : '\u00a0'}
            </p>
          </div>

          {/* Numpad */}
          <CashNumpad value={openingCash} onChange={setOpeningCash} onSubmit={handleStartShift} />

          {error && (
            <Alert variant="destructive" className="bg-destructive/10">
              <CircleAlert />
              <AlertDescription className="text-base font-medium text-destructive">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Start shift */}
          <Button size="xl" className="w-full" onClick={handleStartShift} disabled={loading}>
            {loading ? <Spinner className="size-6" /> : <LogIn />}
            {loading ? 'Starting Shift…' : 'Start Shift'}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            You can enter 0 if no cash float is needed
          </p>
        </div>
      </div>
    </div>
  )
}
