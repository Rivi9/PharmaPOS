/**
 * Customer rules shared by the main process (which enforces them inside the
 * sale transaction) and the till (which shows the cashier what will happen
 * before Complete Sale is pressed). One copy, so the two cannot disagree.
 */

/**
 * Sri Lankan mobile/landline numbers, reduced to a single canonical form.
 *
 * Numbers were stored exactly as typed, so `0771234567`, `+94771234567` and
 * `077 123 4567` were three distinct customers as far as the UNIQUE index was
 * concerned — and `createSale` links by exact equality, so a differently
 * formatted entry silently failed to attach the sale to the customer's history.
 */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null
  let digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('+94')) digits = '0' + digits.slice(3)
  else if (digits.startsWith('0094')) digits = '0' + digits.slice(4)
  else if (digits.startsWith('94') && digits.length === 11) digits = '0' + digits.slice(2)
  digits = digits.replace(/\D/g, '')
  if (digits.length === 9 && !digits.startsWith('0')) digits = '0' + digits
  return digits || null
}

/** A normalised number the Customers tab would accept: 10 digits starting with 0. */
export function isValidCustomerPhone(normalised: string | null | undefined): normalised is string {
  return !!normalised && /^0\d{9}$/.test(normalised)
}

export const CUSTOMER_NAME_MAX = 120

/**
 * The name a customer saved from the till gets when the cashier typed only a
 * phone number. `customers.name` is NOT NULL, and the list, the detail panel
 * and the till's "returning customer" card all lead with the name, so it needs
 * something a person can read.
 *
 * "Customer 4567" rather than the number itself: the number already has its
 * own column, so repeating it as the name reads as a data error, while the
 * last four digits still tell two unnamed customers apart at a glance and say
 * plainly that nobody has given a name yet. It is derived from the record's own
 * phone, so it can be recognised later and replaced by the first real name a
 * cashier types for that number.
 */
export function placeholderCustomerName(phone: string): string {
  return `Customer ${phone.slice(-4)}`
}

/** False for a blank name or the placeholder above — i.e. nobody has given one. */
export function hasRealCustomerName(
  name: string | null | undefined,
  phone: string | null
): boolean {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return false
  return !(phone && trimmed === placeholderCustomerName(phone))
}

export interface CheckoutCustomerInput {
  /** The typed number after `normalisePhone`. */
  phone: string | null
  /** The typed name, trimmed; empty when nothing was typed. */
  typedName: string
  /** The ACTIVE customer holding this number, if any. */
  active: { id: string; name: string; phone: string | null } | null
  /**
   * A deactivated ("Removed") customer still holds this number. Erased
   * customers never do — erasure clears the phone — so they cannot match.
   */
  heldByRemoved: boolean
  /** The signed-in role holds `customers:create`. */
  canCreate: boolean
}

export type CheckoutCustomerPlan =
  | { kind: 'none'; reason: 'no-phone' | 'invalid-phone' | 'removed' | 'not-permitted' }
  | { kind: 'link'; customerId: string; displayName: string; fillName: string | null }
  | { kind: 'create'; name: string; placeholder: boolean }

/**
 * What a sale does with the customer fields typed at checkout.
 *
 * Only a phone number identifies someone, so a name on its own stays on the
 * receipt and creates nothing. A number that matches an active customer links
 * the sale to them; a number nobody holds creates the customer, so the
 * Customers tab fills itself from ordinary sales instead of staying empty
 * unless staff pre-register everyone.
 *
 * A stored real name is never overwritten from the till — a cashier editing the
 * name box for one receipt must not rename the customer behind their back. The
 * receipt still prints what was typed. Only a blank or placeholder name is
 * filled in.
 *
 * A number held by a Removed customer neither links nor creates: the removal
 * must not be quietly undone by typing the number in again, and the UNIQUE
 * index on phone would refuse a second row anyway.
 */
export function planCheckoutCustomer(input: CheckoutCustomerInput): CheckoutCustomerPlan {
  const { phone, active } = input
  const typedName = input.typedName.trim().slice(0, CUSTOMER_NAME_MAX)

  if (!phone) return { kind: 'none', reason: 'no-phone' }

  if (active) {
    const named = hasRealCustomerName(active.name, active.phone)
    const fillName =
      !named && typedName && typedName !== placeholderCustomerName(phone) ? typedName : null
    return {
      kind: 'link',
      customerId: active.id,
      displayName: fillName ?? (named ? active.name : placeholderCustomerName(phone)),
      fillName
    }
  }

  if (!isValidCustomerPhone(phone)) return { kind: 'none', reason: 'invalid-phone' }
  if (input.heldByRemoved) return { kind: 'none', reason: 'removed' }
  if (!input.canCreate) return { kind: 'none', reason: 'not-permitted' }

  const name = typedName || placeholderCustomerName(phone)
  return { kind: 'create', name, placeholder: !hasRealCustomerName(name, phone) }
}
