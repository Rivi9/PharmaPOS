import { getDatabase, generateId } from './database'

export type AuditAction =
  | 'SALE_CREATED'
  | 'SALE_VOIDED'
  | 'SALE_REFUNDED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'STOCK_ADJUSTED'
  | 'STOCK_BATCH_CREATED'
  | 'STOCK_BATCH_UPDATED'
  | 'STOCK_BATCH_DELETED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'SHIFT_STARTED'
  | 'SHIFT_ENDED'
  | 'SETTINGS_UPDATED'
  | 'BACKUP_CREATED'
  | 'BACKUP_RESTORED'
  | 'PRICE_CHANGED'

export type AuditEntityType =
  | 'sale'
  | 'product'
  | 'stock_batch'
  | 'user'
  | 'shift'
  | 'setting'
  | 'backup'
  | 'system'

export interface AuditLogEntry {
  id: string
  timestamp: string
  user_id: string | null
  user_name: string | null
  action: AuditAction
  entity_type: AuditEntityType
  entity_id: string | null
  details: string | null
}

export interface LogAuditParams {
  userId?: string
  userName?: string
  action: AuditAction
  entityType: AuditEntityType
  entityId?: string
  details?: Record<string, unknown>
}

/**
 * Append-only audit log entry. Never call UPDATE or DELETE on audit_log.
 */
export function logAudit(params: LogAuditParams): void {
  try {
    const db = getDatabase()
    db.prepare(
      `INSERT INTO audit_log (id, timestamp, user_id, user_name, action, entity_type, entity_id, details)
       VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?)`
    ).run(
      generateId(),
      params.userId ?? null,
      params.userName ?? null,
      params.action,
      params.entityType,
      params.entityId ?? null,
      params.details ? JSON.stringify(params.details) : null
    )
  } catch {
    // Audit logging must never crash the main operation
  }
}

export interface AuditQueryOptions {
  startDate?: string
  endDate?: string
  userId?: string
  action?: AuditAction
  entityType?: AuditEntityType
  limit?: number
  offset?: number
}

export function queryAuditLog(options: AuditQueryOptions = {}): {
  entries: AuditLogEntry[]
  total: number
} {
  const db = getDatabase()
  const conditions: string[] = []
  const params: unknown[] = []

  if (options.startDate) {
    conditions.push('timestamp >= ?')
    params.push(options.startDate)
  }
  if (options.endDate) {
    conditions.push('timestamp <= ?')
    params.push(options.endDate)
  }
  if (options.userId) {
    conditions.push('user_id = ?')
    params.push(options.userId)
  }
  if (options.action) {
    conditions.push('action = ?')
    params.push(options.action)
  }
  if (options.entityType) {
    conditions.push('entity_type = ?')
    params.push(options.entityType)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit = options.limit ?? 100
  const offset = options.offset ?? 0

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM audit_log ${where}`).get(...params) as {
      count: number
    }
  ).count

  const entries = db
    .prepare(`SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as AuditLogEntry[]

  return { entries, total }
}

export function exportAuditLogCsv(options: AuditQueryOptions = {}): string {
  const { entries } = queryAuditLog({ ...options, limit: 10000 })

  const headers = ['Timestamp', 'User', 'Action', 'Entity Type', 'Entity ID', 'Details']
  const rows = entries.map((e) => [
    e.timestamp,
    e.user_name ?? '',
    e.action,
    e.entity_type,
    e.entity_id ?? '',
    e.details ?? ''
  ])

  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`
  const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))]

  return lines.join('\n')
}
