import { closeDatabase } from './services/database'
import { stopBackupScheduler } from './services/backup/scheduler'
import * as poleDisplay from './services/pole-display'
import { logInfo } from './services/logging/logger'

/**
 * Whether the app is allowed to exit.
 *
 * The close guard exists so Alt+F4 cannot skip End Shift. It lives here rather
 * than in `index.ts` because the updater also has to release it: `before-quit`
 * saw `false`, called `preventDefault()` and re-showed the window *while
 * Squirrel had already launched the replacement process*, leaving two instances
 * on one WAL database with two independent receipt-number generators.
 */
let closeConfirmed = false

export function isCloseConfirmed(): boolean {
  return closeConfirmed
}

export function confirmClose(): void {
  closeConfirmed = true
}

let cleanupDone = false

/**
 * Release every OS resource the process holds. Idempotent, and safe to call
 * before `quitAndInstall()` so the database is closed and its WAL checkpointed
 * before the incoming process opens the same file.
 */
export function runShutdownCleanup(): void {
  if (cleanupDone) return
  cleanupDone = true
  logInfo('Shutting down')
  stopBackupScheduler()
  // Fire-and-forget: the serial close is async and the process is going away
  // either way, so a stuck port must not hold up the exit.
  poleDisplay.closeDisplay().catch(() => {})
  closeDatabase()
}
