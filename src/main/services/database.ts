import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

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

  // Read schema file - in production it's bundled, in dev it's in src
  const schemaPath = path.join(__dirname, '../db/schema.sql')
  const devSchemaPath = path.join(__dirname, '../../src/main/db/schema.sql')

  let schema: string
  if (fs.existsSync(schemaPath)) {
    schema = fs.readFileSync(schemaPath, 'utf-8')
  } else if (fs.existsSync(devSchemaPath)) {
    schema = fs.readFileSync(devSchemaPath, 'utf-8')
  } else {
    // Fallback: try relative to process.cwd()
    const cwdSchemaPath = path.join(process.cwd(), 'src/main/db/schema.sql')
    if (fs.existsSync(cwdSchemaPath)) {
      schema = fs.readFileSync(cwdSchemaPath, 'utf-8')
    } else {
      console.error('Schema file not found at:', schemaPath, devSchemaPath, cwdSchemaPath)
      return
    }
  }

  // Run schema (CREATE TABLE IF NOT EXISTS — safe to re-run)
  database.exec(schema)

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
