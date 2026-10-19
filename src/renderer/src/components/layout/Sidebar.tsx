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
    label: 'Audit',
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
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-[4.5rem] w-20 touch-manipulation flex-col items-center justify-center gap-1.5 rounded-xl px-1 transition-colors select-none active:scale-[0.97]',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground active:bg-accent'
      )}
    >
      <item.icon className="size-6 shrink-0" />
      <span className="text-xs leading-none font-medium">{item.label}</span>
    </button>
  )
}

export function Sidebar({ currentPage, onNavigate }: SidebarProps): React.JSX.Element {
  return (
    <aside className="flex w-24 shrink-0 flex-col items-center gap-2 border-r bg-background py-3">
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
