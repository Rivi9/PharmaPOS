import { formatCurrency } from '@renderer/lib/calculations'

interface CartTotalsProps {
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
}

export function CartTotals({ subtotal, discountAmount, taxAmount, total }: CartTotalsProps): React.JSX.Element {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal:</span>
        <span className="font-medium">{formatCurrency(subtotal)}</span>
      </div>

      {discountAmount > 0 && (
        <div className="flex justify-between text-sm text-green-600">
          <span>Discount:</span>
          <span className="font-medium">-{formatCurrency(discountAmount)}</span>
        </div>
      )}

      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Tax (18%):</span>
        <span className="font-medium">{formatCurrency(taxAmount)}</span>
      </div>

      <div className="flex justify-between text-lg font-bold border-t pt-2">
        <span>Total:</span>
        <span>{formatCurrency(total)}</span>
      </div>
    </div>
  )
}
