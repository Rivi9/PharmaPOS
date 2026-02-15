import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { SettingsPage, POSPage, InventoryPage, AnalyticsPage } from '@renderer/pages'
import { UsersPage } from '@renderer/pages/UsersPage'
import { AuditLogPage } from '@renderer/pages/AuditLogPage'
import { CustomersPage } from '@renderer/pages/CustomersPage'

interface MainLayoutProps {
  user: { full_name: string; role: string } | null
  onLogout: () => void
}

export function MainLayout({ user, onLogout }: MainLayoutProps): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState('pos')

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
      case 'ai':
        return <AnalyticsPage />
      case 'users':
        return <UsersPage />
      case 'customers':
        return <CustomersPage />
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
    <div className="h-screen flex flex-col bg-background">
      <Header user={user} onLogout={onLogout} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <main className="flex-1 overflow-auto">{renderPage()}</main>
      </div>
    </div>
  )
}
