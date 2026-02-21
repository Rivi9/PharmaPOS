import { EscposPrinterInstance } from './thermal-printer'
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
export async function printReceipt(
  instance: EscposPrinterInstance,
  data: ReceiptData
): Promise<void> {
  const db = getDatabase()
  const get = (key: string): string | undefined =>
    (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)
      ?.value

  const businessName = get('business_name') || 'PharmaPOS'
  const address = get('business_address')
  const phone = get('business_phone')
  const footer = get('receipt_footer')
  const currency = get('currency_symbol') || 'Rs.'
  const width = instance.width
  const line = '─'.repeat(width)

  await new Promise<void>((resolve, reject) => {
    instance.device.open((err: Error | null) => {
      if (err) {
        reject(err)
        return
      }

      try {
      const p = instance.printer

      // Header
      p.align('CT')
        .style('B')
        .size(2, 2)
        .text(businessName + '\n')
        .style('NORMAL')
        .size(1, 1)

      if (address) p.text(address + '\n')
      if (phone) p.text(`Tel: ${phone}\n`)

      p.text(line + '\n')

      // Receipt info
      p.align('LT')
        .text(`Receipt: ${data.sale.receipt_number}\n`)
        .text(`Date: ${new Date(data.sale.created_at).toLocaleString()}\n`)
        .text(`Cashier: ${data.user.full_name}\n`)

      if (data.sale.customer_name) {
        p.text(`Customer: ${data.sale.customer_name}\n`)
      }

      p.text(line + '\n')

      // Items header
      p.style('B')
        .text(
          tableRow(
            [
              { text: 'Item', align: 'LEFT', width: 0.5 },
              { text: 'Qty', align: 'CENTER', width: 0.15 },
              { text: 'Price', align: 'RIGHT', width: 0.2 },
              { text: 'Total', align: 'RIGHT', width: 0.15 }
            ],
            width
          ) + '\n'
        )
        .style('NORMAL')

      // Items
      if (data.items.length === 0) {
        p.text('(no items)\n')
      }
      for (const item of data.items) {
        p.text(
          tableRow(
            [
              { text: item.product_name, align: 'LEFT', width: 0.5 },
              { text: item.quantity.toString(), align: 'CENTER', width: 0.15 },
              { text: `${currency}${item.unit_price.toFixed(2)}`, align: 'RIGHT', width: 0.2 },
              { text: `${currency}${item.line_total.toFixed(2)}`, align: 'RIGHT', width: 0.15 }
            ],
            width
          ) + '\n'
        )
      }

      p.text(line + '\n')

      // Totals
      p.text(
        tableRow(
          [
            { text: 'Subtotal:', align: 'LEFT', width: 0.7 },
            { text: `${currency}${data.sale.subtotal.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
          ],
          width
        ) + '\n'
      )

      if (data.sale.discount_amount > 0) {
        p.text(
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
        p.text(
          tableRow(
            [
              { text: 'Tax:', align: 'LEFT', width: 0.7 },
              { text: `${currency}${data.sale.tax_amount.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
            ],
            width
          ) + '\n'
        )
      }

      p.text(line + '\n')

      // Total (double height/width)
      p.style('B')
        .size(2, 2)
        .text(
          tableRow(
            [
              { text: 'TOTAL:', align: 'LEFT', width: 0.6 },
              { text: `${currency}${data.sale.total.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
            ],
            Math.floor(width / 2) // halved because size(2,2) doubles each char
          ) + '\n'
        )
        .size(1, 1)
        .style('NORMAL')

      p.text(line + '\n')

      // Payment details
      if (data.sale.payment_method === 'cash') {
        p.text(
          tableRow(
            [
              { text: 'Cash:', align: 'LEFT', width: 0.7 },
              {
                text: `${currency}${data.sale.cash_received.toFixed(2)}`,
                align: 'RIGHT',
                width: 0.3
              }
            ],
            width
          ) + '\n'
        ).text(
          tableRow(
            [
              { text: 'Change:', align: 'LEFT', width: 0.7 },
              {
                text: `${currency}${data.sale.change_given.toFixed(2)}`,
                align: 'RIGHT',
                width: 0.3
              }
            ],
            width
          ) + '\n'
        )
      } else if (data.sale.payment_method === 'card') {
        p.text('Payment: CARD\n')
      } else if (data.sale.payment_method === 'mixed') {
        p.text(`Cash: ${currency}${data.sale.cash_received.toFixed(2)}\n`).text(
          `Card: ${currency}${(data.sale.total - data.sale.cash_received).toFixed(2)}\n`
        )
      }

      p.text(line + '\n')

      // Footer
      p.align('CT')
      if (footer) p.text(footer + '\n')
      p.text('Powered by PharmaPOS\n')

      p.feed(2)
        .cut()
        .close((closeErr: Error | null) => {
          if (closeErr) reject(closeErr)
          else resolve()
        })
      } catch (e) {
        instance.device.close?.()
        reject(e)
      }
    })
  })
}

/** Print shift report */
export async function printShiftReport(
  instance: EscposPrinterInstance,
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

  const width = instance.width
  const line = '─'.repeat(width)

  await new Promise<void>((resolve, reject) => {
    instance.device.open((err: Error | null) => {
      if (err) {
        reject(err)
        return
      }

      try {
      const p = instance.printer
      const row = (left: string, right: string): string =>
        tableRow(
          [
            { text: left, align: 'LEFT', width: 0.6 },
            { text: right, align: 'RIGHT', width: 0.4 }
          ],
          width
        ) + '\n'

      p.align('CT')
        .style('B')
        .size(2, 2)
        .text('SHIFT REPORT\n')
        .style('NORMAL')
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

      const diff = shiftData.closing_cash - (shiftData.expected_cash ?? 0)
      p.style('B')
        .text(
          row(
            'Difference:',
            `${currency}${Math.abs(diff).toFixed(2)} ${diff >= 0 ? 'OVER' : 'SHORT'}`
          )
        )
        .style('NORMAL')
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
        .close((closeErr: Error | null) => {
          if (closeErr) reject(closeErr)
          else resolve()
        })
      } catch (e) {
        instance.device.close?.()
        reject(e)
      }
    })
  })
}
