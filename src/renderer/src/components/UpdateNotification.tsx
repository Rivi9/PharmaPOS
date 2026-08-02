import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Download, RefreshCw, AlertTriangle } from 'lucide-react'
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
    const handleUpdateStatus = (_event: any, status: { event: string; data: any }) => {
      switch (status.event) {
        case 'update-available':
          setUpdateAvailable(true)
          setUpdateInfo(status.data)
          setUpdateError('')
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

  const handleDownload = () => {
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
    <div className="fixed bottom-4 right-4 w-96 z-50">
      <Card className="shadow-lg border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {updateAvailable ? 'Update Available' : 'Update'}
          </CardTitle>
          <CardDescription>
            {updateInfo?.version
              ? `Version ${updateInfo.version} is ready to install`
              : 'Checking for a newer version'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3">
          {updateError && (
            <div className="flex gap-2 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-medium">Update failed</p>
                <p className="text-xs break-words">{updateError}</p>
                <p className="text-xs mt-1 text-muted-foreground">
                  The till keeps working on the current version.
                </p>
              </div>
            </div>
          )}
          {!updateDownloaded ? (
            <>
              {downloading && downloadProgress ? (
                <div className="space-y-2">
                  <Progress value={downloadProgress.percent} />
                  <p className="text-xs text-muted-foreground text-center">
                    {downloadProgress.percent.toFixed(0)}% -{' '}
                    {formatBytes(downloadProgress.bytesPerSecond)}/s
                  </p>
                </div>
              ) : (
                <Button
                  onClick={() => {
                    setUpdateError('')
                    handleDownload()
                  }}
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {updateError ? 'Try again' : 'Download Update'}
                </Button>
              )}
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Update downloaded and ready to install
              </p>
              <Button onClick={handleInstall} className="w-full">
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
