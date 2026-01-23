import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { PinPad } from '@renderer/components/auth/PinPad'
import { useAuthStore } from '@renderer/stores/authStore'

interface User {
  id: string
  username: string
  full_name: string
  role: string
}

export function LoginPage(): React.JSX.Element {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const login = useAuthStore((state) => state.login)

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
    await window.electron.createUser({
      username: 'admin',
      password: 'admin123',
      fullName: 'Administrator',
      role: 'admin',
      pin: '0000'
    })
  }

  const handlePinSubmit = async (pin: string): Promise<void> => {
    if (!selectedUser) return
    setError('')

    const result = await window.electron.login({ userId: selectedUser.id, pin })

    if (result.success) {
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
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-primary">PharmaPOS</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedUser ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Select user to login
              </p>
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

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUser(null)}
                >
                  Back
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUsePassword(!usePassword)}
                >
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
