import { type Permission } from '../../../shared/permissions'
import { usePermission } from '../hooks/usePermission'

interface PermissionGateProps {
  permission: Permission
  children: React.ReactNode
  fallback?: React.ReactNode
}

export function PermissionGate({ permission, children, fallback = null }: PermissionGateProps) {
  const allowed = usePermission(permission)
  return <>{allowed ? children : fallback}</>
}
