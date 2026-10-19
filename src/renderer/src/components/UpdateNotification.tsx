import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Alert, AlertDescription, AlertTitle } from './ui/alert'
import { Download, RefreshCw, AlertTriangle, RotateCw } from 'lucide-react'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { useConfirm } from '@renderer/hooks/useConfirm'

interface UpdateInfo {
  version: string
  releaseNotes?: string
}

interface DownloadProgress {
  percent: number
  transferred: number
  total: number
  bytesPerSecond: number
}

export function UpdateNotification(): React.JSX.Element | null {
  const [updateAvailable, setUpdateAvailable] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null)
  const [updateDownloaded, setUpdateDownloaded] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const { confirm, confirmProps } = useConfirm()

  useEffect(() => {
    // Listen for update events
    const handleUpdateStatus = (
      _event: unknown,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- payload shape differs per event
      status: { event: string; data: any }
    ): void => {
      switch (status.event) {
        case 'update-available':
          // Squirrel starts downloading as soon as it finds an update, so this
          // means "downloading", not "ready to download".
          setUpdateAvailable(true)
          setUpdateInfo(status.data)
          setUpdateError('')
          setDownloading(true)
          break

        case 'download-progress':
          setDownloading(true)
          setDownloadProgress(status.data)
          break

        case 'update-downloaded':
          setDownloading(false)
          setUpdateDownloaded(true)
          break

        case 'update-error':
          // Shown inside the card, not as an alert(): a modal that steals focus
          // mid-transaction over a failed background download is worse than the
          // failure itself, and the till can carry on running the old version.
          setDownloading(false)
          setUpdateError(status.data?.message || 'The update could not be downloaded.')
          break
      }
    }

    window.electron.ipcRenderer.on('update-status', handleUpdateStatus)

    return () => {
      window.electron.ipcRenderer.removeListener('update-status', handleUpdateStatus)
    }
  }, [])

  const handleDownload = (): void => {
    window.electron.updates.download()
  }

  const handleInstall = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Restart now to install the update?',
      description:
        'The till closes immediately. Finish or cancel the sale on screen first — anything in the cart is lost, and an open shift stays open until you close it after the restart.',
      confirmLabel: 'Restart and install'
    })
    if (ok) window.electron.updates.install()
  }

  if (!updateAvailable && !updateError) {
    return null
  }

  return (
    <div className="fixed right-4 bottom-4 z-50 w-[min(24rem,calc(100vw-2rem))]">
      <Card className="rounded-2xl shadow-lg ring-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-semibold">
            <span className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <RefreshCw className={downloading ? 'size-5 animate-spin' : 'size-5'} />
            </span>
            {updateAvailable ? 'Update Available' : 'Update'}
          </CardTitle>
          <CardDescription className="text-base">
            {updateDownloaded
              ? updateInfo?.version
                ? `Version ${updateInfo.version} is ready to install`
                : 'A new version is ready to install'
              : downloading
                ? 'Downloading a new version in the background'
                : 'A new version is available'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {updateError && (
            <Alert variant="destructive" className="bg-destructive/10">
              <AlertTriangle />
              <AlertTitle>Update failed</AlertTitle>
              <AlertDescription>
                <p className="break-words">{updateError}</p>
                <p className="mt-1 text-muted-foreground">
                  The till keeps working on the current version.
                </p>
              </AlertDescription>
            </Alert>
          )}
          {!updateDownloaded ? (
            <>
              {downloading && downloadProgress ? (
                <div className="space-y-2">
                  <Progress value={downloadProgress.percent} />
                  <p className="text-center text-sm text-muted-foreground tabular-nums">
                    {downloadProgress.percent.toFixed(0)}% -{' '}
                    {formatBytes(downloadProgress.bytesPerSecond)}/s
                  </p>
                </div>
              ) : downloading ? (
                // Squirrel reports no progress. Offering "Download Update" here
                // only started a second check while the first was downloading.
                <p className="text-base text-muted-foreground">
                  Downloading… you can keep using the till.
                </p>
              ) : (
                <Button
                  size="lg"
                  onClick={() => {
                    setUpdateError('')
                    handleDownload()
                  }}
                  className="w-full"
                >
                  <Download />
                  {updateError ? 'Try again' : 'Download Update'}
                </Button>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-base text-muted-foreground">
                Update downloaded and ready to install
              </p>
              <Button size="lg" onClick={handleInstall} className="w-full">
                <RotateCw />
                Install & Restart
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
