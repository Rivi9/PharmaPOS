import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { MainLayout } from './components/layout'
import { LoginPage } from './pages/LoginPage'
import { SetupWizardPage } from './pages/SetupWizardPage'

function App(): React.JSX.Element {
  const { user, isAuthenticated, logout } = useAuthStore()
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null)

  useEffect(() => {
    const checkFirstRun = async () => {
      const firstRun = await window.electron.setup.isFirstRun()
      setIsFirstRun(firstRun)
    }
    checkFirstRun()
  }, [])

  if (isFirstRun === null) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  if (isFirstRun) {
    return <SetupWizardPage />
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return <MainLayout user={user} onLogout={logout} />
}

export default App
