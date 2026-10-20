import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Badge } from '@renderer/components/ui/badge'
import { Switch } from '@renderer/components/ui/switch'
import { Spinner } from '@renderer/components/ui/spinner'
import { Separator } from '@renderer/components/ui/separator'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@renderer/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@renderer/components/ui/toggle-group'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle
} from '@renderer/components/ui/item'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { NumberInput } from '@renderer/components/common/number-input'
import { PrinterSetupWizard } from '@renderer/components/settings/PrinterSetupWizard'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useAuthStore } from '@renderer/stores/authStore'
import { useConfirm } from '@renderer/hooks/useConfirm'
import { useThemeStore, type ThemePreference } from '@renderer/hooks/useTheme'
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
  CloudDownload,
  Printer,
  Store,
  Palette,
  Sun,
  Moon,
  Monitor,
  KeyRound,
  Copy,
  CheckCircle2,
  AlertCircle
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

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor }
]

// `@container`: the tab layouts below respond to the width the content actually
// gets (screen minus sidebar and tab list), not to the viewport.
const TAB_CONTENT_CLASS = '@container mt-0 min-h-0 overflow-y-auto overscroll-contain pb-6 pr-1'
/**
 * Tabs with several cards. A single form column stays max-w-3xl so fields do
 * not stretch across a 1920px screen, but on a wide (maximised) till the cards
 * go two-up instead of leaving half the screen empty. Rows are `auto 1fr` so a
 * card spanning both rows grows the second row, not a gap under the first.
 */
const CARD_GRID_CLASS =
  'grid max-w-3xl items-start gap-6 @5xl:max-w-[100rem] @5xl:grid-cols-2 @5xl:grid-rows-[auto_1fr]'
const TAB_TRIGGER_CLASS =
  'h-14 flex-none justify-start gap-3 px-4 [&_svg:not([class*=size-])]:size-5'

export function SettingsPage(): React.JSX.Element {
  const { settings, isLoading, loadSettings, updateSetting } = useSettingsStore()
  const { user } = useAuthStore()
  const themePreference = useThemeStore((s) => s.preference)
  const setThemePreference = useThemeStore((s) => s.setPreference)
  const { confirm, confirmProps } = useConfirm()
  const [activeTab, setActiveTab] = useState('printer')
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

  // Backup state
  const [backupBusy, setBackupBusy] = useState(false)
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
  // Shown inside the restore dialog: a wrong recovery key has to be read and
  // corrected there, not in a toast that vanishes behind the modal.
  const [restoreError, setRestoreError] = useState('')
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null)

  // Update state
  const [updateBusy, setUpdateBusy] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

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
    try {
      for (const [key, value] of Object.entries(draft)) {
        if (value !== settings[key as keyof typeof settings]) {
          await updateSetting(key as keyof typeof settings, value)
        }
      }
      setLocalSettings(draft)
      toast.success('Settings saved')
    } catch (err) {
      // Previously unhandled: a failed write left the button stuck on "Saving...".
      toast.error('Could not save settings', { description: ipcErrorMessage(err) })
    } finally {
      setSaving(false)
    }
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
    try {
      await window.electron.display.connect(displayPort, displayBaud)
      toast.success(`Connected to ${displayPort} at ${displayBaud} baud`)

      // Persist to DB on successful connection
      await window.electron.setSetting('display_port', displayPort)
      await window.electron.setSetting('display_baud_rate', displayBaud.toString())

      await loadDisplayStatus()
    } catch (err) {
      toast.error('Could not connect to the display', { description: ipcErrorMessage(err) })
    } finally {
      setDisplayBusy(false)
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    setDisplayBusy(true)
    try {
      await window.electron.display.disconnect()
      toast.success('Disconnected')
      await loadDisplayStatus()
    } catch (err) {
      toast.error('Could not disconnect the display', { description: ipcErrorMessage(err) })
    } finally {
      setDisplayBusy(false)
    }
  }

  const handleTest = async (): Promise<void> => {
    try {
      await window.electron.display.test()
      toast.success('Test message sent — check the display')
    } catch (err) {
      toast.error('Display test failed', { description: ipcErrorMessage(err) })
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
    } catch (err) {
      toast.error('Error loading backups', { description: ipcErrorMessage(err) })
    }
  }

  const loadSchedulerStatus = async (): Promise<void> => {
    if (!user?.id) return
    try {
      const status = await window.electron.backup.schedulerStatus(user.id)
      setSchedulerStatus(status as SchedulerStatus)
    } catch (err) {
      console.warn('Failed to load scheduler status:', err)
    }
  }

  const handleBackupTabOpen = (): void => {
    loadLocalBackups()
    loadSchedulerStatus()
  }

  /** Tab-open loaders. Run from onValueChange so keyboard tab switching loads too. */
  const handleTabChange = (value: string): void => {
    setActiveTab(value)
    if (value === 'display') handleDisplayTabOpen()
    if (value === 'backup') handleBackupTabOpen()
  }

  const handleShowRecoveryKey = async (): Promise<void> => {
    if (!user?.id) return
    try {
      const result = await window.electron.backup.recoveryKey(user.id)
      setRecoveryKey((result as { key: string }).key)
    } catch (err) {
      toast.error('Could not show the recovery key', { description: ipcErrorMessage(err) })
    }
  }

  const handleCopyRecoveryKey = (key: string): void => {
    navigator.clipboard.writeText(key).then(
      () => toast.success('Recovery key copied to the clipboard'),
      () => toast.error('Could not copy the recovery key')
    )
  }

  const handleCreateBackup = async (): Promise<void> => {
    if (!user?.id) {
      toast.error('Error: User not authenticated')
      return
    }
    setBackupBusy(true)
    try {
      const result = await window.electron.backup.create(user.id)
      const name = String(result).split(/[\\/]/).pop()
      toast.success('Encrypted backup created', { description: name })
      await loadLocalBackups()
    } catch (err) {
      toast.error('Backup failed', { description: ipcErrorMessage(err) })
    } finally {
      setBackupBusy(false)
    }
  }

  /** Opens the restore dialog. Electron has no window.prompt(), so the password
   *  must be collected in-app — the previous prompt() call simply threw. */
  const openRestoreDialog = (backupPath: string): void => {
    setRestoreTarget(backupPath)
    setRestorePassword('')
    setRestoreError('')
  }

  const handleRestoreConfirm = async (): Promise<void> => {
    if (!user?.id || !restoreTarget) return

    setBackupBusy(true)
    setRestoreError('')
    try {
      await window.electron.backup.restore(user.id, restoreTarget, restorePassword || undefined)
      setRestoreTarget(null)
      // The main process has closed the database and swapped the file; continuing
      // to run would checkpoint stale WAL frames over the restored data.
      window.electron.ipcRenderer.send('app:relaunch')
    } catch (err) {
      setRestoreError(`Error: ${ipcErrorMessage(err)}`)
    } finally {
      setBackupBusy(false)
    }
  }

  const handleDeleteBackup = async (backupPath: string): Promise<void> => {
    if (!user?.id) return
    const ok = await confirm({
      title: 'Delete this backup?',
      description: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true
    })
    if (!ok) return

    setBackupBusy(true)
    try {
      await window.electron.backup.deleteLocal(user.id, backupPath)
      toast.success('Backup deleted successfully')
      await loadLocalBackups()
    } catch (err) {
      toast.error('Could not delete the backup', { description: ipcErrorMessage(err) })
    } finally {
      setBackupBusy(false)
    }
  }

  const handleCheckForUpdates = async (): Promise<void> => {
    setUpdateBusy(true)
    setUpdateMsg('')
    try {
      const result = (await window.electron.updates.check()) as {
        status: 'available' | 'up-to-date' | 'error' | 'unavailable'
        currentVersion: string
        message?: string
      }
      switch (result.status) {
        case 'available':
          setUpdateMsg(
            'A new version is available and downloading — you will be asked to restart when it is ready.'
          )
          break
        case 'up-to-date':
          setUpdateMsg(`You are on the latest version (v${result.currentVersion}).`)
          break
        default:
          setUpdateMsg(`Error: ${result.message}`)
      }
    } catch (err) {
      setUpdateMsg(`Error: ${ipcErrorMessage(err)}`)
    } finally {
      setUpdateBusy(false)
    }
  }

  const handleAutoUpdateChange = async (value: '0' | '1'): Promise<void> => {
    setUpdateMsg('')
    try {
      await updateSetting('auto_update_enabled', value)
    } catch (err) {
      setUpdateMsg(`Error: ${ipcErrorMessage(err)}`)
    }
  }

  const handleSchedulerToggle = async (): Promise<void> => {
    if (!user?.id) return
    setBackupBusy(true)
    try {
      if (schedulerStatus.running) {
        await window.electron.backup.schedulerStop(user.id)
        toast.success('Automatic backups turned off')
      } else {
        await window.electron.backup.schedulerStart(user.id)
        toast.success('Automatic backups turned on')
      }
      await loadSchedulerStatus()
    } catch (err) {
      toast.error('Could not change automatic backups', { description: ipcErrorMessage(err) })
    } finally {
      setBackupBusy(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 bg-canvas text-muted-foreground">
        <Spinner className="size-6" />
        <p className="text-base">Loading settings...</p>
      </div>
    )
  }

  // A saved port that is not plugged in right now still has to show in the
  // picker, or the trigger renders blank and looks unconfigured.
  const portOptions: PortInfo[] =
    displayPort && !availablePorts.some((p) => p.path === displayPort)
      ? [{ path: displayPort, manufacturer: 'not detected' }, ...availablePorts]
      : availablePorts

  const updateIsError = updateMsg.startsWith('Error')

  return (
    <div className="flex h-full flex-col gap-6 bg-canvas p-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-base text-muted-foreground">Configure system settings and preferences</p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        orientation="vertical"
        className="min-h-0 flex-1 items-stretch gap-6"
      >
        <TabsList className="h-fit w-56 shrink-0 items-stretch gap-1 rounded-2xl border bg-card p-2 shadow-xs">
          <TabsTrigger value="printer" className={TAB_TRIGGER_CLASS}>
            <Printer />
            Printer
          </TabsTrigger>
          <TabsTrigger value="business" className={TAB_TRIGGER_CLASS}>
            <Store />
            Business
          </TabsTrigger>
          <TabsTrigger value="display" className={TAB_TRIGGER_CLASS}>
            <MonitorCheck />
            Display
          </TabsTrigger>
          <TabsTrigger value="backup" className={TAB_TRIGGER_CLASS}>
            <Database />
            Backup
          </TabsTrigger>
          <TabsTrigger value="updates" className={TAB_TRIGGER_CLASS}>
            <CloudDownload />
            Updates
          </TabsTrigger>
          <TabsTrigger value="appearance" className={TAB_TRIGGER_CLASS}>
            <Palette />
            Appearance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="printer" className={TAB_CONTENT_CLASS}>
          <div className="max-w-3xl">
            <PrinterSetupWizard />
          </div>
        </TabsContent>

        {/* ── Business Tab ───────────────────────────────────────────── */}
        <TabsContent value="business" className={TAB_CONTENT_CLASS}>
          <div className="flex max-w-3xl flex-col gap-6 @5xl:max-w-[100rem]">
            <div className="flex items-center justify-between gap-4">
              <p className="text-base text-muted-foreground">
                Changes on this page apply after you save.
              </p>
              <Button size="lg" onClick={handleSave} disabled={saving}>
                {saving ? <Spinner className="size-5" /> : <Save />}
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>

            <div className={CARD_GRID_CLASS}>
              <Card className="@5xl:row-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">Business Information</CardTitle>
                  <CardDescription className="text-base">
                    Configure your pharmacy details for receipts
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup className="gap-5">
                    <Field>
                      <FieldLabel htmlFor="business-name">Business Name</FieldLabel>
                      <Input
                        id="business-name"
                        value={localSettings.business_name}
                        onChange={(e) => handleChange('business_name', e.target.value)}
                        placeholder="My Pharmacy"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="business-address">Address</FieldLabel>
                      <Input
                        id="business-address"
                        value={localSettings.business_address}
                        onChange={(e) => handleChange('business_address', e.target.value)}
                        placeholder="123 Main Street, Colombo"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="business-phone">Phone</FieldLabel>
                      <Input
                        id="business-phone"
                        value={localSettings.business_phone}
                        onChange={(e) => handleChange('business_phone', e.target.value)}
                        placeholder="011-2345678"
                      />
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Tax &amp; Currency</CardTitle>
                  <CardDescription className="text-base">
                    Configure tax and currency settings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FieldGroup className="gap-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field data-invalid={Boolean(fieldErrors.vat_rate)}>
                        <FieldLabel htmlFor="vat-rate">VAT Rate (%)</FieldLabel>
                        <NumberInput
                          id="vat-rate"
                          decimal
                          value={localSettings.vat_rate}
                          onValueChange={(v) => handleChange('vat_rate', v)}
                          placeholder="0"
                          aria-invalid={Boolean(fieldErrors.vat_rate)}
                        />
                        <FieldError>{fieldErrors.vat_rate}</FieldError>
                      </Field>
                      <Field data-invalid={Boolean(fieldErrors.currency_symbol)}>
                        <FieldLabel htmlFor="currency-symbol">Currency Symbol</FieldLabel>
                        <Input
                          id="currency-symbol"
                          value={localSettings.currency_symbol}
                          onChange={(e) => handleChange('currency_symbol', e.target.value)}
                          placeholder="Rs."
                          maxLength={5}
                          aria-invalid={Boolean(fieldErrors.currency_symbol)}
                        />
                        <FieldError>{fieldErrors.currency_symbol}</FieldError>
                      </Field>
                    </div>
                    <Separator />
                    <Field orientation="horizontal">
                      <FieldContent>
                        <FieldLabel htmlFor="card-payment-enabled" className="text-base">
                          Accept card payments
                        </FieldLabel>
                        <FieldDescription>
                          Turn card off if this pharmacy has no card terminal — the Card button is
                          then hidden at checkout and card sales are rejected.
                        </FieldDescription>
                      </FieldContent>
                      <Switch
                        id="card-payment-enabled"
                        checked={localSettings.card_payment_enabled !== '0'}
                        onCheckedChange={(on) =>
                          handleChange('card_payment_enabled', on ? '1' : '0')
                        }
                      />
                    </Field>
                  </FieldGroup>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Receipt</CardTitle>
                  <CardDescription className="text-base">
                    Customize receipt appearance
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Field>
                    <FieldLabel htmlFor="receipt-footer">Receipt Footer Message</FieldLabel>
                    <Input
                      id="receipt-footer"
                      value={localSettings.receipt_footer}
                      onChange={(e) => handleChange('receipt_footer', e.target.value)}
                      placeholder="Thank you for your purchase!"
                    />
                  </Field>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ── Pole Display Tab ───────────────────────────────────────────── */}
        <TabsContent value="display" className={TAB_CONTENT_CLASS}>
          <div className="max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MonitorCheck className="size-5" />
                  Pole Display (VFD)
                </CardTitle>
                <CardDescription className="text-base">
                  Connect your customer-facing pole display via COM / LPT port
                </CardDescription>
                <CardAction>
                  <Badge
                    variant="secondary"
                    className={
                      displayStatus.connected
                        ? 'h-7 bg-success-muted px-3 text-sm text-success'
                        : 'h-7 px-3 text-sm'
                    }
                  >
                    {displayStatus.connected
                      ? `Connected — ${displayStatus.port} @ ${displayStatus.baudRate} baud`
                      : 'Not connected'}
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <FieldGroup className="gap-5">
                  <Field>
                    <FieldLabel htmlFor="display-port">COM Port</FieldLabel>
                    <div className="flex gap-2">
                      <Select value={displayPort} onValueChange={setDisplayPort}>
                        <SelectTrigger id="display-port" className="w-auto flex-1">
                          <SelectValue placeholder="Select a port..." />
                        </SelectTrigger>
                        <SelectContent position="popper">
                          {portOptions.length === 0 ? (
                            <p className="px-3 py-3 text-base text-muted-foreground">
                              No ports found — tap refresh
                            </p>
                          ) : (
                            portOptions.map((p) => (
                              <SelectItem key={p.path} value={p.path}>
                                {p.path}
                                {p.manufacturer ? ` — ${p.manufacturer}` : ''}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={loadPorts}
                        title="Refresh ports"
                        aria-label="Refresh ports"
                      >
                        <RefreshCw />
                      </Button>
                    </div>
                    <FieldDescription>
                      Check Device Manager → Ports (COM &amp; LPT) for the correct port number
                    </FieldDescription>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="display-baud">Baud Rate</FieldLabel>
                    <Select
                      value={String(displayBaud)}
                      onValueChange={(v) => setDisplayBaud(Number(v))}
                    >
                      <SelectTrigger id="display-baud" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {BAUD_RATES.map((b) => (
                          <SelectItem key={b} value={String(b)}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      OCPD-LED8 default is 2400 baud. Check your display manual if different.
                    </FieldDescription>
                  </Field>

                  <div className="flex flex-wrap gap-3">
                    {displayStatus.connected ? (
                      <Button
                        size="lg"
                        variant="outline"
                        onClick={handleDisconnect}
                        disabled={displayBusy}
                      >
                        <Plug />
                        Disconnect
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        onClick={handleConnect}
                        disabled={displayBusy || !displayPort}
                      >
                        {displayBusy ? <Spinner className="size-5" /> : <PlugZap />}
                        {displayBusy ? 'Connecting...' : 'Connect'}
                      </Button>
                    )}
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handleTest}
                      disabled={!displayStatus.connected}
                    >
                      <MonitorCheck />
                      Test Display
                    </Button>
                  </div>

                  <Separator />
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Supported displays:</p>
                    <p>Epson DM-D110 / DM-D210, Logic Controls LD9000, Bixolon BCD-1100</p>
                    <p>and most generic 2×20 VFD pole displays (RS-232 serial)</p>
                  </div>
                </FieldGroup>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Backup Tab ───────────────────────────────────────────── */}
        <TabsContent value="backup" className={TAB_CONTENT_CLASS}>
          <div className={CARD_GRID_CLASS}>
            {/* Manual Backup */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="size-5" />
                  Create Backup
                </CardTitle>
                <CardDescription className="text-base">
                  Manually create an encrypted backup of your database
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
                  <p className="text-base">
                    Every backup is encrypted automatically. Backups contain customer records and
                    staff credentials, so they are never written or uploaded in the clear.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This machine unlocks its own backups without a password. To restore onto a
                    <strong> different</strong> machine you need the recovery key below — write it
                    down and keep it somewhere other than this computer.
                  </p>
                  {recoveryKey ? (
                    <div className="space-y-3">
                      <p className="break-all rounded-lg border bg-background p-3 font-mono text-lg font-bold tracking-wider">
                        {recoveryKey}
                      </p>
                      <Button variant="outline" onClick={() => handleCopyRecoveryKey(recoveryKey)}>
                        <Copy />
                        Copy key
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" onClick={handleShowRecoveryKey}>
                      <KeyRound />
                      Show recovery key
                    </Button>
                  )}
                </div>
                <Button size="lg" onClick={handleCreateBackup} disabled={backupBusy}>
                  {backupBusy ? <Spinner className="size-5" /> : <Upload />}
                  {backupBusy ? 'Creating...' : 'Create Backup Now'}
                </Button>
              </CardContent>
            </Card>

            {/* Local Backups List — the right-hand column on a wide screen, since
                it is the one that grows. */}
            <Card className="@5xl:col-start-2 @5xl:row-span-2 @5xl:row-start-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Database className="size-5" />
                  Local Backups
                </CardTitle>
                <CardDescription className="text-base">
                  Manage your local database backups
                </CardDescription>
                <CardAction>
                  <Button variant="outline" onClick={loadLocalBackups}>
                    <RefreshCw />
                    Refresh
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                {localBackups.length === 0 ? (
                  <Empty className="border p-8">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Database />
                      </EmptyMedia>
                      <EmptyTitle>No local backups found</EmptyTitle>
                      <EmptyDescription>
                        Create a backup above, or wait for the next automatic one.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ItemGroup className="gap-2">
                    {localBackups.map((backup) => (
                      <Item key={backup.path} variant="outline" role="listitem">
                        <ItemContent className="min-w-0">
                          <ItemTitle className="w-full truncate text-base">
                            {backup.path.split(/[\\/]/).pop()}
                          </ItemTitle>
                          <ItemDescription className="text-sm">
                            {new Date(backup.timestamp).toLocaleString()} •{' '}
                            {(backup.size / 1024 / 1024).toFixed(2)} MB
                            {!backup.valid && (
                              <span className="text-destructive">
                                {' '}
                                • empty — cannot be restored
                              </span>
                            )}
                          </ItemDescription>
                        </ItemContent>
                        <ItemActions className="gap-3">
                          <Button
                            variant="outline"
                            onClick={() => openRestoreDialog(backup.path)}
                            disabled={backupBusy || !backup.valid}
                          >
                            <Download />
                            Restore
                          </Button>
                          <Button
                            variant="destructive"
                            onClick={() => handleDeleteBackup(backup.path)}
                            disabled={backupBusy}
                          >
                            <Trash2 />
                            Delete
                          </Button>
                        </ItemActions>
                      </Item>
                    ))}
                  </ItemGroup>
                )}
              </CardContent>
            </Card>

            {/* Automatic Backup Scheduler */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Clock className="size-5" />
                  Automatic Backups
                </CardTitle>
                <CardDescription className="text-base">
                  Schedule automatic daily backups
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="backup-scheduler" className="text-base">
                      Daily automatic backups
                      <Badge
                        variant="secondary"
                        className={
                          schedulerStatus.running ? 'bg-success-muted text-success' : undefined
                        }
                      >
                        {schedulerStatus.running ? 'Scheduler Active' : 'Scheduler Stopped'}
                      </Badge>
                    </FieldLabel>
                    {schedulerStatus.running && schedulerStatus.nextRun && (
                      <FieldDescription>
                        Next backup: {new Date(schedulerStatus.nextRun).toLocaleString()}
                      </FieldDescription>
                    )}
                    <FieldDescription>
                      Last backup:{' '}
                      {schedulerStatus.lastBackup
                        ? new Date(schedulerStatus.lastBackup).toLocaleString()
                        : 'never'}
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="backup-scheduler"
                    checked={schedulerStatus.running}
                    onCheckedChange={() => handleSchedulerToggle()}
                    disabled={backupBusy}
                  />
                </Field>
                {schedulerStatus.lastError && (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription className="font-medium text-destructive">
                      Last attempt failed: {schedulerStatus.lastError}
                    </AlertDescription>
                  </Alert>
                )}
                <p className="text-sm text-muted-foreground">
                  Automatic backups run daily at 2:00 AM and are stored locally. If the machine was
                  switched off at that time, a catch-up backup runs at the next startup.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Updates Tab ───────────────────────────────────────────── */}
        <TabsContent value="updates" className={TAB_CONTENT_CLASS}>
          <div className="max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <CloudDownload className="size-5" />
                  Software Updates
                </CardTitle>
                <CardDescription className="text-base">
                  Check for a newer version of PharmaPOS
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <Button size="lg" onClick={handleCheckForUpdates} disabled={updateBusy}>
                  <RefreshCw className={updateBusy ? 'animate-spin' : undefined} />
                  {updateBusy ? 'Checking...' : 'Check for Updates'}
                </Button>

                {updateMsg && (
                  <Alert variant={updateIsError ? 'destructive' : 'default'}>
                    {updateIsError ? <AlertCircle /> : <CheckCircle2 className="text-success" />}
                    <AlertDescription
                      className={
                        updateIsError
                          ? 'break-words text-base font-medium text-destructive'
                          : 'break-words text-base font-medium text-foreground'
                      }
                    >
                      {updateMsg}
                    </AlertDescription>
                  </Alert>
                )}

                <Separator />
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="auto-update-enabled" className="text-base">
                      Automatic update checks
                    </FieldLabel>
                    <FieldDescription>
                      When on, PharmaPOS checks for updates every hour in the background. Takes
                      effect the next time PharmaPOS starts.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id="auto-update-enabled"
                    checked={settings.auto_update_enabled === '1'}
                    onCheckedChange={(on) => handleAutoUpdateChange(on ? '1' : '0')}
                  />
                </Field>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Appearance Tab ───────────────────────────────────────────── */}
        <TabsContent value="appearance" className={TAB_CONTENT_CLASS}>
          <div className="max-w-3xl">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Palette className="size-5" />
                  Appearance
                </CardTitle>
                <CardDescription className="text-base">
                  Choose how PharmaPOS looks on this machine. This is saved on this computer only
                  and is not included in backups.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p id="theme-label" className="text-base font-medium">
                  Theme
                </p>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  spacing={3}
                  value={themePreference}
                  onValueChange={(v) => {
                    // Radix sends "" when the active item is tapped again; keep the current one.
                    if (v) setThemePreference(v as ThemePreference)
                  }}
                  aria-labelledby="theme-label"
                  className="grid w-full grid-cols-3"
                >
                  {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <ToggleGroupItem
                      key={value}
                      value={value}
                      className="h-14 w-full gap-2 text-base data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:text-accent-foreground"
                    >
                      <Icon className="size-5" />
                      {label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <p className="text-sm text-muted-foreground">
                  System follows the Windows light / dark setting.
                </p>
              </CardContent>
            </Card>
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
          <Field data-invalid={Boolean(restoreError)}>
            <FieldLabel htmlFor="restore-password">
              Recovery key (only if this backup came from another machine)
            </FieldLabel>
            <Input
              id="restore-password"
              type="password"
              placeholder="Leave blank — this machine unlocks its own backups"
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
              aria-invalid={Boolean(restoreError)}
            />
            <FieldError className="font-medium">{restoreError}</FieldError>
          </Field>
          <DialogFooter className="gap-3">
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              onClick={() => setRestoreTarget(null)}
              disabled={backupBusy}
            >
              Cancel
            </Button>
            <Button
              size="lg"
              variant="destructive-solid"
              className="flex-1"
              onClick={handleRestoreConfirm}
              disabled={backupBusy}
            >
              {backupBusy && <Spinner className="size-5" />}
              {backupBusy ? 'Restoring…' : 'Restore & Restart'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}
