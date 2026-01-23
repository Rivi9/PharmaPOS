import { useState } from 'react'
import { MainLayout } from './components/layout'

function App(): React.JSX.Element {
  const [user, setUser] = useState<{ full_name: string; role: string } | null>({
    full_name: 'Test User',
    role: 'admin'
  })

  const handleLogout = (): void => {
    setUser(null)
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Please login</p>
      </div>
    )
  }

  return <MainLayout user={user} onLogout={handleLogout} />
}

export default App
