# Phase 5: Polish & Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build production-ready features including Google Drive backup/restore, comprehensive user management with role-based permissions, and printer setup wizard for thermal receipt printing.

**Architecture:** Google Drive API integration for automated cloud backups with encryption. User management with bcrypt password hashing and role-based access control (RBAC) middleware. Printer setup wizard with device detection and test printing using node-thermal-printer library.

**Tech Stack:** React 19, TypeScript, googleapis (Google Drive API), bcrypt, node-thermal-printer, node-schedule, better-sqlite3

---

## Part 1: Backup & Restore System

### Task 1: Create Backup Service

**Files:**
- Create: `src/main/services/backup/database-backup.ts`
- Create: `src/main/services/backup/encryption.ts`

**Step 1: Install required packages**

Run: `npm install archiver extract-zip`

**Step 2: Create encryption utility**

```typescript
// src/main/services/backup/encryption.ts
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const SALT_LENGTH = 64
const TAG_LENGTH = 16

/**
 * Derive encryption key from password
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256')
}

/**
 * Encrypt buffer data
 */
export function encryptData(data: Buffer, password: string): Buffer {
  const salt = crypto.randomBytes(SALT_LENGTH)
  const key = deriveKey(password, salt)
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
  const tag = cipher.getAuthTag()

  // Format: [salt][iv][tag][encrypted]
  return Buffer.concat([salt, iv, tag, encrypted])
}

/**
 * Decrypt buffer data
 */
export function decryptData(encryptedData: Buffer, password: string): Buffer {
  const salt = encryptedData.subarray(0, SALT_LENGTH)
  const iv = encryptedData.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const tag = encryptedData.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + TAG_LENGTH
  )
  const encrypted = encryptedData.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)

  const key = deriveKey(password, salt)

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}
```

**Step 3: Create database backup service**

```typescript
// src/main/services/backup/database-backup.ts
import fs from 'fs'
import path from 'path'
import archiver from 'archiver'
import extract from 'extract-zip'
import { app } from 'electron'
import { encryptData, decryptData } from './encryption'

export interface BackupMetadata {
  version: string
  timestamp: string
  database_size: number
  app_version: string
}

/**
 * Create encrypted backup of database
 */
export async function createBackup(password?: string): Promise<string> {
  const dbPath = path.join(app.getPath('userData'), 'database.db')
  const backupDir = path.join(app.getPath('userData'), 'backups')
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupName = `pharmapos-backup-${timestamp}`

  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }

  const tempZipPath = path.join(backupDir, `${backupName}.zip`)
  const finalPath = password
    ? path.join(backupDir, `${backupName}.encrypted`)
    : tempZipPath

  // Create ZIP archive
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(tempZipPath)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => resolve())
    archive.on('error', (err) => reject(err))

    archive.pipe(output)

    // Add database file
    archive.file(dbPath, { name: 'database.db' })

    // Add metadata
    const metadata: BackupMetadata = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      database_size: fs.statSync(dbPath).size,
      app_version: app.getVersion()
    }
    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' })

    archive.finalize()
  })

  // Encrypt if password provided
  if (password) {
    const zipData = fs.readFileSync(tempZipPath)
    const encrypted = encryptData(zipData, password)
    fs.writeFileSync(finalPath, encrypted)
    fs.unlinkSync(tempZipPath) // Remove unencrypted temp file
  }

  return finalPath
}

/**
 * Restore database from backup
 */
export async function restoreBackup(
  backupPath: string,
  password?: string
): Promise<BackupMetadata> {
  const dbPath = path.join(app.getPath('userData'), 'database.db')
  const tempDir = path.join(app.getPath('userData'), 'temp-restore')
  const tempZipPath = path.join(tempDir, 'restore.zip')

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  try {
    // Decrypt if needed
    if (password) {
      const encryptedData = fs.readFileSync(backupPath)
      const decrypted = decryptData(encryptedData, password)
      fs.writeFileSync(tempZipPath, decrypted)
    } else {
      fs.copyFileSync(backupPath, tempZipPath)
    }

    // Extract ZIP
    await extract(tempZipPath, { dir: tempDir })

    // Read metadata
    const metadataPath = path.join(tempDir, 'metadata.json')
    const metadata: BackupMetadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))

    // Backup current database before restore
    const currentBackupPath = `${dbPath}.pre-restore-${Date.now()}`
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, currentBackupPath)
    }

    // Restore database
    const restoredDbPath = path.join(tempDir, 'database.db')
    fs.copyFileSync(restoredDbPath, dbPath)

    return metadata
  } finally {
    // Cleanup temp files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  }
}

/**
 * List available local backups
 */
export function listBackups(): Array<{ path: string; timestamp: string; size: number }> {
  const backupDir = path.join(app.getPath('userData'), 'backups')

  if (!fs.existsSync(backupDir)) {
    return []
  }

  const files = fs.readdirSync(backupDir)
  return files
    .filter((f) => f.startsWith('pharmapos-backup-') && (f.endsWith('.zip') || f.endsWith('.encrypted')))
    .map((f) => {
      const filePath = path.join(backupDir, f)
      const stats = fs.statSync(filePath)
      // Extract timestamp from filename
      const timestampMatch = f.match(/pharmapos-backup-(.+)\.(zip|encrypted)/)
      const timestamp = timestampMatch ? timestampMatch[1].replace(/-/g, ':') : ''

      return {
        path: filePath,
        timestamp,
        size: stats.size
      }
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}
```

**Step 4: Run dev to verify it compiles**

Run: `npm run dev`
Expected: No compilation errors

**Step 5: Commit**

```bash
git add src/main/services/backup/encryption.ts src/main/services/backup/database-backup.ts package.json package-lock.json
git commit -m "feat: add database backup and encryption service"
```

---

### Task 2: Create Google Drive Integration

**Files:**
- Create: `src/main/services/backup/google-drive.ts`

**Step 1: Install Google APIs client**

Run: `npm install googleapis`

**Step 2: Create Google Drive service**

```typescript
// src/main/services/backup/google-drive.ts
import fs from 'fs'
import { google } from 'googleapis'
import type { drive_v3 } from 'googleapis'
import { getDatabase } from '../../db'

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
```

**Step 3: Commit**

```bash
git add src/main/services/backup/google-drive.ts package.json package-lock.json
git commit -m "feat: add Google Drive backup integration"
```

---

### Task 3: Create Auto-Backup Scheduler

**Files:**
- Create: `src/main/services/backup/scheduler.ts`

**Step 1: Install node-schedule**

Run: `npm install node-schedule @types/node-schedule`

**Step 2: Create backup scheduler**

```typescript
// src/main/services/backup/scheduler.ts
import schedule from 'node-schedule'
import { getDatabase } from '../../db'
import { createBackup } from './database-backup'
import { uploadBackupToDrive, isDriveConfigured, initializeDrive } from './google-drive'
import path from 'path'

let scheduledJob: schedule.Job | null = null

/**
 * Start automatic backup scheduler
 */
export function startBackupScheduler(): void {
  const db = getDatabase()

  // Get backup settings
  const settings = {
    enabled: db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_enabled') as
      | { value: string }
      | undefined,
    frequency: db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_frequency') as
      | { value: string }
      | undefined,
    time: db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_time') as
      | { value: string }
      | undefined
  }

  if (settings.enabled?.value !== '1') {
    console.log('Auto-backup is disabled')
    return
  }

  const frequency = settings.frequency?.value || 'daily'
  const backupTime = settings.time?.value || '02:00' // Default 2 AM

  // Parse time (HH:MM format)
  const [hour, minute] = backupTime.split(':').map(Number)

  let cronExpression: string

  switch (frequency) {
    case 'daily':
      cronExpression = `${minute} ${hour} * * *`
      break
    case 'weekly':
      cronExpression = `${minute} ${hour} * * 0` // Sunday
      break
    case 'monthly':
      cronExpression = `${minute} ${hour} 1 * *` // 1st of month
      break
    default:
      cronExpression = `${minute} ${hour} * * *`
  }

  // Cancel existing job if any
  if (scheduledJob) {
    scheduledJob.cancel()
  }

  // Schedule backup job
  scheduledJob = schedule.scheduleJob(cronExpression, async () => {
    console.log('Running scheduled backup...')
    try {
      await performScheduledBackup()
    } catch (error) {
      console.error('Scheduled backup failed:', error)
    }
  })

  console.log(`Backup scheduler started: ${frequency} at ${backupTime}`)
}

/**
 * Stop backup scheduler
 */
export function stopBackupScheduler(): void {
  if (scheduledJob) {
    scheduledJob.cancel()
    scheduledJob = null
    console.log('Backup scheduler stopped')
  }
}

/**
 * Perform scheduled backup
 */
async function performScheduledBackup(): Promise<void> {
  const db = getDatabase()

  // Get encryption password if set
  const passwordSetting = db
    .prepare('SELECT value FROM settings WHERE key = ?')
    .get('backup_password') as { value: string } | undefined

  // Create local backup
  const backupPath = await createBackup(passwordSetting?.value)
  console.log('Local backup created:', backupPath)

  // Upload to Google Drive if configured
  if (isDriveConfigured()) {
    const tokenSetting = db
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get('google_drive_token') as { value: string } | undefined

    if (tokenSetting?.value) {
      initializeDrive(tokenSetting.value)

      const fileName = path.basename(backupPath)
      const result = await uploadBackupToDrive(backupPath, fileName)
      console.log('Backup uploaded to Google Drive:', result.fileId)

      // Update last backup timestamp
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
        'last_backup_time',
        new Date().toISOString()
      )
    }
  }

  // Cleanup old local backups (keep last 7)
  cleanupOldBackups(7)
}

/**
 * Cleanup old local backups
 */
function cleanupOldBackups(keepCount: number): void {
  const fs = require('fs')
  const { app } = require('electron')
  const backupDir = path.join(app.getPath('userData'), 'backups')

  if (!fs.existsSync(backupDir)) return

  const files = fs
    .readdirSync(backupDir)
    .filter(
      (f: string) =>
        f.startsWith('pharmapos-backup-') && (f.endsWith('.zip') || f.endsWith('.encrypted'))
    )
    .map((f: string) => ({
      name: f,
      path: path.join(backupDir, f),
      time: fs.statSync(path.join(backupDir, f)).mtime.getTime()
    }))
    .sort((a: any, b: any) => b.time - a.time)

  // Delete old backups
  files.slice(keepCount).forEach((file: any) => {
    fs.unlinkSync(file.path)
    console.log('Deleted old backup:', file.name)
  })
}

/**
 * Get backup status
 */
export function getBackupStatus(): {
  enabled: boolean
  lastBackup: string | null
  nextBackup: string | null
} {
  const db = getDatabase()

  const enabled = db.prepare('SELECT value FROM settings WHERE key = ?').get('backup_enabled') as
    | { value: string }
    | undefined

  const lastBackup = db.prepare('SELECT value FROM settings WHERE key = ?').get('last_backup_time') as
    | { value: string }
    | undefined

  return {
    enabled: enabled?.value === '1',
    lastBackup: lastBackup?.value || null,
    nextBackup: scheduledJob ? scheduledJob.nextInvocation().toISOString() : null
  }
}
```

**Step 3: Commit**

```bash
git add src/main/services/backup/scheduler.ts package.json package-lock.json
git commit -m "feat: add auto-backup scheduler"
```

---

### Task 4: Create Backup IPC Channels and Handlers

**Files:**
- Modify: `src/main/ipc/channels.ts:90-110`
- Create: `src/main/ipc/backup-handlers.ts`
- Modify: `src/main/ipc/handlers.ts:20,40`

**Step 1: Add backup IPC channels**

```typescript
// Add to src/main/ipc/channels.ts
export const IPC_CHANNELS = {
  // ... existing channels ...

  // Backup - Local
  BACKUP_CREATE: 'backup:create',
  BACKUP_RESTORE: 'backup:restore',
  BACKUP_LIST_LOCAL: 'backup:list-local',
  BACKUP_DELETE_LOCAL: 'backup:delete-local',

  // Backup - Google Drive
  BACKUP_DRIVE_AUTH: 'backup:drive-auth',
  BACKUP_DRIVE_UPLOAD: 'backup:drive-upload',
  BACKUP_DRIVE_LIST: 'backup:drive-list',
  BACKUP_DRIVE_DOWNLOAD: 'backup:drive-download',
  BACKUP_DRIVE_DELETE: 'backup:drive-delete',

  // Backup - Scheduler
  BACKUP_SCHEDULER_START: 'backup:scheduler-start',
  BACKUP_SCHEDULER_STOP: 'backup:scheduler-stop',
  BACKUP_SCHEDULER_STATUS: 'backup:scheduler-status'
} as const
```

**Step 2: Create backup handlers**

```typescript
// src/main/ipc/backup-handlers.ts
import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from './channels'
import { createBackup, restoreBackup, listBackups } from '../services/backup/database-backup'
import {
  initializeDrive,
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
  ipcMain.handle(BACKUP_CREATE, async (_event, password?: string) => {
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
```

**Step 3: Register in main handlers**

```typescript
// Add to src/main/ipc/handlers.ts
import { registerBackupHandlers } from './backup-handlers'

export function registerHandlers(): void {
  // ... existing
  registerBackupHandlers()
}
```

**Step 4: Update preload API**

```typescript
// Add to src/preload/index.ts
backup: {
  create: (password?: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_CREATE, password),
  restore: (backupPath: string, password?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_RESTORE, { backupPath, password }),
  listLocal: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_LIST_LOCAL),
  deleteLocal: (backupPath: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DELETE_LOCAL, backupPath),

  driveAuth: (accessToken: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_AUTH, accessToken),
  driveUpload: (filePath: string, fileName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_UPLOAD, { filePath, fileName }),
  driveList: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_LIST),
  driveDownload: (fileId: string, fileName: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_DOWNLOAD, { fileId, fileName }),
  driveDelete: (fileId: string) => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DRIVE_DELETE, fileId),

  schedulerStart: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SCHEDULER_START),
  schedulerStop: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SCHEDULER_STOP),
  schedulerStatus: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_SCHEDULER_STATUS)
}
```

**Step 5: Commit**

```bash
git add src/main/ipc/channels.ts src/main/ipc/backup-handlers.ts src/main/ipc/handlers.ts src/preload/index.ts
git commit -m "feat: add backup IPC handlers and channels"
```

---

## Part 1 Complete - Backup System

Tasks 1-4 establish the backup infrastructure:
- ✅ Database backup with encryption
- ✅ Google Drive integration
- ✅ Auto-backup scheduler
- ✅ Backup IPC handlers

---

## Part 2: User Management & RBAC

### Task 5: Create User Management Service

**Files:**
- Create: `src/main/services/users/user-management.ts`
- Create: `src/main/services/users/permissions.ts`

**Step 1: Install bcrypt for password hashing**

Run: `npm install bcrypt @types/bcrypt`

**Step 2: Create user management service**

```typescript
// src/main/services/users/user-management.ts
import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { getDatabase } from '../../db'

const SALT_ROUNDS = 10

export interface User {
  id: string
  username: string
  full_name: string
  role: 'admin' | 'manager' | 'cashier'
  pin_code: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export interface CreateUserData {
  username: string
  password: string
  full_name: string
  role: 'admin' | 'manager' | 'cashier'
  pin_code?: string
}

export interface UpdateUserData {
  full_name?: string
  role?: 'admin' | 'manager' | 'cashier'
  pin_code?: string
  is_active?: number
}

/**
 * List all users (without password hashes)
 */
export function listUsers(): User[] {
  const db = getDatabase()
  const users = db
    .prepare(
      `
    SELECT id, username, full_name, role, pin_code, is_active, created_at, updated_at
    FROM users
    ORDER BY created_at DESC
  `
    )
    .all() as User[]

  return users
}

/**
 * Get user by ID
 */
export function getUserById(id: string): User | null {
  const db = getDatabase()
  const user = db
    .prepare(
      `
    SELECT id, username, full_name, role, pin_code, is_active, created_at, updated_at
    FROM users
    WHERE id = ?
  `
    )
    .get(id) as User | undefined

  return user || null
}

/**
 * Get user by username
 */
export function getUserByUsername(username: string): User | null {
  const db = getDatabase()
  const user = db
    .prepare(
      `
    SELECT id, username, full_name, role, pin_code, is_active, created_at, updated_at
    FROM users
    WHERE username = ?
  `
    )
    .get(username) as User | undefined

  return user || null
}

/**
 * Create new user
 */
export async function createUser(data: CreateUserData): Promise<{ id: string }> {
  const db = getDatabase()

  // Check if username exists
  const existing = getUserByUsername(data.username)
  if (existing) {
    throw new Error('Username already exists')
  }

  // Validate role
  if (!['admin', 'manager', 'cashier'].includes(data.role)) {
    throw new Error('Invalid role')
  }

  // Hash password
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS)

  // Generate ID
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(
    `
    INSERT INTO users (
      id, username, password_hash, full_name, role, pin_code, is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `
  ).run(id, data.username, passwordHash, data.full_name, data.role, data.pin_code || null, now, now)

  return { id }
}

/**
 * Update user
 */
export function updateUser(id: string, data: UpdateUserData): void {
  const db = getDatabase()

  const user = getUserById(id)
  if (!user) {
    throw new Error('User not found')
  }

  const updates: string[] = []
  const values: any[] = []

  if (data.full_name !== undefined) {
    updates.push('full_name = ?')
    values.push(data.full_name)
  }

  if (data.role !== undefined) {
    if (!['admin', 'manager', 'cashier'].includes(data.role)) {
      throw new Error('Invalid role')
    }
    updates.push('role = ?')
    values.push(data.role)
  }

  if (data.pin_code !== undefined) {
    updates.push('pin_code = ?')
    values.push(data.pin_code || null)
  }

  if (data.is_active !== undefined) {
    updates.push('is_active = ?')
    values.push(data.is_active)
  }

  if (updates.length === 0) {
    return
  }

  updates.push('updated_at = ?')
  values.push(new Date().toISOString())

  values.push(id)

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values)
}

/**
 * Change user password
 */
export async function changeUserPassword(id: string, newPassword: string): Promise<void> {
  const db = getDatabase()

  const user = getUserById(id)
  if (!user) {
    throw new Error('User not found')
  }

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS)

  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    passwordHash,
    new Date().toISOString(),
    id
  )
}

/**
 * Verify user password
 */
export async function verifyUserPassword(username: string, password: string): Promise<User | null> {
  const db = getDatabase()

  const user = db
    .prepare('SELECT * FROM users WHERE username = ? AND is_active = 1')
    .get(username) as (User & { password_hash: string }) | undefined

  if (!user) {
    return null
  }

  const isValid = await bcrypt.compare(password, user.password_hash)
  if (!isValid) {
    return null
  }

  // Return user without password hash
  const { password_hash, ...userWithoutPassword } = user
  return userWithoutPassword as User
}

/**
 * Verify PIN code
 */
export function verifyPinCode(pin: string): User | null {
  const db = getDatabase()

  const user = db
    .prepare(
      `
    SELECT id, username, full_name, role, pin_code, is_active, created_at, updated_at
    FROM users
    WHERE pin_code = ? AND is_active = 1
  `
    )
    .get(pin) as User | undefined

  return user || null
}

/**
 * Deactivate user (soft delete)
 */
export function deactivateUser(id: string): void {
  const db = getDatabase()

  // Don't allow deactivating the last admin
  const adminCount = db
    .prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = 1")
    .get() as { count: number }

  const user = getUserById(id)
  if (user?.role === 'admin' && adminCount.count <= 1) {
    throw new Error('Cannot deactivate the last admin user')
  }

  db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  )
}

/**
 * Reactivate user
 */
export function reactivateUser(id: string): void {
  const db = getDatabase()

  db.prepare('UPDATE users SET is_active = 1, updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    id
  )
}

/**
 * Get user statistics
 */
export function getUserStats(): {
  total: number
  active: number
  byRole: Record<string, number>
} {
  const db = getDatabase()

  const total = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }

  const active = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').get() as {
    count: number
  }

  const byRole = db.prepare('SELECT role, COUNT(*) as count FROM users GROUP BY role').all() as Array<{
    role: string
    count: number
  }>

  return {
    total: total.count,
    active: active.count,
    byRole: Object.fromEntries(byRole.map((r) => [r.role, r.count]))
  }
}
```

**Step 3: Create permissions/RBAC service**

```typescript
// src/main/services/users/permissions.ts
export type Permission =
  | 'sales:create'
  | 'sales:void'
  | 'sales:refund'
  | 'sales:view_all'
  | 'inventory:view'
  | 'inventory:create'
  | 'inventory:update'
  | 'inventory:delete'
  | 'inventory:import_export'
  | 'reports:view'
  | 'reports:generate'
  | 'shifts:manage'
  | 'users:view'
  | 'users:create'
  | 'users:update'
  | 'users:delete'
  | 'settings:view'
  | 'settings:update'
  | 'backup:create'
  | 'backup:restore'

export type Role = 'admin' | 'manager' | 'cashier'

/**
 * Role-based permission matrix
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    // Full access to everything
    'sales:create',
    'sales:void',
    'sales:refund',
    'sales:view_all',
    'inventory:view',
    'inventory:create',
    'inventory:update',
    'inventory:delete',
    'inventory:import_export',
    'reports:view',
    'reports:generate',
    'shifts:manage',
    'users:view',
    'users:create',
    'users:update',
    'users:delete',
    'settings:view',
    'settings:update',
    'backup:create',
    'backup:restore'
  ],
  manager: [
    // Can do most things except user management and critical settings
    'sales:create',
    'sales:void',
    'sales:refund',
    'sales:view_all',
    'inventory:view',
    'inventory:create',
    'inventory:update',
    'inventory:delete',
    'inventory:import_export',
    'reports:view',
    'reports:generate',
    'shifts:manage',
    'users:view',
    'backup:create'
  ],
  cashier: [
    // Basic sales operations only
    'sales:create',
    'sales:view_all',
    'inventory:view',
    'shifts:manage'
  ]
}

/**
 * Check if a role has a specific permission
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) || false
}

/**
 * Get all permissions for a role
 */
export function getRolePermissions(role: Role): Permission[] {
  return ROLE_PERMISSIONS[role] || []
}

/**
 * Check if user can perform action (middleware-style)
 */
export function requirePermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new Error(`Permission denied: ${permission}`)
  }
}

/**
 * Get permission description for UI display
 */
export function getPermissionDescription(permission: Permission): string {
  const descriptions: Record<Permission, string> = {
    'sales:create': 'Create new sales',
    'sales:void': 'Void sales transactions',
    'sales:refund': 'Process refunds',
    'sales:view_all': 'View all sales history',
    'inventory:view': 'View inventory',
    'inventory:create': 'Add new products',
    'inventory:update': 'Update product information',
    'inventory:delete': 'Delete products',
    'inventory:import_export': 'Import/export inventory data',
    'reports:view': 'View reports',
    'reports:generate': 'Generate new reports',
    'shifts:manage': 'Open and close shifts',
    'users:view': 'View user list',
    'users:create': 'Create new users',
    'users:update': 'Update user information',
    'users:delete': 'Delete/deactivate users',
    'settings:view': 'View system settings',
    'settings:update': 'Modify system settings',
    'backup:create': 'Create backups',
    'backup:restore': 'Restore from backups'
  }

  return descriptions[permission] || permission
}
```

**Step 4: Commit**

```bash
git add src/main/services/users/user-management.ts src/main/services/users/permissions.ts package.json package-lock.json
git commit -m "feat: add user management and RBAC services"
```

---

### Task 6: Create User Management IPC Handlers

**Files:**
- Modify: `src/main/ipc/channels.ts:115-135`
- Create: `src/main/ipc/user-handlers.ts`
- Modify: `src/main/ipc/handlers.ts:25,45`

**Step 1: Add user management channels**

```typescript
// Add to src/main/ipc/channels.ts
export const IPC_CHANNELS = {
  // ... existing channels ...

  // Users - Management
  USER_LIST: 'user:list',
  USER_GET: 'user:get',
  USER_CREATE: 'user:create',
  USER_UPDATE: 'user:update',
  USER_DELETE: 'user:delete',
  USER_CHANGE_PASSWORD: 'user:change-password',
  USER_VERIFY_PASSWORD: 'user:verify-password',
  USER_VERIFY_PIN: 'user:verify-pin',
  USER_STATS: 'user:stats',

  // Users - Permissions
  USER_CHECK_PERMISSION: 'user:check-permission',
  USER_GET_PERMISSIONS: 'user:get-permissions'
} as const
```

**Step 2: Create user handlers**

```typescript
// src/main/ipc/user-handlers.ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  changeUserPassword,
  verifyUserPassword,
  verifyPinCode,
  deactivateUser,
  reactivateUser,
  getUserStats
} from '../services/users/user-management'
import {
  hasPermission,
  getRolePermissions,
  type Permission,
  type Role
} from '../services/users/permissions'

export function registerUserHandlers(): void {
  // User management
  ipcMain.handle(IPC_CHANNELS.USER_LIST, () => {
    return listUsers()
  })

  ipcMain.handle(IPC_CHANNELS.USER_GET, (_event, id: string) => {
    return getUserById(id)
  })

  ipcMain.handle(IPC_CHANNELS.USER_CREATE, async (_event, data) => {
    return await createUser(data)
  })

  ipcMain.handle(IPC_CHANNELS.USER_UPDATE, (_event, { id, data }) => {
    updateUser(id, data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.USER_DELETE, (_event, { id, reactivate }) => {
    if (reactivate) {
      reactivateUser(id)
    } else {
      deactivateUser(id)
    }
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.USER_CHANGE_PASSWORD, async (_event, { id, password }) => {
    await changeUserPassword(id, password)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.USER_VERIFY_PASSWORD, async (_event, { username, password }) => {
    return await verifyUserPassword(username, password)
  })

  ipcMain.handle(IPC_CHANNELS.USER_VERIFY_PIN, (_event, pin: string) => {
    return verifyPinCode(pin)
  })

  ipcMain.handle(IPC_CHANNELS.USER_STATS, () => {
    return getUserStats()
  })

  // Permissions
  ipcMain.handle(
    IPC_CHANNELS.USER_CHECK_PERMISSION,
    (_event, { role, permission }: { role: Role; permission: Permission }) => {
      return hasPermission(role, permission)
    }
  )

  ipcMain.handle(IPC_CHANNELS.USER_GET_PERMISSIONS, (_event, role: Role) => {
    return getRolePermissions(role)
  })
}
```

**Step 3: Register in main handlers**

```typescript
// Add to src/main/ipc/handlers.ts
import { registerUserHandlers } from './user-handlers'

export function registerHandlers(): void {
  // ... existing
  registerUserHandlers()
}
```

**Step 4: Update preload API**

```typescript
// Add to src/preload/index.ts
users: {
  list: () => ipcRenderer.invoke(IPC_CHANNELS.USER_LIST),
  get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.USER_GET, id),
  create: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.USER_CREATE, data),
  update: (id: string, data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.USER_UPDATE, { id, data }),
  delete: (id: string, reactivate?: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_DELETE, { id, reactivate }),
  changePassword: (id: string, password: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_CHANGE_PASSWORD, { id, password }),
  verifyPassword: (username: string, password: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_VERIFY_PASSWORD, { username, password }),
  verifyPin: (pin: string) => ipcRenderer.invoke(IPC_CHANNELS.USER_VERIFY_PIN, pin),
  stats: () => ipcRenderer.invoke(IPC_CHANNELS.USER_STATS),

  checkPermission: (role: string, permission: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.USER_CHECK_PERMISSION, { role, permission }),
  getPermissions: (role: string) => ipcRenderer.invoke(IPC_CHANNELS.USER_GET_PERMISSIONS, role)
}
```

**Step 5: Commit**

```bash
git add src/main/ipc/channels.ts src/main/ipc/user-handlers.ts src/main/ipc/handlers.ts src/preload/index.ts
git commit -m "feat: add user management IPC handlers"
```

---

### Task 7: Create User Management UI

**Files:**
- Create: `src/renderer/src/pages/UsersPage.tsx`
- Create: `src/renderer/src/components/users/UsersTable.tsx`
- Create: `src/renderer/src/components/users/UserFormModal.tsx`

**Step 1: Create users page**

```typescript
// src/renderer/src/pages/UsersPage.tsx
import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Plus, RefreshCw, Users as UsersIcon } from 'lucide-react'
import { UsersTable } from '@renderer/components/users/UsersTable'
import { UserFormModal } from '@renderer/components/users/UserFormModal'

export interface User {
  id: string
  username: string
  full_name: string
  role: 'admin' | 'manager' | 'cashier'
  pin_code: string | null
  is_active: number
  created_at: string
  updated_at: string
}

export function UsersPage(): React.JSX.Element {
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const [userList, userStats] = await Promise.all([
        window.electron.users.list(),
        window.electron.users.stats()
      ])
      setUsers(userList)
      setStats(userStats)
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [])

  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage users and permissions</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadUsers} disabled={isLoading} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            onClick={() => {
              setEditingUser(null)
              setShowFormModal(true)
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      {stats && (
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Admins</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byRole?.admin || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Cashiers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byRole?.cashier || 0}</div>
            </CardContent>
          </Card>
        </div>
      )}

      <UsersTable
        users={users}
        onEdit={(user) => {
          setEditingUser(user)
          setShowFormModal(true)
        }}
        onRefresh={loadUsers}
      />

      <UserFormModal
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        user={editingUser}
        onSuccess={loadUsers}
      />
    </div>
  )
}
```

**Step 2: Create users table (simplified - actual implementation would be similar to inventory tables)**

```typescript
// src/renderer/src/components/users/UsersTable.tsx
import { Card, CardContent } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Pencil, UserX, UserCheck, Key } from 'lucide-react'
import type { User } from '@renderer/pages/UsersPage'

interface UsersTableProps {
  users: User[]
  onEdit: (user: User) => void
  onRefresh: () => void
}

export function UsersTable({ users, onEdit, onRefresh }: UsersTableProps): React.JSX.Element {
  const handleToggleActive = async (user: User) => {
    const action = user.is_active ? 'deactivate' : 'reactivate'
    if (confirm(`Are you sure you want to ${action} ${user.full_name}?`)) {
      await window.electron.users.delete(user.id, !user.is_active)
      onRefresh()
    }
  }

  const handleChangePassword = async (user: User) => {
    const newPassword = prompt(`Enter new password for ${user.full_name}:`)
    if (newPassword) {
      await window.electron.users.changePassword(user.id, newPassword)
      alert('Password changed successfully')
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className={`flex items-center justify-between p-4 rounded-lg border ${
                user.is_active ? '' : 'bg-muted/50'
              }`}
            >
              <div className="flex-1">
                <p className="font-medium">{user.full_name}</p>
                <p className="text-sm text-muted-foreground">
                  @{user.username} • {user.role}
                  {user.pin_code && ' • PIN set'}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="icon" onClick={() => onEdit(user)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleChangePassword(user)}>
                  <Key className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleToggleActive(user)}
                  className={user.is_active ? 'text-destructive' : 'text-green-600'}
                >
                  {user.is_active ? (
                    <UserX className="h-4 w-4" />
                  ) : (
                    <UserCheck className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 3: Create user form modal (simplified)**

```typescript
// src/renderer/src/components/users/UserFormModal.tsx
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import type { User } from '@renderer/pages/UsersPage'

interface UserFormModalProps {
  open: boolean
  onClose: () => void
  user?: User | null
  onSuccess: () => void
}

export function UserFormModal({ open, onClose, user, onSuccess }: UserFormModalProps): React.JSX.Element {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'cashier' as 'admin' | 'manager' | 'cashier',
    pin_code: ''
  })

  useEffect(() => {
    if (user) {
      setFormData({
        username: user.username,
        password: '',
        full_name: user.full_name,
        role: user.role,
        pin_code: user.pin_code || ''
      })
    } else {
      setFormData({
        username: '',
        password: '',
        full_name: '',
        role: 'cashier',
        pin_code: ''
      })
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (user) {
        await window.electron.users.update(user.id, {
          full_name: formData.full_name,
          role: formData.role,
          pin_code: formData.pin_code || null
        })
      } else {
        await window.electron.users.create(formData)
      }
      onSuccess()
      onClose()
    } catch (error: any) {
      alert(error.message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? 'Edit User' : 'Create User'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              disabled={!!user}
              required
            />
          </div>

          {!user && (
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>
          )}

          <div>
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              required
            />
          </div>

          <div>
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              value={formData.role}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  role: e.target.value as 'admin' | 'manager' | 'cashier'
                })
              }
              className="w-full border rounded-md px-3 py-2"
            >
              <option value="cashier">Cashier</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div>
            <Label htmlFor="pin_code">PIN Code (optional)</Label>
            <Input
              id="pin_code"
              type="password"
              maxLength={6}
              value={formData.pin_code}
              onChange={(e) => setFormData({ ...formData, pin_code: e.target.value })}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{user ? 'Update' : 'Create'} User</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 4: Add route to App.tsx**

```typescript
// Add to src/renderer/src/App.tsx
import { UsersPage } from './pages/UsersPage'

// Add route:
<Route path="/users" element={<UsersPage />} />
```

**Step 5: Commit**

```bash
git add src/renderer/src/pages/UsersPage.tsx src/renderer/src/components/users/UsersTable.tsx src/renderer/src/components/users/UserFormModal.tsx src/renderer/src/App.tsx
git commit -m "feat: add user management UI"
```

---

## Part 2 Complete - User Management

Tasks 5-7 build user management features:
- ✅ User management service with bcrypt
- ✅ Role-based permissions system
- ✅ User management IPC handlers
- ✅ User management UI (list, create, edit, deactivate)

---

## Part 3: Printer Setup & Configuration

### Task 8: Create Printer Service

**Files:**
- Create: `src/main/services/printer/thermal-printer.ts`
- Create: `src/main/services/printer/receipt-formatter.ts`

**Step 1: Install thermal printer library**

Run: `npm install node-thermal-printer @types/node-thermal-printer`

**Step 2: Create thermal printer service**

```typescript
// src/main/services/printer/thermal-printer.ts
import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer'
import { getDatabase } from '../../db'

let printer: ThermalPrinter | null = null

export interface PrinterConfig {
  type: 'epson' | 'star' | 'generic'
  interface: 'tcp' | 'usb' | 'serial'
  path?: string
  ip?: string
  port?: number
  characterSet?: string
  removeSpecialCharacters?: boolean
  lineCharacter?: string
  width?: number
}

/**
 * Initialize printer with configuration
 */
export function initializePrinter(config?: PrinterConfig): ThermalPrinter {
  const db = getDatabase()

  // Load config from database if not provided
  if (!config) {
    const settings = {
      type: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_type') as
        | { value: string }
        | undefined,
      interface: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_interface') as
        | { value: string }
        | undefined,
      path: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_path') as
        | { value: string }
        | undefined,
      ip: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_ip') as
        | { value: string }
        | undefined,
      port: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_port') as
        | { value: string }
        | undefined,
      width: db.prepare('SELECT value FROM settings WHERE key = ?').get('printer_width') as
        | { value: string }
        | undefined
    }

    config = {
      type: (settings.type?.value as 'epson' | 'star' | 'generic') || 'epson',
      interface: (settings.interface?.value as 'tcp' | 'usb' | 'serial') || 'usb',
      path: settings.path?.value,
      ip: settings.ip?.value,
      port: settings.port?.value ? parseInt(settings.port.value) : 9100,
      width: settings.width?.value ? parseInt(settings.width.value) : 48
    }
  }

  // Map printer types
  let printerType: PrinterTypes
  switch (config.type) {
    case 'epson':
      printerType = PrinterTypes.EPSON
      break
    case 'star':
      printerType = PrinterTypes.STAR
      break
    default:
      printerType = PrinterTypes.EPSON
  }

  // Create printer instance
  const printerConfig: any = {
    type: printerType,
    characterSet: config.characterSet || 'SLOVENIA',
    removeSpecialCharacters: config.removeSpecialCharacters ?? false,
    lineCharacter: config.lineCharacter || '=',
    width: config.width || 48
  }

  if (config.interface === 'tcp' && config.ip) {
    printerConfig.interface = 'tcp'
    printerConfig.options = {
      host: config.ip,
      port: config.port || 9100,
      timeout: 3000
    }
  } else if (config.interface === 'usb' && config.path) {
    printerConfig.interface = 'printer:' + config.path
  } else if (config.interface === 'serial' && config.path) {
    printerConfig.interface = config.path
  }

  printer = new ThermalPrinter(printerConfig)
  return printer
}

/**
 * Get current printer instance
 */
export function getPrinter(): ThermalPrinter {
  if (!printer) {
    printer = initializePrinter()
  }
  return printer
}

/**
 * Save printer configuration to database
 */
export function savePrinterConfig(config: PrinterConfig): void {
  const db = getDatabase()

  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'printer_type',
    config.type
  )
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'printer_interface',
    config.interface
  )

  if (config.path) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'printer_path',
      config.path
    )
  }

  if (config.ip) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'printer_ip',
      config.ip
    )
  }

  if (config.port) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'printer_port',
      config.port.toString()
    )
  }

  if (config.width) {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      'printer_width',
      config.width.toString()
    )
  }

  // Reinitialize printer with new config
  initializePrinter(config)
}

/**
 * Test printer connection
 */
export async function testPrinter(): Promise<boolean> {
  try {
    const p = getPrinter()

    p.alignCenter()
    p.setTextSize(1, 1)
    p.bold(true)
    p.println('PRINTER TEST')
    p.bold(false)
    p.drawLine()
    p.alignLeft()
    p.println('If you can read this,')
    p.println('your printer is working!')
    p.drawLine()
    p.newLine()
    p.cut()

    await p.execute()
    return true
  } catch (error) {
    console.error('Printer test failed:', error)
    return false
  }
}

/**
 * Open cash drawer (if connected)
 */
export async function openCashDrawer(): Promise<void> {
  const p = getPrinter()
  p.openCashDrawer()
  await p.execute()
}

/**
 * List available USB printers
 */
export async function listUSBPrinters(): Promise<Array<{ name: string; path: string }>> {
  // This is platform-specific and would require additional native modules
  // For now, return common USB printer paths
  const commonPaths = [
    '/dev/usb/lp0',
    '/dev/usb/lp1',
    'COM1',
    'COM2',
    'COM3',
    'LPT1'
  ]

  return commonPaths.map((path) => ({
    name: `USB Printer (${path})`,
    path
  }))
}
```

**Step 3: Create receipt formatter**

```typescript
// src/main/services/printer/receipt-formatter.ts
import { ThermalPrinter } from 'node-thermal-printer'
import { getDatabase } from '../../db'

export interface ReceiptData {
  sale: {
    id: string
    receipt_number: string
    created_at: string
    subtotal: number
    tax_amount: number
    discount_amount: number
    total: number
    payment_method: string
    cash_received: number
    change_given: number
    customer_name?: string
  }
  items: Array<{
    product_name: string
    quantity: number
    unit_price: number
    line_total: number
  }>
  user: {
    full_name: string
  }
}

/**
 * Format and print receipt
 */
export async function printReceipt(printer: ThermalPrinter, data: ReceiptData): Promise<void> {
  const db = getDatabase()

  // Get business settings
  const settings = {
    name: db.prepare('SELECT value FROM settings WHERE key = ?').get('business_name') as
      | { value: string }
      | undefined,
    address: db.prepare('SELECT value FROM settings WHERE key = ?').get('business_address') as
      | { value: string }
      | undefined,
    phone: db.prepare('SELECT value FROM settings WHERE key = ?').get('business_phone') as
      | { value: string }
      | undefined,
    footer: db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt_footer') as
      | { value: string }
      | undefined,
    currency: db.prepare('SELECT value FROM settings WHERE key = ?').get('currency_symbol') as
      | { value: string }
      | undefined
  }

  const currency = settings.currency?.value || 'Rs.'

  // Header
  printer.alignCenter()
  printer.setTextSize(1, 1)
  printer.bold(true)
  printer.println(settings.name?.value || 'PharmaPOS')
  printer.bold(false)
  printer.setTextSize(0, 0)

  if (settings.address?.value) {
    printer.println(settings.address.value)
  }
  if (settings.phone?.value) {
    printer.println(`Tel: ${settings.phone.value}`)
  }

  printer.drawLine()

  // Receipt info
  printer.alignLeft()
  printer.println(`Receipt: ${data.sale.receipt_number}`)
  printer.println(`Date: ${new Date(data.sale.created_at).toLocaleString()}`)
  printer.println(`Cashier: ${data.user.full_name}`)

  if (data.sale.customer_name) {
    printer.println(`Customer: ${data.sale.customer_name}`)
  }

  printer.drawLine()

  // Items
  printer.bold(true)
  printer.tableCustom([
    { text: 'Item', align: 'LEFT', width: 0.5 },
    { text: 'Qty', align: 'CENTER', width: 0.15 },
    { text: 'Price', align: 'RIGHT', width: 0.2 },
    { text: 'Total', align: 'RIGHT', width: 0.15 }
  ])
  printer.bold(false)

  data.items.forEach((item) => {
    printer.tableCustom([
      { text: item.product_name, align: 'LEFT', width: 0.5 },
      { text: item.quantity.toString(), align: 'CENTER', width: 0.15 },
      { text: `${currency}${item.unit_price.toFixed(2)}`, align: 'RIGHT', width: 0.2 },
      { text: `${currency}${item.line_total.toFixed(2)}`, align: 'RIGHT', width: 0.15 }
    ])
  })

  printer.drawLine()

  // Totals
  printer.tableCustom([
    { text: 'Subtotal:', align: 'LEFT', width: 0.7 },
    { text: `${currency}${data.sale.subtotal.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
  ])

  if (data.sale.discount_amount > 0) {
    printer.tableCustom([
      { text: 'Discount:', align: 'LEFT', width: 0.7 },
      { text: `-${currency}${data.sale.discount_amount.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
    ])
  }

  if (data.sale.tax_amount > 0) {
    printer.tableCustom([
      { text: 'Tax:', align: 'LEFT', width: 0.7 },
      { text: `${currency}${data.sale.tax_amount.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
    ])
  }

  printer.drawLine()

  printer.bold(true)
  printer.setTextSize(1, 1)
  printer.tableCustom([
    { text: 'TOTAL:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${data.sale.total.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])
  printer.setTextSize(0, 0)
  printer.bold(false)

  printer.drawLine()

  // Payment info
  if (data.sale.payment_method === 'cash') {
    printer.tableCustom([
      { text: 'Cash:', align: 'LEFT', width: 0.7 },
      { text: `${currency}${data.sale.cash_received.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
    ])
    printer.tableCustom([
      { text: 'Change:', align: 'LEFT', width: 0.7 },
      { text: `${currency}${data.sale.change_given.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
    ])
  } else if (data.sale.payment_method === 'card') {
    printer.println('Payment: CARD')
  } else if (data.sale.payment_method === 'mixed') {
    printer.println(`Cash: ${currency}${data.sale.cash_received.toFixed(2)}`)
    printer.println(`Card: ${currency}${data.sale.card_received.toFixed(2)}`)
  }

  printer.drawLine()

  // Footer
  printer.alignCenter()
  if (settings.footer?.value) {
    printer.println(settings.footer.value)
  }
  printer.println('Powered by PharmaPOS')

  printer.newLine()
  printer.newLine()
  printer.cut()

  await printer.execute()
}

/**
 * Print shift report
 */
export async function printShiftReport(
  printer: ThermalPrinter,
  shiftData: {
    shift_id: string
    user_name: string
    started_at: string
    ended_at: string
    opening_cash: number
    closing_cash: number
    expected_cash: number
    total_sales: number
    cash_sales: number
    card_sales: number
    transaction_count: number
  }
): Promise<void> {
  const db = getDatabase()
  const currency =
    (
      db.prepare('SELECT value FROM settings WHERE key = ?').get('currency_symbol') as
        | { value: string }
        | undefined
    )?.value || 'Rs.'

  printer.alignCenter()
  printer.setTextSize(1, 1)
  printer.bold(true)
  printer.println('SHIFT REPORT')
  printer.bold(false)
  printer.setTextSize(0, 0)
  printer.drawLine()

  printer.alignLeft()
  printer.println(`Cashier: ${shiftData.user_name}`)
  printer.println(`Started: ${new Date(shiftData.started_at).toLocaleString()}`)
  printer.println(`Ended: ${new Date(shiftData.ended_at).toLocaleString()}`)
  printer.drawLine()

  printer.println('CASH SUMMARY')
  printer.tableCustom([
    { text: 'Opening Cash:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.opening_cash.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])
  printer.tableCustom([
    { text: 'Expected Cash:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.expected_cash.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])
  printer.tableCustom([
    { text: 'Actual Cash:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.closing_cash.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])

  const difference = shiftData.closing_cash - shiftData.expected_cash
  printer.bold(true)
  printer.tableCustom([
    { text: 'Difference:', align: 'LEFT', width: 0.6 },
    {
      text: `${currency}${Math.abs(difference).toFixed(2)} ${difference >= 0 ? 'OVER' : 'SHORT'}`,
      align: 'RIGHT',
      width: 0.4
    }
  ])
  printer.bold(false)

  printer.drawLine()

  printer.println('SALES SUMMARY')
  printer.tableCustom([
    { text: 'Transactions:', align: 'LEFT', width: 0.6 },
    { text: shiftData.transaction_count.toString(), align: 'RIGHT', width: 0.4 }
  ])
  printer.tableCustom([
    { text: 'Total Sales:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.total_sales.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])
  printer.tableCustom([
    { text: 'Cash Sales:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.cash_sales.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])
  printer.tableCustom([
    { text: 'Card Sales:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.card_sales.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])

  printer.drawLine()
  printer.alignCenter()
  printer.println('End of Shift Report')
  printer.newLine()
  printer.newLine()
  printer.cut()

  await printer.execute()
}
```

**Step 4: Commit**

```bash
git add src/main/services/printer/thermal-printer.ts src/main/services/printer/receipt-formatter.ts package.json package-lock.json
git commit -m "feat: add thermal printer service and receipt formatter"
```

---

### Task 9: Create Printer IPC Handlers

**Files:**
- Modify: `src/main/ipc/channels.ts:140-155`
- Create: `src/main/ipc/printer-handlers.ts`
- Modify: `src/main/ipc/handlers.ts:30,50`

**Step 1: Add printer channels**

```typescript
// Add to src/main/ipc/channels.ts
export const IPC_CHANNELS = {
  // ... existing channels ...

  // Printer
  PRINTER_INITIALIZE: 'printer:initialize',
  PRINTER_TEST: 'printer:test',
  PRINTER_SAVE_CONFIG: 'printer:save-config',
  PRINTER_LIST_USB: 'printer:list-usb',
  PRINTER_PRINT_RECEIPT: 'printer:print-receipt',
  PRINTER_PRINT_SHIFT_REPORT: 'printer:print-shift-report',
  PRINTER_OPEN_DRAWER: 'printer:open-drawer'
} as const
```

**Step 2: Create printer handlers**

```typescript
// src/main/ipc/printer-handlers.ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  initializePrinter,
  savePrinterConfig,
  testPrinter,
  openCashDrawer,
  listUSBPrinters,
  getPrinter,
  type PrinterConfig
} from '../services/printer/thermal-printer'
import { printReceipt, printShiftReport } from '../services/printer/receipt-formatter'

export function registerPrinterHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.PRINTER_INITIALIZE, (_event, config?: PrinterConfig) => {
    initializePrinter(config)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_TEST, async () => {
    return await testPrinter()
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_SAVE_CONFIG, (_event, config: PrinterConfig) => {
    savePrinterConfig(config)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_LIST_USB, async () => {
    return await listUSBPrinters()
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_PRINT_RECEIPT, async (_event, data) => {
    const printer = getPrinter()
    await printReceipt(printer, data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_PRINT_SHIFT_REPORT, async (_event, data) => {
    const printer = getPrinter()
    await printShiftReport(printer, data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PRINTER_OPEN_DRAWER, async () => {
    await openCashDrawer()
    return { success: true }
  })
}
```

**Step 3: Register in main handlers**

```typescript
// Add to src/main/ipc/handlers.ts
import { registerPrinterHandlers } from './printer-handlers'

export function registerHandlers(): void {
  // ... existing
  registerPrinterHandlers()
}
```

**Step 4: Update preload API**

```typescript
// Add to src/preload/index.ts
printer: {
  initialize: (config?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_INITIALIZE, config),
  test: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_TEST),
  saveConfig: (config: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_SAVE_CONFIG, config),
  listUSB: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_LIST_USB),
  printReceipt: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_PRINT_RECEIPT, data),
  printShiftReport: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_PRINT_SHIFT_REPORT, data),
  openDrawer: () => ipcRenderer.invoke(IPC_CHANNELS.PRINTER_OPEN_DRAWER)
}
```

**Step 5: Commit**

```bash
git add src/main/ipc/channels.ts src/main/ipc/printer-handlers.ts src/main/ipc/handlers.ts src/preload/index.ts
git commit -m "feat: add printer IPC handlers"
```

---

### Task 10: Create Printer Setup Wizard UI

**Files:**
- Create: `src/renderer/src/pages/SettingsPage.tsx`
- Create: `src/renderer/src/components/settings/PrinterSetupWizard.tsx`

**Step 1: Create settings page**

```typescript
// src/renderer/src/pages/SettingsPage.tsx
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { PrinterSetupWizard } from '@renderer/components/settings/PrinterSetupWizard'
import { Printer, Database, Users, Sparkles } from 'lucide-react'

export function SettingsPage(): React.JSX.Element {
  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure system settings and preferences</p>
      </div>

      <Tabs defaultValue="printer" className="flex-1">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="printer">Printer</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
        </TabsList>

        <TabsContent value="printer" className="space-y-6">
          <PrinterSetupWizard />
        </TabsContent>

        <TabsContent value="business" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
              <CardDescription>Update your business details for receipts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Business settings will be added here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backup" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Backup Settings</CardTitle>
              <CardDescription>Configure automatic backups</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">Backup settings will be added here</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>AI Configuration</CardTitle>
              <CardDescription>Set up Gemini API for AI insights</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">AI settings will be added here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

**Step 2: Create printer setup wizard**

```typescript
// src/renderer/src/components/settings/PrinterSetupWizard.tsx
import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { CheckCircle2, XCircle, Printer } from 'lucide-react'

export function PrinterSetupWizard(): React.JSX.Element {
  const [step, setStep] = useState(1)
  const [config, setConfig] = useState({
    type: 'epson' as 'epson' | 'star' | 'generic',
    interface: 'usb' as 'tcp' | 'usb' | 'serial',
    path: '',
    ip: '',
    port: 9100,
    width: 48
  })
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleTestPrinter = async () => {
    setIsLoading(true)
    setTestResult(null)

    try {
      // Initialize with current config
      await window.electron.printer.initialize(config)

      // Test print
      const result = await window.electron.printer.test()
      setTestResult(result)

      if (result) {
        setTimeout(() => setStep(3), 1500)
      }
    } catch (error: any) {
      setTestResult(false)
      alert(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveConfig = async () => {
    setIsLoading(true)
    try {
      await window.electron.printer.saveConfig(config)
      alert('Printer configuration saved successfully!')
      setStep(1)
    } catch (error: any) {
      alert(error.message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          <CardTitle>Printer Setup Wizard</CardTitle>
        </div>
        <CardDescription>Configure your thermal receipt printer</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1: Choose Printer Type */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="printer-type">Printer Type</Label>
              <select
                id="printer-type"
                value={config.type}
                onChange={(e) => setConfig({ ...config, type: e.target.value as any })}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="epson">Epson (ESC/POS)</option>
                <option value="star">Star Micronics</option>
                <option value="generic">Generic (ESC/POS)</option>
              </select>
            </div>

            <div>
              <Label htmlFor="printer-interface">Connection Type</Label>
              <select
                id="printer-interface"
                value={config.interface}
                onChange={(e) => setConfig({ ...config, interface: e.target.value as any })}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="usb">USB</option>
                <option value="tcp">Network (TCP/IP)</option>
                <option value="serial">Serial Port</option>
              </select>
            </div>

            {config.interface === 'usb' && (
              <div>
                <Label htmlFor="printer-path">USB Path</Label>
                <Input
                  id="printer-path"
                  value={config.path}
                  onChange={(e) => setConfig({ ...config, path: e.target.value })}
                  placeholder="/dev/usb/lp0 or COM1"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Common: /dev/usb/lp0 (Linux), COM1 (Windows), /dev/tty.usbserial (Mac)
                </p>
              </div>
            )}

            {config.interface === 'tcp' && (
              <>
                <div>
                  <Label htmlFor="printer-ip">IP Address</Label>
                  <Input
                    id="printer-ip"
                    value={config.ip}
                    onChange={(e) => setConfig({ ...config, ip: e.target.value })}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div>
                  <Label htmlFor="printer-port">Port</Label>
                  <Input
                    id="printer-port"
                    type="number"
                    value={config.port}
                    onChange={(e) => setConfig({ ...config, port: parseInt(e.target.value) })}
                  />
                </div>
              </>
            )}

            {config.interface === 'serial' && (
              <div>
                <Label htmlFor="printer-serial">Serial Port</Label>
                <Input
                  id="printer-serial"
                  value={config.path}
                  onChange={(e) => setConfig({ ...config, path: e.target.value })}
                  placeholder="/dev/ttyS0 or COM1"
                />
              </div>
            )}

            <div>
              <Label htmlFor="printer-width">Receipt Width (characters)</Label>
              <Input
                id="printer-width"
                type="number"
                value={config.width}
                onChange={(e) => setConfig({ ...config, width: parseInt(e.target.value) })}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Common: 32 (58mm), 42 (76mm), 48 (80mm)
              </p>
            </div>

            <Button onClick={() => setStep(2)} className="w-full">
              Next: Test Printer
            </Button>
          </div>
        )}

        {/* Step 2: Test Printer */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="text-center py-8">
              {testResult === null && !isLoading && (
                <>
                  <Printer className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-lg font-medium mb-2">Ready to test printer</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    Click the button below to print a test page
                  </p>
                  <Button onClick={handleTestPrinter} size="lg">
                    Print Test Page
                  </Button>
                </>
              )}

              {isLoading && (
                <>
                  <div className="animate-spin h-16 w-16 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4" />
                  <p className="text-lg font-medium">Testing printer...</p>
                </>
              )}

              {testResult === true && (
                <>
                  <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-600" />
                  <p className="text-lg font-medium text-green-600 mb-2">Test successful!</p>
                  <p className="text-sm text-muted-foreground">
                    Proceeding to save configuration...
                  </p>
                </>
              )}

              {testResult === false && (
                <>
                  <XCircle className="h-16 w-16 mx-auto mb-4 text-destructive" />
                  <p className="text-lg font-medium text-destructive mb-2">Test failed</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    Please check your printer connection and settings
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" onClick={() => setStep(1)}>
                      Back to Settings
                    </Button>
                    <Button onClick={handleTestPrinter}>Try Again</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Save Configuration */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="text-center py-8">
              <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-600" />
              <p className="text-lg font-medium mb-2">Printer configured successfully!</p>
              <p className="text-sm text-muted-foreground mb-6">
                Save this configuration to use it for all receipts
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Configure Another
                </Button>
                <Button onClick={handleSaveConfig} disabled={isLoading}>
                  Save Configuration
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

**Step 3: Add route to App.tsx**

```typescript
// Add to src/renderer/src/App.tsx
import { SettingsPage } from './pages/SettingsPage'

// Add route:
<Route path="/settings" element={<SettingsPage />} />
```

**Step 4: Commit**

```bash
git add src/renderer/src/pages/SettingsPage.tsx src/renderer/src/components/settings/PrinterSetupWizard.tsx src/renderer/src/App.tsx
git commit -m "feat: add printer setup wizard UI"
```

---

## Part 3 Complete - Printer Setup

Tasks 8-10 build printer capabilities:
- ✅ Thermal printer service with node-thermal-printer
- ✅ Receipt formatter for sales and shift reports
- ✅ Printer IPC handlers
- ✅ Printer setup wizard UI

---

## Phase 5 Complete - Summary

**Total Tasks:** 10
**Backup System:** Tasks 1-4
**User Management:** Tasks 5-7
**Printer Setup:** Tasks 8-10

**What We Built:**
- Encrypted database backup system
- Google Drive integration for cloud backups
- Automatic backup scheduler
- Comprehensive user management with bcrypt
- Role-based access control (RBAC)
- Thermal receipt printer integration
- Printer setup wizard
- Receipt and shift report formatting

**Tech Stack Used:**
- googleapis (Google Drive API)
- bcrypt (password hashing)
- node-thermal-printer (receipt printing)
- archiver/extract-zip (backup compression)
- node-schedule (task scheduling)
- crypto (encryption)

**Key Features:**
- AES-256-GCM encrypted backups
- Auto-backup scheduling (daily/weekly/monthly)
- Role-based permissions (admin/manager/cashier)
- USB/Network thermal printer support
- Test printing and cash drawer control
- Multi-format receipt printing

**Security Highlights:**
- Password hashing with bcrypt (10 rounds)
- PBKDF2 key derivation for encryption
- PIN code support for quick login
- Role-based permission checks
- Soft delete for user deactivation

**Ready For:**
- Production deployment
- Final testing and QA
- User training and documentation

---

_Plan completed: 2025-02-02_
