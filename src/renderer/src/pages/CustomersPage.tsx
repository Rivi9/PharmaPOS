import { useState, useEffect, useCallback } from 'react'
import { Search, UserPlus, Phone, Mail, Star, History } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@renderer/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Label } from '@renderer/components/ui/label'
import { useAuthStore } from '@renderer/stores/authStore'

interface Customer {
  id: string
  name: string
  phone: string | null
  email: string | null
  address: string | null
  loyalty_points: number
  notes: string | null
  created_at: string
}

interface PurchaseHistoryData {
  sales: Array<{
    id: string
    receipt_number: string
    total: number
    payment_method: string
    created_at: string
    item_count: number
  }>
  total_spent: number
  visit_count: number
}

export function CustomersPage(): React.JSX.Element {
  const userId = useAuthStore((s) => s.user?.id ?? '')
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Customer | null>(null)
  const [history, setHistory] = useState<PurchaseHistoryData | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Form state
  const [formName, setFormName] = useState('')
  const [formPhone, setFormPhone] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formAddress, setFormAddress] = useState('')
  const [formNotes, setFormNotes] = useState('')
  const [formError, setFormError] = useState('')

  const loadCustomers = useCallback(async () => {
    setIsLoading(true)
    try {
      const data = await window.electron.customers.list(search || undefined)
      setCustomers(data)
    } finally {
      setIsLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(loadCustomers, 300)
    return () => clearTimeout(timer)
  }, [loadCustomers])

  const loadHistory = async (customerId: string) => {
    const data = await window.electron.customers.purchaseHistory(customerId)
    setHistory(data)
  }

  const handleSelect = (customer: Customer) => {
    setSelected(customer)
    loadHistory(customer.id)
  }

  const openCreateForm = () => {
    setEditCustomer(null)
    setFormName('')
    setFormPhone('')
    setFormEmail('')
    setFormAddress('')
    setFormNotes('')
    setFormError('')
    setShowForm(true)
  }

  const openEditForm = (customer: Customer) => {
    setEditCustomer(customer)
    setFormName(customer.name)
    setFormPhone(customer.phone ?? '')
    setFormEmail(customer.email ?? '')
    setFormAddress(customer.address ?? '')
    setFormNotes(customer.notes ?? '')
    setFormError('')
    setShowForm(true)
  }

  const handleSaveCustomer = async () => {
    if (!formName.trim()) {
      setFormError('Name is required')
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

    if (editCustomer) {
      await window.electron.customers.update(userId, editCustomer.id, data)
    } else {
      await window.electron.customers.create(userId, data)
    }

    setShowForm(false)
    loadCustomers()
  }

  const handleDelete = async (customer: Customer) => {
    if (!confirm(`Delete customer "${customer.name}"?`)) return
    await window.electron.customers.delete(userId, customer.id)
    if (selected?.id === customer.id) setSelected(null)
    loadCustomers()
  }

  return (
    <div className="h-full flex overflow-hidden">
      {/* Customer List */}
      <div className="w-96 border-r flex flex-col">
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold">Customers</h1>
            <Button size="sm" onClick={openCreateForm}>
              <UserPlus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
              Loading...
            </div>
          ) : customers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 text-muted-foreground text-sm gap-1">
              <p>No customers found</p>
              {!search && <p className="text-xs">Click Add to create your first customer</p>}
            </div>
          ) : (
            customers.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelect(c)}
                className={`w-full text-left px-4 py-3 border-b hover:bg-muted/50 transition-colors ${selected?.id === c.id ? 'bg-primary/10 border-l-2 border-l-primary' : ''}`}
              >
                <div className="font-medium">{c.name}</div>
                <div className="text-sm text-muted-foreground flex items-center gap-3 mt-0.5">
                  {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.phone}</span>}
                  <span className="flex items-center gap-1"><Star className="w-3 h-3 text-yellow-500" />{c.loyalty_points} pts</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Customer Detail */}
      <div className="flex-1 overflow-auto p-6">
        {!selected ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Select a customer to view details
          </div>
        ) : (
          <div className="space-y-6 max-w-2xl">
            {/* Customer Info */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{selected.name}</CardTitle>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEditForm(selected)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(selected)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4 text-sm">
                {selected.phone && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase font-medium">Phone</p>
                    <p className="flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{selected.phone}</p>
                  </div>
                )}
                {selected.email && (
                  <div>
                    <p className="text-muted-foreground text-xs uppercase font-medium">Email</p>
                    <p className="flex items-center gap-1 mt-0.5"><Mail className="w-3 h-3" />{selected.email}</p>
                  </div>
                )}
                {selected.address && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs uppercase font-medium">Address</p>
                    <p className="mt-0.5">{selected.address}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs uppercase font-medium">Loyalty Points</p>
                  <p className="flex items-center gap-1 mt-0.5 font-semibold text-yellow-600">
                    <Star className="w-3 h-3" />{selected.loyalty_points} pts
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs uppercase font-medium">Customer Since</p>
                  <p className="mt-0.5">{new Date(selected.created_at).toLocaleDateString()}</p>
                </div>
              </CardContent>
            </Card>

            {/* Purchase History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="w-4 h-4" />
                  Purchase History
                  {history && (
                    <span className="ml-auto text-sm text-muted-foreground font-normal">
                      {history.visit_count} visits · Total: Rs. {history.total_spent.toFixed(2)}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!history ? (
                  <p className="text-sm text-muted-foreground">Loading...</p>
                ) : history.sales.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No purchases yet</p>
                ) : (
                  <div className="space-y-2">
                    {history.sales.map((sale) => (
                      <div key={sale.id} className="flex items-center justify-between py-2 border-b last:border-0 text-sm">
                        <div>
                          <p className="font-medium">{sale.receipt_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(sale.created_at).toLocaleDateString()} · {sale.item_count} items · {sale.payment_method}
                          </p>
                        </div>
                        <p className="font-semibold">Rs. {sale.total.toFixed(2)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCustomer ? 'Edit Customer' : 'New Customer'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={formPhone} onChange={(e) => setFormPhone(e.target.value)} placeholder="07X XXX XXXX" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={formEmail} onChange={(e) => setFormEmail(e.target.value)} placeholder="email@example.com" />
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Input value={formAddress} onChange={(e) => setFormAddress(e.target.value)} placeholder="Address" />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Input value={formNotes} onChange={(e) => setFormNotes(e.target.value)} placeholder="Any notes..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button onClick={handleSaveCustomer}>
                {editCustomer ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
