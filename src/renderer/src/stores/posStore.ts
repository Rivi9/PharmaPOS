import { create } from 'zustand'
import type { Product, CartItem, SaleDiscount } from '../lib/types'
import {
  calculateLineTotal,
  calculateSubtotal,
  calculateSaleDiscountAmount,
  calculateTax,
  calculateTotal
} from '../lib/calculations'
import { useSettingsStore } from './settingsStore'

interface CartState {
  items: CartItem[]
  saleDiscount: SaleDiscount | null
}

interface POSStore extends CartState {
  // Cart operations
  addItem: (product: Product, quantity: number) => void
  updateQuantity: (index: number, quantity: number) => void
  removeItem: (index: number) => void
  applyLineDiscount: (index: number, newPrice: number) => void
  clearCart: () => void

  // Discount operations
  applySaleDiscount: (discount: SaleDiscount | null) => void

  // Computed totals
  subtotal: () => number
  discountAmount: () => number
  taxAmount: () => number
  total: () => number

  // Hold/Recall
  heldSale: CartState | null
  holdCurrentSale: () => void
  recallHeldSale: () => void

  // Status
  saleInProgress: () => boolean
}

export const usePOSStore = create<POSStore>((set, get) => ({
  // Initial state
  items: [],
  saleDiscount: null,
  heldSale: null,

  // Add item to cart — stacks quantity if product already present
  addItem: (product, quantity) => {
    set((state) => {
      const maxStock =
        product.total_stock != null
          ? Math.max(0, Math.floor(product.total_stock))
          : Number.POSITIVE_INFINITY
      const safeQty = Math.max(1, Math.floor(quantity))
      const existingIndex = state.items.findIndex((i) => i.product.id === product.id)
      if (existingIndex !== -1) {
        const items = [...state.items]
        const existing = items[existingIndex]
        const newQty = Math.min(existing.quantity + safeQty, maxStock)
        if (newQty === existing.quantity) return state
        items[existingIndex] = {
          ...existing,
          quantity: newQty,
          line_total: calculateLineTotal(existing.unit_price, newQty)
        }
        return { items }
      }
      const unitPrice = product.unit_price
      const initialQty = Math.min(safeQty, maxStock)
      if (initialQty < 1) return state
      return {
        items: [
          ...state.items,
          {
            product,
            quantity: initialQty,
            unit_price: unitPrice,
            line_total: calculateLineTotal(unitPrice, initialQty)
          }
        ]
      }
    })
  },

  // Update quantity
  updateQuantity: (index, quantity) => {
    set((state) => {
      const items = [...state.items]
      const item = items[index]
      if (!item) return state
      const maxStock =
        item.product.total_stock != null
          ? Math.max(0, Math.floor(item.product.total_stock))
          : Number.POSITIVE_INFINITY
      const safeQty = Math.max(1, Math.floor(quantity))
      const clampedQty = Math.min(safeQty, maxStock)
      if (clampedQty < 1) return state

      items[index] = {
        ...item,
        quantity: clampedQty,
        line_total: calculateLineTotal(item.unit_price, clampedQty)
      }

      return { items }
    })
  },

  // Remove item
  removeItem: (index) => {
    set((state) => ({
      items: state.items.filter((_, i) => i !== index)
    }))
  },

  // Apply line discount (changes unit price)
  applyLineDiscount: (index, newPrice) => {
    set((state) => {
      const items = [...state.items]
      const item = items[index]
      if (!item) return state

      items[index] = {
        ...item,
        unit_price: newPrice,
        line_total: calculateLineTotal(newPrice, item.quantity)
      }

      return { items }
    })
  },

  // Clear cart
  clearCart: () => {
    set({ items: [], saleDiscount: null })
  },

  // Apply sale discount
  applySaleDiscount: (discount) => {
    set({ saleDiscount: discount })
  },

  // Computed: Subtotal
  subtotal: () => {
    return calculateSubtotal(get().items)
  },

  // Computed: Discount amount
  discountAmount: () => {
    const subtotal = get().subtotal()
    return calculateSaleDiscountAmount(subtotal, get().saleDiscount)
  },

  // Computed: Tax amount — reads rate from settings (0 if not loaded yet)
  taxAmount: () => {
    const subtotal = get().subtotal()
    const discount = get().discountAmount()
    const ratePercent = parseFloat(useSettingsStore.getState().settings.vat_rate) || 0
    return calculateTax(subtotal - discount, ratePercent)
  },

  // Computed: Total
  total: () => {
    const subtotal = get().subtotal()
    const discount = get().discountAmount()
    const tax = get().taxAmount()
    return calculateTotal(subtotal, discount, tax)
  },

  // Hold current sale
  holdCurrentSale: () => {
    const { items, saleDiscount } = get()
    if (items.length === 0) return

    set({
      heldSale: { items, saleDiscount },
      items: [],
      saleDiscount: null
    })
  },

  // Recall held sale
  recallHeldSale: () => {
    const { heldSale } = get()
    if (!heldSale) return

    set({
      items: heldSale.items,
      saleDiscount: heldSale.saleDiscount,
      heldSale: null
    })
  },

  // Check if sale in progress
  saleInProgress: () => {
    return get().items.length > 0
  }
}))
