import type { CartItem, SaleDiscount } from './types'
import { round2, extractIncludedTax, basketLineTax } from '../../../shared/money'

export function calculateLineTotal(unitPrice: number, quantity: number): number {
  return round2(unitPrice * quantity)
}

export function calculateSubtotal(items: CartItem[]): number {
  return round2(items.reduce((sum, item) => sum + item.line_total, 0))
}

export function calculateSaleDiscountAmount(
  subtotal: number,
  discount: SaleDiscount | null
): number {
  if (!discount) return 0

  // Clamped: an unclamped percentage above 100, or a fixed amount above the
  // subtotal, produced a negative total and negative tax.
  const raw =
    discount.type === 'percentage'
      ? (subtotal * Math.min(Math.max(discount.value, 0), 100)) / 100
      : Math.max(discount.value, 0)

  return round2(Math.min(raw, subtotal))
}

/**
 * VAT contained within the (tax-inclusive) amount charged.
 *
 * Prices are entered as shelf/MRP prices that already include VAT, so this
 * extracts the tax rather than adding it. The old `subtotal * rate` added 18%
 * on top of an MRP and overcharged every customer.
 */
export function calculateTax(taxableAmount: number, ratePercent: number): number {
  return extractIncludedTax(taxableAmount, ratePercent)
}

/**
 * Cart VAT, summed per line.
 *
 * Must be per line, not extracted from the subtotal: `createSale` stores VAT on
 * each `sale_items` row and the sale header is their sum, so extracting from the
 * subtotal here would leave the cart and the receipt disagreeing by a cent or two
 * (770.00 at 18% gives 117.46 on the subtotal but 117.45 line by line).
 *
 * A sale-level discount is split across the lines first (`basketLineTax`, the
 * same function `createSale` uses), so the VAT shown here is exactly the VAT the
 * main process stores. Scaling the summed line VAT by the discount ratio instead
 * was right in total but could differ from the stored figure by a cent.
 */
export function calculateItemsTax(
  items: CartItem[],
  ratePercent: number,
  discountAmount = 0
): number {
  if (!(ratePercent > 0) || items.length === 0) return 0
  return basketLineTax(
    items.map((item) => item.line_total),
    discountAmount,
    ratePercent
  ).tax
}

/**
 * Amount the customer pays. Tax is already inside the prices, so it is NOT
 * added here — adding it would charge VAT twice.
 */
export function calculateTotal(subtotal: number, discountAmount: number): number {
  return round2(subtotal - discountAmount)
}

export function calculateChange(amountPaid: number, total: number): number {
  return round2(Math.max(0, amountPaid - total))
}

export function formatCurrency(amount: number, symbol = 'Rs.'): string {
  return `${symbol} ${amount.toFixed(2)}`
}
