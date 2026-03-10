import { PrinterHandle } from './thermal-printer'
import { EscPosBuilder } from './escpos-builder'
import { getDatabase } from '../database'

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
    change_given: number
    customer_name?: string
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
export async function printReceipt(handle: PrinterHandle, data: ReceiptData): Promise<void> {
  const db = getDatabase()
  const get = (key: string): string | undefined =>
    (
      db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
        | { value: string }
        | undefined
    )?.value

  const businessName = get('business_name') || 'PharmaPOS'
  const address = get('business_address')
  const phone = get('business_phone')
  const footer = get('receipt_footer')
  const currency = get('currency_symbol') || 'Rs.'
  const width = handle.width
  const line = '-'.repeat(width)

  const b = new EscPosBuilder()

  // Header
  b.align('CT').bold(true).size(2, 2).text(businessName + '\n').bold(false).size(1, 1).text('\n')
  if (address) b.text(address + '\n')
  if (phone) b.text(`Tel: ${phone}\n`)
  b.text(line + '\n')

  // Receipt info
  b.align('LT')
    .text(`Receipt: ${data.sale.receipt_number}\n`)
    .text(`Date: ${new Date(data.sale.created_at).toLocaleString()}\n`)
    .text(`Cashier: ${data.user.full_name}\n`)

  if (data.sale.customer_name) b.text(`Customer: ${data.sale.customer_name}\n`)
  b.text(line + '\n')

  // Items header
  b.bold(true)
    .text(
      tableRow(
        [
          { text: 'Item', align: 'LEFT', width: 0.382 },
          { text: 'Qty', align: 'CENTER', width: 0.096 },
          { text: `Price(${currency})`, align: 'RIGHT', width: 0.262 },
          { text: `Total(${currency})`, align: 'RIGHT', width: 0.262 }
        ],
        width
      ) + '\n'
    )
    .bold(false)

  // Items
  if (data.items.length === 0) b.text('(no items)\n')
  for (const item of data.items) {
    b.text(
      tableRow(
        [
          { text: item.product_name, align: 'LEFT', width: 0.382 },
          { text: item.quantity.toString(), align: 'CENTER', width: 0.096 },
          { text: item.unit_price.toFixed(2), align: 'RIGHT', width: 0.262 },
          { text: item.line_total.toFixed(2), align: 'RIGHT', width: 0.262 }
        ],
        width
      ) + '\n'
    )
  }

  b.text(line + '\n')

  // Totals
  b.text(
    tableRow(
      [
        { text: 'Subtotal:', align: 'LEFT', width: 0.7 },
        { text: `${currency}${data.sale.subtotal.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
      ],
      width
    ) + '\n'
  )

  if (data.sale.discount_amount > 0) {
    b.text(
      tableRow(
        [
          { text: 'Discount:', align: 'LEFT', width: 0.7 },
          {
            text: `-${currency}${data.sale.discount_amount.toFixed(2)}`,
            align: 'RIGHT',
            width: 0.3
          }
        ],
        width
      ) + '\n'
    )
  }

  if (data.sale.tax_amount > 0) {
    b.text(
      tableRow(
        [
          { text: 'Tax:', align: 'LEFT', width: 0.7 },
          { text: `${currency}${data.sale.tax_amount.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
        ],
        width
      ) + '\n'
    )
  }

  b.text(line + '\n')

  // Total — double size (halve the column width budget accordingly)
  b.bold(true)
    .size(2, 2)
    .text(
      tableRow(
        [
          { text: 'TOTAL:', align: 'LEFT', width: 0.5 },
          { text: `${currency}${data.sale.total.toFixed(2)}`, align: 'RIGHT', width: 0.5 }
        ],
        Math.floor(width / 2)
      ) + '\n'
    )
    .size(1, 1)
    .bold(false)

  b.text(line + '\n')

  // Payment details
  if (data.sale.payment_method === 'cash') {
    b.text(
      tableRow(
        [
          { text: 'Cash:', align: 'LEFT', width: 0.7 },
          { text: `${currency}${data.sale.cash_received.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
        ],
        width
      ) + '\n'
    ).text(
      tableRow(
        [
          { text: 'Change:', align: 'LEFT', width: 0.7 },
          { text: `${currency}${data.sale.change_given.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
        ],
        width
      ) + '\n'
    )
  } else if (data.sale.payment_method === 'card') {
    b.text('Payment: CARD\n')
  } else if (data.sale.payment_method === 'mixed') {
    b.text(`Cash: ${currency}${data.sale.cash_received.toFixed(2)}\n`).text(
      `Card: ${currency}${(data.sale.total - data.sale.cash_received).toFixed(2)}\n`
    )
  }

  b.text(line + '\n')

  // Footer
  b.align('CT')
  if (footer) b.text(footer + '\n')
  b.text('Powered by PharmaPOS\n').feed(4)

  // Open cash drawer for cash/mixed payments (not card)
  if (data.sale.payment_method === 'cash' || data.sale.payment_method === 'mixed') {
    b.cashdraw(2)
  }

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
    total_sales: number
    cash_sales: number
    card_sales: number
    transaction_count: number
  }
): Promise<void> {
  const db = getDatabase()
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
      row(
        'Difference:',
        `${currency}${Math.abs(diff).toFixed(2)} ${diff >= 0 ? 'OVER' : 'SHORT'}`
      )
    )
    .bold(false)
    .text(line + '\n')
    .text('SALES SUMMARY\n')
    .text(row('Transactions:', shiftData.transaction_count.toString()))
    .text(row('Total Sales:', `${currency}${shiftData.total_sales.toFixed(2)}`))
    .text(row('Cash Sales:', `${currency}${shiftData.cash_sales.toFixed(2)}`))
    .text(row('Card Sales:', `${currency}${shiftData.card_sales.toFixed(2)}`))
    .text(line + '\n')
    .align('CT')
    .text('End of Shift Report\n')
    .feed(2)
    .cut()

  await handle.send(b.build())
}
