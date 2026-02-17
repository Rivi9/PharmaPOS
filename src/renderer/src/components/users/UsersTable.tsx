import { useState } from 'react'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Pencil, UserX, UserCheck, Key } from 'lucide-react'
import type { User } from '@renderer/pages/UsersPage'

interface UsersTableProps {
  users: User[]
  userId: string
  onEdit: (user: User) => void
  onRefresh: () => void
}

export function UsersTable({ users, userId, onEdit, onRefresh }: UsersTableProps): React.JSX.Element {
  const [changePwUser, setChangePwUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [pwError, setPwError] = useState('')

  const handleToggleActive = async (user: User) => {
    const action = user.is_active ? 'deactivate' : 'reactivate'
    if (confirm(`Are you sure you want to ${action} ${user.full_name}?`)) {
      await window.electron.users.delete(userId, user.id, !user.is_active)
      onRefresh()
    }
  }

  const openChangePassword = (user: User) => {
    setChangePwUser(user)
    setNewPassword('')
    setPwError('')
  }

  const handleChangePasswordSubmit = async () => {
    if (!newPassword.trim()) {
      setPwError('Password cannot be empty')
      return
    }
    try {
      await window.electron.users.changePassword(userId, changePwUser!.id, newPassword)
      setChangePwUser(null)
    } catch (err: any) {
      setPwError(err.message)
    }
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                className={`flex items-center justify-between p-4 rounded-lg border ${
                  user.is_active ? '' : 'bg-muted/50'
                }`}
              >
                <div className="flex-1">
                  <p className="font-medium">{user.full_name}</p>
                  <p className="text-sm text-muted-foreground">
                    @{user.username} • {user.role}
                    {user.pin_code && ' • PIN set'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(user)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openChangePassword(user)}>
                    <Key className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleActive(user)}
                    className={user.is_active ? 'text-destructive' : 'text-green-600'}
                  >
                    {user.is_active ? (
                      <UserX className="h-4 w-4" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!changePwUser} onOpenChange={() => setChangePwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password — {changePwUser?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="new-password">New Password</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleChangePasswordSubmit()}
                autoFocus
              />
              {pwError && <p className="text-xs text-destructive mt-1">{pwError}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setChangePwUser(null)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleChangePasswordSubmit}>
                Update Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
