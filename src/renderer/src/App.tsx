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
import { ErrorBoundary } from './components/ErrorBoundary'
import { Toaster } from './components/ui/sonner'
import { Spinner } from './components/ui/spinner'
import { TooltipProvider } from './components/ui/tooltip'
import { useSystemThemeSync } from './hooks/useTheme'

function App(): React.JSX.Element {
  useSystemThemeSync()
  return (
    <TooltipProvider delayDuration={400}>
      <AppScreens />
      <Toaster />
    </TooltipProvider>
  )
}

function AppScreens(): React.JSX.Element {
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
    const checkFirstRun = async (): Promise<void> => {
      const firstRun = await window.electron.setup.isFirstRun()
      setIsFirstRun(firstRun)
    }
    checkFirstRun()
    useSettingsStore.getState().loadSettings()

    /**
     * Recover the session after a reload (L7).
     *
     * Ctrl+R — the default Electron menu is still installed — wiped the auth
     * store and dropped the cashier at the login screen mid-sale, with a
     * part-rung basket. The main-process session survives a reload because it is
     * keyed to the webContents, so it is asked rather than assumed, and the open
     * shift is picked up with it. The cart itself is restored by posStore.
     */
    const restoreSession = async (): Promise<void> => {
      try {
        const current = await window.electron.currentUser()
        if (!current) return
        useAuthStore.getState().login(current)
        const shift = await window.electron.getActiveShift()
        if (shift) {
          useShiftStore.getState().setCurrentShift(shift)
          await useShiftStore.getState().refreshTodaySales(shift.id)
        }
      } catch {
        // Not signed in, or the session has gone — the login screen is correct.
      }
    }
    void restoreSession()
  }, [])

  // Intercept OS window-close (Alt+F4, title-bar X).
  // Register once on mount (empty deps) — the ref ensures we always read the current shift.
  // Main process sends APP_CLOSE_REQUESTED; we show EndShift or confirm close immediately.
  useEffect(() => {
    const handler = (): void => {
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

  const handleEndShiftClose = (): void => {
    setEndShiftOpen(false)
    setCloseWindowOnEnd(false)
  }

  const handleShiftEnded = (): void => {
    if (closeWindowOnEnd) {
      window.electron.ipcRenderer.send('app:confirm-close')
    }
    handleEndShiftClose()
  }

  if (isFirstRun === null) {
    return (
      <>
        <div className="flex min-h-screen items-center justify-center bg-canvas text-muted-foreground">
          <Spinner className="size-8" />
        </div>
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
      <ErrorBoundary label="The main screen hit an unexpected error.">
        <MainLayout user={user} onEndShift={() => setEndShiftOpen(true)} />
      </ErrorBoundary>
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
