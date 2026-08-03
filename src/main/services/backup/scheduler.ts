import schedule from 'node-schedule'
import fs from 'fs'
import path from 'path'
import { getDatabase } from '../database'
import { createBackup, getBackupDir } from './database-backup'
import { uploadBackupToDrive, readDriveToken, initializeDrive } from './google-drive'
import { logError, logInfo, logWarning } from '../logging/logger'

let scheduledJob: schedule.Job | null = null

const FREQUENCY_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 30 * 24 * 60 * 60 * 1000
}

function readSetting(key: string): string | undefined {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value
}

/** `settings.updated_at` is NOT NULL with no default — omitting it throws. */
function writeSetting(key: string, value: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, value)
}

/** Backups are opt-out: an absent setting means enabled. */
function backupsEnabled(): boolean {
  return readSetting('backup_enabled') !== '0'
}

function scheduleConfig(): { frequency: string; backupTime: string; cron: string } {
  const frequency = readSetting('backup_frequency') || 'daily'
  const backupTime = readSetting('backup_time') || '02:00'
  const [hour, minute] = backupTime.split(':').map(Number)
  const h = Number.isFinite(hour) ? hour : 2
  const m = Number.isFinite(minute) ? minute : 0

  const cron =
    frequency === 'weekly'
      ? `${m} ${h} * * 0`
      : frequency === 'monthly'
        ? `${m} ${h} 1 * *`
        : `${m} ${h} * * *`

  return { frequency, backupTime, cron }
}

/**
 * Start the automatic backup scheduler. Called at app startup, not only from Settings —
 * previously nothing invoked it on launch, so scheduled backups never ran at all.
 */
export function startBackupScheduler(): void {
  if (!backupsEnabled()) {
    logInfo('Automatic backups are disabled')
    return
  }

  const { frequency, backupTime, cron } = scheduleConfig()

  if (scheduledJob) scheduledJob.cancel()

  scheduledJob = schedule.scheduleJob(cron, async () => {
    logInfo('Running scheduled backup')
    try {
      await performScheduledBackup()
    } catch (error) {
      logError('Scheduled backup failed', error as Error)
      writeSetting('last_backup_error', (error as Error).message)
    }
  })

  logInfo('Backup scheduler started', { frequency, backupTime })
  void runCatchUpIfMissed(frequency)
}

/**
 * A POS is usually powered off at 02:00, and node-schedule has no missed-run
 * catch-up — so without this a shop that closes at night would never be backed up.
 */
async function runCatchUpIfMissed(frequency: string): Promise<void> {
  const last = readSetting('last_backup_time')
  const interval = FREQUENCY_MS[frequency] ?? FREQUENCY_MS.daily
  if (last && Date.now() - new Date(last).getTime() < interval) return

  logWarning('No recent backup found — running catch-up backup now', {
    lastBackup: last ?? 'never'
  })
  try {
    await performScheduledBackup()
  } catch (error) {
    logError('Catch-up backup failed', error as Error)
    writeSetting('last_backup_error', (error as Error).message)
  }
}

export function stopBackupScheduler(): void {
  if (scheduledJob) {
    scheduledJob.cancel()
    scheduledJob = null
    logInfo('Backup scheduler stopped')
  }
}

async function performScheduledBackup(): Promise<void> {
  const backupPath = await createBackup(readSetting('backup_password'))
  logInfo('Local backup created', { path: backupPath })

  // Record success regardless of Drive — previously this only ran on the Drive
  // path, so lastBackup stayed null for every local-only install.
  writeSetting('last_backup_time', new Date().toISOString())
  writeSetting('last_backup_error', '')

  // Read through readDriveToken: the credential is DPAPI-wrapped now, and a
  // token restored from another machine's backup cannot be decrypted here.
  const token = readDriveToken()
  if (token) {
    try {
      initializeDrive(token)
      const result = await uploadBackupToDrive(backupPath, path.basename(backupPath))
      logInfo('Backup uploaded to Google Drive', { fileId: result.fileId })
    } catch (error) {
      // A Drive failure must not abort retention below, but it must be visible:
      // the whole point of off-site copies is that someone notices when they stop.
      logError('Google Drive upload failed', error as Error)
      writeSetting('last_backup_error', (error as Error).message)
    }
  }

  cleanupOldBackups(7)
}

/**
 * Prune old archives, keeping `keepCount` *valid* ones. Zero-byte residue from a
 * failed run does not count as a survivor, and the newest valid archive is never
 * deleted — otherwise a week of failures could evict the last good backup.
 */
function cleanupOldBackups(keepCount: number): void {
  const backupDir = getBackupDir()
  if (!fs.existsSync(backupDir)) return

  const files = fs
    .readdirSync(backupDir)
    .filter((f) => /^pharmapos-backup-.+\.(zip|encrypted)$/.test(f))
    .map((f) => {
      const full = path.join(backupDir, f)
      const stats = fs.statSync(full)
      return { name: f, path: full, time: stats.mtime.getTime(), valid: stats.size > 0 }
    })
    .sort((a, b) => b.time - a.time)

  const valid = files.filter((f) => f.valid)
  const keep = new Set(valid.slice(0, Math.max(keepCount, 1)).map((f) => f.path))

  for (const file of files) {
    if (keep.has(file.path)) continue
    try {
      fs.unlinkSync(file.path)
      logInfo('Deleted old backup', { name: file.name, empty: !file.valid })
    } catch (error) {
      logError('Could not delete old backup', error as Error, { name: file.name })
    }
  }
}

export function getBackupStatus(): {
  enabled: boolean
  running: boolean
  lastBackup: string | null
  lastError: string | null
  nextRun: string | null
} {
  return {
    enabled: backupsEnabled(),
    running: scheduledJob !== null,
    lastBackup: readSetting('last_backup_time') || null,
    lastError: readSetting('last_backup_error') || null,
    nextRun: scheduledJob?.nextInvocation()?.toISOString() || null
  }
}

/** Enable or disable automatic backups, (re)starting the job to match. */
export function setBackupsEnabled(enabled: boolean): void {
  writeSetting('backup_enabled', enabled ? '1' : '0')
  if (enabled) startBackupScheduler()
  else stopBackupScheduler()
}
