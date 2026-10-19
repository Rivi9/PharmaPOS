import { Button } from '@renderer/components/ui/button'
import { Settings, LogOut, Clock, Cross } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Avatar, AvatarFallback } from '@renderer/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { useShiftStore } from '@renderer/stores/shiftStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
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
  const currencySymbol = useSettingsStore((s) => s.settings.currency_symbol)

  const initials = (user?.full_name ?? '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Cross className="size-5" />
          </span>
          <span className="text-lg font-bold tracking-tight">PharmaPOS</span>
        </div>

        {currentShift && (
          <div className="hidden items-center gap-2 sm:flex">
            <Badge variant="outline" className="h-8 gap-1.5 border-transparent bg-accent px-3 text-sm text-accent-foreground">
              <Clock className="size-4" />
              Shift since {shiftStartTime(currentShift.started_at)}
            </Badge>
            <Badge variant="outline" className="h-8 px-3 text-sm tabular-nums">
              Today {formatCurrency(todaySalesTotal, currencySymbol)}
            </Badge>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {user && (
          <div className="hidden items-center gap-2.5 pr-1 sm:flex">
            <Avatar className="size-9">
              <AvatarFallback className="bg-secondary text-sm font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <div className="leading-tight">
              <p className="text-sm font-medium">{user.full_name}</p>
              <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
            </div>
          </div>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={onSettings} aria-label="Settings">
              <Settings />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>

        {currentShift && (
          <Button variant="destructive" onClick={onEndShift}>
            <LogOut />
            End Shift
          </Button>
        )}
      </div>
    </header>
  )
}
