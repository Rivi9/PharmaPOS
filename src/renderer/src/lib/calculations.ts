import type { CartItem, SaleDiscount } from './types'

const TAX_RATE = 0.18 // 18% VAT

export function calculateLineTotal(unitPrice: number, quantity: number): number {
  return unitPrice * quantity
}

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.line_total, 0)
}

export function calculateSaleDiscountAmount(
  subtotal: number,
  discount: SaleDiscount | null
): number {
  if (!discount) return 0

  if (discount.type === 'percentage') {
    return (subtotal * discount.value) / 100
  }
  return discount.value
}

export function calculateTax(taxableAmount: number): number {
  return taxableAmount * TAX_RATE
}

export function calculateTotal(
  subtotal: number,
  discountAmount: number,
  taxAmount: number
): number {
  return subtotal - discountAmount + taxAmount
}

export function calculateChange(amountPaid: number, total: number): number {
  return Math.max(0, amountPaid - total)
}

export function formatCurrency(amount: number): string {
  return `Rs. ${amount.toFixed(2)}`
}
