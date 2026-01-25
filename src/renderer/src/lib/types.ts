export interface Product {
  id: string
  name: string
  generic_name: string | null
  barcode: string | null
  sku: string
  unit_price: number
  is_active: number
  total_stock?: number
  nearest_expiry?: string | null
}

export interface CartItem {
  product: Product
  quantity: number
  unit_price: number // May differ from product.unit_price if line discount applied
  line_total: number // Calculated: unit_price × quantity
}

export interface SaleDiscount {
  type: 'percentage' | 'fixed'
  value: number
}
