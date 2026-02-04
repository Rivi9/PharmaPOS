import fs from 'fs'
import { google } from 'googleapis'
import type { drive_v3 } from 'googleapis'
import { getDatabase } from '../database'

let drive: drive_v3.Drive | null = null
const FOLDER_NAME = 'PharmaPOS_Backups'

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
  if (!drive) throw new Error('Google Drive not initialized')

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
}

/**
 * Upload backup file to Google Drive
 */
export async function uploadBackupToDrive(
  filePath: string,
  fileName: string
): Promise<{ fileId: string; webViewLink: string }> {
  if (!drive) throw new Error('Google Drive not initialized')

  const folderId = await getOrCreateBackupFolder()

  const fileMetadata = {
    name: fileName,
    parents: [folderId]
  }

  const media = {
    mimeType: 'application/octet-stream',
    body: fs.createReadStream(filePath)
  }

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, webViewLink'
  })

  return {
    fileId: response.data.id!,
    webViewLink: response.data.webViewLink || ''
  }
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
  if (!drive) throw new Error('Google Drive not initialized')

  const folderId = await getOrCreateBackupFolder()

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
}

/**
 * Download backup from Google Drive
 */
export async function downloadBackupFromDrive(
  fileId: string,
  destinationPath: string
): Promise<void> {
  if (!drive) throw new Error('Google Drive not initialized')

  const response = await drive.files.get(
    { fileId: fileId, alt: 'media' },
    { responseType: 'stream' }
  )

  const dest = fs.createWriteStream(destinationPath)

  return new Promise((resolve, reject) => {
    response.data
      .on('end', () => resolve())
      .on('error', (err: Error) => reject(err))
      .pipe(dest)
  })
}

/**
 * Delete backup from Google Drive
 */
export async function deleteBackupFromDrive(fileId: string): Promise<void> {
  if (!drive) throw new Error('Google Drive not initialized')

  await drive.files.delete({ fileId })
}

/**
 * Check if Google Drive is configured
 */
export function isDriveConfigured(): boolean {
  const db = getDatabase()
  const setting = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('google_drive_token') as { value: string } | undefined

  return !!setting?.value
}

/**
 * Store Google Drive access token
 */
export function storeDriveToken(accessToken: string): void {
  const db = getDatabase()
  db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  ).run('google_drive_token', accessToken)

  initializeDrive(accessToken)
}
