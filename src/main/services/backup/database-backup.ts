import fs from 'fs'
import path from 'path'
import archiver from 'archiver'
import extract from 'extract-zip'
import { app } from 'electron'
import { encryptData, decryptData } from './encryption'

export interface BackupMetadata {
  version: string
  timestamp: string
  database_size: number
  app_version: string
}

/**
 * Create encrypted backup of database
 */
export async function createBackup(password?: string): Promise<string> {
  const dbPath = path.join(app.getPath('userData'), 'database.db')
  const backupDir = path.join(app.getPath('userData'), 'backups')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupName = `pharmapos-backup-${timestamp}`

  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const tempZipPath = path.join(backupDir, `${backupName}.zip`)
  const finalPath = password
    ? path.join(backupDir, `${backupName}.encrypted`)
    : tempZipPath

  // Create ZIP archive
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(tempZipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => resolve())
    archive.on('error', (err) => reject(err))

    archive.pipe(output)

    // Add database file
    archive.file(dbPath, { name: 'database.db' })

    // Add metadata
    const metadata: BackupMetadata = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      database_size: fs.statSync(dbPath).size,
      app_version: app.getVersion()
    }
    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' })

    archive.finalize()
  })

  // Encrypt if password provided
  if (password) {
    const zipData = fs.readFileSync(tempZipPath)
    const encrypted = encryptData(zipData, password)
    fs.writeFileSync(finalPath, encrypted)
    fs.unlinkSync(tempZipPath) // Remove unencrypted temp file
  }

  return finalPath
}

/**
 * Restore database from backup
 */
export async function restoreBackup(
  backupPath: string,
  password?: string
): Promise<BackupMetadata> {
  const dbPath = path.join(app.getPath('userData'), 'database.db')
  const tempDir = path.join(app.getPath('userData'), 'temp-restore')
  const tempZipPath = path.join(tempDir, 'restore.zip')

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  try {
    // Decrypt if needed
    if (password) {
      const encryptedData = fs.readFileSync(backupPath)
      const decrypted = decryptData(encryptedData, password)
      fs.writeFileSync(tempZipPath, decrypted)
    } else {
      fs.copyFileSync(backupPath, tempZipPath)
    }

    // Extract ZIP
    await extract(tempZipPath, { dir: tempDir })

    // Read metadata
    const metadataPath = path.join(tempDir, 'metadata.json')
    const metadata: BackupMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))

    // Backup current database before restore
    const currentBackupPath = `${dbPath}.pre-restore-${Date.now()}`
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, currentBackupPath)
    }

    // Restore database
    const restoredDbPath = path.join(tempDir, 'database.db')
    fs.copyFileSync(restoredDbPath, dbPath)

    return metadata
  } finally {
    // Cleanup temp files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

/**
 * List available local backups
 */
export function listBackups(): Array<{ path: string; timestamp: string; size: number }> {
  const backupDir = path.join(app.getPath('userData'), 'backups')

  if (!fs.existsSync(backupDir)) {
    return []
  }

  const files = fs.readdirSync(backupDir)
  return files
    .filter((f) => f.startsWith('pharmapos-backup-') && (f.endsWith('.zip') || f.endsWith('.encrypted')))
    .map((f) => {
      const filePath = path.join(backupDir, f)
      const stats = fs.statSync(filePath)
      // Extract timestamp from filename
      const timestampMatch = f.match(/pharmapos-backup-(.+)\.(zip|encrypted)/)
      const timestamp = timestampMatch ? timestampMatch[1].replace(/-/g, ':') : ''

      return {
        path: filePath,
        timestamp,
        size: stats.size
      }
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
