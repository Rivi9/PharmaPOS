import { Button } from '@renderer/components/ui/button'
import { Settings, LogOut } from 'lucide-react'

interface HeaderProps {
  user: { full_name: string; role: string } | null
  onLogout: () => void
}

export function Header({ user, onLogout }: HeaderProps): React.JSX.Element {
  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-primary">PharmaPOS</h1>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <span className="text-sm text-muted-foreground">
            {user.full_name} ({user.role})
          </span>
        )}
        <Button variant="ghost" size="icon" title="Settings">
          <Settings className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onLogout} title="Logout">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  )
}
