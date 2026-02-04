import { useEffect, useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { PrinterSetupWizard } from '@renderer/components/settings/PrinterSetupWizard'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { Save } from 'lucide-react'

export function SettingsPage(): React.JSX.Element {
  const { settings, isLoading, loadSettings, updateSetting } = useSettingsStore()
  const [localSettings, setLocalSettings] = useState(settings)
  const [saving, setSaving] = useState(false)

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
