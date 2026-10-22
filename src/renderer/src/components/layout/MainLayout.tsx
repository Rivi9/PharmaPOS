import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { NAV_ITEMS } from './nav-items'
import { Header } from './Header'
import { SettingsPage, POSPage, InventoryPage, AnalyticsPage } from '@renderer/pages'
import { UsersPage } from '@renderer/pages/UsersPage'
import { AuditLogPage } from '@renderer/pages/AuditLogPage'
import { CustomersPage } from '@renderer/pages/CustomersPage'
import { SalesPage } from '@renderer/pages/SalesPage'
import { useAuthStore } from '@renderer/stores/authStore'
import { hasPermission, type Role } from '../../../../shared/permissions'

interface MainLayoutProps {
  user: { full_name: string; role: string } | null
  onEndShift: () => void
}

export function MainLayout({ user, onEndShift }: MainLayoutProps): React.JSX.Element {
  const [requestedPage, setCurrentPage] = useState('pos')
  const role = useAuthStore((s) => s.user?.role) as Role | undefined

  // Hiding a nav button is not enough: any other path to a page (a header
  // shortcut, a stale page left from the previous user) would still render it.
  // A page the signed-in role may not see falls back to the till.
  const allowed = (page: string): boolean => {
    const item = NAV_ITEMS.find((i) => i.id === page)
    return !item || (!!role && hasPermission(role, item.permission))
  }
  const currentPage = allowed(requestedPage) ? requestedPage : 'pos'

  const renderPage = (): React.JSX.Element => {
    switch (currentPage) {
      case 'settings':
        return <SettingsPage />
      case 'pos':
        return <POSPage />
      case 'inventory':
        return <InventoryPage />
      case 'analytics':
        return <AnalyticsPage />
      case 'users':
        return <UsersPage />
      case 'customers':
        return <CustomersPage />
      case 'sales':
        return <SalesPage />
      case 'audit':
        return <AuditLogPage />
      default:
        return (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>Select a page from the sidebar</p>
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen flex-col bg-canvas">
      <Header user={user} onEndShift={onEndShift} onSettings={() => setCurrentPage('settings')} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        {/* overflow-hidden: pages own their internal scrolling. An overflow-auto here
            competes with inner scroll areas (cart list, tables) and steals touch swipes. */}
        <main className="flex-1 min-w-0 overflow-hidden">{renderPage()}</main>
      </div>
    </div>
  )
}
