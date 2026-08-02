import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Label } from '@renderer/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { PrinterSetupWizard } from '@renderer/components/settings/PrinterSetupWizard'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useAuthStore } from '@renderer/stores/authStore'
import {
  Save,
  MonitorCheck,
  RefreshCw,
  Plug,
  PlugZap,
  Database,
  Clock,
  Trash2,
  Download,
  Upload,
  Play,
  Square
} from 'lucide-react'

interface LocalBackup {
  path: string
  size: number
  timestamp: string
  /** False for the zero-byte residue of a failed run — never offer it for restore. */
  valid: boolean
}

interface SchedulerStatus {
  enabled: boolean
  running: boolean
  lastBackup: string | null
  lastError: string | null
  nextRun: string | null
}

interface PortInfo {
  path: string
  manufacturer?: string
}

interface DisplayStatus {
  connected: boolean
  port: string
  baudRate: number
}

const BAUD_RATES = [1200, 2400, 4800, 9600, 19200, 38400]

export function SettingsPage(): React.JSX.Element {
  const { settings, isLoading, loadSettings, updateSetting } = useSettingsStore()
  const { user } = useAuthStore()
  const [localSettings, setLocalSettings] = useState(settings)
  const [saving, setSaving] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Pole display state
  const [availablePorts, setAvailablePorts] = useState<PortInfo[]>([])
  const [displayPort, setDisplayPort] = useState('')
  const [displayBaud, setDisplayBaud] = useState(2400)
  const [displayStatus, setDisplayStatus] = useState<DisplayStatus>({
    connected: false,
    port: '',
    baudRate: 2400
  })
  const [displayBusy, setDisplayBusy] = useState(false)
  const [displayMsg, setDisplayMsg] = useState('')

  // Backup state
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const [localBackups, setLocalBackups] = useState<LocalBackup[]>([])
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus>({
    enabled: true,
    running: false,
    lastBackup: null,
    lastError: null,
    nextRun: null
  })
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)
  const [restorePassword, setRestorePassword] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)


  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  /**
   * Validate the business settings that feed money calculations. A bad VAT rate
   * or empty currency symbol corrupts every total and receipt in the session,
   * so these are blocked at save time rather than silently corrected.
   */
  const validateSettings = (draft: typeof localSettings): Record<string, string> => {
    const errors: Record<string, string> = {}

    const vat = parseFloat(draft.vat_rate)
    if (draft.vat_rate.trim() === '' || Number.isNaN(vat)) {
      errors.vat_rate = 'Enter a VAT rate between 0 and 100'
    } else if (vat < 0 || vat > 100) {
      errors.vat_rate = 'VAT rate must be between 0 and 100'
    }

    const symbol = draft.currency_symbol.trim()
    if (symbol.length === 0) {
      errors.currency_symbol = 'Currency symbol is required'
    } else if (symbol.length > 5) {
      errors.currency_symbol = 'Currency symbol must be 5 characters or fewer'
    }

    return errors
  }

  const handleSave = async (): Promise<void> => {
    const errors = validateSettings(localSettings)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    const draft = { ...localSettings, currency_symbol: localSettings.currency_symbol.trim() }
    setSaving(true)
    for (const [key, value] of Object.entries(draft)) {
      if (value !== settings[key as keyof typeof settings]) {
        await updateSetting(key as keyof typeof settings, value)
      }
    }
    setLocalSettings(draft)
    setSaving(false)
  }

  const handleChange = (key: string, value: string): void => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }))
    setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev))
  }

  const loadPorts = async (): Promise<void> => {
    const ports = await window.electron.display.listPorts()
    setAvailablePorts(ports as PortInfo[])
    if (ports.length > 0 && !displayPort) {
      setDisplayPort((ports[0] as PortInfo).path)
    }
  }

  const loadDisplayStatus = async (): Promise<void> => {
    const status = await window.electron.display.getStatus()
    setDisplayStatus(status as DisplayStatus)
    if ((status as DisplayStatus).connected) {
      setDisplayPort((status as DisplayStatus).port)
      setDisplayBaud((status as DisplayStatus).baudRate)
    }
  }

  const handleDisplayTabOpen = async (): Promise<void> => {
    loadPorts()
    loadDisplayStatus()

    // Load saved display settings from DB
    try {
      const savedPort = await window.electron.getSetting('display_port')
      const savedBaud = await window.electron.getSetting('display_baud_rate')
      if (savedPort) setDisplayPort(savedPort as string)
      if (savedBaud) setDisplayBaud(parseInt(savedBaud as string))
    } catch (err) {
      console.warn('Failed to load saved display settings:', err)
    }
  }

  const handleConnect = async (): Promise<void> => {
    if (!displayPort) return
    setDisplayBusy(true)
    setDisplayMsg('')
    try {
      await window.electron.display.connect(displayPort, displayBaud)
      setDisplayMsg(`Connected to ${displayPort} at ${displayBaud} baud`)

      // Persist to DB on successful connection
      await window.electron.setSetting('display_port', displayPort)
      await window.electron.setSetting('display_baud_rate', displayBaud.toString())

      await loadDisplayStatus()
    } catch (err: any) {
      setDisplayMsg(`Error: ${err.message}`)
    } finally {
      setDisplayBusy(false)
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    setDisplayBusy(true)
    setDisplayMsg('')
    try {
      await window.electron.display.disconnect()
      setDisplayMsg('Disconnected')
      await loadDisplayStatus()
    } catch (err: any) {
      setDisplayMsg(`Error: ${err.message}`)
    } finally {
      setDisplayBusy(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    try {
      await window.electron.display.test()
      setDisplayMsg('Test message sent — check the display')
    } catch (err: any) {
      setDisplayMsg(`Error: ${err.message}`)
    }
  }

  // Backup functions
  const loadLocalBackups = async (): Promise<void> => {
    if (!user?.id) return
    try {
      const backups = await window.electron.backup.listLocal(user.id)
      setLocalBackups(
        backups as Array<{
          path: string
          size: number
          timestamp: string
          valid: boolean
        }>
      )
    } catch (err: any) {
      setBackupMsg(`Error loading backups: ${err.message}`)
    }
  }

  const loadSchedulerStatus = async (): Promise<void> => {
    if (!user?.id) return
    try {
      const status = await window.electron.backup.schedulerStatus(user.id)
      setSchedulerStatus(status as SchedulerStatus)
    } catch (err: any) {
      console.warn('Failed to load scheduler status:', err)
    }
  }

  const handleBackupTabOpen = (): void => {
    loadLocalBackups()
    loadSchedulerStatus()
  }

  const handleShowRecoveryKey = async (): Promise<void> => {
    if (!user?.id) return
    setBackupMsg('')
    try {
      const result = await window.electron.backup.recoveryKey(user.id)
      setRecoveryKey((result as { key: string }).key)
    } catch (err: any) {
      setBackupMsg(`Error: ${err.message}`)
    }
  }

  const handleCreateBackup = async (): Promise<void> => {
    if (!user?.id) {
      setBackupMsg('Error: User not authenticated')
      return
    }
    setBackupBusy(true)
    setBackupMsg('')
    try {
      const result = await window.electron.backup.create(user.id)
      const name = String(result).split(/[\/]/).pop()
      setBackupMsg(`Encrypted backup created: ${name}`)
      await loadLocalBackups()
    } catch (err: any) {
      setBackupMsg(`Error: ${err.message}`)
    } finally {
      setBackupBusy(false)
    }
  }

  /** Opens the restore dialog. Electron has no window.prompt(), so the password
   *  must be collected in-app — the previous prompt() call simply threw. */
  const openRestoreDialog = (backupPath: string): void => {
    setRestoreTarget(backupPath)
    setRestorePassword('')
    setBackupMsg('')
  }

  const handleRestoreConfirm = async (): Promise<void> => {
    if (!user?.id || !restoreTarget) return

    setBackupBusy(true)
    setBackupMsg('')
    try {
      await window.electron.backup.restore(
        user.id,
        restoreTarget,
        restorePassword || undefined
      )
      setRestoreTarget(null)
      // The main process has closed the database and swapped the file; continuing
      // to run would checkpoint stale WAL frames over the restored data.
      window.electron.ipcRenderer.send('app:relaunch')
    } catch (err: any) {
      setBackupMsg(`Error: ${err.message}`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleDeleteBackup = async (backupPath: string): Promise<void> => {
    if (!user?.id) return
    setBackupBusy(true)
    setBackupMsg('')
    try {
      await window.electron.backup.deleteLocal(user.id, backupPath)
      setBackupMsg('Backup deleted successfully')
      await loadLocalBackups()
    } catch (err: any) {
      setBackupMsg(`Error: ${err.message}`)
    } finally {
      setBackupBusy(false)
      setDeleteTarget(null)
    }
  }

  const handleSchedulerToggle = async (): Promise<void> => {
    if (!user?.id) return
    setBackupBusy(true)
    setBackupMsg('')
    try {
      if (schedulerStatus.running) {
        await window.electron.backup.schedulerStop(user.id)
        setBackupMsg('Automatic backups turned off')
      } else {
        await window.electron.backup.schedulerStart(user.id)
        setBackupMsg('Automatic backups turned on')
      }
      await loadSchedulerStatus()
    } catch (err: any) {
      setBackupMsg(`Error: ${err.message}`)
    } finally {
      setBackupBusy(false)
    }
  }


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Configure system settings and preferences</p>
      </div>

      <Tabs defaultValue="printer" className="flex-1 min-h-0 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 max-w-3xl">
          <TabsTrigger value="printer">Printer</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="display" onClick={handleDisplayTabOpen}>
            Display
          </TabsTrigger>
          <TabsTrigger value="backup" onClick={handleBackupTabOpen}>
            Backup
          </TabsTrigger>
        </TabsList>

        <TabsContent value="printer" className="space-y-6 flex-1 min-h-0 overflow-y-auto overscroll-contain pt-4 pb-6 pr-1">
          <PrinterSetupWizard />
        </TabsContent>

        <TabsContent value="business" className="space-y-6 flex-1 min-h-0 overflow-y-auto overscroll-contain pt-4 pb-6 pr-1">
          <div className="max-w-2xl">
            <div className="flex items-center justify-end mb-4">
              <Button onClick={handleSave} disabled={saving}>
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Business Information</CardTitle>
                <CardDescription>Configure your pharmacy details for receipts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Business Name</label>
                  <Input
                    value={localSettings.business_name}
                    onChange={(e) => handleChange('business_name', e.target.value)}
                    placeholder="My Pharmacy"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Address</label>
                  <Input
                    value={localSettings.business_address}
                    onChange={(e) => handleChange('business_address', e.target.value)}
                    placeholder="123 Main Street, Colombo"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Phone</label>
                  <Input
                    value={localSettings.business_phone}
                    onChange={(e) => handleChange('business_phone', e.target.value)}
                    placeholder="011-2345678"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Tax & Currency</CardTitle>
                <CardDescription>Configure tax and currency settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">VAT Rate (%)</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    max="100"
                    step="0.01"
                    value={localSettings.vat_rate}
                    onChange={(e) => handleChange('vat_rate', e.target.value)}
                    placeholder="0"
                    aria-invalid={Boolean(fieldErrors.vat_rate)}
                  />
                  {fieldErrors.vat_rate && (
                    <p className="text-sm text-destructive mt-1">{fieldErrors.vat_rate}</p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">Currency Symbol</label>
                  <Input
                    value={localSettings.currency_symbol}
                    onChange={(e) => handleChange('currency_symbol', e.target.value)}
                    placeholder="Rs."
                    maxLength={5}
                    aria-invalid={Boolean(fieldErrors.currency_symbol)}
                  />
                  {fieldErrors.currency_symbol && (
                    <p className="text-sm text-destructive mt-1">{fieldErrors.currency_symbol}</p>
                  )}
                </div>
                <div className="border-t pt-4">
                  <label className="text-sm font-medium">Payment methods</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Turn card off if this pharmacy has no card terminal — the Card button is then
                    hidden at checkout and card sales are rejected.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant={
                        localSettings.card_payment_enabled !== '0' ? 'default' : 'outline'
                      }
                      className="h-11 flex-1"
                      onClick={() => handleChange('card_payment_enabled', '1')}
                    >
                      Cash &amp; Card
                    </Button>
                    <Button
                      variant={
                        localSettings.card_payment_enabled === '0' ? 'default' : 'outline'
                      }
                      className="h-11 flex-1"
                      onClick={() => handleChange('card_payment_enabled', '0')}
                    >
                      Cash only
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Receipt</CardTitle>
                <CardDescription>Customize receipt appearance</CardDescription>
              </CardHeader>
              <CardContent>
                <div>
                  <label className="text-sm font-medium">Receipt Footer Message</label>
                  <Input
                    value={localSettings.receipt_footer}
                    onChange={(e) => handleChange('receipt_footer', e.target.value)}
                    placeholder="Thank you for your purchase!"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Pole Display Tab ───────────────────────────────────────────── */}
        <TabsContent value="display" className="space-y-6 flex-1 min-h-0 overflow-y-auto overscroll-contain pt-4 pb-6 pr-1">
          <div className="max-w-xl">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MonitorCheck className="h-5 w-5" />
                  Pole Display (VFD)
                </CardTitle>
                <CardDescription>
                  Connect your customer-facing pole display via COM / LPT port
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Status badge */}
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${displayStatus.connected ? 'bg-green-500' : 'bg-muted-foreground'}`}
                  />
                  <span className="text-sm font-medium">
                    {displayStatus.connected
                      ? `Connected — ${displayStatus.port} @ ${displayStatus.baudRate} baud`
                      : 'Not connected'}
                  </span>
                </div>

                {/* Port selection */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">COM Port</label>
                  <div className="flex gap-2">
                    <select
                      value={displayPort}
                      onChange={(e) => setDisplayPort(e.target.value)}
                      className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">Select a port...</option>
                      {availablePorts.map((p) => (
                        <option key={p.path} value={p.path}>
                          {p.path}
                          {p.manufacturer ? ` — ${p.manufacturer}` : ''}
                        </option>
                      ))}
                    </select>
                    <Button variant="outline" size="icon" onClick={loadPorts} title="Refresh ports">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Check Device Manager → Ports (COM &amp; LPT) for the correct port number
                  </p>
                </div>

                {/* Baud rate */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Baud Rate</label>
                  <select
                    value={displayBaud}
                    onChange={(e) => setDisplayBaud(Number(e.target.value))}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {BAUD_RATES.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    OCPD-LED8 default is 2400 baud. Check your display manual if different.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  {displayStatus.connected ? (
                    <Button
                      variant="outline"
                      onClick={handleDisconnect}
                      disabled={displayBusy}
                      className="flex items-center gap-2"
                    >
                      <Plug className="h-4 w-4" />
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      onClick={handleConnect}
                      disabled={displayBusy || !displayPort}
                      className="flex items-center gap-2"
                    >
                      <PlugZap className="h-4 w-4" />
                      {displayBusy ? 'Connecting...' : 'Connect'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleTest}
                    disabled={!displayStatus.connected}
                    className="flex items-center gap-2"
                  >
                    <MonitorCheck className="h-4 w-4" />
                    Test Display
                  </Button>
                </div>

                {displayMsg && (
                  <p
                    className={`text-sm font-medium ${displayMsg.startsWith('Error') ? 'text-destructive' : 'text-green-600'}`}
                  >
                    {displayMsg}
                  </p>
                )}

                <div className="border-t pt-4 text-xs text-muted-foreground space-y-1">
                  <p className="font-medium">Supported displays:</p>
                  <p>Epson DM-D110 / DM-D210, Logic Controls LD9000, Bixolon BCD-1100</p>
                  <p>and most generic 2×20 VFD pole displays (RS-232 serial)</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Backup Tab ───────────────────────────────────────────── */}
        <TabsContent value="backup" className="space-y-6 flex-1 min-h-0 overflow-y-auto overscroll-contain pt-4 pb-6 pr-1">
          <div className="max-w-2xl">
            {/* Manual Backup */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Create Backup
                </CardTitle>
                <CardDescription>
                  Manually create an encrypted backup of your database
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-sm">
                    Every backup is encrypted automatically. Backups contain customer records
                    and staff credentials, so they are never written or uploaded in the clear.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    This machine unlocks its own backups without a password. To restore onto a
                    <strong> different</strong> machine you need the recovery key below — write it
                    down and keep it somewhere other than this computer.
                  </p>
                  {recoveryKey ? (
                    <div className="space-y-2">
                      <p className="font-mono text-base font-bold tracking-wider break-all bg-background rounded-md p-3 border">
                        {recoveryKey}
                      </p>
                      <Button
                        variant="outline"
                        className="h-11"
                        onClick={() => {
                          navigator.clipboard.writeText(recoveryKey)
                          setBackupMsg('Recovery key copied to the clipboard')
                        }}
                      >
                        Copy key
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" className="h-11" onClick={handleShowRecoveryKey}>
                      Show recovery key
                    </Button>
                  )}
                </div>
                <Button
                  onClick={handleCreateBackup}
                  disabled={backupBusy}
                  className="h-11 flex items-center gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {backupBusy ? 'Creating...' : 'Create Backup Now'}
                </Button>
              </CardContent>
            </Card>

            {/* Local Backups List */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Local Backups
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadLocalBackups}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Refresh
                  </Button>
                </CardTitle>
                <CardDescription>Manage your local database backups</CardDescription>
              </CardHeader>
              <CardContent>
                {localBackups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No local backups found</p>
                ) : (
                  <div className="space-y-2">
                    {localBackups.map((backup) => (
                      <div
                        key={backup.path}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {backup.path.split(/[\\/]/).pop()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(backup.timestamp).toLocaleString()} •{' '}
                            {(backup.size / 1024 / 1024).toFixed(2)} MB
                            {!backup.valid && (
                              <span className="text-destructive"> • empty — cannot be restored</span>
                            )}
                          </p>
                        </div>
                        <div className="flex gap-3">
                          <Button
                            variant="outline"
                            onClick={() => openRestoreDialog(backup.path)}
                            disabled={backupBusy || !backup.valid}
                            className="flex items-center gap-1"
                          >
                            <Download className="h-4 w-4" />
                            Restore
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(backup.path)}
                            disabled={backupBusy}
                            className="flex items-center gap-1 text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Automatic Backup Scheduler */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Automatic Backups
                </CardTitle>
                <CardDescription>Schedule automatic daily backups</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-3 h-3 rounded-full ${schedulerStatus.running ? 'bg-green-500' : 'bg-muted-foreground'}`}
                    />
                    <div>
                      <p className="text-sm font-medium">
                        {schedulerStatus.running ? 'Scheduler Active' : 'Scheduler Stopped'}
                      </p>
                      {schedulerStatus.running && schedulerStatus.nextRun && (
                        <p className="text-xs text-muted-foreground">
                          Next backup: {new Date(schedulerStatus.nextRun).toLocaleString()}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Last backup:{' '}
                        {schedulerStatus.lastBackup
                          ? new Date(schedulerStatus.lastBackup).toLocaleString()
                          : 'never'}
                      </p>
                      {schedulerStatus.lastError && (
                        <p className="text-xs text-destructive font-medium">
                          Last attempt failed: {schedulerStatus.lastError}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant={schedulerStatus.running ? 'outline' : 'default'}
                    onClick={handleSchedulerToggle}
                    disabled={backupBusy}
                    className="flex items-center gap-2"
                  >
                    {schedulerStatus.running ? (
                      <>
                        <Square className="h-4 w-4" />
                        Stop Scheduler
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        Start Scheduler
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Automatic backups run daily at 2:00 AM and are stored locally. If the machine was
                  switched off at that time, a catch-up backup runs at the next startup.
                </p>
              </CardContent>
            </Card>

            {backupMsg && (
              <div
                className={`mt-4 p-3 rounded-lg ${backupMsg.startsWith('Error') ? 'bg-destructive/10 text-destructive' : 'bg-green-50 text-green-700'}`}
              >
                <p className="text-sm font-medium">{backupMsg}</p>
              </div>
            )}
          </div>
        </TabsContent>

      </Tabs>

      {/* Restore — Electron has no window.prompt(), so the password is collected here */}
      <Dialog open={restoreTarget !== null} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Restore this backup?</DialogTitle>
            <DialogDescription>
              This replaces all current data with the contents of the backup. The application will
              restart immediately afterwards. Your current database is saved as a
              &ldquo;pre-restore&rdquo; backup first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="restore-password">Recovery key (only if this backup came from another machine)</Label>
            <Input
              id="restore-password"
              type="password"
              placeholder="Leave blank — this machine unlocks its own backups"
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
              className="h-12"
            />
          </div>
          {backupMsg.startsWith('Error') && (
            <p className="text-sm text-destructive font-medium">{backupMsg}</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={() => setRestoreTarget(null)}
              disabled={backupBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 h-12 font-semibold"
              onClick={handleRestoreConfirm}
              disabled={backupBusy}
            >
              {backupBusy ? 'Restoring…' : 'Restore & Restart'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this backup?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1 h-12"
              onClick={() => setDeleteTarget(null)}
              disabled={backupBusy}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 h-12 font-semibold"
              onClick={() => deleteTarget && handleDeleteBackup(deleteTarget)}
              disabled={backupBusy}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
