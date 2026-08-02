/**
 * The single source of truth for receipt layout.
 *
 * Both the on-screen preview and the thermal printer build their output from
 * `buildReceipt()`, so what the cashier sees is exactly what the customer gets.
 * Previously the two were separate implementations and had drifted apart in the
 * date format, separators, labels, the customer block and the card amount.
 *
 * Everything here is plain ASCII: the printer's CP437 encoder maps anything else
 * to '?', so box-drawing characters must never reach it.
 */

export interface ReceiptSale {
  receipt_number: string
  created_at: string
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
  payment_method: string
  cash_received: number
  card_received?: number | null
  change_given: number
  customer_name?: string | null
  customer_phone?: string | null
}

export interface ReceiptItem {
  product_name: string
  quantity: number
  unit_price: number
  line_total: number
}

export interface ReceiptBusiness {
  name: string
  address?: string
  phone?: string
  footer?: string
  currency: string
  /** Rate that applied to this sale, for the VAT label. */
  vatRate?: string
}

export interface ReceiptInput {
  sale: ReceiptSale
  items: ReceiptItem[]
  cashierName: string
  business: ReceiptBusiness
  /** Printable columns at single width. 80mm = 42, 58mm = 32. */
  width?: number
  /** Marks a re-print so a duplicate cannot pass as the original. */
  reprint?: boolean
}

export interface ReceiptLine {
  text: string
  align: 'left' | 'center'
  bold?: boolean
  /** Rendered at double width AND height — occupies two columns per character. */
  double?: boolean
}

/**
 * Deterministic `DD/MM/YYYY HH:MM` in local time.
 *
 * `toLocaleString()` was used in main and `toLocaleString('en-LK')` in the
 * renderer, so the same sale printed as "7/18/2026, 10:03:06 AM" but previewed
 * as "18/07/2026". Formatting explicitly removes the locale from the equation.
 */
export function formatReceiptDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p2 = (n: number): string => String(n).padStart(2, '0')
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

function centre(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  const pad = Math.floor((width - text.length) / 2)
  return ' '.repeat(pad) + text
}

/** Wrap on word boundaries; never lose characters. */
function wrap(text: string, width: number): string[] {
  const out: string[] = []
  for (const paragraph of text.split('\n')) {
    let current = ''
    for (const word of paragraph.split(' ')) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length <= width) {
        current = candidate
      } else {
        if (current) out.push(current)
        // A single word longer than the line still has to be broken somewhere.
        let rest = word
        while (rest.length > width) {
          out.push(rest.slice(0, width))
          rest = rest.slice(width)
        }
        current = rest
      }
    }
    out.push(current)
  }
  return out
}

/**
 * `label ......... amount`, with the amount never truncated.
 *
 * The old implementation gave the label 70% and the amount 30% and floored both,
 * so at width 42 the row was 41 characters and every amount sat one column short
 * of the separator lines. It also clipped the amount's trailing digits when it
 * did not fit, which silently misprinted the total on large sales.
 */
function amountRow(label: string, amount: string, width: number): string {
  if (amount.length >= width) return amount.slice(-width)
  const labelSpace = width - amount.length - 1
  const shownLabel = label.length > labelSpace ? label.slice(0, labelSpace) : label
  return shownLabel + amount.padStart(width - shownLabel.length)
}

/** Item table geometry, always summing to exactly `width`. */
function itemColumns(width: number): { qty: number; price: number; total: number; name: number } {
  const qty = 4
  const price = Math.max(8, Math.floor(width * 0.262))
  const total = Math.max(8, Math.floor(width * 0.262))
  return { qty, price, total, name: width - qty - price - total }
}

export function buildReceipt(input: ReceiptInput): ReceiptLine[] {
  const width = input.width ?? 42
  const { sale, items, business } = input
  const cur = business.currency || 'Rs.'
  const lines: ReceiptLine[] = []

  const rule = (): void => {
    lines.push({ text: '-'.repeat(width), align: 'left' })
  }
  const left = (text: string, bold = false): void => {
    lines.push({ text, align: 'left', bold })
  }
  const centred = (text: string, bold = false): void => {
    for (const l of wrap(text, width)) lines.push({ text: l, align: 'center', bold })
  }

  // ── Header ───────────────────────────────────────────────
  centred(business.name, true)
  if (business.address) centred(business.address)
  if (business.phone) centred(`Tel: ${business.phone}`)
  rule()

  if (input.reprint) {
    centred('*** REPRINT ***', true)
    rule()
  }

  // ── Sale info ────────────────────────────────────────────
  left(`Receipt: ${sale.receipt_number}`)
  left(`Date: ${formatReceiptDateTime(sale.created_at)}`)
  left(`Cashier: ${input.cashierName}`)
  if (sale.customer_name) left(`Customer: ${sale.customer_name}`)
  if (sale.customer_phone) left(`Phone: ${sale.customer_phone}`)
  rule()

  // ── Items ────────────────────────────────────────────────
  const c = itemColumns(width)
  left(
    'Item'.padEnd(c.name) +
      centre('Qty', c.qty).padEnd(c.qty) +
      `Price(${cur})`.padStart(c.price) +
      `Total(${cur})`.padStart(c.total),
    true
  )

  if (items.length === 0) left('(no items)')
  for (const item of items) {
    const qty = centre(String(item.quantity), c.qty).padEnd(c.qty)
    const price = item.unit_price.toFixed(2).padStart(c.price)
    const total = item.line_total.toFixed(2).padStart(c.total)

    if (item.product_name.length <= c.name) {
      left(item.product_name.padEnd(c.name) + qty + price + total)
    } else {
      // Full name on its own line(s), figures underneath. Truncating to the column
      // printed "Azithromycin- 50" on a real bill — a pharmacy receipt must never
      // hide the strength of what was dispensed.
      for (const nameLine of wrap(item.product_name, width)) left(nameLine)
      left(''.padEnd(c.name) + qty + price + total)
    }
  }
  rule()

  // ── Totals ───────────────────────────────────────────────
  left(amountRow('Subtotal:', `${cur}${sale.subtotal.toFixed(2)}`, width))
  if (sale.discount_amount > 0) {
    left(amountRow('Discount:', `-${cur}${sale.discount_amount.toFixed(2)}`, width))
  }
  if (sale.tax_amount > 0) {
    // Prices are tax-inclusive, so this is a breakdown of what is already in the
    // total — labelled "incl." so nobody reads it as an additional charge.
    const rate = business.vatRate && business.vatRate !== '0' ? ` (${business.vatRate}%)` : ''
    left(amountRow(`incl. VAT${rate}:`, `${cur}${sale.tax_amount.toFixed(2)}`, width))
  }
  rule()

  // Double-width characters occupy two columns, so this row is laid out against
  // half the width. The amount is never clipped — that misprinted the grand total
  // on any sale of Rs. 10,000 or more.
  lines.push({
    text: amountRow('TOTAL:', `${cur}${sale.total.toFixed(2)}`, Math.floor(width / 2)),
    align: 'left',
    bold: true,
    double: true
  })
  rule()

  // ── Payment ──────────────────────────────────────────────
  const card = sale.card_received ?? 0
  if (sale.payment_method === 'cash') {
    left(amountRow('Cash:', `${cur}${sale.cash_received.toFixed(2)}`, width))
    left(amountRow('Change:', `${cur}${sale.change_given.toFixed(2)}`, width))
  } else if (sale.payment_method === 'card') {
    // The printed receipt used to say only "Payment: CARD" with no amount.
    left(amountRow('Card:', `${cur}${card.toFixed(2)}`, width))
  } else {
    left(amountRow('Cash:', `${cur}${sale.cash_received.toFixed(2)}`, width))
    left(amountRow('Card:', `${cur}${card.toFixed(2)}`, width))
    if (sale.change_given > 0) {
      left(amountRow('Change:', `${cur}${sale.change_given.toFixed(2)}`, width))
    }
  }
  rule()

  // ── Footer ───────────────────────────────────────────────
  if (business.footer) centred(business.footer)
  centred('Powered by PharmaPOS')

  return lines
}

/** Flatten to the exact text the printer emits — used for the preview and clipboard. */
export function receiptToPlainText(lines: ReceiptLine[], width = 42): string {
  return lines
    .map((l) => {
      if (l.align !== 'center') return l.text
      // Centre against the effective column count for this line's size.
      const w = l.double ? Math.floor(width / 2) : width
      return centre(l.text, w)
    })
    .join('\n')
}
