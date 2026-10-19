import { useState, useEffect } from 'react'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Badge } from '@renderer/components/ui/badge'
import { Spinner } from '@renderer/components/ui/spinner'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@renderer/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { NumberInput } from '@renderer/components/common/number-input'
import { CheckCircle2, XCircle, Printer, RefreshCw } from 'lucide-react'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

interface PrinterConfig {
  type: 'epson' | 'star' | 'generic'
  interface: 'tcp' | 'usb'
  path: string
  ip: string
  port: number
  width: number
}

export function PrinterSetupWizard(): React.JSX.Element {
  const [step, setStep] = useState(1)
  const [config, setConfig] = useState<PrinterConfig>({
    type: 'epson',
    interface: 'usb',
    path: '',
    ip: '',
    port: 9100,
    width: 42
  })
  const [testResult, setTestResult] = useState<boolean | null>(null)
  const [testError, setTestError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [usbPrinters, setUsbPrinters] = useState<Array<{ name: string; path: string }>>([])
  const [usbListLoading, setUsbListLoading] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const loadUsbPrinters = async (currentPath?: string): Promise<void> => {
    setUsbListLoading(true)
    try {
      const list = await window.electron.printer.listUSB()
      setUsbPrinters(list as Array<{ name: string; path: string }>)
      if (list.length > 0 && !currentPath) {
        setConfig((prev) => ({ ...prev, path: (list[0] as { path: string }).path }))
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
      .then((saved: Partial<PrinterConfig> | null) => {
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

  const handleInterfaceChange = (value: 'tcp' | 'usb'): void => {
    setConfig({ ...config, interface: value, path: '' })
    if (value === 'usb') {
      loadUsbPrinters()
    }
  }

  const handleTestPrinter = async (): Promise<void> => {
    setIsLoading(true)
    setTestResult(null)
    setTestError(null)

    try {
      // Initialize with current config
      const initResult = (await window.electron.printer.initialize(config)) as
        | { success?: boolean; error?: string }
        | undefined
      if (initResult && initResult.success === false) {
        throw new Error(initResult.error || 'Failed to initialize printer')
      }

      // Test print
      const result = (await window.electron.printer.test()) as { success: boolean; error?: string }
      if (result.success) {
        setTestResult(true)
        setTimeout(() => setStep(3), 1500)
      } else {
        setTestResult(false)
        setTestError(result.error || 'Unknown error')
      }
    } catch (error) {
      setTestResult(false)
      setTestError(ipcErrorMessage(error, 'Unknown error'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveConfig = async (): Promise<void> => {
    setIsLoading(true)
    setSaveMessage(null)
    try {
      const saveResult = (await window.electron.printer.saveConfig(config)) as
        | { success?: boolean; error?: string }
        | undefined
      if (saveResult && saveResult.success === false) {
        throw new Error(saveResult.error || 'Failed to save printer configuration')
      }
      // Reported in place rather than through alert(): the wizard jumps back to
      // step 1 on success, and an OS modal on a touchscreen puts an unreachably
      // small OK button between the operator and that transition.
      setSaveMessage({ ok: true, text: 'Printer configuration saved.' })
      setStep(1)
    } catch (error) {
      setSaveMessage({
        ok: false,
        text: ipcErrorMessage(error, 'Failed to save printer configuration')
      })
    } finally {
      setIsLoading(false)
    }
  }

  /** parseInt('') is NaN; show an empty box rather than the text "NaN". */
  const numberText = (n: number): string => (Number.isNaN(n) ? '' : String(n))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Printer className="size-5" />
          Printer Setup Wizard
        </CardTitle>
        <CardDescription className="text-base">
          Configure your thermal receipt printer
        </CardDescription>
        <CardAction>
          <Badge variant="secondary" className="h-7 px-3 text-sm">
            Step {step} of 3
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Step 1: Choose Printer Type */}
        {step === 1 && (
          <FieldGroup className="gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="printer-type">Printer Type</FieldLabel>
                <Select
                  value={config.type}
                  onValueChange={(v) => setConfig({ ...config, type: v as PrinterConfig['type'] })}
                >
                  <SelectTrigger id="printer-type" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="epson">Epson (ESC/POS)</SelectItem>
                    <SelectItem value="star">Star Micronics</SelectItem>
                    <SelectItem value="generic">Generic (ESC/POS)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="printer-interface">Connection Type</FieldLabel>
                <Select
                  value={config.interface}
                  onValueChange={(v) => handleInterfaceChange(v as 'tcp' | 'usb')}
                >
                  <SelectTrigger id="printer-interface" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    <SelectItem value="usb">USB</SelectItem>
                    <SelectItem value="tcp">Network (TCP/IP)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {config.interface === 'usb' && (
              <Field>
                <FieldLabel htmlFor="printer-path">Printer</FieldLabel>
                <div className="flex gap-2">
                  {usbPrinters.length > 0 ? (
                    <Select
                      value={config.path}
                      onValueChange={(v) => setConfig({ ...config, path: v })}
                    >
                      <SelectTrigger id="printer-path" className="w-auto min-w-0 flex-1">
                        <SelectValue placeholder="Select a printer" />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        {usbPrinters.map((p) => (
                          <SelectItem key={p.path} value={p.path}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="printer-path"
                      className="flex-1"
                      value={config.path}
                      onChange={(e) => setConfig({ ...config, path: e.target.value })}
                      placeholder="Enter printer name (e.g. EPSON TM-T81III)"
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => loadUsbPrinters()}
                    disabled={usbListLoading}
                  >
                    {usbListLoading ? <Spinner className="size-5" /> : <RefreshCw />}
                    {usbListLoading ? 'Loading...' : 'Refresh list'}
                  </Button>
                </div>
                <FieldDescription>
                  USB printing requires the <strong>WinUSB</strong> driver. Download{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      window.open('https://zadig.akeo.ie')
                    }}
                  >
                    Zadig
                  </a>
                  , select your printer, and install WinUSB. Then click Refresh.
                </FieldDescription>
              </Field>
            )}

            {config.interface === 'tcp' && (
              <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
                <Field>
                  <FieldLabel htmlFor="printer-ip">IP Address</FieldLabel>
                  <Input
                    id="printer-ip"
                    inputMode="decimal"
                    value={config.ip}
                    onChange={(e) => setConfig({ ...config, ip: e.target.value })}
                    placeholder="192.168.1.100"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="printer-port">Port</FieldLabel>
                  <NumberInput
                    id="printer-port"
                    value={numberText(config.port)}
                    onValueChange={(v) => setConfig({ ...config, port: parseInt(v) })}
                  />
                </Field>
              </div>
            )}

            <Field>
              <FieldLabel htmlFor="printer-width">Receipt Width (characters)</FieldLabel>
              <NumberInput
                id="printer-width"
                value={numberText(config.width)}
                onValueChange={(v) => setConfig({ ...config, width: parseInt(v) })}
              />
              <FieldDescription>
                Common: 32 (58mm), 42 (80mm Font A), 56 (80mm Font B)
              </FieldDescription>
            </Field>

            <Button size="lg" onClick={() => setStep(2)} className="w-full">
              Next: Test Printer
            </Button>
          </FieldGroup>
        )}

        {/* Step 2: Test Printer */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="py-8 text-center">
              {testResult === null && !isLoading && (
                <>
                  <Printer className="mx-auto mb-4 size-16 text-muted-foreground" />
                  <p className="mb-2 text-lg font-medium">Ready to test printer</p>
                  <p className="mb-6 text-base text-muted-foreground">
                    Click the button below to print a test page
                  </p>
                  <div className="flex justify-center gap-3">
                    <Button size="lg" variant="outline" onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button onClick={handleTestPrinter} size="lg">
                      Print Test Page
                    </Button>
                  </div>
                </>
              )}

              {isLoading && (
                <>
                  <Spinner className="mx-auto mb-4 size-16 text-primary" />
                  <p className="text-lg font-medium">Testing printer...</p>
                </>
              )}

              {testResult === true && (
                <>
                  <CheckCircle2 className="mx-auto mb-4 size-16 text-success" />
                  <p className="mb-2 text-lg font-medium text-success">Test successful!</p>
                  <p className="text-base text-muted-foreground">
                    Proceeding to save configuration...
                  </p>
                </>
              )}

              {testResult === false && (
                <>
                  <XCircle className="mx-auto mb-4 size-16 text-destructive" />
                  <p className="mb-2 text-lg font-medium text-destructive">Test failed</p>
                  {testError && (
                    <p className="mx-auto mb-4 max-w-sm break-all rounded-md bg-muted px-3 py-2 text-left font-mono text-sm">
                      {testError}
                    </p>
                  )}
                  <p className="mb-6 text-base text-muted-foreground">
                    Please check your printer connection and settings
                  </p>
                  <div className="flex justify-center gap-3">
                    <Button size="lg" variant="outline" onClick={() => setStep(1)}>
                      Back to Settings
                    </Button>
                    <Button size="lg" onClick={handleTestPrinter}>
                      Try Again
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Save Configuration */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto mb-4 size-16 text-success" />
              <p className="mb-2 text-lg font-medium">Printer configured successfully!</p>
              <p className="mb-6 text-base text-muted-foreground">
                Save this configuration to use it for all receipts
              </p>
              <div className="flex justify-center gap-3">
                <Button size="lg" variant="outline" onClick={() => setStep(1)}>
                  Configure Another
                </Button>
                <Button size="lg" onClick={handleSaveConfig} disabled={isLoading}>
                  {isLoading && <Spinner className="size-5" />}
                  Save Configuration
                </Button>
              </div>
            </div>
          </div>
        )}
        {saveMessage && (
          <Alert
            role="status"
            variant={saveMessage.ok ? 'default' : 'destructive'}
            className={
              saveMessage.ok ? 'border-success/30 bg-success-muted text-success' : undefined
            }
          >
            {saveMessage.ok ? <CheckCircle2 /> : <XCircle />}
            <AlertDescription className="text-base font-medium text-current">
              {saveMessage.text}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
