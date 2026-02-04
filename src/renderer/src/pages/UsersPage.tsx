import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Plus, RefreshCw } from 'lucide-react'
import { UsersTable } from '@renderer/components/users/UsersTable'
import { UserFormModal } from '@renderer/components/users/UserFormModal'

export interface User {
  id: string
  username: string
  full_name: string
  role: 'admin' | 'manager' | 'cashier'
  pin_code: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export function UsersPage(): React.JSX.Element {
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const [userList, userStats] = await Promise.all([
        window.electron.users.list(),
        window.electron.users.stats()
      ])
      setUsers(userList)
      setStats(userStats)
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage users and permissions</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadUsers} disabled={isLoading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setEditingUser(null)
              setShowFormModal(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Admins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byRole?.admin || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cashiers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byRole?.cashier || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <UsersTable
        users={users}
        onEdit={(user) => {
          setEditingUser(user)
          setShowFormModal(true)
        }}
        onRefresh={loadUsers}
      />

      <UserFormModal
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        user={editingUser}
        onSuccess={loadUsers}
      />
    </div>
  )
}
