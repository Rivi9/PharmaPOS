import fs from 'fs'
import { safeStorage } from 'electron'
import { google } from 'googleapis'
import type { drive_v3 } from 'googleapis'
import { getDatabase } from '../database'
import { logError, logInfo } from '../logging/logger'

let drive: drive_v3.Drive | null = null
const FOLDER_NAME = 'PharmaPOS_Backups'
const TOKEN_KEY = 'google_drive_token_protected'
/** Legacy plaintext key, migrated away from on first read. */
const LEGACY_TOKEN_KEY = 'google_drive_token'

/**
 * Wrap a Drive call so an expired credential is reported rather than logged.
 *
 * The token stored here is a bare OAuth *access* token — there is no refresh
 * token, no client credentials and no consent flow, so Google expires it after
 * about an hour and there is nothing in the app that can renew it. Uploads then
 * 401 forever. That is a real limitation (see H30), not something this wrapper
 * fixes; what it does is make the state legible instead of silent, so the
 * operator is told to reconnect rather than believing backups are still going
 * off-site.
 */
async function withDrive<T>(operation: string, fn: (d: drive_v3.Drive) => Promise<T>): Promise<T> {
  if (!drive) {
    throw new Error('Google Drive is not connected. Reconnect it in Settings → Backup.')
  }
  try {
    return await fn(drive)
  } catch (error) {
    const status =
      (error as { code?: number; status?: number })?.code ?? (error as { status?: number })?.status
    if (status === 401 || status === 403) {
      // The credential is dead; stop pretending Drive is configured.
      clearDriveToken()
      logError(`Google Drive ${operation} rejected the stored credential`, error as Error)
      throw new Error(
        'Google Drive rejected the saved sign-in. It has expired — reconnect Drive in Settings → Backup. Local backups are unaffected.'
      )
    }
    logError(`Google Drive ${operation} failed`, error as Error)
    throw error
  }
}

/**
 * Initialize Google Drive API with OAuth credentials
 */
export function initializeDrive(accessToken: string): void {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })

  drive = google.drive({ version: 'v3', auth: oauth2Client })
}

/**
 * Get or create PharmaPOS backup folder
 */
async function getOrCreateBackupFolder(): Promise<string> {
  return withDrive('folder lookup', async (drive) => {
    // Search for existing folder
    const response = await drive.files.list({
      q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
      spaces: 'drive'
    })

    if (response.data.files && response.data.files.length > 0) {
      return response.data.files[0].id!
    }

    // Create folder if not exists
    const folderMetadata = {
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder'
    }

    const folder = await drive.files.create({
      requestBody: folderMetadata,
      fields: 'id'
    })

    return folder.data.id!
  })
}

/**
 * Upload backup file to Google Drive
 */
export async function uploadBackupToDrive(
  filePath: string,
  fileName: string
): Promise<{ fileId: string; webViewLink: string }> {
  const folderId = await getOrCreateBackupFolder()

  const fileMetadata = {
    name: fileName,
    parents: [folderId]
  }

  const media = {
    mimeType: 'application/octet-stream',
    body: fs.createReadStream(filePath)
  }

  return withDrive('upload', async (drive) => {
    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id, webViewLink'
    })
    return {
      fileId: response.data.id!,
      webViewLink: response.data.webViewLink || ''
    }
  })
}

/**
 * List backups on Google Drive
 */
export async function listDriveBackups(): Promise<
  Array<{
    id: string
    name: string
    size: number
    createdTime: string
    webViewLink: string
  }>
> {
  const folderId = await getOrCreateBackupFolder()

  return withDrive('list', async (drive) => {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'files(id, name, size, createdTime, webViewLink)',
      orderBy: 'createdTime desc',
      pageSize: 50
    })

    return (
      response.data.files?.map((f) => ({
        id: f.id!,
        name: f.name!,
        size: parseInt(f.size || '0'),
        createdTime: f.createdTime!,
        webViewLink: f.webViewLink || ''
      })) || []
    )
  })
}

/**
 * Download backup from Google Drive
 */
export async function downloadBackupFromDrive(
  fileId: string,
  destinationPath: string
): Promise<void> {
  return withDrive('download', async (drive) => {
    const response = await drive.files.get(
      { fileId: fileId, alt: 'media' },
      { responseType: 'stream' }
    )

    const dest = fs.createWriteStream(destinationPath)

    await new Promise<void>((resolve, reject) => {
      // Resolve on the DESTINATION's 'finish', not the source's 'end': the
      // source ends as soon as the last byte is read, so a restore starting
      // immediately afterwards could read a partially written file.
      dest.on('finish', () => resolve())
      dest.on('error', reject)
      response.data.on('error', (err: Error) => reject(err)).pipe(dest)
    })
  })
}

/**
 * Delete backup from Google Drive
 */
export async function deleteBackupFromDrive(fileId: string): Promise<void> {
  await withDrive('delete', (drive) => drive.files.delete({ fileId }))
}

function readSetting(key: string): string | null {
  const row = getDatabase().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function writeSetting(key: string, value: string): void {
  // settings.updated_at is NOT NULL with no default — omitting it threw, which is why
  // Google Drive could never be configured.
  getDatabase()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(key, value)
}

/**
 * Store the Drive credential.
 *
 * DPAPI-wrapped via `safeStorage`, exactly like the backup recovery key, because
 * the plaintext form used to sit in the `settings` table — and that table is
 * packed into every backup, so an archive uploaded to Drive contained the
 * credential for the Drive account it had just been uploaded to.
 */
export function storeDriveToken(accessToken: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'This machine cannot protect stored credentials, so Google Drive cannot be connected. Local backups are unaffected.'
    )
  }
  writeSetting(TOKEN_KEY, safeStorage.encryptString(accessToken).toString('base64'))
  // Remove any plaintext copy left by an earlier version.
  getDatabase().prepare('DELETE FROM settings WHERE key = ?').run(LEGACY_TOKEN_KEY)
  initializeDrive(accessToken)
}

/**
 * The stored credential in plaintext, or null. Also migrates a plaintext token
 * written by an earlier version, so upgrading does not silently disconnect Drive.
 */
export function readDriveToken(): string | null {
  const legacy = readSetting(LEGACY_TOKEN_KEY)
  if (legacy) {
    logInfo('Migrating the plaintext Google Drive token into protected storage')
    try {
      storeDriveToken(legacy)
      return legacy
    } catch {
      // Cannot protect it — drop it rather than leave it readable in backups.
      getDatabase().prepare('DELETE FROM settings WHERE key = ?').run(LEGACY_TOKEN_KEY)
      return null
    }
  }

  const protectedValue = readSetting(TOKEN_KEY)
  if (!protectedValue) return null
  try {
    return safeStorage.decryptString(Buffer.from(protectedValue, 'base64'))
  } catch (error) {
    // A restored backup carries another machine's DPAPI blob, which this machine
    // cannot open. Treat it as not configured rather than crashing the scheduler.
    logError('Stored Google Drive credential could not be read on this machine', error as Error)
    return null
  }
}

/** Forget the credential — called when Drive rejects it. */
export function clearDriveToken(): void {
  drive = null
  const db = getDatabase()
  db.prepare('DELETE FROM settings WHERE key IN (?, ?)').run(TOKEN_KEY, LEGACY_TOKEN_KEY)
}

export function isDriveConfigured(): boolean {
  return readDriveToken() !== null
}
