import { useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Cross,
  Info,
  Store,
  User
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@renderer/components/ui/card'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Alert, AlertDescription } from '@renderer/components/ui/alert'
import { Spinner } from '@renderer/components/ui/spinner'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from '@renderer/components/ui/field'
import { cn } from '@renderer/lib/utils'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'

const STEPS = [
  { title: 'Business', icon: Store },
  { title: 'Admin account', icon: User },
  { title: 'Review', icon: CheckCircle2 }
] as const

/** Numbered step indicator. Purely visual — the steps are not clickable, so a
 *  later step can never be reached without passing the earlier step's checks. */
function StepIndicator({ current }: { current: number }): React.JSX.Element {
  return (
    <ol className="flex items-center gap-2" aria-label={`Step ${current} of ${STEPS.length}`}>
      {STEPS.map((step, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <li
            key={step.title}
            className={cn('flex items-center gap-2', n < STEPS.length && 'flex-1')}
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={cn(
                'grid size-10 shrink-0 place-items-center rounded-full border-2 text-base font-semibold tabular-nums transition-colors',
                done && 'border-primary bg-primary text-primary-foreground',
                active && 'border-primary bg-accent text-accent-foreground',
                !done && !active && 'border-border bg-card text-muted-foreground'
              )}
            >
              {done ? <Check className="size-5" /> : n}
            </span>
            <span
              className={cn(
                'hidden text-sm font-medium whitespace-nowrap sm:inline',
                active ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {step.title}
            </span>
            {n < STEPS.length && (
              <span
                className={cn(
                  'h-0.5 flex-1 rounded-full transition-colors',
                  done ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Required(): React.JSX.Element {
  return (
    <span aria-hidden="true" className="text-destructive">
      *
    </span>
  )
}

export function SetupWizardPage(): React.JSX.Element {
  const [currentStep, setCurrentStep] = useState(1)
  const [setupError, setSetupError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    businessName: '',
    businessAddress: '',
    businessPhone: '',
    currency: 'Rs.',
    adminUsername: '',
    adminPassword: '',
    adminFullName: ''
  })

  // Mirrors assertPasswordStrength() in the main process. The server is still the
  // authority — this only saves the operator a round-trip on the very first screen
  // they ever see.
  const pw = formData.adminPassword
  const passwordProblem =
    pw.length === 0
      ? null
      : pw.length < 8
        ? 'Password must be at least 8 characters'
        : pw.toLowerCase() === formData.adminUsername.trim().toLowerCase()
          ? 'Password must not be the same as the username'
          : null

  const adminStepIncomplete =
    !formData.adminUsername.trim() ||
    !formData.adminFullName.trim() ||
    pw.length < 8 ||
    passwordProblem !== null

  const handleNext = (): void => {
    if (currentStep < 3) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = (): void => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = async (): Promise<void> => {
    setSetupError('')
    setIsSubmitting(true)
    try {
      // Initialize database settings AND create the first admin user
      await window.electron.setup.initialize(formData)

      // Mark setup complete
      await window.electron.setup.complete()

      // Reload to show login page
      window.location.reload()
    } catch (error) {
      // Inline rather than alert(): the installer runs on a bare touchscreen
      // where an OS modal is the one thing that cannot be dismissed by finger.
      setSetupError(ipcErrorMessage(error, 'Setup failed'))
      setIsSubmitting(false)
    }
  }

  const StepIcon = STEPS[currentStep - 1].icon

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <Card className="w-full max-w-2xl gap-0 rounded-2xl py-0 text-base">
        <CardHeader className="gap-6 border-b p-6 [.border-b]:pb-6">
          <div className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-xs">
              <Cross className="size-7" />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-2xl font-semibold">Welcome to PharmaPOS</CardTitle>
              <CardDescription className="gap-1 text-base">
                Let&apos;s set up your pharmacy management system
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <StepIndicator current={currentStep} />
            </div>
            <span className="shrink-0 text-sm text-muted-foreground">
              Step {currentStep} of {STEPS.length}
            </span>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-6 p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-accent text-accent-foreground">
              <StepIcon className="size-5" />
            </span>
            <h2 className="text-xl font-semibold">
              {currentStep === 1
                ? 'Business Information'
                : currentStep === 2
                  ? 'Create Admin Account'
                  : 'Review & Complete'}
            </h2>
          </div>

          {/* Step 1: Business Information */}
          {currentStep === 1 && (
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="businessName" className="gap-1 text-base">
                  Business Name <Required />
                </FieldLabel>
                <Input
                  id="businessName"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  placeholder="My Pharmacy"
                  autoFocus
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="businessAddress" className="gap-1 text-base">
                  Address
                </FieldLabel>
                <Input
                  id="businessAddress"
                  value={formData.businessAddress}
                  onChange={(e) => setFormData({ ...formData, businessAddress: e.target.value })}
                  placeholder="123 Main Street, City"
                />
              </Field>

              <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
                <Field>
                  <FieldLabel htmlFor="businessPhone" className="gap-1 text-base">
                    Phone Number
                  </FieldLabel>
                  <Input
                    id="businessPhone"
                    type="tel"
                    value={formData.businessPhone}
                    onChange={(e) => setFormData({ ...formData, businessPhone: e.target.value })}
                    placeholder="+1 234 567 8900"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="currency" className="gap-1 text-base">
                    Currency Symbol
                  </FieldLabel>
                  <Input
                    id="currency"
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    placeholder="Rs."
                  />
                </Field>
              </div>
            </FieldGroup>
          )}

          {/* Step 2: Admin Account */}
          {currentStep === 2 && (
            <FieldGroup className="gap-5">
              <Field>
                <FieldLabel htmlFor="adminFullName" className="gap-1 text-base">
                  Full Name <Required />
                </FieldLabel>
                <Input
                  id="adminFullName"
                  value={formData.adminFullName}
                  onChange={(e) => setFormData({ ...formData, adminFullName: e.target.value })}
                  placeholder="John Doe"
                  autoFocus
                  required
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="adminUsername" className="gap-1 text-base">
                  Username <Required />
                </FieldLabel>
                <Input
                  id="adminUsername"
                  value={formData.adminUsername}
                  onChange={(e) => setFormData({ ...formData, adminUsername: e.target.value })}
                  placeholder="admin"
                  autoComplete="off"
                  required
                />
              </Field>

              <Field data-invalid={passwordProblem ? true : undefined}>
                <FieldLabel htmlFor="adminPassword" className="gap-1 text-base">
                  Password <Required />
                </FieldLabel>
                <Input
                  id="adminPassword"
                  type="password"
                  value={formData.adminPassword}
                  onChange={(e) => setFormData({ ...formData, adminPassword: e.target.value })}
                  placeholder="Enter a strong password"
                  autoComplete="new-password"
                  aria-invalid={passwordProblem ? true : undefined}
                  aria-describedby="adminPassword-hint"
                  required
                />
                {/* This line used to be copy only — nothing checked it, here or
                    in the main process. It now reflects the real rule. Exactly one
                    of the two is rendered, so the rule text appears once. */}
                {passwordProblem ? (
                  <FieldError id="adminPassword-hint" className="font-medium">
                    {passwordProblem}
                  </FieldError>
                ) : (
                  <FieldDescription id="adminPassword-hint">
                    At least 8 characters, and not the same as the username
                  </FieldDescription>
                )}
              </Field>
            </FieldGroup>
          )}

          {/* Step 3: Review & Complete */}
          {currentStep === 3 && (
            <div className="flex flex-col gap-4">
              <dl className="divide-y rounded-xl border bg-muted/40">
                <div className="flex flex-col gap-0.5 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Business Name</dt>
                  <dd className="font-medium">{formData.businessName}</dd>
                </div>
                {formData.businessAddress && (
                  <div className="flex flex-col gap-0.5 px-4 py-3">
                    <dt className="text-sm text-muted-foreground">Address</dt>
                    <dd className="font-medium">{formData.businessAddress}</dd>
                  </div>
                )}
                {formData.businessPhone && (
                  <div className="flex flex-col gap-0.5 px-4 py-3">
                    <dt className="text-sm text-muted-foreground">Phone Number</dt>
                    <dd className="font-medium">{formData.businessPhone}</dd>
                  </div>
                )}
                <div className="flex flex-col gap-0.5 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Currency Symbol</dt>
                  <dd className="font-medium">{formData.currency}</dd>
                </div>
                <div className="flex flex-col gap-0.5 px-4 py-3">
                  <dt className="text-sm text-muted-foreground">Admin User</dt>
                  <dd className="font-medium">
                    {formData.adminFullName}{' '}
                    <span className="font-normal text-muted-foreground">
                      (@{formData.adminUsername})
                    </span>
                  </dd>
                </div>
              </dl>

              <div className="flex items-start gap-3 rounded-xl bg-info-muted p-4 text-info">
                <Info className="mt-0.5 size-5 shrink-0" />
                <p>
                  <strong>Ready to start!</strong> Click &quot;Complete Setup&quot; to initialize
                  your pharmacy management system.
                </p>
              </div>
            </div>
          )}

          {setupError && (
            <Alert variant="destructive" className="gap-1 text-base">
              <AlertCircle />
              <AlertDescription>{setupError}</AlertDescription>
            </Alert>
          )}
        </CardContent>

        {/* Navigation Buttons */}
        <CardFooter className="gap-3 border-t bg-muted/30 p-6 [.border-t]:pt-6">
          {currentStep > 1 && (
            <Button variant="outline" size="lg" onClick={handleBack} disabled={isSubmitting}>
              <ArrowLeft />
              Back
            </Button>
          )}
          {currentStep < 3 ? (
            <Button
              size="lg"
              onClick={handleNext}
              disabled={currentStep === 1 ? !formData.businessName : adminStepIncomplete}
              className="ml-auto min-w-40"
            >
              Next
              <ArrowRight />
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleComplete}
              disabled={isSubmitting}
              className="ml-auto min-w-48"
            >
              {isSubmitting ? <Spinner className="size-5" aria-hidden="true" /> : <Check />}
              {isSubmitting ? 'Setting up…' : 'Complete Setup'}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
