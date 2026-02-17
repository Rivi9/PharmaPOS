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
  // Apply migration SQL (same pattern as old schema.sql?raw)
  sqlite.exec(migrationSql)
  _db = drizzle(sqlite, { schema })
  return _db
}
