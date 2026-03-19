import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
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

export function LoginPage(): React.JSX.Element {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [firstRunCreds, setFirstRunCreds] = useState<{ pin: string; password: string } | null>(
    null
  )

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

      // If no users, we need to create admin
      if (userList.length === 0) {
        await createDefaultAdmin()
        loadUsers()
      }
    } catch (err) {
      console.error('Failed to load users:', err)
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
  const resumeShift = async (userId: string): Promise<void> => {
    const shift = await window.electron.getActiveShift(userId)
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
      await resumeShift(result.user.id)
      login(result.user)
    } else {
      setError(result.error || 'Invalid PIN')
    }
  }

  const handlePasswordSubmit = async (): Promise<void> => {
    if (!selectedUser || !password) return
    setError('')

    const result = await window.electron.login({ userId: selectedUser.id, password })

    if (result.success) {
      await resumeShift(result.user.id)
      login(result.user)
    } else {
      setError(result.error || 'Invalid password')
      setPassword('')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {firstRunCreds && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h2 className="text-lg font-bold text-center">First-Time Setup</h2>
            <p className="text-sm text-muted-foreground text-center">
              An admin account has been created. Write down these credentials — they will not be
              shown again.
            </p>
            <div className="bg-muted rounded-lg p-4 space-y-2 font-mono text-sm">
              <p>
                <span className="text-muted-foreground">Username: </span>
                <span className="font-bold">admin</span>
              </p>
              <p>
                <span className="text-muted-foreground">PIN: </span>
                <span className="font-bold">{firstRunCreds.pin}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Password: </span>
                <span className="font-bold">{firstRunCreds.password}</span>
              </p>
            </div>
            <Button className="w-full" onClick={() => setFirstRunCreds(null)}>
              I have saved these credentials
            </Button>
          </div>
        </div>
      )}
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-primary">PharmaPOS</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedUser ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center mb-4">Select user to login</p>
              {users.map((user) => (
                <Button
                  key={user.id}
                  variant="outline"
                  className="w-full justify-start h-12"
                  onClick={() => setSelectedUser(user)}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{user.full_name}</span>
                    <span className="text-xs text-muted-foreground">{user.role}</span>
                  </div>
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="font-medium">{selectedUser.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.role}</p>
              </div>

              {error && <p className="text-sm text-destructive text-center">{error}</p>}

              {usePassword ? (
                <div className="space-y-4">
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                  />
                  <Button className="w-full" onClick={handlePasswordSubmit}>
                    Login
                  </Button>
                </div>
              ) : (
                <PinPad onSubmit={handlePinSubmit} />
              )}

              <div className="flex justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedUser(null)}>
                  Back
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setUsePassword(!usePassword)}>
                  {usePassword ? 'Use PIN' : 'Use Password'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
