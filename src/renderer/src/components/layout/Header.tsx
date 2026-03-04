import { Button } from '@renderer/components/ui/button'
import { Settings, LogOut, Clock } from 'lucide-react'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { formatCurrency } from '@renderer/lib/calculations'

interface HeaderProps {
  user: { full_name: string; role: string } | null
  onEndShift: () => void
  onSettings: () => void
}

/** Parse a SQLite datetime string (UTC, no timezone marker) into a Date. */
function parseSqliteDate(dt: string): Date {
  return new Date(dt.includes('T') ? dt : dt.replace(' ', 'T') + 'Z')
}

function shiftStartTime(startedAt: string): string {
  return parseSqliteDate(startedAt).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function Header({ user, onEndShift, onSettings }: HeaderProps): React.JSX.Element {
  const currentShift = useShiftStore((s) => s.currentShift)
  const todaySalesTotal = useShiftStore((s) => s.todaySalesTotal)

  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-primary">PharmaPOS</h1>

        {currentShift && (
          <div className="hidden sm:flex items-center gap-1.5 text-sm text-muted-foreground border rounded-md px-3 py-1">
            <Clock className="h-3.5 w-3.5" />
            <span>{shiftStartTime(currentShift.started_at)}</span>
            <span className="mx-1 text-border">|</span>
            <span className="font-medium text-foreground">{formatCurrency(todaySalesTotal)}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {user && (
          <span className="hidden sm:block text-sm text-muted-foreground">{user.full_name}</span>
        )}

        <Button variant="ghost" size="icon" onClick={onSettings} title="Settings">
          <Settings className="w-5 h-5" />
        </Button>

        {currentShift && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/5 gap-1.5"
            onClick={onEndShift}
            title="End Shift & Logout"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">End Shift</span>
          </Button>
        )}
      </div>
    </header>
  )
}
