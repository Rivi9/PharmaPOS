import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission, actingUserId } from './middleware'
import {
  createBackup,
  restoreBackup,
  listBackups,
  getBackupDir,
  assertInsideBackupDir
} from '../services/backup/database-backup'
import {
  uploadBackupToDrive,
  listDriveBackups,
  downloadBackupFromDrive,
  deleteBackupFromDrive,
  storeDriveToken
} from '../services/backup/google-drive'
import {
  startBackupScheduler,
  stopBackupScheduler,
  getBackupStatus,
  setBackupsEnabled
} from '../services/backup/scheduler'
import { getBackupRecoveryKey } from '../services/backup/recovery-key'
import { logAudit } from '../services/audit'
import path from 'path'
import fs from 'fs'

/** Drive filenames arrive from the renderer and are joined into a path — constrain them. */
function safeBackupFileName(fileName: string): string {
  const base = path.basename(fileName)
  if (!/^pharmapos-backup-[\w.-]+\.(zip|encrypted)$/.test(base)) {
    throw new Error('Invalid backup file name')
  }
  return base
}

export function registerBackupHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_CREATE,
    async (_event, { password }: { password?: string }) => {
      return withPermission(_event, 'backup:create', async () => {
        const backupPath = await createBackup(password)
        logAudit({
        userId: actingUserId(_event),
          action: 'BACKUP_CREATED',
          entityType: 'backup',
          entityId: path.basename(backupPath),
          details: { encrypted: Boolean(password) }
        })
        return backupPath
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_RESTORE,
    async (
      _event,
      { backupPath, password }: { backupPath: string; password?: string }
    ) => {
      return withPermission(_event, 'backup:restore', async () => {
        const metadata = await restoreBackup(backupPath, password)
        // Written after the swap, so it survives into the restored database.
        logAudit({
        userId: actingUserId(_event),
          action: 'BACKUP_RESTORED',
          entityType: 'backup',
          entityId: path.basename(backupPath),
          details: { backup_timestamp: metadata.timestamp }
        })
        return metadata
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.BACKUP_LIST_LOCAL, (_event) => {
    return withPermission(_event, 'backup:create', () => listBackups())
  })

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DELETE_LOCAL,
    (_event, { backupPath }: { backupPath: string }) => {
      return withPermission(_event, 'backup:restore', () => {
        // Without containment this deletes any path the renderer names, including
        // the live database.
        const safePath = assertInsideBackupDir(backupPath)
        fs.unlinkSync(safePath)
        return { success: true }
      })
    }
  )

  // Google Drive operations
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DRIVE_AUTH,
    (_event, { accessToken }: { accessToken: string }) => {
      return withPermission(_event, 'backup:create', () => {
        storeDriveToken(accessToken)
        return { success: true }
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DRIVE_UPLOAD,
    async (
      _event,
      { filePath, fileName }: { filePath: string; fileName: string }
    ) => {
      return withPermission(_event, 'backup:create', () =>
        uploadBackupToDrive(assertInsideBackupDir(filePath), safeBackupFileName(fileName))
      )
    }
  )

  ipcMain.handle(IPC_CHANNELS.BACKUP_DRIVE_LIST, async (_event) => {
    return withPermission(_event, 'backup:create', () => listDriveBackups())
  })

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DRIVE_DOWNLOAD,
    async (
      _event,
      { fileId, fileName }: { fileId: string; fileName: string }
    ) => {
      return withPermission(_event, 'backup:restore', async () => {
        const destPath = path.join(getBackupDir(), safeBackupFileName(fileName))
        await downloadBackupFromDrive(fileId, destPath)
        return { path: destPath }
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DRIVE_DELETE,
    async (_event, { fileId }: { fileId: string }) => {
      return withPermission(_event, 'backup:restore', async () => {
        await deleteBackupFromDrive(fileId)
        return { success: true }
      })
    }
  )

  // The operator must be able to write this down — a key that exists only on the
  // machine is worthless once that machine dies, which is the case backups exist for.
  ipcMain.handle(IPC_CHANNELS.BACKUP_RECOVERY_KEY, (_event) => {
    return withPermission(_event, 'backup:restore', () => {
      const key = getBackupRecoveryKey()
      logAudit({
        userId: actingUserId(_event),
        action: 'BACKUP_CREATED',
        entityType: 'backup',
        entityId: 'recovery-key',
        details: { action: 'recovery key revealed' }
      })
      return { key }
    })
  })

  // Scheduler operations
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_SCHEDULER_START,
    (_event) => {
      return withPermission(_event, 'backup:create', () => {
        setBackupsEnabled(true)
        return { success: true }
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.BACKUP_SCHEDULER_STOP, (_event) => {
    return withPermission(_event, 'backup:create', () => {
      setBackupsEnabled(false)
      return { success: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.BACKUP_SCHEDULER_STATUS, (_event) => {
    return withPermission(_event, 'backup:create', () => getBackupStatus())
  })
}

// Re-exported so main can start the scheduler at launch.
export { startBackupScheduler, stopBackupScheduler }
