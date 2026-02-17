import { useState } from 'react'
import { LogIn, Delete } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { formatCurrency } from '@renderer/lib/calculations'

/**
 * Full-page screen shown between login and the main POS whenever
 * the logged-in user has no active shift. The cashier enters their
 * opening cash float and confirms to start the shift.
 */
export function StartShiftModal(): React.JSX.Element {
  const [openingCash, setOpeningCash] = useState('')
  const [loading, setLoading] = useState(false)

  const user = useAuthStore((s) => s.user)
  const setCurrentShift = useShiftStore((s) => s.setCurrentShift)
  const setTodaySalesTotal = useShiftStore((s) => s.setTodaySalesTotal)
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)

  const cashAmount = parseFloat(openingCash) || 0

  const handleNumpadKey = (key: string) => {
    if (key === 'backspace') {
      setOpeningCash((v) => v.slice(0, -1))
      return
    }
    if (key === '.' && openingCash.includes('.')) return
    const dotIndex = openingCash.indexOf('.')
    if (dotIndex !== -1 && openingCash.length - dotIndex > 2) return
    setOpeningCash((v) => v + key)
  }

  const handleStartShift = async () => {
    if (!user) return
    setLoading(true)
    try {
      await window.electron.startShift({ userId: user.id, openingCash: cashAmount })
      const shift = await window.electron.getActiveShift(user.id)
      setTodaySalesTotal(0)
      setCurrentShift(shift)
    } finally {
      setLoading(false)
    }
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Greeting */}
        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">{dateStr}</p>
          <p className="text-2xl font-bold text-primary">{timeStr}</p>
          <p className="text-lg font-semibold mt-2">{user?.full_name}</p>
          <p className="text-sm text-muted-foreground capitalize">{user?.role}</p>
        </div>

        {/* Opening cash display */}
        <div className="border rounded-xl p-4 bg-muted/30 text-center space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Opening Cash</p>
          <p className="text-4xl font-bold font-mono tracking-tight">
            {currencySymbol}&nbsp;{openingCash || '0.00'}
          </p>
          {cashAmount > 0 && (
            <p className="text-sm text-muted-foreground">{formatCurrency(cashAmount)}</p>
          )}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'backspace'].map((key) => (
            <Button
              key={key}
              variant="outline"
              className="h-14 text-xl font-semibold"
              onClick={() => handleNumpadKey(key)}
            >
              {key === 'backspace' ? <Delete className="h-5 w-5" /> : key}
            </Button>
          ))}
        </div>

        {/* Start shift */}
        <Button
          className="w-full h-14 text-lg font-bold"
          onClick={handleStartShift}
          disabled={loading}
        >
          <LogIn className="mr-2 h-5 w-5" />
          {loading ? 'Starting Shift…' : 'Start Shift'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          You can enter 0 if no cash float is needed
        </p>
      </div>
    </div>
  )
}
