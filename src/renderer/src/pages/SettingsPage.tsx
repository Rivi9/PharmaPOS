import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { PrinterSetupWizard } from '@renderer/components/settings/PrinterSetupWizard'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { Save, MonitorCheck, RefreshCw, Plug, PlugZap } from 'lucide-react'

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
  const [localSettings, setLocalSettings] = useState(settings)
  const [saving, setSaving] = useState(false)

  // Pole display state
  const [availablePorts, setAvailablePorts] = useState<PortInfo[]>([])
  const [displayPort, setDisplayPort] = useState('')
  const [displayBaud, setDisplayBaud] = useState(9600)
  const [displayStatus, setDisplayStatus] = useState<DisplayStatus>({ connected: false, port: '', baudRate: 9600 })
  const [displayBusy, setDisplayBusy] = useState(false)
  const [displayMsg, setDisplayMsg] = useState('')

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

  const handleDisplayTabOpen = (): void => {
    loadPorts()
    loadDisplayStatus()
  }

  const handleConnect = async (): Promise<void> => {
    if (!displayPort) return
    setDisplayBusy(true)
    setDisplayMsg('')
    try {
      await window.electron.display.connect(displayPort, displayBaud)
      setDisplayMsg(`Connected to ${displayPort} at ${displayBaud} baud`)
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
          <TabsTrigger value="display" onClick={handleDisplayTabOpen}>Display</TabsTrigger>
          <TabsTrigger value="backup">Backup</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
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
                  <div className={`w-3 h-3 rounded-full ${displayStatus.connected ? 'bg-green-500' : 'bg-muted-foreground'}`} />
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
                          {p.path}{p.manufacturer ? ` — ${p.manufacturer}` : ''}
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
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Most VFD displays use 9600 baud (default). Check your display manual.
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
                  <p className={`text-sm font-medium ${displayMsg.startsWith('Error') ? 'text-destructive' : 'text-green-600'}`}>
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
