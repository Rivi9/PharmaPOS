/**
 * Pages in the sidebar and the permission each needs. MainLayout uses the
 * same table to refuse a page the signed-in role may not see.
 */
import {
  ShoppingCart,
  Package,
  BarChart3,
  Users,
  Settings,
  UserCog,
  ClipboardList,
  ReceiptText
} from 'lucide-react'
import type { Permission } from '../../../../shared/permissions'

export const NAV_ITEMS = [
  { id: 'pos', label: 'POS', icon: ShoppingCart, permission: 'sales:create' as Permission },
  // Every role may look a sale up and reprint it; Void and Refund inside the
  // page need sales:void / sales:refund, which cashiers do not hold.
  { id: 'sales', label: 'Sales', icon: ReceiptText, permission: 'sales:view_all' as Permission },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    permission: 'inventory:view' as Permission
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: BarChart3,
    permission: 'reports:view' as Permission
  },
  { id: 'customers', label: 'Customers', icon: Users, permission: 'sales:create' as Permission },
  { id: 'users', label: 'Users', icon: UserCog, permission: 'users:view' as Permission },
  {
    id: 'audit',
    label: 'Audit',
    icon: ClipboardList,
    permission: 'reports:view' as Permission
  },
  { id: 'settings', label: 'Settings', icon: Settings, permission: 'settings:view' as Permission }
]
