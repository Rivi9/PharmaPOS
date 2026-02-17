import { getUserById } from '../services/users/user-management'
import { hasPermission, type Permission } from '../services/users/permissions'

export async function withPermission<T>(
  userId: string,
  permission: Permission,
  handler: () => T | Promise<T>
): Promise<T> {
  const user = getUserById(userId)
  if (!user) throw new Error('User not found')
  if (!user.isActive) throw new Error('Account inactive')
  if (!hasPermission(user.role as 'admin' | 'manager' | 'cashier', permission)) {
    throw new Error(`Permission denied: requires "${permission}"`)
  }
  return handler()
}
