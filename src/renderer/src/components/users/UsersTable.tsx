import { useState } from 'react'
import { toast } from 'sonner'
import { Pencil, UserX, UserCheck, KeyRound, Users } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Skeleton } from '@renderer/components/ui/skeleton'
import { Field, FieldError, FieldLabel } from '@renderer/components/ui/field'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@renderer/components/ui/table'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { useConfirm } from '@renderer/hooks/useConfirm'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { cn } from '@renderer/lib/utils'
import type { User } from '@renderer/pages/UsersPage'

interface UsersTableProps {
  users: User[]
  userId: string
  isLoading?: boolean
  onEdit: (user: User) => void
  onRefresh: () => void
}

const ROLE_LABELS: Record<User['role'], string> = {
  admin: 'Admin',
  manager: 'Manager',
  cashier: 'Cashier'
}

const ROLE_BADGE: Record<User['role'], string> = {
  admin: 'bg-primary/10 text-primary',
  manager: 'bg-info-muted text-info',
  cashier: 'bg-muted text-muted-foreground'
}

export function UsersTable({
  users,
  userId,
  isLoading,
  onEdit,
  onRefresh
}: UsersTableProps): React.JSX.Element {
  const [changePwUser, setChangePwUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const { confirm, notify, confirmProps } = useConfirm()

  const handleToggleActive = async (user: User): Promise<void> => {
    const ok = await confirm({
      title: user.is_active ? `Deactivate ${user.full_name}?` : `Reactivate ${user.full_name}?`,
      description: user.is_active
        ? 'They will not be able to sign in, and any till session they have open stays open until someone closes it.'
        : 'They will be able to sign in again with their existing password.',
      confirmLabel: user.is_active ? 'Deactivate' : 'Reactivate',
      destructive: Boolean(user.is_active)
    })
    if (!ok) return
    try {
      await window.electron.users.delete(userId, user.id, !user.is_active)
    } catch (error) {
      await notify('Could not update the user', ipcErrorMessage(error))
      return
    }
    toast.success(
      user.is_active ? `${user.full_name} deactivated` : `${user.full_name} reactivated`
    )
    onRefresh()
  }

  const openChangePassword = (user: User): void => {
    setChangePwUser(user)
    setNewPassword('')
    setPwError('')
  }

  const handleChangePasswordSubmit = async (): Promise<void> => {
    if (!newPassword.trim()) {
      setPwError('Password cannot be empty')
      return
    }
    setPwSaving(true)
    try {
      await window.electron.users.changePassword(userId, changePwUser!.id, newPassword)
      toast.success(`Password updated for ${changePwUser!.full_name}`)
      setChangePwUser(null)
    } catch (error) {
      // Inline so the operator can retype without reopening the dialog.
      setPwError(ipcErrorMessage(error, 'Could not change the password'))
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <>
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        {isLoading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : users.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>No users yet</EmptyTitle>
              <EmptyDescription>Tap Add User to create the first account.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>PIN</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} className={cn(!user.is_active && 'bg-muted/40')}>
                  <TableCell className="pl-4">
                    <p className={cn('font-medium', !user.is_active && 'text-muted-foreground')}>
                      {user.full_name}
                    </p>
                    <p className="text-sm text-muted-foreground">@{user.username}</p>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn('h-7 px-3 text-sm', ROLE_BADGE[user.role])}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {user.pin_set ? 'PIN set' : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        'h-7 px-3 text-sm',
                        user.is_active
                          ? 'bg-success-muted text-success'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {user.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => onEdit(user)}>
                        <Pencil className="size-5" />
                        Edit
                      </Button>
                      <Button variant="outline" onClick={() => openChangePassword(user)}>
                        <KeyRound className="size-5" />
                        Password
                      </Button>
                      {user.is_active ? (
                        <Button
                          variant="destructive"
                          className="w-40"
                          onClick={() => handleToggleActive(user)}
                        >
                          <UserX className="size-5" />
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="w-40 text-success hover:text-success"
                          onClick={() => handleToggleActive(user)}
                        >
                          <UserCheck className="size-5" />
                          Reactivate
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={!!changePwUser} onOpenChange={() => setChangePwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-xl">
              Change Password — {changePwUser?.full_name}
            </DialogTitle>
            <DialogDescription className="text-base">
              They will use the new password the next time they sign in.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              handleChangePasswordSubmit()
            }}
          >
            <Field data-invalid={!!pwError || undefined}>
              <FieldLabel htmlFor="new-password">New Password</FieldLabel>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  if (pwError) setPwError('')
                }}
                aria-invalid={!!pwError || undefined}
                autoFocus
              />
              <FieldError>{pwError}</FieldError>
            </Field>
            <DialogFooter className="gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setChangePwUser(null)}
              >
                Cancel
              </Button>
              <Button type="submit" size="lg" className="flex-1" disabled={pwSaving}>
                Update Password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog {...confirmProps} />
    </>
  )
}
