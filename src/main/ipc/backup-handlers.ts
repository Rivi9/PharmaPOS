import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission } from './middleware'
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
    async (_event, { userId, password }: { userId: string; password?: string }) => {
      return withPermission(userId, 'backup:create', async () => {
        const backupPath = await createBackup(password)
        logAudit({
          userId,
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
      { userId, backupPath, password }: { userId: string; backupPath: string; password?: string }
    ) => {
      return withPermission(userId, 'backup:restore', async () => {
        const metadata = await restoreBackup(backupPath, password)
        // Written after the swap, so it survives into the restored database.
        logAudit({
          userId,
          action: 'BACKUP_RESTORED',
          entityType: 'backup',
          entityId: path.basename(backupPath),
          details: { backup_timestamp: metadata.timestamp }
        })
        return metadata
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.BACKUP_LIST_LOCAL, (_event, userId: string) => {
    return withPermission(userId, 'backup:create', () => listBackups())
  })

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DELETE_LOCAL,
    (_event, { userId, backupPath }: { userId: string; backupPath: string }) => {
      return withPermission(userId, 'backup:restore', () => {
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
    (_event, { userId, accessToken }: { userId: string; accessToken: string }) => {
      return withPermission(userId, 'backup:create', () => {
        storeDriveToken(accessToken)
        return { success: true }
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DRIVE_UPLOAD,
    async (
      _event,
      { userId, filePath, fileName }: { userId: string; filePath: string; fileName: string }
    ) => {
      return withPermission(userId, 'backup:create', () =>
        uploadBackupToDrive(assertInsideBackupDir(filePath), safeBackupFileName(fileName))
      )
    }
  )

  ipcMain.handle(IPC_CHANNELS.BACKUP_DRIVE_LIST, async (_event, userId: string) => {
    return withPermission(userId, 'backup:create', () => listDriveBackups())
  })

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DRIVE_DOWNLOAD,
    async (
      _event,
      { userId, fileId, fileName }: { userId: string; fileId: string; fileName: string }
    ) => {
      return withPermission(userId, 'backup:restore', async () => {
        const destPath = path.join(getBackupDir(), safeBackupFileName(fileName))
        await downloadBackupFromDrive(fileId, destPath)
        return { path: destPath }
      })
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DRIVE_DELETE,
    async (_event, { userId, fileId }: { userId: string; fileId: string }) => {
      return withPermission(userId, 'backup:restore', async () => {
        await deleteBackupFromDrive(fileId)
        return { success: true }
      })
    }
  )

  // Scheduler operations
  ipcMain.handle(
    IPC_CHANNELS.BACKUP_SCHEDULER_START,
    (_event, userId: string) => {
      return withPermission(userId, 'backup:create', () => {
        setBackupsEnabled(true)
        return { success: true }
      })
    }
  )

  ipcMain.handle(IPC_CHANNELS.BACKUP_SCHEDULER_STOP, (_event, userId: string) => {
    return withPermission(userId, 'backup:create', () => {
      setBackupsEnabled(false)
      return { success: true }
    })
  })

  ipcMain.handle(IPC_CHANNELS.BACKUP_SCHEDULER_STATUS, (_event, userId: string) => {
    return withPermission(userId, 'backup:create', () => getBackupStatus())
  })
}

// Re-exported so main can start the scheduler at launch.
export { startBackupScheduler, stopBackupScheduler }
