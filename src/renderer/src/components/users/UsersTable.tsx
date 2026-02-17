import { Card, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Pencil, UserX, UserCheck, Key } from 'lucide-react'
import type { User } from '@renderer/pages/UsersPage'

interface UsersTableProps {
  users: User[]
  userId: string
  onEdit: (user: User) => void
  onRefresh: () => void
}

export function UsersTable({ users, userId, onEdit, onRefresh }: UsersTableProps): React.JSX.Element {
  const handleToggleActive = async (user: User) => {
    const action = user.is_active ? 'deactivate' : 'reactivate'
    if (confirm(`Are you sure you want to ${action} ${user.full_name}?`)) {
      await window.electron.users.delete(userId, user.id, !user.is_active)
      onRefresh()
    }
  }

  const handleChangePassword = async (user: User) => {
    const newPassword = prompt(`Enter new password for ${user.full_name}:`)
    if (newPassword) {
      await window.electron.users.changePassword(userId, user.id, newPassword)
      alert('Password changed successfully')
    }
  }

  return (
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
                <Button variant="ghost" size="icon" onClick={() => handleChangePassword(user)}>
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
  )
}
