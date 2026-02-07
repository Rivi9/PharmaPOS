import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { CheckCircle2, Store, User } from 'lucide-react'

export function SetupWizardPage(): React.JSX.Element {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState({
    businessName: '',
    businessAddress: '',
    businessPhone: '',
    currency: 'Rs.',
    adminUsername: '',
    adminPassword: '',
    adminFullName: ''
  })

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = async () => {
    try {
      // Create admin user
      await window.electron.users.create({
        username: formData.adminUsername,
        password: formData.adminPassword,
        full_name: formData.adminFullName,
        role: 'admin'
      })

      // Initialize database settings
      await window.electron.setup.initialize(formData)

      // Mark setup complete
      await window.electron.setup.complete()

      // Navigate to login
      navigate('/login')
    } catch (error: any) {
      alert(`Setup failed: ${error.message}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              {[1, 2, 3].map((step) => (
                <div
                  key={step}
                  className={`h-2 w-16 rounded-full ${
                    step <= currentStep ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              Step {currentStep} of 3
            </span>
          </div>
          <CardTitle className="text-2xl">Welcome to PharmaPOS</CardTitle>
          <CardDescription>Let's set up your pharmacy management system</CardDescription>
        </CardHeader>

        <CardContent>
          {/* Step 1: Business Information */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Store className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-medium">Business Information</h3>
              </div>

              <div>
                <Label htmlFor="businessName">Business Name *</Label>
                <Input
                  id="businessName"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  placeholder="My Pharmacy"
                  required
                />
              </div>

              <div>
                <Label htmlFor="businessAddress">Address</Label>
                <Input
                  id="businessAddress"
                  value={formData.businessAddress}
                  onChange={(e) => setFormData({ ...formData, businessAddress: e.target.value })}
                  placeholder="123 Main Street, City"
                />
              </div>

              <div>
                <Label htmlFor="businessPhone">Phone Number</Label>
                <Input
                  id="businessPhone"
                  value={formData.businessPhone}
                  onChange={(e) => setFormData({ ...formData, businessPhone: e.target.value })}
                  placeholder="+1 234 567 8900"
                />
              </div>

              <div>
                <Label htmlFor="currency">Currency Symbol</Label>
                <Input
                  id="currency"
                  value={formData.currency}
                  onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                  placeholder="Rs."
                />
              </div>
            </div>
          )}

          {/* Step 2: Admin Account */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <User className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-medium">Create Admin Account</h3>
              </div>

              <div>
                <Label htmlFor="adminFullName">Full Name *</Label>
                <Input
                  id="adminFullName"
                  value={formData.adminFullName}
                  onChange={(e) => setFormData({ ...formData, adminFullName: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <Label htmlFor="adminUsername">Username *</Label>
                <Input
                  id="adminUsername"
                  value={formData.adminUsername}
                  onChange={(e) => setFormData({ ...formData, adminUsername: e.target.value })}
                  placeholder="admin"
                  required
                />
              </div>

              <div>
                <Label htmlFor="adminPassword">Password *</Label>
                <Input
                  id="adminPassword"
                  type="password"
                  value={formData.adminPassword}
                  onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                  placeholder="Enter a strong password"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Choose a strong password with at least 8 characters
                </p>
              </div>
            </div>
          )}

          {/* Step 3: Review & Complete */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-medium">Review & Complete</h3>
              </div>

              <div className="bg-muted p-4 rounded-lg space-y-2">
                <div>
                  <p className="text-sm font-medium">Business Name</p>
                  <p className="text-sm text-muted-foreground">{formData.businessName}</p>
                </div>
                {formData.businessAddress && (
                  <div>
                    <p className="text-sm font-medium">Address</p>
                    <p className="text-sm text-muted-foreground">{formData.businessAddress}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">Admin User</p>
                  <p className="text-sm text-muted-foreground">
                    {formData.adminFullName} (@{formData.adminUsername})
                  </p>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
                <p className="text-sm text-blue-900">
                  <strong>Ready to start!</strong> Click "Complete Setup" to initialize your
                  pharmacy management system.
                </p>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex gap-2 mt-6">
            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack}>
                Back
              </Button>
            )}
            {currentStep < 3 ? (
              <Button
                onClick={handleNext}
                disabled={
                  currentStep === 1
                    ? !formData.businessName
                    : !formData.adminUsername || !formData.adminPassword || !formData.adminFullName
                }
                className="ml-auto"
              >
                Next
              </Button>
            ) : (
              <Button onClick={handleComplete} className="ml-auto">
                Complete Setup
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
