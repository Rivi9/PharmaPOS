import schedule from 'node-schedule'
import { getDatabase } from '../database'
import { createBackup } from './database-backup'
import { uploadBackupToDrive, isDriveConfigured, initializeDrive } from './google-drive'
import path from 'path'

let scheduledJob: schedule.Job | null = null

/**
 * Start automatic backup scheduler
 */
export function startBackupScheduler(): void {
  const db = getDatabase()

  // Get backup settings
  const settings = {
    enabled: db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_enabled') as
      | { value: string }
      | undefined,
    frequency: db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_frequency') as
      | { value: string }
      | undefined,
    time: db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_time') as
      | { value: string }
      | undefined
  }

  if (settings.enabled?.value !== '1') {
    console.log('Auto-backup is disabled')
    return
  }

  const frequency = settings.frequency?.value || 'daily'
  const backupTime = settings.time?.value || '02:00' // Default 2 AM

  // Parse time (HH:MM format)
  const [hour, minute] = backupTime.split(':').map(Number)

  let cronExpression: string

  switch (frequency) {
    case 'daily':
      cronExpression = `${minute} ${hour} * * *`
      break
    case 'weekly':
      cronExpression = `${minute} ${hour} * * 0` // Sunday
      break
    case 'monthly':
      cronExpression = `${minute} ${hour} 1 * *` // 1st of month
      break
    default:
      cronExpression = `${minute} ${hour} * * *`
  }

  // Cancel existing job if any
  if (scheduledJob) {
    scheduledJob.cancel()
  }

  // Schedule backup job
  scheduledJob = schedule.scheduleJob(cronExpression, async () => {
    console.log('Running scheduled backup...')
    try {
      await performScheduledBackup()
    } catch (error) {
      console.error('Scheduled backup failed:', error)
    }
  })

  console.log(`Backup scheduler started: ${frequency} at ${backupTime}`)
}

/**
 * Stop backup scheduler
 */
export function stopBackupScheduler(): void {
  if (scheduledJob) {
    scheduledJob.cancel()
    scheduledJob = null
    console.log('Backup scheduler stopped')
  }
}

/**
 * Perform scheduled backup
 */
async function performScheduledBackup(): Promise<void> {
  const db = getDatabase()

  // Get encryption password if set
  const passwordSetting = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('backup_password') as { value: string } | undefined

  // Create local backup
  const backupPath = await createBackup(passwordSetting?.value)
  console.log('Local backup created:', backupPath)

  // Upload to Google Drive if configured
  if (isDriveConfigured()) {
    const tokenSetting = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('google_drive_token') as { value: string } | undefined

    if (tokenSetting?.value) {
      initializeDrive(tokenSetting.value)

      const fileName = path.basename(backupPath)
      const result = await uploadBackupToDrive(backupPath, fileName)
      console.log('Backup uploaded to Google Drive:', result.fileId)

      // Update last backup timestamp
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'last_backup_time',
        new Date().toISOString()
      )
    }
  }

  // Cleanup old local backups (keep last 7)
  cleanupOldBackups(7)
}

/**
 * Cleanup old local backups
 */
function cleanupOldBackups(keepCount: number): void {
  const fs = require('fs')
  const { app } = require('electron')
  const backupDir = path.join(app.getPath('userData'), 'backups')

  if (!fs.existsSync(backupDir)) return

  const files = fs
    .readdirSync(backupDir)
    .filter(
      (f: string) =>
        f.startsWith('pharmapos-backup-') && (f.endsWith('.zip') || f.endsWith('.encrypted'))
    )
    .map((f: string) => ({
      name: f,
      path: path.join(backupDir, f),
      time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
    }))
    .sort((a: any, b: any) => b.time - a.time)

  // Delete old backups
  files.slice(keepCount).forEach((file: any) => {
    fs.unlinkSync(file.path)
    console.log('Deleted old backup:', file.name)
  })
}

/**
 * Get backup status
 */
export function getBackupStatus(): {
  enabled: boolean
  lastBackup: string | null
  nextBackup: string | null
} {
  const db = getDatabase()

  const enabled = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_enabled') as
    | { value: string }
    | undefined

  const lastBackup = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('last_backup_time') as { value: string } | undefined

  return {
    enabled: enabled?.value === '1',
    lastBackup: lastBackup?.value || null,
    nextBackup: scheduledJob?.nextInvocation()?.toISOString() || null
  }
}
