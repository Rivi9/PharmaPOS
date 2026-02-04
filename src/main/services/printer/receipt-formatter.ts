import { ThermalPrinter } from 'node-thermal-printer'
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

/**
 * Format and print receipt
 */
export async function printReceipt(printer: ThermalPrinter, data: ReceiptData): Promise<void> {
  const db = getDatabase()

  // Get business settings
  const settings = {
    name: db.prepare('SELECT value FROM settings WHERE key = ?').get('business_name') as
      | { value: string }
      | undefined,
    address: db.prepare('SELECT value FROM settings WHERE key = ?').get('business_address') as
      | { value: string }
      | undefined,
    phone: db.prepare('SELECT value FROM settings WHERE key = ?').get('business_phone') as
      | { value: string }
      | undefined,
    footer: db.prepare('SELECT value FROM settings WHERE key = ?').get('receipt_footer') as
      | { value: string }
      | undefined,
    currency: db.prepare('SELECT value FROM settings WHERE key = ?').get('currency_symbol') as
      | { value: string }
      | undefined
  }

  const currency = settings.currency?.value || 'Rs.'

  // Header
  printer.alignCenter()
  printer.setTextSize(1, 1)
  printer.bold(true)
  printer.println(settings.name?.value || 'PharmaPOS')
  printer.bold(false)
  printer.setTextSize(0, 0)

  if (settings.address?.value) {
    printer.println(settings.address.value)
  }
  if (settings.phone?.value) {
    printer.println(`Tel: ${settings.phone.value}`)
  }

  printer.drawLine()

  // Receipt info
  printer.alignLeft()
  printer.println(`Receipt: ${data.sale.receipt_number}`)
  printer.println(`Date: ${new Date(data.sale.created_at).toLocaleString()}`)
  printer.println(`Cashier: ${data.user.full_name}`)

  if (data.sale.customer_name) {
    printer.println(`Customer: ${data.sale.customer_name}`)
  }

  printer.drawLine()

  // Items
  printer.bold(true)
  printer.tableCustom([
    { text: 'Item', align: 'LEFT', width: 0.5 },
    { text: 'Qty', align: 'CENTER', width: 0.15 },
    { text: 'Price', align: 'RIGHT', width: 0.2 },
    { text: 'Total', align: 'RIGHT', width: 0.15 }
  ])
  printer.bold(false)

  data.items.forEach((item) => {
    printer.tableCustom([
      { text: item.product_name, align: 'LEFT', width: 0.5 },
      { text: item.quantity.toString(), align: 'CENTER', width: 0.15 },
      { text: `${currency}${item.unit_price.toFixed(2)}`, align: 'RIGHT', width: 0.2 },
      { text: `${currency}${item.line_total.toFixed(2)}`, align: 'RIGHT', width: 0.15 }
    ])
  })

  printer.drawLine()

  // Totals
  printer.tableCustom([
    { text: 'Subtotal:', align: 'LEFT', width: 0.7 },
    { text: `${currency}${data.sale.subtotal.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
  ])

  if (data.sale.discount_amount > 0) {
    printer.tableCustom([
      { text: 'Discount:', align: 'LEFT', width: 0.7 },
      { text: `-${currency}${data.sale.discount_amount.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
    ])
  }

  if (data.sale.tax_amount > 0) {
    printer.tableCustom([
      { text: 'Tax:', align: 'LEFT', width: 0.7 },
      { text: `${currency}${data.sale.tax_amount.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
    ])
  }

  printer.drawLine()

  printer.bold(true)
  printer.setTextSize(1, 1)
  printer.tableCustom([
    { text: 'TOTAL:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${data.sale.total.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])
  printer.setTextSize(0, 0)
  printer.bold(false)

  printer.drawLine()

  // Payment info
  if (data.sale.payment_method === 'cash') {
    printer.tableCustom([
      { text: 'Cash:', align: 'LEFT', width: 0.7 },
      { text: `${currency}${data.sale.cash_received.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
    ])
    printer.tableCustom([
      { text: 'Change:', align: 'LEFT', width: 0.7 },
      { text: `${currency}${data.sale.change_given.toFixed(2)}`, align: 'RIGHT', width: 0.3 }
    ])
  } else if (data.sale.payment_method === 'card') {
    printer.println('Payment: CARD')
  } else if (data.sale.payment_method === 'mixed') {
    printer.println(`Cash: ${currency}${data.sale.cash_received.toFixed(2)}`)
    printer.println(`Card: ${currency}${(data.sale.total - data.sale.cash_received).toFixed(2)}`)
  }

  printer.drawLine()

  // Footer
  printer.alignCenter()
  if (settings.footer?.value) {
    printer.println(settings.footer.value)
  }
  printer.println('Powered by PharmaPOS')

  printer.newLine()
  printer.newLine()
  printer.cut()

  await printer.execute()
}

/**
 * Print shift report
 */
export async function printShiftReport(
  printer: ThermalPrinter,
  shiftData: {
    shift_id: string
    user_name: string
    started_at: string
    ended_at: string
    opening_cash: number
    closing_cash: number
    expected_cash: number
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

  printer.alignCenter()
  printer.setTextSize(1, 1)
  printer.bold(true)
  printer.println('SHIFT REPORT')
  printer.bold(false)
  printer.setTextSize(0, 0)
  printer.drawLine()

  printer.alignLeft()
  printer.println(`Cashier: ${shiftData.user_name}`)
  printer.println(`Started: ${new Date(shiftData.started_at).toLocaleString()}`)
  printer.println(`Ended: ${new Date(shiftData.ended_at).toLocaleString()}`)
  printer.drawLine()

  printer.println('CASH SUMMARY')
  printer.tableCustom([
    { text: 'Opening Cash:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.opening_cash.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])
  printer.tableCustom([
    { text: 'Expected Cash:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.expected_cash.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])
  printer.tableCustom([
    { text: 'Actual Cash:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.closing_cash.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])

  const difference = shiftData.closing_cash - shiftData.expected_cash
  printer.bold(true)
  printer.tableCustom([
    { text: 'Difference:', align: 'LEFT', width: 0.6 },
    {
      text: `${currency}${Math.abs(difference).toFixed(2)} ${difference >= 0 ? 'OVER' : 'SHORT'}`,
      align: 'RIGHT',
      width: 0.4
    }
  ])
  printer.bold(false)

  printer.drawLine()

  printer.println('SALES SUMMARY')
  printer.tableCustom([
    { text: 'Transactions:', align: 'LEFT', width: 0.6 },
    { text: shiftData.transaction_count.toString(), align: 'RIGHT', width: 0.4 }
  ])
  printer.tableCustom([
    { text: 'Total Sales:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.total_sales.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])
  printer.tableCustom([
    { text: 'Cash Sales:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.cash_sales.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])
  printer.tableCustom([
    { text: 'Card Sales:', align: 'LEFT', width: 0.6 },
    { text: `${currency}${shiftData.card_sales.toFixed(2)}`, align: 'RIGHT', width: 0.4 }
  ])

  printer.drawLine()
  printer.alignCenter()
  printer.println('End of Shift Report')
  printer.newLine()
  printer.newLine()
  printer.cut()

  await printer.execute()
}
