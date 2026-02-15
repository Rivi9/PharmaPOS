import { ipcMain } from 'electron'
import { dialog } from 'electron'
import fs from 'fs'
import { IPC_CHANNELS } from './channels'
import { queryAuditLog, exportAuditLogCsv, type AuditQueryOptions } from '../services/audit'

export function registerAuditHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.AUDIT_LOG_QUERY, (_event, options: AuditQueryOptions) => {
    return queryAuditLog(options)
  })

  ipcMain.handle(IPC_CHANNELS.AUDIT_LOG_EXPORT_CSV, async (event, options: AuditQueryOptions) => {
    const csv = exportAuditLogCsv(options)

    const win = require('electron').BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: `audit-log-${new Date().toISOString().split('T')[0]}.csv`,
      filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    })

    if (result.canceled || !result.filePath) {
      return { success: false, cancelled: true }
    }

    fs.writeFileSync(result.filePath, csv, 'utf-8')
    return { success: true, filePath: result.filePath }
  })
}
