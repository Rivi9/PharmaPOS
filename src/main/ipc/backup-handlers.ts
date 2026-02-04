import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { createBackup, restoreBackup, listBackups } from '../services/backup/database-backup'
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
  getBackupStatus
} from '../services/backup/scheduler'
import path from 'path'
import { app } from 'electron'
import fs from 'fs'

export function registerBackupHandlers(): void {
  // Local backup operations
  ipcMain.handle(IPC_CHANNELS.BACKUP_CREATE, async (_event, password?: string) => {
    return await createBackup(password)
  })

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_RESTORE,
    async (_event, { backupPath, password }: { backupPath: string; password?: string }) => {
      return await restoreBackup(backupPath, password)
    }
  )

  ipcMain.handle(IPC_CHANNELS.BACKUP_LIST_LOCAL, () => {
    return listBackups()
  })

  ipcMain.handle(IPC_CHANNELS.BACKUP_DELETE_LOCAL, (_event, backupPath: string) => {
    fs.unlinkSync(backupPath)
    return { success: true }
  })

  // Google Drive operations
  ipcMain.handle(IPC_CHANNELS.BACKUP_DRIVE_AUTH, (_event, accessToken: string) => {
    storeDriveToken(accessToken)
    return { success: true }
  })

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DRIVE_UPLOAD,
    async (_event, { filePath, fileName }: { filePath: string; fileName: string }) => {
      return await uploadBackupToDrive(filePath, fileName)
    }
  )

  ipcMain.handle(IPC_CHANNELS.BACKUP_DRIVE_LIST, async () => {
    return await listDriveBackups()
  })

  ipcMain.handle(
    IPC_CHANNELS.BACKUP_DRIVE_DOWNLOAD,
    async (_event, { fileId, fileName }: { fileId: string; fileName: string }) => {
      const destPath = path.join(app.getPath('userData'), 'backups', fileName)
      await downloadBackupFromDrive(fileId, destPath)
      return { path: destPath }
    }
  )

  ipcMain.handle(IPC_CHANNELS.BACKUP_DRIVE_DELETE, async (_event, fileId: string) => {
    await deleteBackupFromDrive(fileId)
    return { success: true }
  })

  // Scheduler operations
  ipcMain.handle(IPC_CHANNELS.BACKUP_SCHEDULER_START, () => {
    startBackupScheduler()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.BACKUP_SCHEDULER_STOP, () => {
    stopBackupScheduler()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.BACKUP_SCHEDULER_STATUS, () => {
    return getBackupStatus()
  })
}
