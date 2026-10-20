import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { withPermission } from './middleware'
import { checkForUpdates, downloadUpdate, installUpdate } from '../services/updates/auto-updater'

export function registerUpdateHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.UPDATES_CHECK, () => checkForUpdates())

  ipcMain.handle(IPC_CHANNELS.UPDATES_DOWNLOAD, () => {
    downloadUpdate()
    return { success: true }
  })

  // Installing quits the till on the spot, releasing the End-Shift close guard
  // on the way out (see installUpdate). With no check, anyone — signed in or not
  // — could use it to walk away from an uncounted drawer.
  ipcMain.handle(IPC_CHANNELS.UPDATES_INSTALL, (event) => {
    return withPermission(event, 'settings:update', () => {
      installUpdate()
      return { success: true }
    })
  })
}
