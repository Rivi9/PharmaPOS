import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { useShiftStore } from './stores/shiftStore'
import { useSettingsStore } from './stores/settingsStore'
import { MainLayout } from './components/layout'
import { LoginPage } from './pages/LoginPage'
import { SetupWizardPage } from './pages/SetupWizardPage'
import { UpdateNotification } from './components/UpdateNotification'
import { StartShiftModal } from './components/pos/StartShiftModal'
import { EndShiftModal } from './components/pos/EndShiftModal'

function App(): React.JSX.Element {
  const { user, isAuthenticated } = useAuthStore()
  const { currentShift } = useShiftStore()
  const [isFirstRun, setIsFirstRun] = useState<boolean | null>(null)
  const [endShiftOpen, setEndShiftOpen] = useState(false)
  // True when the modal was triggered by the OS close button / Alt+F4
  const [closeWindowOnEnd, setCloseWindowOnEnd] = useState(false)

  // Keep a ref so the IPC handler registered once on mount always sees the latest shift.
  const currentShiftRef = useRef(currentShift)
  useEffect(() => {
    currentShiftRef.current = currentShift
  }, [currentShift])

  useEffect(() => {
    const checkFirstRun = async () => {
      const firstRun = await window.electron.setup.isFirstRun()
      setIsFirstRun(firstRun)
    }
    checkFirstRun()
    useSettingsStore.getState().loadSettings()
  }, [])

  // Intercept OS window-close (Alt+F4, title-bar X).
  // Register once on mount (empty deps) — the ref ensures we always read the current shift.
  // Main process sends APP_CLOSE_REQUESTED; we show EndShift or confirm close immediately.
  useEffect(() => {
    const handler = () => {
      if (currentShiftRef.current) {
        setCloseWindowOnEnd(true)
        setEndShiftOpen(true)
      } else {
        // No active shift — safe to close immediately
        window.electron.ipcRenderer.send('app:confirm-close')
      }
    }
    window.electron.ipcRenderer.on('app:close-requested', handler)
    return () => {
      window.electron.ipcRenderer.removeListener('app:close-requested', handler)
    }
  }, []) // empty: register once, never re-register

  const handleEndShiftClose = () => {
    setEndShiftOpen(false)
    setCloseWindowOnEnd(false)
  }

  const handleShiftEnded = () => {
    if (closeWindowOnEnd) {
      window.electron.ipcRenderer.send('app:confirm-close')
    }
    handleEndShiftClose()
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
      <MainLayout user={user} onEndShift={() => setEndShiftOpen(true)} />
      <EndShiftModal
        open={endShiftOpen}
        onClose={handleEndShiftClose}
        onShiftEnded={handleShiftEnded}
      />
      <UpdateNotification />
    </>
  )
}

export default App
