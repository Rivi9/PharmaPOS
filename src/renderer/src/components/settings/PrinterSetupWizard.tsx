import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
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
    width: 42
  })
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [usbPrinters, setUsbPrinters] = useState<Array<{ name: string; path: string }>>([])
  const [usbListLoading, setUsbListLoading] = useState(false)

  const loadUsbPrinters = async (currentPath?: string) => {
    setUsbListLoading(true)
    try {
      const list = await window.electron.printer.listUSB()
      setUsbPrinters(list as Array<{ name: string; path: string }>)
      if (list.length > 0 && !currentPath) {
        setConfig((prev) => ({ ...prev, path: (list[0] as any).path }))
      }
    } catch {
      setUsbPrinters([])
    } finally {
      setUsbListLoading(false)
    }
  }

  useEffect(() => {
    window.electron.printer
      .getConfig()
      .then((saved: any) => {
        if (saved) {
          setConfig({
            type: saved.type || 'epson',
            interface: saved.interface || 'usb',
            path: saved.path || '',
            ip: saved.ip || '',
            port: saved.port || 9100,
            width: saved.width || 42
          })
          if (saved.interface === 'usb') {
            loadUsbPrinters(saved.path)
          }
        }
      })
      .catch(() => {
        /* no saved config yet */
      })
  }, [])

  const handleInterfaceChange = (value: 'tcp' | 'usb' | 'serial') => {
    setConfig({ ...config, interface: value, path: '' })
    if (value === 'usb') {
      loadUsbPrinters()
    }
  }

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
                onChange={(e) => handleInterfaceChange(e.target.value as any)}
                className="w-full border rounded-md px-3 py-2"
              >
                <option value="usb">USB</option>
                <option value="tcp">Network (TCP/IP)</option>
                <option value="serial">Serial Port</option>
              </select>
            </div>

            {config.interface === 'usb' && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="printer-path">Printer</Label>
                  <button
                    type="button"
                    onClick={loadUsbPrinters}
                    disabled={usbListLoading}
                    className="text-xs text-primary underline disabled:opacity-50"
                  >
                    {usbListLoading ? 'Loading...' : 'Refresh list'}
                  </button>
                </div>
                {usbPrinters.length > 0 ? (
                  <select
                    id="printer-path"
                    value={config.path}
                    onChange={(e) => setConfig({ ...config, path: e.target.value })}
                    className="w-full border rounded-md px-3 py-2"
                  >
                    {usbPrinters.map((p) => (
                      <option key={p.path} value={p.path}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="printer-path"
                    value={config.path}
                    onChange={(e) => setConfig({ ...config, path: e.target.value })}
                    placeholder="Enter printer name (e.g. EPSON TM-T81III)"
                  />
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  On Windows, this is the printer name shown in Devices &amp; Printers
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
                Common: 32 (58mm), 42 (80mm Font A), 56 (80mm Font B)
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
