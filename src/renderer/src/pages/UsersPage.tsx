import { useEffect, useState } from 'react'
import { Plus, RefreshCw, ShieldCheck, UserCheck, Users, UserRound } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { UsersTable } from '@renderer/components/users/UsersTable'
import { UserFormModal } from '@renderer/components/users/UserFormModal'
import { useAuthStore } from '@renderer/stores/authStore'
import { cn } from '@renderer/lib/utils'

export interface User {
  id: string
  username: string
  full_name: string
  role: 'admin' | 'manager' | 'cashier'
  /** Whether a PIN is set. The hash itself never leaves the main process. */
  pin_set: boolean
  is_active: number
  created_at: string
  updated_at: string
}

interface UserStats {
  total: number
  active: number
  byRole?: Partial<Record<User['role'], number>>
}

export function UsersPage(): React.JSX.Element {
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<UserStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const currentUserId = useAuthStore((s) => s.user?.id ?? '')

  const loadUsers = async (): Promise<void> => {
    setIsLoading(true)
    try {
      const [userList, userStats] = await Promise.all([
        window.electron.users.list(currentUserId),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const statTiles = [
    { label: 'Total Users', value: stats?.total ?? 0, icon: Users, tone: 'text-foreground' },
    { label: 'Active', value: stats?.active ?? 0, icon: UserCheck, tone: 'text-success' },
    {
      label: 'Admins',
      value: stats?.byRole?.admin || 0,
      icon: ShieldCheck,
      tone: 'text-foreground'
    },
    {
      label: 'Cashiers',
      value: stats?.byRole?.cashier || 0,
      icon: UserRound,
      tone: 'text-foreground'
    }
  ]

  return (
    <div className="flex h-full flex-col gap-4 bg-canvas p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">User Management</h1>
          <p className="text-base text-muted-foreground">Manage users and permissions</p>
        </div>
        <div className="flex gap-3">
          <Button onClick={loadUsers} disabled={isLoading} variant="outline">
            <RefreshCw className={cn('size-5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setEditingUser(null)
              setShowFormModal(true)
            }}
          >
            <Plus className="size-5" />
            Add User
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain pr-1">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {statTiles.map(({ label, value, icon: Icon, tone }) => (
            <div
              key={label}
              className="flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-xs"
            >
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Icon className="size-6" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">{label}</p>
                {stats ? (
                  <p className={cn('text-2xl font-semibold tabular-nums', tone)}>{value}</p>
                ) : (
                  <Skeleton className="mt-1 h-8 w-12" />
                )}
              </div>
            </div>
          ))}
        </div>

        <UsersTable
          users={users}
          userId={currentUserId}
          isLoading={isLoading && users.length === 0}
          onEdit={(user) => {
            setEditingUser(user)
            setShowFormModal(true)
          }}
          onRefresh={loadUsers}
        />
      </div>

      <UserFormModal
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        user={editingUser}
        userId={currentUserId}
        onSuccess={loadUsers}
      />
    </div>
  )
}
