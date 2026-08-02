import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { initDb } from '../db/index'

let db: Database.Database | null = null

/**
 * The one place the database filename is defined. Anything that copies, backs up
 * or restores the database MUST use this — a second hardcoded name here is what
 * silently broke backup and restore.
 */
export function getDatabasePath(): string {
  return process.env.TEST_DB_PATH
    ? process.env.TEST_DB_PATH
    : path.join(app.getPath('userData'), 'pharmapos.db')
}

export function getDatabase(): Database.Database {
  if (db) return db

  const dbPath = getDatabasePath()

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  return db
}

export function initializeDatabase(): void {
  const database = getDatabase()

  initDb(database)

  console.log('Database initialized at:', app.getPath('userData'))
}

/**
 * Apply pending schema migrations and close again, without booting the app.
 *
 * Called from the Squirrel install/update hook so the schema is already current
 * before the pharmacy first opens the new version. `initDb` is idempotent and
 * version-guarded, so the normal startup path re-checking costs nothing and
 * still covers installs that never run the hook (zip builds, restored backups).
 */
export function migrateDatabaseOnly(): void {
  try {
    initializeDatabase()
  } finally {
    closeDatabase()
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

// Helper to generate UUID
export function generateId(): string {
  return crypto.randomUUID()
}
