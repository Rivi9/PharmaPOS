import type { CartItem, SaleDiscount } from './types'
import { round2 } from '../../../shared/money'

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

export function calculateTax(taxableAmount: number, ratePercent: number): number {
  return round2(taxableAmount * (ratePercent / 100))
}

export function calculateTotal(
  subtotal: number,
  discountAmount: number,
  taxAmount: number
): number {
  return round2(subtotal - discountAmount + taxAmount)
}

export function calculateChange(amountPaid: number, total: number): number {
  return round2(Math.max(0, amountPaid - total))
}

export function formatCurrency(amount: number, symbol = 'Rs.'): string {
  return `${symbol} ${amount.toFixed(2)}`
}
