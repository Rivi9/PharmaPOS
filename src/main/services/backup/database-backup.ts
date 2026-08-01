import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import archiver from 'archiver'
import extract from 'extract-zip'
import { app } from 'electron'
import { encryptData, decryptData } from './encryption'
import { getDatabase, getDatabasePath, closeDatabase } from '../database'
import { logError, logInfo } from '../logging/logger'

export interface BackupMetadata {
  version: string
  timestamp: string
  database_size: number
  app_version: string
}

/** Name the database is stored under *inside* the archive. */
const ARCHIVE_DB_NAME = 'database.db'
/** Older archives used the same name, so both read paths are identical. */
const LEGACY_ARCHIVE_DB_NAMES = [ARCHIVE_DB_NAME, 'pharmapos.db']

const BACKUP_FILE_RE = /^pharmapos-backup-.+\.(zip|encrypted)$/

export function getBackupDir(): string {
  return path.join(app.getPath('userData'), 'backups')
}

/**
 * Reject any path that did not come from our own backup directory. Renderer-supplied
 * paths reach delete/restore, so containment is checked here rather than at each call site.
 */
export function assertInsideBackupDir(candidate: string): string {
  const dir = getBackupDir()
  const resolved = path.resolve(candidate)
  const rel = path.relative(dir, resolved)
  if (rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) {
    throw new Error('Refusing to operate on a path outside the backup directory')
  }
  if (!BACKUP_FILE_RE.test(path.basename(resolved))) {
    throw new Error('Not a PharmaPOS backup file')
  }
  return resolved
}

/** Open a database file read-only and confirm SQLite considers it sound. */
function verifySqliteFile(filePath: string): void {
  const header = Buffer.alloc(16)
  const fd = fs.openSync(filePath, 'r')
  try {
    fs.readSync(fd, header, 0, 16, 0)
  } finally {
    fs.closeSync(fd)
  }
  if (header.toString('utf8', 0, 15) !== 'SQLite format 3') {
    throw new Error('Backup does not contain a valid SQLite database')
  }

  const probe = new Database(filePath, { readonly: true, fileMustExist: true })
  try {
    const result = probe.pragma('integrity_check', { simple: true })
    if (result !== 'ok') {
      throw new Error(`Backup failed integrity check: ${String(result)}`)
    }
    // Sanity-check that this is actually our schema, not some other SQLite file.
    probe.prepare('SELECT 1 FROM users LIMIT 1').get()
    probe.prepare('SELECT 1 FROM sales LIMIT 1').get()
  } finally {
    probe.close()
  }
}

/**
 * Take a transactionally consistent copy of the live database.
 *
 * A plain file copy is unsafe in WAL mode: committed pages may still live in
 * `-wal` and the copy can be internally inconsistent. `VACUUM INTO` produces a
 * complete, checkpointed snapshot while the database stays open.
 */
function snapshotDatabase(targetPath: string): void {
  if (fs.existsSync(targetPath)) fs.rmSync(targetPath)
  const db = getDatabase()
  db.prepare('VACUUM INTO ?').run(targetPath)
}

/**
 * Create a backup of the database. Always verifies the snapshot before archiving,
 * so a corrupt or partial archive is never presented as restorable.
 */
export async function createBackup(password?: string): Promise<string> {
  const backupDir = getBackupDir()
  const timestamp = new Date().toISOString()
  const backupName = `pharmapos-backup-${timestamp.replace(/[:.]/g, '-')}`

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const snapshotPath = path.join(backupDir, `${backupName}.snapshot`)
  const tempZipPath = path.join(backupDir, `${backupName}.zip`)
  const finalPath = password ? path.join(backupDir, `${backupName}.encrypted`) : tempZipPath

  try {
    snapshotDatabase(snapshotPath)
    verifySqliteFile(snapshotPath)

    const metadata: BackupMetadata = {
      version: '1.0',
      timestamp,
      database_size: fs.statSync(snapshotPath).size,
      app_version: app.getVersion()
    }

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(tempZipPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      output.on('close', () => resolve())
      // Without this, ENOSPC escalates to an uncaught exception and the promise
      // never settles, leaving the UI stuck on "Creating…".
      output.on('error', reject)
      archive.on('error', reject)

      archive.pipe(output)
      archive.file(snapshotPath, { name: ARCHIVE_DB_NAME })
      archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' })
      archive.finalize()
    })

    if (password) {
      const encrypted = encryptData(fs.readFileSync(tempZipPath), password)
      fs.writeFileSync(finalPath, encrypted)
    }

    logInfo('Backup created', { path: finalPath, bytes: metadata.database_size })
    return finalPath
  } catch (error) {
    // Never leave a half-written archive behind — listBackups would offer it for restore.
    for (const p of [tempZipPath, finalPath]) {
      if (p !== finalPath || password) {
        try {
          if (fs.existsSync(p)) fs.rmSync(p)
        } catch {
          /* best effort */
        }
      }
    }
    logError('Backup failed', error as Error)
    throw error
  } finally {
    try {
      if (fs.existsSync(snapshotPath)) fs.rmSync(snapshotPath)
      // The plaintext zip is an intermediate when encrypting — it must not survive.
      if (password && fs.existsSync(tempZipPath)) fs.rmSync(tempZipPath)
    } catch {
      /* best effort */
    }
  }
}

/**
 * Restore the database from a backup.
 *
 * The caller MUST relaunch the app immediately afterwards: the live connection is
 * closed here, and continuing to run against a swapped file is what previously
 * checkpointed a stale WAL over the restored data.
 */
export async function restoreBackup(
  backupPath: string,
  password?: string
): Promise<BackupMetadata> {
  const safePath = assertInsideBackupDir(backupPath)
  const dbPath = getDatabasePath()
  const tempDir = path.join(app.getPath('userData'), 'temp-restore')
  const tempZipPath = path.join(tempDir, 'restore.zip')

  // Encryption is decided by the file, not by whether a password happened to be typed.
  const isEncrypted = safePath.endsWith('.encrypted')
  if (isEncrypted && !password) {
    throw new Error('This backup is encrypted — a password is required')
  }

  fs.rmSync(tempDir, { recursive: true, force: true })
  fs.mkdirSync(tempDir, { recursive: true })

  try {
    if (isEncrypted) {
      const decrypted = decryptData(fs.readFileSync(safePath), password as string)
      fs.writeFileSync(tempZipPath, decrypted)
    } else {
      fs.copyFileSync(safePath, tempZipPath)
    }

    await extract(tempZipPath, { dir: tempDir })

    const metadataPath = path.join(tempDir, 'metadata.json')
    if (!fs.existsSync(metadataPath)) {
      throw new Error('Backup is missing metadata.json — it may not be a PharmaPOS backup')
    }
    const metadata: BackupMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))

    const restoredDbPath = LEGACY_ARCHIVE_DB_NAMES.map((n) => path.join(tempDir, n)).find((p) =>
      fs.existsSync(p)
    )
    if (!restoredDbPath) {
      throw new Error('Backup does not contain a database file')
    }

    // Validate BEFORE touching live data.
    verifySqliteFile(restoredDbPath)

    // Consistent snapshot of the current database so the restore can be undone.
    const preRestorePath = path.join(
      getBackupDir(),
      `pharmapos-backup-pre-restore-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`
    )
    try {
      const preSnapshot = `${preRestorePath}.snapshot`
      snapshotDatabase(preSnapshot)
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(preRestorePath)
        const archive = archiver('zip', { zlib: { level: 9 } })
        output.on('close', () => resolve())
        output.on('error', reject)
        archive.on('error', reject)
        archive.pipe(output)
        archive.file(preSnapshot, { name: ARCHIVE_DB_NAME })
        archive.append(
          JSON.stringify(
            { version: '1.0', timestamp: new Date().toISOString(), app_version: app.getVersion() },
            null,
            2
          ),
          { name: 'metadata.json' }
        )
        archive.finalize()
      })
      fs.rmSync(preSnapshot, { force: true })
    } catch (err) {
      logError('Could not snapshot the current database before restore', err as Error)
      throw new Error('Could not safeguard the current database — restore aborted')
    }

    // Close the live connection and clear the WAL sidecars, or the open handle will
    // checkpoint pre-restore frames on top of the file we just put in place.
    closeDatabase()
    for (const sidecar of [`${dbPath}-wal`, `${dbPath}-shm`]) {
      if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true })
    }
    fs.copyFileSync(restoredDbPath, dbPath)

    logInfo('Backup restored — relaunch required', { from: safePath })
    return metadata
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

/**
 * List available local backups. The timestamp comes from the file's own mtime —
 * reverse-engineering it from the filename produced "Invalid Date", because the
 * separators in the ISO date are the same hyphens the encoding replaced.
 */
export function listBackups(): Array<{
  path: string
  timestamp: string
  size: number
  valid: boolean
}> {
  const backupDir = getBackupDir()
  if (!fs.existsSync(backupDir)) return []

  return fs
    .readdirSync(backupDir)
    .filter((f) => BACKUP_FILE_RE.test(f))
    .map((f) => {
      const filePath = path.join(backupDir, f)
      const stats = fs.statSync(filePath)
      return {
        path: filePath,
        timestamp: stats.mtime.toISOString(),
        size: stats.size,
        // A zero-byte file is the residue of a failed run; never offer it for restore.
        valid: stats.size > 0
      }
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
