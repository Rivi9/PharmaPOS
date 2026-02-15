import { cn } from '@renderer/lib/utils'
import { ShoppingCart, Package, BarChart3, Bot, Users, Settings, Shield, UserCircle } from 'lucide-react'

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
}

const navItems = [
  { id: 'pos', label: 'POS', icon: ShoppingCart },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'ai', label: 'AI Insights', icon: Bot },
  { id: 'customers', label: 'Customers', icon: UserCircle },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'audit', label: 'Audit', icon: Shield },
  { id: 'settings', label: 'Settings', icon: Settings }
]

export function Sidebar({ currentPage, onNavigate }: SidebarProps): React.JSX.Element {
  return (
    <aside className="w-16 bg-muted border-r flex flex-col items-center py-4 gap-2">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = currentPage === item.id

        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              'w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground'
            )}
            title={item.label}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label.slice(0, 3)}</span>
          </button>
        )
      })}
    </aside>
  )
}
