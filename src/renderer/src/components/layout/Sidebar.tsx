import { cn } from '@renderer/lib/utils'
import {
  ShoppingCart,
  Package,
  BarChart3,
  Users,
  Settings,
  UserCog,
  ClipboardList
} from 'lucide-react'
import { usePermission } from '@renderer/hooks/usePermission'
import type { Permission } from '../../../../shared/permissions'

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
}

const NAV_ITEMS = [
  { id: 'pos', label: 'POS', icon: ShoppingCart, permission: 'sales:create' as Permission },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    permission: 'inventory:view' as Permission
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    permission: 'reports:view' as Permission
  },
  { id: 'customers', label: 'Customers', icon: Users, permission: 'sales:create' as Permission },
  { id: 'users', label: 'Users', icon: UserCog, permission: 'users:view' as Permission },
  {
    id: 'audit',
    label: 'Audit Log',
    icon: ClipboardList,
    permission: 'reports:view' as Permission
  },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'settings:view' as Permission }
]

interface NavButtonProps {
  item: (typeof NAV_ITEMS)[0]
  active: boolean
  onClick: () => void
}

function NavButton({ item, active, onClick }: NavButtonProps): React.JSX.Element | null {
  const allowed = usePermission(item.permission)
  if (!allowed) return null

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'hover:bg-accent text-muted-foreground hover:text-foreground'
      )}
      title={item.label}
    >
      <item.icon className="w-5 h-5" />
      <span className="text-[10px] font-medium">{item.label.slice(0, 3)}</span>
    </button>
  )
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps): React.JSX.Element {
  return (
    <aside className="w-16 bg-muted border-r flex flex-col items-center py-4 gap-2">
      {NAV_ITEMS.map((item) => (
        <NavButton
          key={item.id}
          item={item}
          active={currentPage === item.id}
          onClick={() => onNavigate(item.id)}
        />
      ))}
    </aside>
  )
}
