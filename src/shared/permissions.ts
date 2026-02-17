export type Permission =
  | 'sales:create'
  | 'sales:void'
  | 'sales:refund'
  | 'sales:view_all'
  | 'inventory:view'
  | 'inventory:create'
  | 'inventory:update'
  | 'inventory:delete'
  | 'inventory:import_export'
  | 'reports:view'
  | 'reports:generate'
  | 'shifts:manage'
  | 'users:view'
  | 'users:create'
  | 'users:update'
  | 'users:delete'
  | 'settings:view'
  | 'settings:update'
  | 'backup:create'
  | 'backup:restore'

export type Role = 'admin' | 'manager' | 'cashier'

/**
 * Role-based permission matrix
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    // Full access to everything
    'sales:create',
    'sales:void',
    'sales:refund',
    'sales:view_all',
    'inventory:view',
    'inventory:create',
    'inventory:update',
    'inventory:delete',
    'inventory:import_export',
    'reports:view',
    'reports:generate',
    'shifts:manage',
    'users:view',
    'users:create',
    'users:update',
    'users:delete',
    'settings:view',
    'settings:update',
    'backup:create',
    'backup:restore'
  ],
  manager: [
    // Can do most things except user management and critical settings
    'sales:create',
    'sales:void',
    'sales:refund',
    'sales:view_all',
    'inventory:view',
    'inventory:create',
    'inventory:update',
    'inventory:delete',
    'inventory:import_export',
    'reports:view',
    'reports:generate',
    'shifts:manage',
    'users:view',
    'backup:create'
  ],
  cashier: [
    // Basic sales operations only
    'sales:create',
    'sales:view_all',
    'inventory:view',
    'shifts:manage'
  ]
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) || false
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] || []
}

/**
 * Check if user can perform action (middleware-style)
 */
export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Permission denied: ${permission}`)
  }
}

/**
 * Get permission description for UI display
 */
export function getPermissionDescription(permission: Permission): string {
  const descriptions: Record<Permission, string> = {
    'sales:create': 'Create new sales',
    'sales:void': 'Void sales transactions',
    'sales:refund': 'Process refunds',
    'sales:view_all': 'View all sales history',
    'inventory:view': 'View inventory',
    'inventory:create': 'Add new products',
    'inventory:update': 'Update product information',
    'inventory:delete': 'Delete products',
    'inventory:import_export': 'Import/export inventory data',
    'reports:view': 'View reports',
    'reports:generate': 'Generate new reports',
    'shifts:manage': 'Open and close shifts',
    'users:view': 'View user list',
    'users:create': 'Create new users',
    'users:update': 'Update user information',
    'users:delete': 'Delete/deactivate users',
    'settings:view': 'View system settings',
    'settings:update': 'Modify system settings',
    'backup:create': 'Create backups',
    'backup:restore': 'Restore from backups'
  }

  return descriptions[permission] || permission
}
