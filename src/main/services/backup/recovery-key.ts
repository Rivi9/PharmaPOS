import crypto from 'crypto'
import { safeStorage } from 'electron'
import { getDatabase } from '../database'
import { logInfo } from '../logging/logger'

const SETTING_KEY = 'backup_recovery_key_protected'

/**
 * Alphabet without characters that are easily confused when transcribed by hand
 * (no I/L/1, no O/0, no U). The operator has to be able to copy this off a screen
 * onto paper and type it back correctly, possibly months later.
 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

/** e.g. `K7QF-2M9X-BTRW-4HPD-N6SY-J38Z` — 30 chars, ~147 bits. */
function generateRecoveryKey(): string {
  const bytes = crypto.randomBytes(30)
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length])
  const groups: string[] = []
  for (let i = 0; i < chars.length; i += 5) groups.push(chars.slice(i, i + 5).join(''))
  return groups.join('-')
}

function readProtected(): string | null {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(SETTING_KEY) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function writeProtected(value: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(SETTING_KEY, value)
}

export function hasRecoveryKey(): boolean {
  return readProtected() !== null
}

/**
 * The key every backup is encrypted with.
 *
 * Stored on disk only in the form produced by Electron's `safeStorage` (DPAPI on
 * Windows), so reading the settings table does not reveal it — which matters,
 * because that table is itself inside every backup.
 *
 * It is deliberately *also* a transcribable string the operator can write down.
 * A purely machine-bound key would make every archive unreadable the moment the
 * POS machine dies, which is exactly the disaster the backups exist for.
 */
export function getBackupRecoveryKey(): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'Operating system encryption is unavailable, so the backup key cannot be stored safely. ' +
        'Backups are disabled until this is resolved.'
    )
  }

  const existing = readProtected()
  if (existing) {
    return safeStorage.decryptString(Buffer.from(existing, 'base64'))
  }

  const key = generateRecoveryKey()
  writeProtected(safeStorage.encryptString(key).toString('base64'))
  logInfo('Generated a new backup recovery key')
  return key
}
