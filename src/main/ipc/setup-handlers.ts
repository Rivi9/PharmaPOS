import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import { isFirstRun, initializeDatabase, markSetupComplete } from '../services/setup/first-run'

export function registerSetupHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.SETUP_IS_FIRST_RUN, () => {
    return isFirstRun()
  })

  ipcMain.handle(IPC_CHANNELS.SETUP_INITIALIZE, (_event, data) => {
    initializeDatabase(data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.SETUP_COMPLETE, () => {
    markSetupComplete()
    return { success: true }
  })
}
