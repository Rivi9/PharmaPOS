import { create } from 'zustand'
import type { Product, CartItem, SaleDiscount } from '../lib/types'
import {
  calculateLineTotal,
  calculateSubtotal,
  calculateSaleDiscountAmount,
  calculateItemsTax,
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
  /** True when holding would overwrite an existing held sale (M1). */
  holdWouldOverwrite: () => boolean
  holdCurrentSale: () => void
  recallHeldSale: () => void

  /**
   * Why the last cart action did nothing (M5).
   *
   * Scanning an item already at its stock limit was a completely silent no-op —
   * no message, no beep — so the cashier rescanned, or assumed it went in and
   * charged for a quantity the cart never held.
   */
  lastRejection: string | null
  clearRejection: () => void

  // Status
  saleInProgress: () => boolean
}

export const usePOSStore = create<POSStore>((set, get) => ({
  // Initial state
  items: [],
  saleDiscount: null,
  heldSale: null,
  lastRejection: null,

  clearRejection: () => set({ lastRejection: null }),

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
        if (newQty === existing.quantity) {
          return {
            lastRejection: `Only ${maxStock} of ${product.name} in stock — all of it is already in the cart`
          }
        }
        items[existingIndex] = {
          ...existing,
          quantity: newQty,
          line_total: calculateLineTotal(existing.unit_price, newQty)
        }
        return { items, lastRejection: null }
      }
      const unitPrice = product.unit_price
      const initialQty = Math.min(safeQty, maxStock)
      if (initialQty < 1) {
        return { lastRejection: `${product.name} is out of sellable stock` }
      }
      return {
        items: [
          ...state.items,
          {
            product,
            quantity: initialQty,
            unit_price: unitPrice,
            line_total: calculateLineTotal(unitPrice, initialQty)
          }
        ],
        lastRejection: null
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

      // M4: `product.total_stock` is a snapshot taken when the item was added, and
      // the clamp used to apply in BOTH directions. If the cart held more than the
      // snapshot allows — a recalled hold, or stock adjusted since — then one tap
      // of "−" from 5 clamped to the stale maximum of 3, silently dropping two
      // units off what the customer was charged for. Reducing a quantity is always
      // safe, so only an increase is clamped.
      const decreasing = safeQty < item.quantity
      const clampedQty = decreasing ? safeQty : Math.min(safeQty, maxStock)
      if (clampedQty < 1) return state
      if (clampedQty === item.quantity) {
        return safeQty > item.quantity
          ? {
              lastRejection: `Only ${maxStock} of ${item.product.name} in stock`
            }
          : state
      }

      items[index] = {
        ...item,
        quantity: clampedQty,
        line_total: calculateLineTotal(item.unit_price, clampedQty)
      }

      return { items, lastRejection: null }
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

  // Computed: VAT already contained in the prices charged (tax-inclusive model).
  // This is a breakdown for reporting — it does not change what the customer pays.
  taxAmount: () => {
    const ratePercent = parseFloat(useSettingsStore.getState().settings.vat_rate) || 0
    // Summed per line so the cart matches the per-row VAT that createSale stores.
    return calculateItemsTax(get().items, ratePercent, get().discountAmount())
  },

  // Computed: Total. Tax is inside the prices, so it is not added on.
  total: () => {
    const subtotal = get().subtotal()
    const discount = get().discountAmount()
    return calculateTotal(subtotal, discount)
  },

  // Hold current sale
  holdWouldOverwrite: () => {
    const { items, heldSale } = get()
    return items.length > 0 && heldSale !== null
  },

  // One hold slot. Holding a second sale used to destroy the first with no
  // warning, while the Recall path did confirm — the callers now ask first (M1).
  holdCurrentSale: () => {
    const { items, saleDiscount } = get()
    if (items.length === 0) return

    set({
      heldSale: { items, saleDiscount },
      items: [],
      saleDiscount: null,
      lastRejection: null
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
