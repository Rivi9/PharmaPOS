import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import schemaSql from '../db/schema.sql?raw'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (db) return db

  // Use test database in test environment
  const dbPath = process.env.TEST_DB_PATH
    ? process.env.TEST_DB_PATH
    : path.join(app.getPath('userData'), 'pharmapos.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  return db
}

export function initializeDatabase(): void {
  const database = getDatabase()

  // schemaSql is inlined at build time via Vite's ?raw import — no file path issues
  database.exec(schemaSql)

  // Run column migrations for existing databases
  // SQLite does not support ADD COLUMN IF NOT EXISTS — use try/catch
  const columnMigrations = [
    'ALTER TABLE sales ADD COLUMN customer_id TEXT REFERENCES customers(id)'
  ]
  for (const migration of columnMigrations) {
    try {
      database.exec(migration)
    } catch {
      // Column already exists — safe to ignore
    }
  }

  console.log('Database initialized at:', app.getPath('userData'))
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
