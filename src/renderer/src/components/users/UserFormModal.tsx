import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import type { User } from '@renderer/pages/UsersPage'

interface UserFormModalProps {
  open: boolean
  onClose: () => void
  user?: User | null
  userId: string
  onSuccess: () => void
}

export function UserFormModal({
  open,
  onClose,
  user,
  userId,
  onSuccess
}: UserFormModalProps): React.JSX.Element {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'cashier' as 'admin' | 'manager' | 'cashier',
    pin_code: ''
  })

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username,
        password: '',
        full_name: user.full_name,
        role: user.role,
        pin_code: user.pin_code || ''
      })
    } else {
      setFormData({
        username: '',
        password: '',
        full_name: '',
        role: 'cashier',
        pin_code: ''
      })
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (user) {
        await window.electron.users.update(userId, user.id, {
          full_name: formData.full_name,
          role: formData.role,
          pin_code: formData.pin_code || null
        })
      } else {
        await window.electron.users.create(userId, formData)
      }
      onSuccess()
      onClose()
    } catch (error: any) {
      alert(error.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'Edit User' : 'Create User'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              disabled={!!user}
              required
            />
          </div>

          {!user && (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
          )}

          <div>
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as 'admin' | 'manager' | 'cashier'
                })
              }
              className="w-full border rounded-md px-3 py-2"
            >
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <Label htmlFor="pin_code">PIN Code (optional)</Label>
            <Input
              id="pin_code"
              type="password"
              maxLength={6}
              value={formData.pin_code}
              onChange={(e) => setFormData({ ...formData, pin_code: e.target.value })}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{user ? 'Update' : 'Create'} User</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
