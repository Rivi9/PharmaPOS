import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

interface MainLayoutProps {
  user: { full_name: string; role: string } | null
  onLogout: () => void
  children?: React.ReactNode
}

export function MainLayout({ user, onLogout, children }: MainLayoutProps): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState('pos')

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header user={user} onLogout={onLogout} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <main className="flex-1 overflow-auto p-4">
          {children || (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p>Select a page from the sidebar</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
