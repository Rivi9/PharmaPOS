import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { checkForUpdates, downloadUpdate, installUpdate } from '../services/updates/auto-updater'

export function registerUpdateHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.UPDATES_CHECK, () => {
    checkForUpdates()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.UPDATES_DOWNLOAD, () => {
    downloadUpdate()
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.UPDATES_INSTALL, () => {
    installUpdate()
    return { success: true }
  })
}
