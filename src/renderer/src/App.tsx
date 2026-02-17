import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { useShiftStore } from './stores/shiftStore'
import { MainLayout } from './components/layout'
import { LoginPage } from './pages/LoginPage'
import { SetupWizardPage } from './pages/SetupWizardPage'
import { UpdateNotification } from './components/UpdateNotification'
import { StartShiftModal } from './components/pos/StartShiftModal'

function App(): React.JSX.Element {
  const { user, isAuthenticated, logout } = useAuthStore()
  const { currentShift, setCurrentShift } = useShiftStore()
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null)

  useEffect(() => {
    const checkFirstRun = async () => {
      const firstRun = await window.electron.setup.isFirstRun()
      setIsFirstRun(firstRun)
    }
    checkFirstRun()
  }, [])

  // Plain logout: clears shift from memory (shift stays open in DB, resumed on next login)
  const handleLogout = () => {
    setCurrentShift(null)
    logout()
  }

  if (isFirstRun === null) {
    return (
      <>
        <div className="min-h-screen flex items-center justify-center">Loading...</div>
        <UpdateNotification />
      </>
    )
  }

  if (isFirstRun) {
    return (
      <>
        <SetupWizardPage />
        <UpdateNotification />
      </>
    )
  }

  if (!isAuthenticated) {
    return (
      <>
        <LoginPage />
        <UpdateNotification />
      </>
    )
  }

  // Authenticated but no active shift — show shift start screen
  if (!currentShift) {
    return (
      <>
        <StartShiftModal />
        <UpdateNotification />
      </>
    )
  }

  return (
    <>
      <MainLayout user={user} onLogout={handleLogout} />
      <UpdateNotification />
    </>
  )
}

export default App
