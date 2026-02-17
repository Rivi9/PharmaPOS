import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import migrationSql from './migrations/0000_chilly_alice.sql?raw'

export type DB = BetterSQLite3Database<typeof schema>

let _db: DB | null = null

export function getDb(): DB {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

export function initDb(sqlite: import('better-sqlite3').Database): DB {
  // Only run migration SQL if the schema hasn't been applied yet.
  // Probe sqlite_master for a sentinel table to detect first-run.
  const schemaExists = sqlite
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='audit_log'`)
    .get()
  if (!schemaExists) {
    sqlite.exec(migrationSql)
  }
  _db = drizzle(sqlite, { schema })
  return _db
}
