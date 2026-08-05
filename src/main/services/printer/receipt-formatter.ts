import { PrinterHandle } from './thermal-printer'
import { EscPosBuilder } from './escpos-builder'
import { getDatabase } from '../database'
import { buildReceipt } from '../../../shared/receipt'

export interface ReceiptData {
  sale: {
    id: string
    receipt_number: string
    created_at: string
    subtotal: number
    tax_amount: number
    discount_amount: number
    total: number
    payment_method: string
    cash_received: number
    card_received?: number | null
    change_given: number
    customer_name?: string
    customer_phone?: string
  }
  items: Array<{
    product_name: string
    quantity: number
    unit_price: number
    line_total: number
  }>
  user: {
    full_name: string
  }
}

interface Column {
  text: string
  align: 'LEFT' | 'CENTER' | 'RIGHT'
  width: number // proportion 0..1, columns must sum to 1.0
}

/** Format a row of columns into a fixed-width string */
function tableRow(columns: Column[], totalWidth: number): string {
  return columns
    .map((col) => {
      const chars = Math.floor(col.width * totalWidth)
      const text = col.text.length > chars ? col.text.substring(0, chars) : col.text
      if (col.align === 'RIGHT') return text.padStart(chars)
      if (col.align === 'CENTER') {
        const pad = Math.floor((chars - text.length) / 2)
        return ' '.repeat(pad) + text + ' '.repeat(chars - text.length - pad)
      }
      return text.padEnd(chars)
    })
    .join('')
}

/** Format and print receipt */
export async function printReceipt(
  handle: PrinterHandle,
  data: ReceiptData,
  options?: { reprint?: boolean }
): Promise<void> {
  const db = getDatabase()
  const get = (key: string): string | undefined =>
    (
      db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined
    )?.value

  const width = handle.width

  // Built from the shared layout so the printout is byte-for-byte the text the
  // cashier previewed. Styling (bold / double size) is applied per line here.
  const lines = buildReceipt({
    sale: data.sale,
    items: data.items,
    cashierName: data.user.full_name,
    business: {
      name: get('business_name') || 'PharmaPOS',
      address: get('business_address'),
      phone: get('business_phone'),
      footer: get('receipt_footer'),
      currency: get('currency_symbol') || 'Rs.',
      vatRate: get('vat_rate')
    },
    width,
    reprint: options?.reprint
  })

  const b = new EscPosBuilder()

  for (const l of lines) {
    b.align(l.align === 'center' ? 'CT' : 'LT')
    if (l.bold) b.bold(true)
    if (l.double) b.size(2, 2)
    b.text(l.text + '\n')
    if (l.double) b.size(1, 1)
    if (l.bold) b.bold(false)
  }

  b.align('LT').feed(4)
  b.cut()

  await handle.send(b.build())
}

/** Print shift report */
export async function printShiftReport(
  handle: PrinterHandle,
  shiftData: {
    shift_id: string
    user_name: string
    started_at: string
    ended_at: string
    opening_cash: number
    closing_cash: number
    expected_cash?: number
  }
): Promise<void> {
  const db = getDatabase()

  /**
   * The sales figures are computed HERE, from the shift's own rows.
   *
   * They used to be parameters. The only caller had no honest source for the
   * transaction count or the card split, so wiring this up (L6) would have meant
   * printing zeros on a report the cashier hands over with the drawer — worse
   * than not printing it. Voided and refunded sales are excluded, so the report
   * agrees with the drawer reconciliation by construction.
   */
  const totals = db
    .prepare(
      `SELECT
         COUNT(*) as transaction_count,
         COALESCE(SUM(total), 0) as total_sales,
         COALESCE(SUM(cash_received - COALESCE(change_given, 0)), 0) as cash_sales,
         COALESCE(SUM(card_received), 0) as card_sales
       FROM sales
       WHERE shift_id = ? AND status = 'completed'`
    )
    .get(shiftData.shift_id) as {
    transaction_count: number
    total_sales: number
    cash_sales: number
    card_sales: number
  }

  const refunded = db
    .prepare(
      `SELECT COALESCE(SUM(total_refunded), 0) as refunded
       FROM sale_refunds WHERE shift_id = ?`
    )
    .get(shiftData.shift_id) as { refunded: number }
  const currency =
    (
      db.prepare('SELECT value FROM settings WHERE key = ?').get('currency_symbol') as
        | { value: string }
        | undefined
    )?.value || 'Rs.'

  const width = handle.width
  const line = '-'.repeat(width)

  const row = (left: string, right: string): string =>
    tableRow(
      [
        { text: left, align: 'LEFT', width: 0.6 },
        { text: right, align: 'RIGHT', width: 0.4 }
      ],
      width
    ) + '\n'

  const diff = shiftData.closing_cash - (shiftData.expected_cash ?? 0)

  const b = new EscPosBuilder()
  b.align('CT')
    .bold(true)
    .size(2, 2)
    .text('SHIFT REPORT\n')
    .bold(false)
    .size(1, 1)
    .text(line + '\n')
    .align('LT')
    .text(`Cashier: ${shiftData.user_name}\n`)
    .text(`Started: ${new Date(shiftData.started_at).toLocaleString()}\n`)
    .text(`Ended: ${new Date(shiftData.ended_at).toLocaleString()}\n`)
    .text(line + '\n')
    .text('CASH SUMMARY\n')
    .text(row('Opening Cash:', `${currency}${shiftData.opening_cash.toFixed(2)}`))
    .text(row('Expected Cash:', `${currency}${(shiftData.expected_cash ?? 0).toFixed(2)}`))
    .text(row('Actual Cash:', `${currency}${shiftData.closing_cash.toFixed(2)}`))
    .bold(true)
    .text(
      row('Difference:', `${currency}${Math.abs(diff).toFixed(2)} ${diff >= 0 ? 'OVER' : 'SHORT'}`)
    )
    .bold(false)
    .text(line + '\n')
    .text('SALES SUMMARY\n')
    .text(row('Transactions:', totals.transaction_count.toString()))
    .text(row('Total Sales:', `${currency}${totals.total_sales.toFixed(2)}`))
    .text(row('Cash Taken:', `${currency}${totals.cash_sales.toFixed(2)}`))
    .text(row('Card Sales:', `${currency}${totals.card_sales.toFixed(2)}`))
    .text(row('Refunds Paid Out:', `${currency}${refunded.refunded.toFixed(2)}`))
    .text(line + '\n')
    .align('CT')
    .text('End of Shift Report\n')
    .feed(2)
    .cut()

  await handle.send(b.build())
}
