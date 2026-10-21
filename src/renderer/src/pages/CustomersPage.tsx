import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import {
  UserPlus,
  Phone,
  Mail,
  History,
  MapPin,
  StickyNote,
  CalendarDays,
  Pencil,
  UserMinus,
  ShieldX,
  Users,
  Receipt
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Textarea } from '@renderer/components/ui/textarea'
import { Skeleton } from '@renderer/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from '@renderer/components/ui/empty'
import { Field, FieldError, FieldGroup, FieldLabel } from '@renderer/components/ui/field'
import { SearchInput } from '@renderer/components/common/search-input'
import { useAuthStore } from '@renderer/stores/authStore'
import { ipcErrorMessage } from '@renderer/lib/ipc-error'
import { formatCurrency } from '@renderer/lib/calculations'
import { cn } from '@renderer/lib/utils'
import { ConfirmDialog } from '@renderer/components/ui/confirm-dialog'
import { useConfirm } from '@renderer/hooks/useConfirm'
import { usePermission } from '@renderer/hooks/usePermission'

interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  created_at: string
}

interface PurchaseHistoryEntry {
  id: string
  receiptNumber: string
  total: number
  paymentMethod: string
  createdAt: string
  items: { productName: string; quantity: number; lineTotal: number }[]
}

/** Which form field a save error belongs to, so it renders under that field. */
type FormErrorField = 'name' | 'phone' | 'form'

export function CustomersPage(): React.JSX.Element {
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [history, setHistory] = useState<PurchaseHistoryEntry[] | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  // The customer whose history is wanted, so a slow response for a customer
  // tapped earlier cannot overwrite the one now on screen.
  const historyFor = useRef<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formError, setFormError] = useState('')
  const [formErrorField, setFormErrorField] = useState<FormErrorField>('form')
  const [isSaving, setIsSaving] = useState(false)
  const { confirm, notify, confirmProps } = useConfirm()
  const canErase = usePermission('customers:erase')

  const loadCustomers = useCallback(async () => {
    setIsLoading(true)
    try {
      const data: Customer[] = await window.electron.customers.list(search || undefined)
      setCustomers(data)
      // Keep the detail panel in step with an edit; a customer filtered out by
      // the search stays on screen as it was.
      setSelected((prev) => (prev ? (data.find((c) => c.id === prev.id) ?? prev) : prev))
    } catch (error) {
      toast.error('Could not load customers', { description: ipcErrorMessage(error) })
    } finally {
      setIsLoading(false)
      setHasLoaded(true)
    }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(loadCustomers, 300)
    return () => clearTimeout(timer)
  }, [loadCustomers])

  const loadHistory = async (customerId: string): Promise<void> => {
    historyFor.current = customerId
    try {
      const data = await window.electron.customers.purchaseHistory(customerId)
      if (historyFor.current === customerId) setHistory(data ?? [])
    } catch {
      // Fall back to an empty history so the panel shows "No purchases yet"
      // rather than sitting on "Loading..." forever.
      if (historyFor.current === customerId) setHistory([])
    }
  }

  const handleSelect = (customer: Customer): void => {
    setSelected(customer)
    setHistory(null)
    loadHistory(customer.id)
  }

  const showFormError = (message: string, field: FormErrorField = 'form'): void => {
    setFormError(message)
    setFormErrorField(field)
  }

  const openCreateForm = (): void => {
    setEditCustomer(null)
    setFormName('')
    setFormPhone('')
    setFormEmail('')
    setFormAddress('')
    setFormNotes('')
    setFormError('')
    setShowForm(true)
  }

  const openEditForm = (customer: Customer): void => {
    setEditCustomer(customer)
    setFormName(customer.name)
    setFormPhone(customer.phone ?? '')
    setFormEmail(customer.email ?? '')
    setFormAddress(customer.address ?? '')
    setFormNotes(customer.notes ?? '')
    setFormError('')
    setShowForm(true)
  }

  const handleSaveCustomer = async (): Promise<void> => {
    if (!formName.trim()) {
      showFormError('Name is required', 'name')
      return
    }
    setFormError('')

    const data = {
      name: formName.trim(),
      phone: formPhone.trim() || undefined,
      email: formEmail.trim() || undefined,
      address: formAddress.trim() || undefined,
      notes: formNotes.trim() || undefined
    }

    // The handlers report failure by throwing, not by returning
    // `{ success: false }` — the old check could never fire, so a duplicate
    // phone number or a permission error closed the dialog as if it had saved.
    setIsSaving(true)
    try {
      if (editCustomer) {
        await window.electron.customers.update(userId, editCustomer.id, data)
      } else {
        await window.electron.customers.create(userId, data)
      }
    } catch (error) {
      if (/UNIQUE constraint failed: customers.phone/.test(String(error))) {
        showFormError('Another customer already uses that phone number', 'phone')
      } else {
        showFormError(ipcErrorMessage(error, 'Failed to save customer'))
      }
      return
    } finally {
      setIsSaving(false)
    }

    toast.success(editCustomer ? `${data.name} updated` : `${data.name} added`)
    setShowForm(false)
    loadCustomers()
  }

  const handleDelete = async (customer: Customer): Promise<void> => {
    const ok = await confirm({
      title: `Remove ${customer.name}?`,
      description:
        'Their past sales stay on record; they just stop appearing in the customer list.',
      confirmLabel: 'Remove',
      destructive: true
    })
    if (!ok) return
    try {
      await window.electron.customers.delete(userId, customer.id)
    } catch (error) {
      await notify('Could not remove customer', ipcErrorMessage(error))
      return
    }
    toast.success(`${customer.name} removed`)
    if (selected?.id === customer.id) setSelected(null)
    loadCustomers()
  }

  /**
   * The data-protection path, separate from Remove. Remove only hides the
   * customer; this destroys the identifying fields for good, including the
   * copies the sales table keeps on every transaction.
   */
  const handleErase = async (customer: Customer): Promise<void> => {
    const ok = await confirm({
      title: `Permanently erase ${customer.name}?`,
      description:
        'Their name, phone, email, address and notes are destroyed, here and on every past sale. The sales themselves are kept for the accounts. This cannot be undone and it cannot be recovered from a backup taken afterwards.',
      confirmLabel: 'Erase permanently',
      destructive: true
    })
    if (!ok) return
    try {
      const result = (await window.electron.customers.erase(userId, customer.id)) as {
        salesScrubbed?: number
      }
      setSelected(null)
      await notify(
        'Customer erased',
        `${result?.salesScrubbed ?? 0} sale${result?.salesScrubbed === 1 ? '' : 's'} had their stored name and phone cleared.`
      )
    } catch (error) {
      await notify('Could not erase the customer', ipcErrorMessage(error))
      return
    }
    loadCustomers()
  }

  const historyTotal = history?.reduce((s, h) => s + h.total, 0) ?? 0

  return (
    <div className="flex h-full gap-4 overflow-hidden bg-canvas p-4">
      {/* Customer List */}
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs xl:w-96">
        <div className="flex flex-col gap-3 border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Customers</h1>
              <p className="text-sm text-muted-foreground">
                {hasLoaded ? `${customers.length} shown` : 'Loading…'}
              </p>
            </div>
            <Button onClick={openCreateForm}>
              <UserPlus className="size-5" />
              Add
            </Button>
          </div>
          <SearchInput
            value={search}
            onValueChange={setSearch}
            loading={isLoading && hasLoaded}
            placeholder="Search by name or phone..."
            className="max-w-none"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {!hasLoaded ? (
            <div className="flex flex-col gap-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : customers.length === 0 ? (
            <Empty className="p-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>No customers found</EmptyTitle>
                <EmptyDescription>
                  {search
                    ? 'Try another name or phone number.'
                    : 'Tap Add to create your first customer.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col gap-1 p-2">
              {customers.map((c) => {
                const isSelected = selected?.id === c.id
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(c)}
                      aria-pressed={isSelected}
                      className={cn(
                        'flex min-h-16 w-full flex-col justify-center rounded-xl px-4 py-3 text-left transition-colors touch-manipulation hover:bg-muted active:bg-muted',
                        isSelected && 'bg-accent text-accent-foreground hover:bg-accent'
                      )}
                    >
                      <span className="text-base font-medium">{c.name}</span>
                      {c.phone && (
                        <span
                          className={cn(
                            'mt-0.5 flex items-center gap-1.5 text-sm',
                            isSelected ? 'text-accent-foreground/80' : 'text-muted-foreground'
                          )}
                        >
                          <Phone className="size-4" />
                          {c.phone}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      {/* Customer Detail. Fills the rest of the screen: on a wide (maximised)
          till the contact card and the purchase history sit side by side, below
          that they stack; either way the history list scrolls inside its own
          card. The column itself only scrolls as a fallback, when a short window
          leaves the history less than its minimum height. */}
      <div className="@container flex min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center rounded-2xl border bg-card shadow-xs">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Users />
                </EmptyMedia>
                <EmptyTitle>Select a customer to view details</EmptyTitle>
                <EmptyDescription>
                  Their contact details and purchase history appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-4 @4xl:flex-row">
            {/* Customer Info */}
            <section className="@container/info shrink-0 rounded-2xl border bg-card p-6 shadow-xs @4xl:w-[28rem] @4xl:self-start">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold">{selected.name}</h2>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarDays className="size-4" />
                    Customer since {new Date(selected.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => openEditForm(selected)}>
                    <Pencil className="size-5" />
                    Edit
                  </Button>
                  <Button variant="outline" onClick={() => handleDelete(selected)}>
                    <UserMinus className="size-5" />
                    Remove
                  </Button>
                  {canErase && (
                    <Button variant="destructive" onClick={() => handleErase(selected)}>
                      <ShieldX className="size-5" />
                      Erase data
                    </Button>
                  )}
                </div>
              </div>

              <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 @md/info:grid-cols-2">
                <DetailItem icon={Phone} label="Phone" value={selected.phone} />
                <DetailItem icon={Mail} label="Email" value={selected.email} />
                <DetailItem
                  icon={MapPin}
                  label="Address"
                  value={selected.address}
                  className="@md/info:col-span-2"
                />
                <DetailItem
                  icon={StickyNote}
                  label="Notes"
                  value={selected.notes}
                  className="@md/info:col-span-2"
                />
              </dl>
            </section>

            {/* Purchase History */}
            <section className="flex min-h-64 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-xs">
              <div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-6 py-4">
                <History className="size-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">Purchase History</h3>
                {history && history.length > 0 && (
                  <span className="ml-auto text-base text-muted-foreground tabular-nums">
                    {history.length} visits · Total:{' '}
                    <span className="font-semibold text-foreground">
                      {formatCurrency(historyTotal)}
                    </span>
                  </span>
                )}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
                {!history ? (
                  <div className="flex flex-col gap-2 p-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : history.length === 0 ? (
                  <Empty className="p-8">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Receipt />
                      </EmptyMedia>
                      <EmptyTitle>No purchases yet</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                ) : (
                  <ul className="flex flex-col divide-y">
                    {history.map((sale) => (
                      <li key={sale.id} className="px-4 py-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-medium">{sale.receiptNumber}</p>
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                              {new Date(sale.createdAt).toLocaleDateString()}
                              <Badge variant="secondary" className="h-6 px-2.5 text-sm capitalize">
                                {sale.paymentMethod}
                              </Badge>
                            </p>
                          </div>
                          <p className="text-lg font-semibold tabular-nums">
                            {formatCurrency(sale.total)}
                          </p>
                        </div>
                        <ul className="mt-2 flex flex-col gap-1 border-l-2 border-border pl-3">
                          {sale.items.map((item, i) => (
                            <li
                              key={i}
                              className="flex items-center justify-between gap-4 text-sm text-muted-foreground"
                            >
                              <span className="truncate">
                                {item.productName} × {item.quantity}
                              </span>
                              <span className="tabular-nums">{formatCurrency(item.lineTotal)}</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {editCustomer ? 'Edit Customer' : 'New Customer'}
            </DialogTitle>
            <DialogDescription className="text-base">Only the name is required.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-6"
            onSubmit={(e) => {
              e.preventDefault()
              handleSaveCustomer()
            }}
          >
            <FieldGroup className="gap-5">
              <Field data-invalid={(formError && formErrorField === 'name') || undefined}>
                <FieldLabel htmlFor="customer-name">Name *</FieldLabel>
                <Input
                  id="customer-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Full name"
                  aria-invalid={(formError && formErrorField === 'name') || undefined}
                  autoComplete="off"
                />
                {formErrorField === 'name' && <FieldError>{formError}</FieldError>}
              </Field>
              <Field data-invalid={(formError && formErrorField === 'phone') || undefined}>
                <FieldLabel htmlFor="customer-phone">Phone</FieldLabel>
                <Input
                  id="customer-phone"
                  type="tel"
                  inputMode="tel"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  placeholder="07X XXX XXXX"
                  aria-invalid={(formError && formErrorField === 'phone') || undefined}
                  autoComplete="off"
                />
                {formErrorField === 'phone' && <FieldError>{formError}</FieldError>}
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-email">Email</FieldLabel>
                <Input
                  id="customer-email"
                  inputMode="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="email@example.com"
                  autoComplete="off"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-address">Address</FieldLabel>
                <Textarea
                  id="customer-address"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Address"
                  rows={2}
                  className="min-h-12 md:text-base"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="customer-notes">Notes</FieldLabel>
                <Textarea
                  id="customer-notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Any notes..."
                  rows={2}
                  className="min-h-12 md:text-base"
                />
              </Field>
            </FieldGroup>

            {formErrorField === 'form' && (
              <FieldError className="font-medium">{formError}</FieldError>
            )}

            <DialogFooter className="gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setShowForm(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button type="submit" size="lg" className="flex-1" disabled={isSaving}>
                {isSaving ? 'Saving…' : editCustomer ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog {...confirmProps} />
    </div>
  )
}

function DetailItem({
  icon: Icon,
  label,
  value,
  className
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <dt className="text-sm text-muted-foreground">{label}</dt>
        <dd
          className={cn(
            'text-base break-words whitespace-pre-line',
            !value && 'text-muted-foreground'
          )}
        >
          {value || '—'}
        </dd>
      </div>
    </div>
  )
}
