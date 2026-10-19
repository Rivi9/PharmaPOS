import { useState, useEffect, useRef } from 'react'
import { AlertCircle, ArrowLeft, Cross, Hash, KeyRound, LogIn } from 'lucide-react'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Avatar, AvatarFallback } from '@renderer/components/ui/avatar'
import { Field, FieldLabel } from '@renderer/components/ui/field'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'
import { PinPad } from '@renderer/components/auth/PinPad'
import { useAuthStore } from '@renderer/stores/authStore'
import { useShiftStore } from '@renderer/stores/shiftStore'

interface User {
  id: string
  username: string
  full_name: string
  role: string
}

function generatePin(): string {
  const arr = new Uint16Array(1)
  crypto.getRandomValues(arr)
  return String(1000 + (arr[0] % 9000))
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const arr = new Uint8Array(10)
  crypto.getRandomValues(arr)
  return Array.from(arr, (b) => chars[b % chars.length]).join('')
}

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  )
}

/** The PharmaPOS mark — same treatment as the app header, scaled up. */
function BrandMark(): React.JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-12 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
        <Cross className="size-7" />
      </span>
      <span className="text-3xl font-bold tracking-tight">PharmaPOS</span>
    </div>
  )
}

export function LoginPage(): React.JSX.Element {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [firstRunCreds, setFirstRunCreds] = useState<{ pin: string; password: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const bootstrapAttempted = useRef(false)

  const login = useAuthStore((state) => state.login)
  const setCurrentShift = useShiftStore((state) => state.setCurrentShift)
  const setTodaySalesTotal = useShiftStore((state) => state.setTodaySalesTotal)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async (): Promise<void> => {
    try {
      const userList = await window.electron.getUsers()
      setUsers(userList)

      // First run: bootstrap the admin account. The ref guard means a failed
      // creation surfaces an error instead of re-entering loadUsers forever.
      if (userList.length === 0 && !bootstrapAttempted.current) {
        bootstrapAttempted.current = true
        await createDefaultAdmin()
        const afterCreate = await window.electron.getUsers()
        setUsers(afterCreate)
        if (afterCreate.length === 0) {
          setError('Could not create the default admin account. Please restart the application.')
        }
      }
    } catch (err) {
      console.error('Failed to load users:', err)
      setError('Failed to load users. Please restart the application.')
    } finally {
      setLoading(false)
    }
  }

  const createDefaultAdmin = async (): Promise<void> => {
    const pin = generatePin()
    const pw = generatePassword()
    await window.electron.createUser({
      username: 'admin',
      password: pw,
      fullName: 'Administrator',
      role: 'admin',
      pin
    })
    setFirstRunCreds({ pin, password: pw })
  }

  /** Load an existing active shift and restore its sales total from the DB. */
  const resumeShift = async (): Promise<void> => {
    const shift = await window.electron.getActiveShift()
    setCurrentShift(shift)
    if (shift) {
      const total = await window.electron.getTodaySalesTotal(shift.id)
      setTodaySalesTotal(typeof total === 'number' ? total : 0)
    }
  }

  const handlePinSubmit = async (pin: string): Promise<void> => {
    if (!selectedUser) return
    setError('')

    const result = await window.electron.login({ userId: selectedUser.id, pin })

    if (result.success) {
      await resumeShift()
      login(result.user)
    } else {
      setError(result.error || 'Invalid PIN')
    }
  }

  const handlePasswordSubmit = async (): Promise<void> => {
    // `submitting` stops Enter + a tap on Login from sending two attempts for
    // the same password (each failure counts towards the lockout).
    if (!selectedUser || !password || submitting) return
    setError('')
    setSubmitting(true)

    try {
      const result = await window.electron.login({ userId: selectedUser.id, password })

      if (result.success) {
        await resumeShift()
        login(result.user)
      } else {
        setError(result.error || 'Invalid password')
        setPassword('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleBack = (): void => {
    // Don't carry a half-typed password or the last user's error back to the
    // user list, where the next person would see it.
    setSelectedUser(null)
    setPassword('')
    setError('')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-canvas text-base text-muted-foreground">
        <Spinner className="size-6" />
        Loading...
      </div>
    )
  }

  const errorAlert = error ? (
    <Alert variant="destructive" className="text-base">
      <AlertCircle />
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  ) : null

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-canvas p-6">
      {/* Shown once, and only dismissable by the button: the credentials are
          generated here and are never displayed again. */}
      <AlertDialog open={firstRunCreds !== null}>
        <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl">First-Time Setup</AlertDialogTitle>
            <AlertDialogDescription className="text-base">
              An admin account has been created. Write down these credentials — they will not be
              shown again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-muted p-4 font-mono text-base">
            <dt className="text-muted-foreground">Username</dt>
            <dd className="font-bold">admin</dd>
            <dt className="text-muted-foreground">PIN</dt>
            <dd className="font-bold">{firstRunCreds?.pin}</dd>
            <dt className="text-muted-foreground">Password</dt>
            <dd className="font-bold break-all">{firstRunCreds?.password}</dd>
          </dl>
          <AlertDialogFooter>
            <AlertDialogAction
              size="lg"
              className="w-full sm:w-full"
              onClick={() => setFirstRunCreds(null)}
            >
              I have saved these credentials
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BrandMark />

      {!selectedUser ? (
        <Card className="w-full max-w-2xl gap-6 rounded-2xl text-base">
          <CardContent className="flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-2xl font-semibold">Welcome back</h1>
              <p className="mt-1 text-muted-foreground">Select user to login</p>
            </div>

            {errorAlert}

            {users.length === 0 && !error ? (
              <p className="py-8 text-center text-muted-foreground">No users found.</p>
            ) : (
              <div className="-m-1 grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3">
                {users.map((user) => (
                  <Button
                    key={user.id}
                    variant="outline"
                    className="h-auto flex-col gap-3 rounded-xl px-3 py-5 whitespace-normal hover:border-primary/40 hover:bg-accent"
                    onClick={() => setSelectedUser(user)}
                  >
                    <Avatar className="size-16">
                      <AvatarFallback className="bg-accent text-xl font-semibold text-accent-foreground">
                        {initialsOf(user.full_name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex flex-col items-center gap-0.5 text-center">
                      <span className="text-base leading-tight font-medium">{user.full_name}</span>
                      <span className="text-sm text-muted-foreground capitalize">{user.role}</span>
                    </span>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="w-full max-w-md gap-6 rounded-2xl text-base">
          <CardContent className="flex flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar className="size-20">
                <AvatarFallback className="bg-accent text-2xl font-semibold text-accent-foreground">
                  {initialsOf(selectedUser.full_name)}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xl font-semibold">{selectedUser.full_name}</p>
                <p className="text-sm text-muted-foreground capitalize">{selectedUser.role}</p>
              </div>
            </div>

            {errorAlert}

            {usePassword ? (
              <div className="flex w-full flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="login-password" className="sr-only">
                    Password
                  </FieldLabel>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="Enter password"
                    autoComplete="current-password"
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                    className="h-14 text-lg"
                  />
                </Field>
                <Button
                  className="w-full"
                  size="xl"
                  onClick={handlePasswordSubmit}
                  disabled={!password || submitting}
                >
                  {submitting ? <Spinner className="size-6" aria-hidden="true" /> : <LogIn />}
                  Login
                </Button>
              </div>
            ) : (
              <PinPad onSubmit={handlePinSubmit} />
            )}

            <div className="flex w-full justify-between gap-3">
              <Button variant="ghost" size="lg" onClick={handleBack}>
                <ArrowLeft />
                Back
              </Button>
              <Button variant="outline" size="lg" onClick={() => setUsePassword(!usePassword)}>
                {usePassword ? <Hash /> : <KeyRound />}
                {usePassword ? 'Use PIN' : 'Use Password'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
