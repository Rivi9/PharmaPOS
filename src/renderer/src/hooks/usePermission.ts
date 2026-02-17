import { useAuthStore } from '@renderer/stores/authStore'
import { hasPermission, type Permission } from '../../../shared/permissions'

export function usePermission(permission: Permission): boolean {
  const role = useAuthStore((s) => s.user?.role)
  if (!role) return false
  return hasPermission(role as 'admin' | 'manager' | 'cashier', permission)
}
