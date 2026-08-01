import { getDatabase, generateId } from './database'
import { logError } from './logging/logger'

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
  | 'PRODUCTS_IMPORTED_EXCEL'

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
  const db = getDatabase()

  const insert = (userId: string | null, details: Record<string, unknown> | undefined): void => {
    db.prepare(
      `INSERT INTO audit_log (id, timestamp, user_id, user_name, action, entity_type, entity_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      generateId(),
      // Stored as ISO-8601 UTC to match every other table. datetime('now') yields
      // "YYYY-MM-DD HH:MM:SS", which JS parses as *local* time and rendered 5.5h early.
      new Date().toISOString(),
      userId,
      params.userName ?? resolveUserName(params.userId),
      params.action,
      params.entityType,
      params.entityId ?? null,
      details ? JSON.stringify(details) : null
    )
  }

  try {
    insert(params.userId ?? null, params.details)
  } catch (error) {
    // audit_log.user_id has an FK to users(id). A stale or unknown id used to make the
    // whole entry disappear silently. Keep the record — attribute it as unknown instead.
    try {
      insert(null, { ...(params.details ?? {}), claimed_user_id: params.userId ?? null })
      logError('Audit entry written without an actor — user id was not valid', error as Error, {
        action: params.action,
        claimed_user_id: params.userId
      })
    } catch (fallbackError) {
      // Auditing must never crash the operation, but the loss must be diagnosable.
      logError('AUDIT WRITE FAILED — entry lost', fallbackError as Error, {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId
      })
    }
  }
}

/** Fill in the display name so entries do not render as "system". */
function resolveUserName(userId?: string): string | null {
  if (!userId) return null
  try {
    const row = getDatabase()
      .prepare('SELECT full_name FROM users WHERE id = ?')
      .get(userId) as { full_name: string } | undefined
    return row?.full_name ?? null
  } catch {
    return null
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
