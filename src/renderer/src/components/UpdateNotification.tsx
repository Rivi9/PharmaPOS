import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'
import { Progress } from './ui/progress'
import { Download, RefreshCw } from 'lucide-react'

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

  useEffect(() => {
    // Listen for update events
    const handleUpdateStatus = (_event: any, status: { event: string; data: any }) => {
      switch (status.event) {
        case 'update-available':
          setUpdateAvailable(true)
          setUpdateInfo(status.data)
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
          setDownloading(false)
          alert(`Update error: ${status.data.message}`)
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

  const handleInstall = () => {
    if (confirm('The application will restart to install the update. Continue?')) {
      window.electron.updates.install()
    }
  }

  if (!updateAvailable) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 z-50">
      <Card className="shadow-lg border-primary">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Update Available
          </CardTitle>
          <CardDescription>Version {updateInfo?.version} is ready to install</CardDescription>
        </CardHeader>

        <CardContent>
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
                <Button onClick={handleDownload} className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Download Update
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
