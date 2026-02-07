import { test as base } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'

/**
 * Custom fixture that provides isolated test database
 */
export const test = base.extend<{ testDb: string }>({
  testDb: async ({}, use) => {
    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../temp')
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }

    // Create unique test database
    const testDbPath = path.join(tempDir, `test-${Date.now()}.db`)

    // Initialize database with schema
    const db = new Database(testDbPath)
    const schemaPath = path.join(__dirname, '../../../src/main/db/schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf-8')
    db.exec(schema)
    db.close()

    // Provide database path to test
    await use(testDbPath)

    // Cleanup after test
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath)
    }
  }
})

export { expect } from '@playwright/test'
