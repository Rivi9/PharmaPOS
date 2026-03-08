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
  Key,
  Trash2,
  Download,
  Upload,
  Play,
  Square,
  CheckCircle2
} from 'lucide-react'

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
  const [backupPassword, setBackupPassword] = useState('')
  const [backupBusy, setBackupBusy] = useState(false)
  const [backupMsg, setBackupMsg] = useState('')
  const [localBackups, setLocalBackups] = useState<
    Array<{ filename: string; path: string; size: number; timestamp: string }>
  >([])
  const [schedulerStatus, setSchedulerStatus] = useState<{ running: boolean; nextRun?: string }>({
    running: false
  })

  // AI state
  const [geminiKey, setGeminiKey] = useState('')
  const [aiSaving, setAiSaving] = useState(false)
  const [aiMsg, setAiMsg] = useState('')
  const [geminiConfigured, setGeminiConfigured] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    for (const [key, value] of Object.entries(localSettings)) {
      if (value !== settings[key as keyof typeof settings]) {
        await updateSetting(key as keyof typeof settings, value)
      }
    }
    setSaving(false)
  }

  const handleChange = (key: string, value: string): void => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }))
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
    try {
      const backups = await window.electron.backup.listLocal()
      setLocalBackups(
        backups as Array<{ filename: string; path: string; size: number; timestamp: string }>
      )
    } catch (err: any) {
      setBackupMsg(`Error loading backups: ${err.message}`)
    }
  }

  const loadSchedulerStatus = async (): Promise<void> => {
    try {
      const status = await window.electron.backup.schedulerStatus()
      setSchedulerStatus(status as { running: boolean; nextRun?: string })
    } catch (err: any) {
      console.warn('Failed to load scheduler status:', err)
    }
  }

  const handleBackupTabOpen = (): void => {
    loadLocalBackups()
    loadSchedulerStatus()
  }

  const handleCreateBackup = async (): Promise<void> => {
    if (!user?.id) {
      setBackupMsg('Error: User not authenticated')
      return
    }
    setBackupBusy(true)
    setBackupMsg('')
    try {
      const result = await window.electron.backup.create(user.id, backupPassword || undefined)
      setBackupMsg(`Backup created successfully: ${(result as any).filename}`)
      setBackupPassword('')
      await loadLocalBackups()
    } catch (err: any) {
      setBackupMsg(`Error: ${err.message}`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleRestoreBackup = async (backupPath: string): Promise<void> => {
    if (!user?.id) {
      setBackupMsg('Error: User not authenticated')
      return
    }
    if (!confirm('Restore from this backup? This will replace all current data.')) return

    const password = prompt('Enter backup password (leave empty if no password):')
    if (password === null) return // Cancelled

    setBackupBusy(true)
    setBackupMsg('')
    try {
      await window.electron.backup.restore(user.id, backupPath, password || undefined)
      setBackupMsg('Backup restored successfully. Please restart the application.')
    } catch (err: any) {
      setBackupMsg(`Error: ${err.message}`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleDeleteBackup = async (backupPath: string): Promise<void> => {
    if (!confirm('Delete this backup? This cannot be undone.')) return

    setBackupBusy(true)
    setBackupMsg('')
    try {
      await window.electron.backup.deleteLocal(backupPath)
      setBackupMsg('Backup deleted successfully')
      await loadLocalBackups()
    } catch (err: any) {
      setBackupMsg(`Error: ${err.message}`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleSchedulerToggle = async (): Promise<void> => {
    setBackupBusy(true)
    setBackupMsg('')
    try {
      if (schedulerStatus.running) {
        await window.electron.backup.schedulerStop()
        setBackupMsg('Automatic backup scheduler stopped')
      } else {
        await window.electron.backup.schedulerStart()
        setBackupMsg('Automatic backup scheduler started')
      }
      await loadSchedulerStatus()
    } catch (err: any) {
      setBackupMsg(`Error: ${err.message}`)
    } finally {
      setBackupBusy(false)
    }
  }

  // AI functions
  const loadGeminiConfig = async (): Promise<void> => {
    try {
      const apiKey = await window.electron.getSetting('gemini_api_key')
      if (apiKey && (apiKey as string).length > 0) {
        setGeminiConfigured(true)
        setGeminiKey('••••••••••••••••') // Masked
      } else {
        setGeminiConfigured(false)
        setGeminiKey('')
      }
    } catch (err) {
      console.warn('Failed to load Gemini config:', err)
    }
  }

  const handleAiTabOpen = (): void => {
    loadGeminiConfig()
  }

  const handleSaveGeminiKey = async (): Promise<void> => {
    if (!geminiKey || geminiKey === '••••••••••••••••') {
      setAiMsg('Please enter a valid API key')
      return
    }
    setAiSaving(true)
    setAiMsg('')
    try {
      await window.electron.setSetting('gemini_api_key', geminiKey)
      setAiMsg('Gemini API key saved successfully')
      setGeminiConfigured(true)
      setGeminiKey('••••••••••••••••') // Mask after save
    } catch (err: any) {
      setAiMsg(`Error: ${err.message}`)
    } finally {
      setAiSaving(false)
    }
  }

  const handleClearGeminiKey = async (): Promise<void> => {
    if (!confirm('Clear the Gemini API key? AI features will be disabled.')) return
    setAiSaving(true)
    setAiMsg('')
    try {
      await window.electron.setSetting('gemini_api_key', '')
      setAiMsg('Gemini API key cleared')
      setGeminiConfigured(false)
      setGeminiKey('')
    } catch (err: any) {
      setAiMsg(`Error: ${err.message}`)
    } finally {
      setAiSaving(false)
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

      <Tabs defaultValue="printer" className="flex-1">
        <TabsList className="grid w-full grid-cols-5 max-w-3xl">
          <TabsTrigger value="printer">Printer</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="display" onClick={handleDisplayTabOpen}>
            Display
          </TabsTrigger>
          <TabsTrigger value="backup" onClick={handleBackupTabOpen}>
            Backup
          </TabsTrigger>
          <TabsTrigger value="ai" onClick={handleAiTabOpen}>
            AI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="printer" className="space-y-6">
          <PrinterSetupWizard />
        </TabsContent>

        <TabsContent value="business" className="space-y-6">
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
                    value={localSettings.vat_rate}
                    onChange={(e) => handleChange('vat_rate', e.target.value)}
                    placeholder="18"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Currency Symbol</label>
                  <Input
                    value={localSettings.currency_symbol}
                    onChange={(e) => handleChange('currency_symbol', e.target.value)}
                    placeholder="Rs."
                  />
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
        <TabsContent value="display" className="space-y-6">
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
        <TabsContent value="backup" className="space-y-6">
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
                <div className="space-y-2">
                  <label className="text-sm font-medium">Backup Password (Optional)</label>
                  <Input
                    type="password"
                    value={backupPassword}
                    onChange={(e) => setBackupPassword(e.target.value)}
                    placeholder="Leave empty for no encryption"
                  />
                  <p className="text-xs text-muted-foreground">
                    Recommended: Use a strong password to encrypt sensitive data
                  </p>
                </div>
                <Button
                  onClick={handleCreateBackup}
                  disabled={backupBusy}
                  className="flex items-center gap-2"
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
                        <div className="flex-1">
                          <p className="text-sm font-medium">{backup.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(backup.timestamp).toLocaleString()} •{' '}
                            {(backup.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestoreBackup(backup.path)}
                            disabled={backupBusy}
                            className="flex items-center gap-1"
                          >
                            <Download className="h-3 w-3" />
                            Restore
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteBackup(backup.path)}
                            disabled={backupBusy}
                            className="flex items-center gap-1 text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
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
                  Automatic backups run daily at 2:00 AM and are stored locally
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

        {/* ── AI Tab ───────────────────────────────────────────── */}
        <TabsContent value="ai" className="space-y-6">
          <div className="max-w-xl">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Gemini AI Configuration
                </CardTitle>
                <CardDescription>
                  Configure Google Gemini API for AI-powered insights and analytics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Status indicator */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  {geminiConfigured ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">AI Features Enabled</p>
                        <p className="text-xs text-muted-foreground">
                          Gemini API key is configured and ready to use
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">AI Features Disabled</p>
                        <p className="text-xs text-muted-foreground">
                          Enter your Gemini API key to enable AI insights
                        </p>
                      </div>
                    </>
                  )}
                </div>

                {/* API Key input */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Gemini API Key</label>
                  <Input
                    type="password"
                    value={geminiKey}
                    onChange={(e) => setGeminiKey(e.target.value)}
                    placeholder="Enter your Google Gemini API key"
                    disabled={aiSaving}
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your API key from{' '}
                    <a
                      href="https://makersuite.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-primary"
                    >
                      Google AI Studio
                    </a>
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveGeminiKey}
                    disabled={aiSaving || !geminiKey || geminiKey === '••••••••••••••••'}
                    className="flex items-center gap-2"
                  >
                    <Save className="h-4 w-4" />
                    {aiSaving ? 'Saving...' : 'Save API Key'}
                  </Button>
                  {geminiConfigured && (
                    <Button
                      variant="outline"
                      onClick={handleClearGeminiKey}
                      disabled={aiSaving}
                      className="flex items-center gap-2"
                    >
                      <Trash2 className="h-4 w-4" />
                      Clear Key
                    </Button>
                  )}
                </div>

                {aiMsg && (
                  <div
                    className={`p-3 rounded-lg ${aiMsg.startsWith('Error') ? 'bg-destructive/10 text-destructive' : 'bg-green-50 text-green-700'}`}
                  >
                    <p className="text-sm font-medium">{aiMsg}</p>
                  </div>
                )}

                {/* Features info */}
                <div className="border-t pt-4 space-y-2">
                  <p className="text-sm font-medium">AI Features:</p>
                  <ul className="text-xs text-muted-foreground space-y-1 ml-4">
                    <li>• Smart reorder suggestions based on sales patterns</li>
                    <li>• Dead stock detection to identify slow-moving items</li>
                    <li>• Natural language queries for business insights</li>
                    <li>• Sales forecasting and demand prediction</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
