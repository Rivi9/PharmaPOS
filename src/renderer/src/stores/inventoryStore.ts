import { create } from 'zustand'

interface Product {
  id: string
  name: string
  generic_name: string | null
  barcode: string | null
  sku: string
  category_id: string | null
  category_name?: string
  supplier_id: string | null
  supplier_name?: string
  cost_price: number
  unit_price: number
  tax_rate: number
  is_tax_inclusive: number
  reorder_level: number
  reorder_qty: number
  unit: string
  is_active: number
  track_expiry: number
  total_stock?: number
  created_at: string
  updated_at: string
}

interface Category {
  id: string
  name: string
  description: string | null
  parent_id: string | null
  parent_name?: string
  product_count?: number
  created_at: string
}

interface Supplier {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  lead_time_days: number
  is_active: number
  product_count?: number
  batch_count?: number
  created_at: string
}

interface StockBatch {
  id: string
  product_id: string
  product_name?: string
  sku?: string
  batch_number: string | null
  quantity: number
  cost_price: number
  expiry_date: string | null
  received_date: string
  supplier_id: string | null
  supplier_name?: string
  created_at: string
}

interface InventoryStore {
  // Products
  products: Product[]
  setProducts: (products: Product[]) => void

  // Categories
  categories: Category[]
  setCategories: (categories: Category[]) => void

  // Suppliers
  suppliers: Supplier[]
  setSuppliers: (suppliers: Supplier[]) => void

  // Stock Batches
  stockBatches: StockBatch[]
  setStockBatches: (batches: StockBatch[]) => void

  // Low stock alerts
  lowStockProducts: Product[]
  setLowStockProducts: (products: Product[]) => void
}

export const useInventoryStore = create<InventoryStore>((set) => ({
  products: [],
  setProducts: (products) => set({ products }),

  categories: [],
  setCategories: (categories) => set({ categories }),

  suppliers: [],
  setSuppliers: (suppliers) => set({ suppliers }),

  stockBatches: [],
  setStockBatches: (stockBatches) => set({ stockBatches }),

  lowStockProducts: [],
  setLowStockProducts: (lowStockProducts) => set({ lowStockProducts })
}))

export type { Product, Category, Supplier, StockBatch }
