import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@renderer/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import type { User } from '@renderer/pages/UsersPage'

interface UserFormModalProps {
  open: boolean
  onClose: () => void
  user?: User | null
  userId: string
  onSuccess: () => void
}

const ROLE_OPTIONS: { value: User['role']; label: string; hint: string }[] = [
  { value: 'cashier', label: 'Cashier', hint: 'Sells at the till' },
  { value: 'manager', label: 'Manager', hint: 'Stock, reports and refunds' },
  { value: 'admin', label: 'Admin', hint: 'Everything, including users and settings' }
]

export function UserFormModal({
  open,
  onClose,
  user,
  userId,
  onSuccess
}: UserFormModalProps): React.JSX.Element {
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'cashier' as 'admin' | 'manager' | 'cashier',
    pin_code: ''
  })

  // Reset on every open, not only when `user` changes: opening "Add User" twice
  // in a row would otherwise show the previous attempt's fields and error.
  useEffect(() => {
    if (!open) return
    setFormError('')
    if (user) {
      setFormData({
        username: user.username,
        password: '',
        full_name: user.full_name,
        role: user.role,
        pin_code: ''
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
  }, [user, open])

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    setIsSaving(true)
    try {
      if (user) {
        // Only send the PIN when one was actually typed. The field is
        // deliberately blank on open, so sending it unconditionally would clear
        // the user's existing PIN every time an unrelated field was edited.
        const updates: Record<string, unknown> = {
          full_name: formData.full_name,
          role: formData.role
        }
        if (formData.pin_code.trim()) {
          if (!/^\d{4,6}$/.test(formData.pin_code.trim())) {
            setFormError('PIN must be 4 to 6 digits')
            return
          }
          updates.pin_code = formData.pin_code.trim()
        }
        await window.electron.users.update(userId, user.id, updates)
      } else {
        await window.electron.users.create(userId, formData)
      }
      toast.success(user ? `${formData.full_name} updated` : `${formData.full_name} created`)
      onSuccess()
      onClose()
    } catch (error) {
      // Inline, not alert(): the modal stays open so the operator can correct
      // the field rather than retyping the whole form.
      setFormError(ipcErrorMessage(error, 'Could not save the user'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{user ? 'Edit User' : 'Create User'}</DialogTitle>
          <DialogDescription className="text-base">
            {user
              ? 'Change their name, role or PIN. Use Password in the list to reset a password.'
              : 'They sign in with the username and password set here.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <FieldGroup className="gap-5">
            <Field data-disabled={!!user || undefined}>
              <FieldLabel htmlFor="username">Username</FieldLabel>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                disabled={!!user}
                autoComplete="off"
                required
              />
            </Field>

            {!user && (
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  autoComplete="new-password"
                  required
                />
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="full_name">Full Name</FieldLabel>
              <Input
                id="full_name"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="role">Role</FieldLabel>
              <Select
                value={formData.role}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    role: value as 'admin' | 'manager' | 'cashier'
                  })
                }
              >
                <SelectTrigger id="role" className="w-full">
                  <SelectValue>
                    {ROLE_OPTIONS.find((o) => o.value === formData.role)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent position="popper">
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex flex-col items-start">
                        <span>{option.label}</span>
                        <span className="text-sm text-muted-foreground">{option.hint}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor="pin_code">PIN Code (optional)</FieldLabel>
              <Input
                id="pin_code"
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder={user ? 'Leave blank to keep the current PIN' : '4 to 6 digits'}
                value={formData.pin_code}
                onChange={(e) => {
                  setFormData({ ...formData, pin_code: e.target.value })
                  if (formError) setFormError('')
                }}
              />
              <FieldDescription>For quick sign-in at the till.</FieldDescription>
            </Field>
          </FieldGroup>

          <FieldError className="font-medium">{formError}</FieldError>

          <DialogFooter className="gap-3">
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="lg" className="flex-1" disabled={isSaving}>
              {user ? 'Update' : 'Create'} User
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
