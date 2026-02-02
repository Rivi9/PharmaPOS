# Phase 3: Inventory Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build complete inventory management system for products, categories, suppliers, and stock batches with CRUD operations, CSV import/export, and low stock alerts.

**Architecture:** React data tables with TanStack Table for product/category/supplier listings. Modal forms with React Hook Form + Zod validation. Main process services for database operations. CSV parsing with papaparse library.

**Tech Stack:** React 19, TypeScript, TanStack Table v8, React Hook Form v7, Zod v3, papaparse, better-sqlite3

---

## Prerequisites

- Phase 2 (Core POS) merged to main
- Database schema already includes: products, categories, suppliers, stock_batches tables
- Existing UI components: Button, Input, Card, Dialog, Label from shadcn/ui

---

## Task 1: Create Inventory Page Layout

**Files:**
- Create: `src/renderer/src/pages/InventoryPage.tsx`
- Modify: `src/renderer/src/pages/index.ts`
- Modify: `src/renderer/src/components/layout/MainLayout.tsx:19-27`

**Step 1: Create InventoryPage component**

```typescript
// src/renderer/src/pages/InventoryPage.tsx
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'

export function InventoryPage(): React.JSX.Element {
  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Inventory Management</h1>
        <p className="text-muted-foreground">Manage products, categories, suppliers, and stock</p>
      </div>

      <Tabs defaultValue="products" className="flex-1">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="stock">Stock Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-6">
          <div className="text-muted-foreground">Products list will go here</div>
        </TabsContent>

        <TabsContent value="categories" className="mt-6">
          <div className="text-muted-foreground">Categories list will go here</div>
        </TabsContent>

        <TabsContent value="suppliers" className="mt-6">
          <div className="text-muted-foreground">Suppliers list will go here</div>
        </TabsContent>

        <TabsContent value="stock" className="mt-6">
          <div className="text-muted-foreground">Stock batches will go here</div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

**Step 2: Export InventoryPage**

```typescript
// src/renderer/src/pages/index.ts
export * from './LoginPage'
export * from './SettingsPage'
export * from './POSPage'
export * from './InventoryPage'  // Add this line
```

**Step 3: Add inventory route to MainLayout**

```typescript
// src/renderer/src/components/layout/MainLayout.tsx
// Find the renderPage function and add inventory case:

case 'inventory':
  return <InventoryPage />  // Replace placeholder with actual component
```

**Step 4: Create Tabs component**

```bash
# Install dependencies if not already present
npm install @radix-ui/react-tabs
```

```typescript
// src/renderer/src/components/ui/tabs.tsx
import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@renderer/lib/utils'

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
```

**Step 5: Test the layout**

Run: `npm run dev`
Expected: Inventory page accessible from sidebar with 4 tabs (products, categories, suppliers, stock)

**Step 6: Commit**

```bash
git add src/renderer/src/pages/InventoryPage.tsx src/renderer/src/pages/index.ts src/renderer/src/components/layout/MainLayout.tsx src/renderer/src/components/ui/tabs.tsx package.json package-lock.json
git commit -m "feat: add inventory page layout with tabs"
```

---

## Task 2: Create Inventory Store

**Files:**
- Create: `src/renderer/src/stores/inventoryStore.ts`

**Step 1: Create inventory Zustand store**

```typescript
// src/renderer/src/stores/inventoryStore.ts
import { create } from 'zustand'

interface Product {
  id: string
  name: string
  generic_name: string | null
  barcode: string | null
  sku: string
  category_id: string | null
  supplier_id: string | null
  cost_price: number
  unit_price: number
  reorder_level: number
  reorder_qty: number
  is_active: number
  total_stock?: number
}

interface Category {
  id: string
  name: string
  description: string | null
  parent_id: string | null
}

interface Supplier {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  is_active: number
}

interface StockBatch {
  id: string
  product_id: string
  product_name: string
  batch_number: string | null
  quantity: number
  cost_price: number
  expiry_date: string | null
  received_date: string
  supplier_name: string | null
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
```

**Step 2: Commit**

```bash
git add src/renderer/src/stores/inventoryStore.ts
git commit -m "feat: add inventory Zustand store with types"
```

---

## Task 3: Add Inventory IPC Channels

**Files:**
- Modify: `src/main/ipc/channels.ts:19-35`

**Step 1: Add inventory channels**

```typescript
// src/main/ipc/channels.ts
// Add after existing channels:

  // Inventory - Products
  PRODUCT_LIST: 'product:list',
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',
  PRODUCT_LOW_STOCK: 'product:lowStock',

  // Inventory - Categories
  CATEGORY_LIST: 'category:list',
  CATEGORY_CREATE: 'category:create',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_DELETE: 'category:delete',

  // Inventory - Suppliers
  SUPPLIER_LIST: 'supplier:list',
  SUPPLIER_CREATE: 'supplier:create',
  SUPPLIER_UPDATE: 'supplier:update',
  SUPPLIER_DELETE: 'supplier:delete',

  // Inventory - Stock Batches
  STOCK_BATCH_LIST: 'stock:batchList',
  STOCK_BATCH_CREATE: 'stock:batchCreate',
  STOCK_BATCH_UPDATE: 'stock:batchUpdate',
  STOCK_BATCH_DELETE: 'stock:batchDelete',
  STOCK_BATCH_ADJUST: 'stock:batchAdjust',

  // Inventory - Import/Export
  PRODUCT_IMPORT_CSV: 'product:importCsv',
  PRODUCT_EXPORT_CSV: 'product:exportCsv'
```

**Step 2: Commit**

```bash
git add src/main/ipc/channels.ts
git commit -m "feat: add inventory IPC channels"
```

---

## Task 4: Create Inventory Services (Products)

**Files:**
- Create: `src/main/services/inventory.ts`

**Step 1: Create product CRUD service**

```typescript
// src/main/services/inventory.ts
import { getDatabase } from './database'

// =====================
// PRODUCTS
// =====================

export interface ProductData {
  name: string
  generic_name?: string
  barcode?: string
  sku: string
  category_id?: string
  supplier_id?: string
  cost_price: number
  unit_price: number
  reorder_level?: number
  reorder_qty?: number
  is_active?: number
}

export function listProducts(): any[] {
  const db = getDatabase()

  const products = db.prepare(`
    SELECT
      p.*,
      COALESCE(SUM(sb.quantity), 0) as total_stock,
      c.name as category_name,
      s.name as supplier_name
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    GROUP BY p.id
    ORDER BY p.name ASC
  `).all()

  return products
}

export function createProduct(data: ProductData): { id: string } {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO products (
      id, name, generic_name, barcode, sku,
      category_id, supplier_id, cost_price, unit_price,
      reorder_level, reorder_qty, is_active,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.generic_name || null,
    data.barcode || null,
    data.sku,
    data.category_id || null,
    data.supplier_id || null,
    data.cost_price,
    data.unit_price,
    data.reorder_level || 10,
    data.reorder_qty || 50,
    data.is_active ?? 1,
    now,
    now
  )

  return { id }
}

export function updateProduct(id: string, data: Partial<ProductData>): void {
  const db = getDatabase()
  const now = new Date().toISOString()

  const fields: string[] = []
  const values: any[] = []

  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.generic_name !== undefined) {
    fields.push('generic_name = ?')
    values.push(data.generic_name || null)
  }
  if (data.barcode !== undefined) {
    fields.push('barcode = ?')
    values.push(data.barcode || null)
  }
  if (data.sku !== undefined) {
    fields.push('sku = ?')
    values.push(data.sku)
  }
  if (data.category_id !== undefined) {
    fields.push('category_id = ?')
    values.push(data.category_id || null)
  }
  if (data.supplier_id !== undefined) {
    fields.push('supplier_id = ?')
    values.push(data.supplier_id || null)
  }
  if (data.cost_price !== undefined) {
    fields.push('cost_price = ?')
    values.push(data.cost_price)
  }
  if (data.unit_price !== undefined) {
    fields.push('unit_price = ?')
    values.push(data.unit_price)
  }
  if (data.reorder_level !== undefined) {
    fields.push('reorder_level = ?')
    values.push(data.reorder_level)
  }
  if (data.reorder_qty !== undefined) {
    fields.push('reorder_qty = ?')
    values.push(data.reorder_qty)
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?')
    values.push(data.is_active)
  }

  fields.push('updated_at = ?')
  values.push(now)
  values.push(id)

  db.prepare(`
    UPDATE products
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values)
}

export function deleteProduct(id: string): void {
  const db = getDatabase()

  // Soft delete - set is_active to 0
  db.prepare(`
    UPDATE products
    SET is_active = 0, updated_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), id)
}

export function getLowStockProducts(): any[] {
  const db = getDatabase()

  const products = db.prepare(`
    SELECT
      p.*,
      COALESCE(SUM(sb.quantity), 0) as total_stock
    FROM products p
    LEFT JOIN stock_batches sb ON p.id = sb.product_id
    WHERE p.is_active = 1
    GROUP BY p.id
    HAVING total_stock <= p.reorder_level
    ORDER BY total_stock ASC, p.name ASC
  `).all()

  return products
}
```

**Step 2: Commit**

```bash
git add src/main/services/inventory.ts
git commit -m "feat: add product CRUD service functions"
```

---

## Task 5: Create Inventory Services (Categories)

**Files:**
- Modify: `src/main/services/inventory.ts:100-180`

**Step 1: Add category CRUD functions**

```typescript
// src/main/services/inventory.ts
// Add after product functions:

// =====================
// CATEGORIES
// =====================

export interface CategoryData {
  name: string
  description?: string
  parent_id?: string
}

export function listCategories(): any[] {
  const db = getDatabase()

  const categories = db.prepare(`
    SELECT
      c.*,
      COUNT(DISTINCT p.id) as product_count,
      parent.name as parent_name
    FROM categories c
    LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
    LEFT JOIN categories parent ON c.parent_id = parent.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all()

  return categories
}

export function createCategory(data: CategoryData): { id: string } {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO categories (id, name, description, parent_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.description || null,
    data.parent_id || null,
    now
  )

  return { id }
}

export function updateCategory(id: string, data: Partial<CategoryData>): void {
  const db = getDatabase()

  const fields: string[] = []
  const values: any[] = []

  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.description !== undefined) {
    fields.push('description = ?')
    values.push(data.description || null)
  }
  if (data.parent_id !== undefined) {
    fields.push('parent_id = ?')
    values.push(data.parent_id || null)
  }

  values.push(id)

  db.prepare(`
    UPDATE categories
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values)
}

export function deleteCategory(id: string): void {
  const db = getDatabase()

  // Check if category has products
  const count = db.prepare(`
    SELECT COUNT(*) as count FROM products WHERE category_id = ?
  `).get(id) as { count: number }

  if (count.count > 0) {
    throw new Error('Cannot delete category with products. Move or delete products first.')
  }

  // Delete category
  db.prepare(`DELETE FROM categories WHERE id = ?`).run(id)
}
```

**Step 2: Commit**

```bash
git add src/main/services/inventory.ts
git commit -m "feat: add category CRUD service functions"
```

---

## Task 6: Create Inventory Services (Suppliers)

**Files:**
- Modify: `src/main/services/inventory.ts:181-270`

**Step 1: Add supplier CRUD functions**

```typescript
// src/main/services/inventory.ts
// Add after category functions:

// =====================
// SUPPLIERS
// =====================

export interface SupplierData {
  name: string
  contact_person?: string
  phone?: string
  email?: string
  address?: string
  is_active?: number
}

export function listSuppliers(): any[] {
  const db = getDatabase()

  const suppliers = db.prepare(`
    SELECT
      s.*,
      COUNT(DISTINCT p.id) as product_count,
      COUNT(DISTINCT sb.id) as batch_count
    FROM suppliers s
    LEFT JOIN products p ON s.id = p.supplier_id AND p.is_active = 1
    LEFT JOIN stock_batches sb ON s.id = sb.supplier_id
    GROUP BY s.id
    ORDER BY s.name ASC
  `).all()

  return suppliers
}

export function createSupplier(data: SupplierData): { id: string } {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO suppliers (
      id, name, contact_person, phone, email, address, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.name,
    data.contact_person || null,
    data.phone || null,
    data.email || null,
    data.address || null,
    data.is_active ?? 1,
    now
  )

  return { id }
}

export function updateSupplier(id: string, data: Partial<SupplierData>): void {
  const db = getDatabase()

  const fields: string[] = []
  const values: any[] = []

  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.contact_person !== undefined) {
    fields.push('contact_person = ?')
    values.push(data.contact_person || null)
  }
  if (data.phone !== undefined) {
    fields.push('phone = ?')
    values.push(data.phone || null)
  }
  if (data.email !== undefined) {
    fields.push('email = ?')
    values.push(data.email || null)
  }
  if (data.address !== undefined) {
    fields.push('address = ?')
    values.push(data.address || null)
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?')
    values.push(data.is_active)
  }

  values.push(id)

  db.prepare(`
    UPDATE suppliers
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values)
}

export function deleteSupplier(id: string): void {
  const db = getDatabase()

  // Soft delete - set is_active to 0
  db.prepare(`
    UPDATE suppliers
    SET is_active = 0
    WHERE id = ?
  `).run(id)
}
```

**Step 2: Commit**

```bash
git add src/main/services/inventory.ts
git commit -m "feat: add supplier CRUD service functions"
```

---

## Task 7: Create Inventory Services (Stock Batches)

**Files:**
- Modify: `src/main/services/inventory.ts:271-400`

**Step 1: Add stock batch CRUD and adjustment functions**

```typescript
// src/main/services/inventory.ts
// Add after supplier functions:

// =====================
// STOCK BATCHES
// =====================

export interface StockBatchData {
  product_id: string
  batch_number?: string
  quantity: number
  cost_price: number
  expiry_date?: string
  supplier_id?: string
}

export function listStockBatches(): any[] {
  const db = getDatabase()

  const batches = db.prepare(`
    SELECT
      sb.*,
      p.name as product_name,
      p.sku,
      s.name as supplier_name
    FROM stock_batches sb
    JOIN products p ON sb.product_id = p.id
    LEFT JOIN suppliers s ON sb.supplier_id = s.id
    WHERE sb.quantity > 0 OR date(sb.received_date) >= date('now', '-30 days')
    ORDER BY sb.received_date DESC, p.name ASC
  `).all()

  return batches
}

export function createStockBatch(data: StockBatchData): { id: string } {
  const db = getDatabase()
  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  db.prepare(`
    INSERT INTO stock_batches (
      id, product_id, batch_number, quantity, cost_price,
      expiry_date, supplier_id, received_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?)
  `).run(
    id,
    data.product_id,
    data.batch_number || null,
    data.quantity,
    data.cost_price,
    data.expiry_date || null,
    data.supplier_id || null,
    now
  )

  return { id }
}

export function updateStockBatch(id: string, data: Partial<StockBatchData>): void {
  const db = getDatabase()

  const fields: string[] = []
  const values: any[] = []

  if (data.batch_number !== undefined) {
    fields.push('batch_number = ?')
    values.push(data.batch_number || null)
  }
  if (data.quantity !== undefined) {
    fields.push('quantity = ?')
    values.push(data.quantity)
  }
  if (data.cost_price !== undefined) {
    fields.push('cost_price = ?')
    values.push(data.cost_price)
  }
  if (data.expiry_date !== undefined) {
    fields.push('expiry_date = ?')
    values.push(data.expiry_date || null)
  }
  if (data.supplier_id !== undefined) {
    fields.push('supplier_id = ?')
    values.push(data.supplier_id || null)
  }

  values.push(id)

  db.prepare(`
    UPDATE stock_batches
    SET ${fields.join(', ')}
    WHERE id = ?
  `).run(...values)
}

export function deleteStockBatch(id: string): void {
  const db = getDatabase()

  // Hard delete - only if quantity is 0
  const batch = db.prepare(`
    SELECT quantity FROM stock_batches WHERE id = ?
  `).get(id) as { quantity: number } | undefined

  if (!batch) {
    throw new Error('Batch not found')
  }

  if (batch.quantity > 0) {
    throw new Error('Cannot delete batch with remaining stock. Adjust to 0 first.')
  }

  db.prepare(`DELETE FROM stock_batches WHERE id = ?`).run(id)
}

export interface StockAdjustmentData {
  batch_id: string
  quantity_change: number // Positive for adding, negative for removing
  reason: string
}

export function adjustStockBatch(data: StockAdjustmentData): void {
  const db = getDatabase()

  db.transaction(() => {
    // Get current quantity
    const batch = db.prepare(`
      SELECT quantity FROM stock_batches WHERE id = ?
    `).get(data.batch_id) as { quantity: number } | undefined

    if (!batch) {
      throw new Error('Batch not found')
    }

    const newQuantity = batch.quantity + data.quantity_change

    if (newQuantity < 0) {
      throw new Error('Adjustment would result in negative stock')
    }

    // Update batch quantity
    db.prepare(`
      UPDATE stock_batches
      SET quantity = ?
      WHERE id = ?
    `).run(newQuantity, data.batch_id)

    // Log adjustment (optional - could add stock_adjustments table)
    console.log(`Stock adjusted: batch ${data.batch_id}, change: ${data.quantity_change}, reason: ${data.reason}`)
  })()
}
```

**Step 2: Commit**

```bash
git add src/main/services/inventory.ts
git commit -m "feat: add stock batch CRUD and adjustment functions"
```

---

## Task 8: Register Inventory IPC Handlers

**Files:**
- Create: `src/main/ipc/inventory-handlers.ts`
- Modify: `src/main/ipc/handlers.ts:5,20`

**Step 1: Create inventory handlers**

```typescript
// src/main/ipc/inventory-handlers.ts
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from './channels'
import {
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getLowStockProducts,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  listStockBatches,
  createStockBatch,
  updateStockBatch,
  deleteStockBatch,
  adjustStockBatch
} from '../services/inventory'

export function registerInventoryHandlers(): void {
  // Products
  ipcMain.handle(IPC_CHANNELS.PRODUCT_LIST, () => {
    return listProducts()
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_CREATE, (_event, data) => {
    return createProduct(data)
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_UPDATE, (_event, { id, data }) => {
    updateProduct(id, data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_DELETE, (_event, id) => {
    deleteProduct(id)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.PRODUCT_LOW_STOCK, () => {
    return getLowStockProducts()
  })

  // Categories
  ipcMain.handle(IPC_CHANNELS.CATEGORY_LIST, () => {
    return listCategories()
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_CREATE, (_event, data) => {
    return createCategory(data)
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_UPDATE, (_event, { id, data }) => {
    updateCategory(id, data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.CATEGORY_DELETE, (_event, id) => {
    deleteCategory(id)
    return { success: true }
  })

  // Suppliers
  ipcMain.handle(IPC_CHANNELS.SUPPLIER_LIST, () => {
    return listSuppliers()
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_CREATE, (_event, data) => {
    return createSupplier(data)
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_UPDATE, (_event, { id, data }) => {
    updateSupplier(id, data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.SUPPLIER_DELETE, (_event, id) => {
    deleteSupplier(id)
    return { success: true }
  })

  // Stock Batches
  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_LIST, () => {
    return listStockBatches()
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_CREATE, (_event, data) => {
    return createStockBatch(data)
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_UPDATE, (_event, { id, data }) => {
    updateStockBatch(id, data)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_DELETE, (_event, id) => {
    deleteStockBatch(id)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.STOCK_BATCH_ADJUST, (_event, data) => {
    adjustStockBatch(data)
    return { success: true }
  })
}
```

**Step 2: Register handlers in main**

```typescript
// src/main/ipc/handlers.ts
// Add import at top:
import { registerInventoryHandlers } from './inventory-handlers'

// Add in registerIpcHandlers function:
export function registerIpcHandlers(): void {
  // ... existing handlers ...
  registerInventoryHandlers()  // Add this line
}
```

**Step 3: Commit**

```bash
git add src/main/ipc/inventory-handlers.ts src/main/ipc/handlers.ts
git commit -m "feat: register inventory IPC handlers"
```

---

## Task 9: Expose Inventory API in Preload

**Files:**
- Modify: `src/preload/index.ts:48-100`

**Step 1: Add inventory methods to electron API**

```typescript
// src/preload/index.ts
// Add after existing methods:

  // Inventory - Products
  listProducts: () => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_LIST),
  createProduct: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_CREATE, data),
  updateProduct: (id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_UPDATE, { id, data }),
  deleteProduct: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_DELETE, id),
  getLowStockProducts: () => ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_LOW_STOCK),

  // Inventory - Categories
  listCategories: () => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_LIST),
  createCategory: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_CREATE, data),
  updateCategory: (id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_UPDATE, { id, data }),
  deleteCategory: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CATEGORY_DELETE, id),

  // Inventory - Suppliers
  listSuppliers: () => ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_LIST),
  createSupplier: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_CREATE, data),
  updateSupplier: (id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_UPDATE, { id, data }),
  deleteSupplier: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.SUPPLIER_DELETE, id),

  // Inventory - Stock Batches
  listStockBatches: () => ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_LIST),
  createStockBatch: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_CREATE, data),
  updateStockBatch: (id: string, data: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_UPDATE, { id, data }),
  deleteStockBatch: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_DELETE, id),
  adjustStockBatch: (data: unknown) => ipcRenderer.invoke(IPC_CHANNELS.STOCK_BATCH_ADJUST, data),

  // Inventory - Import/Export (to be implemented)
  importProductsCsv: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_IMPORT_CSV, filePath),
  exportProductsCsv: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRODUCT_EXPORT_CSV, filePath)
```

**Step 2: Commit**

```bash
git add src/preload/index.ts
git commit -m "feat: expose inventory API in preload"
```

---

---

## Part 1 Complete - Backend Infrastructure

Tasks 1-9 establish the complete backend infrastructure:
- ✅ Page layout and navigation
- ✅ Zustand state management
- ✅ IPC channels for all operations
- ✅ Full CRUD services (products, categories, suppliers, stock batches)
- ✅ Low stock queries and stock adjustments
- ✅ Preload API exposure

**Status:** Ready for Part 2 (UI components, CSV import/export, testing)

---

## Part 2: UI Components & Features

### Task 10: Create Products Data Table

**Files:**
- Create: `src/renderer/src/components/inventory/ProductsTable.tsx`
- Create: `src/renderer/src/components/inventory/ProductFormModal.tsx`

**Step 1: Create products table with TanStack Table**

```typescript
// src/renderer/src/components/inventory/ProductsTable.tsx
import { useMemo, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
  type ColumnFiltersState
} from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Package, Pencil, Trash2, Plus } from 'lucide-react'
import { useInventoryStore } from '@renderer/stores/inventoryStore'
import { ProductFormModal } from './ProductFormModal'
import type { Product } from '@renderer/types'

const columnHelper = createColumnHelper<Product>()

export function ProductsTable(): React.JSX.Element {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showFormModal, setShowFormModal] = useState(false)

  const products = useInventoryStore((state) => state.products)

  const columns = useMemo(
    () => [
      columnHelper.accessor('barcode', {
        header: 'Barcode',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('name', {
        header: 'Product Name',
        cell: (info) => (
          <div>
            <div className="font-medium">{info.getValue()}</div>
            {info.row.original.generic_name && (
              <div className="text-xs text-muted-foreground">{info.row.original.generic_name}</div>
            )}
          </div>
        )
      }),
      columnHelper.accessor('category_name', {
        header: 'Category',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('unit_price', {
        header: 'Price',
        cell: (info) => `Rs. ${info.getValue().toFixed(2)}`
      }),
      columnHelper.accessor('total_stock', {
        header: 'Stock',
        cell: (info) => {
          const stock = info.getValue()
          const reorderLevel = info.row.original.reorder_level
          const isLow = stock <= reorderLevel
          return (
            <span className={isLow ? 'text-destructive font-medium' : ''}>
              {stock} {info.row.original.unit}
            </span>
          )
        }
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditingProduct(info.row.original)
                setShowFormModal(true)
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(info.row.original.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })
    ],
    []
  )

  const table = useReactTable({
    data: products,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel()
  })

  const handleDelete = async (id: string) => {
    if (confirm('Delete this product? This will also remove all associated stock batches.')) {
      await window.electron.deleteProduct(id)
      const updated = await window.electron.listProducts()
      useInventoryStore.getState().setProducts(updated)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Input
          placeholder="Search products..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <Button
          onClick={() => {
            setEditingProduct(null)
            setShowFormModal(true)
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Product
        </Button>
      </div>

      <div className="border rounded-lg">
        <table className="w-full">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left text-sm font-medium">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ProductFormModal
        open={showFormModal}
        onClose={() => setShowFormModal(false)}
        product={editingProduct}
      />
    </div>
  )
}
```

**Step 2: Run dev server to verify it compiles**

Run: `npm run dev`
Expected: No compilation errors

**Step 3: Commit**

```bash
git add src/renderer/src/components/inventory/ProductsTable.tsx
git commit -m "feat: add products data table with TanStack Table"
```

---

### Task 11: Create Product Form Modal

**Files:**
- Create: `src/renderer/src/components/inventory/ProductFormModal.tsx`

**Step 1: Create product form with React Hook Form + Zod**

```typescript
// src/renderer/src/components/inventory/ProductFormModal.tsx
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { useInventoryStore } from '@renderer/stores/inventoryStore'
import type { Product } from '@renderer/types'

const productSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  generic_name: z.string().optional(),
  barcode: z.string().optional(),
  sku: z.string().optional(),
  category_id: z.string().optional(),
  supplier_id: z.string().optional(),
  cost_price: z.coerce.number().min(0, 'Cost price must be positive'),
  unit_price: z.coerce.number().min(0, 'Unit price must be positive'),
  tax_rate: z.coerce.number().min(0).max(100).default(18),
  reorder_level: z.coerce.number().int().min(0).default(10),
  reorder_qty: z.coerce.number().int().min(0).default(50),
  unit: z.string().default('piece'),
  track_expiry: z.boolean().default(true)
})

type ProductFormData = z.infer<typeof productSchema>

interface ProductFormModalProps {
  open: boolean
  onClose: () => void
  product?: Product | null
}

export function ProductFormModal({ open, onClose, product }: ProductFormModalProps): React.JSX.Element {
  const categories = useInventoryStore((state) => state.categories)
  const suppliers = useInventoryStore((state) => state.suppliers)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      tax_rate: 18,
      reorder_level: 10,
      reorder_qty: 50,
      unit: 'piece',
      track_expiry: true
    }
  })

  useEffect(() => {
    if (product) {
      reset({
        name: product.name,
        generic_name: product.generic_name || '',
        barcode: product.barcode || '',
        sku: product.sku || '',
        category_id: product.category_id || '',
        supplier_id: product.supplier_id || '',
        cost_price: product.cost_price,
        unit_price: product.unit_price,
        tax_rate: product.tax_rate || 18,
        reorder_level: product.reorder_level || 10,
        reorder_qty: product.reorder_qty || 50,
        unit: product.unit || 'piece',
        track_expiry: product.track_expiry === 1
      })
    } else {
      reset()
    }
  }, [product, reset])

  const onSubmit = async (data: ProductFormData) => {
    try {
      if (product) {
        await window.electron.updateProduct(product.id, data)
      } else {
        await window.electron.createProduct(data)
      }

      // Refresh products list
      const updated = await window.electron.listProducts()
      useInventoryStore.getState().setProducts(updated)

      onClose()
    } catch (error: any) {
      alert(error.message || 'Failed to save product')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Edit Product' : 'Add New Product'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Product Name *</Label>
              <Input id="name" {...register('name')} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="generic_name">Generic Name</Label>
              <Input id="generic_name" {...register('generic_name')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" {...register('barcode')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku">SKU</Label>
              <Input id="sku" {...register('sku')} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category_id">Category</Label>
              <select id="category_id" {...register('category_id')} className="w-full border rounded-md px-3 py-2">
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier_id">Supplier</Label>
              <select id="supplier_id" {...register('supplier_id')} className="w-full border rounded-md px-3 py-2">
                <option value="">Select supplier</option>
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cost_price">Cost Price *</Label>
              <Input id="cost_price" type="number" step="0.01" {...register('cost_price')} />
              {errors.cost_price && <p className="text-sm text-destructive">{errors.cost_price.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit_price">Unit Price *</Label>
              <Input id="unit_price" type="number" step="0.01" {...register('unit_price')} />
              {errors.unit_price && <p className="text-sm text-destructive">{errors.unit_price.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax_rate">Tax Rate (%)</Label>
              <Input id="tax_rate" type="number" step="0.01" {...register('tax_rate')} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reorder_level">Reorder Level</Label>
              <Input id="reorder_level" type="number" {...register('reorder_level')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reorder_qty">Reorder Qty</Label>
              <Input id="reorder_qty" type="number" {...register('reorder_qty')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="unit">Unit</Label>
              <Input id="unit" {...register('unit')} />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input id="track_expiry" type="checkbox" {...register('track_expiry')} />
            <Label htmlFor="track_expiry" className="cursor-pointer">Track expiry dates</Label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : product ? 'Update Product' : 'Create Product'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Run dev server to verify it compiles**

Run: `npm run dev`
Expected: No compilation errors, form renders correctly

**Step 3: Commit**

```bash
git add src/renderer/src/components/inventory/ProductFormModal.tsx
git commit -m "feat: add product form modal with validation"
```

---

### Task 12: Create Categories and Suppliers Tables

**Files:**
- Create: `src/renderer/src/components/inventory/CategoriesTable.tsx`
- Create: `src/renderer/src/components/inventory/SuppliersTable.tsx`

**Step 1: Create categories table (simpler version of products table)**

```typescript
// src/renderer/src/components/inventory/CategoriesTable.tsx
import { useMemo, useState } from 'react'
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useInventoryStore } from '@renderer/stores/inventoryStore'
import type { Category } from '@renderer/types'

const columnHelper = createColumnHelper<Category>()

export function CategoriesTable(): React.JSX.Element {
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const categories = useInventoryStore((state) => state.categories)

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Category Name',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>
      }),
      columnHelper.accessor('description', {
        header: 'Description',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditingCategory(info.row.original)
                setName(info.row.original.name)
                setDescription(info.row.original.description || '')
                setShowForm(true)
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(info.row.original.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })
    ],
    []
  )

  const table = useReactTable({
    data: categories,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  const handleDelete = async (id: string) => {
    if (confirm('Delete this category?')) {
      await window.electron.deleteCategory(id)
      const updated = await window.electron.listCategories()
      useInventoryStore.getState().setCategories(updated)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingCategory) {
        await window.electron.updateCategory(editingCategory.id, { name, description })
      } else {
        await window.electron.createCategory({ name, description })
      }
      const updated = await window.electron.listCategories()
      useInventoryStore.getState().setCategories(updated)
      setShowForm(false)
      setName('')
      setDescription('')
      setEditingCategory(null)
    } catch (error: any) {
      alert(error.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Category
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3">
          <div>
            <Input
              placeholder="Category name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Input
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit">{editingCategory ? 'Update' : 'Create'}</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false)
                setName('')
                setDescription('')
                setEditingCategory(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="border rounded-lg">
        <table className="w-full">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left text-sm font-medium">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step 2: Create suppliers table (similar structure)**

```typescript
// src/renderer/src/components/inventory/SuppliersTable.tsx
import { useMemo, useState } from 'react'
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useInventoryStore } from '@renderer/stores/inventoryStore'
import type { Supplier } from '@renderer/types'

const columnHelper = createColumnHelper<Supplier>()

export function SuppliersTable(): React.JSX.Element {
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: ''
  })

  const suppliers = useInventoryStore((state) => state.suppliers)

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Supplier Name',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>
      }),
      columnHelper.accessor('contact_person', {
        header: 'Contact Person',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('phone', {
        header: 'Phone',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('email', {
        header: 'Email',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setEditingSupplier(info.row.original)
                setFormData({
                  name: info.row.original.name,
                  contact_person: info.row.original.contact_person || '',
                  phone: info.row.original.phone || '',
                  email: info.row.original.email || '',
                  address: info.row.original.address || ''
                })
                setShowForm(true)
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(info.row.original.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })
    ],
    []
  )

  const table = useReactTable({
    data: suppliers,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  const handleDelete = async (id: string) => {
    if (confirm('Delete this supplier?')) {
      await window.electron.deleteSupplier(id)
      const updated = await window.electron.listSuppliers()
      useInventoryStore.getState().setSuppliers(updated)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingSupplier) {
        await window.electron.updateSupplier(editingSupplier.id, formData)
      } else {
        await window.electron.createSupplier(formData)
      }
      const updated = await window.electron.listSuppliers()
      useInventoryStore.getState().setSuppliers(updated)
      setShowForm(false)
      setFormData({ name: '', contact_person: '', phone: '', email: '', address: '' })
      setEditingSupplier(null)
    } catch (error: any) {
      alert(error.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Supplier
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3">
          <Input
            placeholder="Supplier name *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />
          <Input
            placeholder="Contact person"
            value={formData.contact_person}
            onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
          />
          <Input
            placeholder="Phone"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
          <Input
            placeholder="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
          <Input
            placeholder="Address"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
          <div className="flex gap-2">
            <Button type="submit">{editingSupplier ? 'Update' : 'Create'}</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false)
                setFormData({ name: '', contact_person: '', phone: '', email: '', address: '' })
                setEditingSupplier(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="border rounded-lg">
        <table className="w-full">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left text-sm font-medium">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/renderer/src/components/inventory/CategoriesTable.tsx src/renderer/src/components/inventory/SuppliersTable.tsx
git commit -m "feat: add categories and suppliers tables"
```

---

### Task 13: Create Stock Batches Table

**Files:**
- Create: `src/renderer/src/components/inventory/StockBatchesTable.tsx`

**Step 1: Create stock batches table with expiry tracking**

```typescript
// src/renderer/src/components/inventory/StockBatchesTable.tsx
import { useMemo, useState } from 'react'
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'
import { useInventoryStore } from '@renderer/stores/inventoryStore'
import type { StockBatch } from '@renderer/types'

const columnHelper = createColumnHelper<StockBatch>()

export function StockBatchesTable(): React.JSX.Element {
  const [showForm, setShowForm] = useState(false)
  const [editingBatch, setEditingBatch] = useState<StockBatch | null>(null)
  const [formData, setFormData] = useState({
    product_id: '',
    batch_number: '',
    quantity: 0,
    cost_price: 0,
    expiry_date: '',
    supplier_id: ''
  })

  const stockBatches = useInventoryStore((state) => state.stockBatches)
  const products = useInventoryStore((state) => state.products)
  const suppliers = useInventoryStore((state) => state.suppliers)

  const columns = useMemo(
    () => [
      columnHelper.accessor('product_name', {
        header: 'Product',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>
      }),
      columnHelper.accessor('batch_number', {
        header: 'Batch #',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.accessor('quantity', {
        header: 'Quantity',
        cell: (info) => <span className="font-medium">{info.getValue()}</span>
      }),
      columnHelper.accessor('cost_price', {
        header: 'Cost Price',
        cell: (info) => `Rs. ${info.getValue().toFixed(2)}`
      }),
      columnHelper.accessor('expiry_date', {
        header: 'Expiry Date',
        cell: (info) => {
          const expiry = info.getValue()
          if (!expiry) return '-'

          const expiryDate = new Date(expiry)
          const today = new Date()
          const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

          let className = ''
          if (daysUntilExpiry < 0) className = 'text-destructive font-medium'
          else if (daysUntilExpiry < 30) className = 'text-orange-600 font-medium'

          return <span className={className}>{expiry}</span>
        }
      }),
      columnHelper.accessor('received_date', {
        header: 'Received',
        cell: (info) => info.getValue() || '-'
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleAdjust(info.row.original)}
            >
              <Package className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleDelete(info.row.original.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })
    ],
    []
  )

  const table = useReactTable({
    data: stockBatches,
    columns,
    getCoreRowModel: getCoreRowModel()
  })

  const handleDelete = async (id: string) => {
    if (confirm('Delete this batch?')) {
      await window.electron.deleteStockBatch(id)
      const updated = await window.electron.listStockBatches()
      useInventoryStore.getState().setStockBatches(updated)
    }
  }

  const handleAdjust = async (batch: StockBatch) => {
    const reason = prompt('Reason for stock adjustment:')
    if (!reason) return

    const change = prompt(`Adjust stock for batch ${batch.batch_number} (current: ${batch.quantity}):`)
    if (!change) return

    const quantityChange = parseInt(change)
    if (isNaN(quantityChange)) {
      alert('Invalid quantity')
      return
    }

    await window.electron.adjustStockBatch({
      batch_id: batch.id,
      quantity_change: quantityChange,
      reason
    })

    const updated = await window.electron.listStockBatches()
    useInventoryStore.getState().setStockBatches(updated)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingBatch) {
        await window.electron.updateStockBatch(editingBatch.id, formData)
      } else {
        await window.electron.createStockBatch(formData)
      }
      const updated = await window.electron.listStockBatches()
      useInventoryStore.getState().setStockBatches(updated)
      setShowForm(false)
      setFormData({
        product_id: '',
        batch_number: '',
        quantity: 0,
        cost_price: 0,
        expiry_date: '',
        supplier_id: ''
      })
      setEditingBatch(null)
    } catch (error: any) {
      alert(error.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Stock Batch
        </Button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <select
                value={formData.product_id}
                onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
                className="w-full border rounded-md px-3 py-2"
                required
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              placeholder="Batch number"
              value={formData.batch_number}
              onChange={(e) => setFormData({ ...formData, batch_number: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input
              type="number"
              placeholder="Quantity *"
              value={formData.quantity || ''}
              onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
              required
            />
            <Input
              type="number"
              step="0.01"
              placeholder="Cost price *"
              value={formData.cost_price || ''}
              onChange={(e) => setFormData({ ...formData, cost_price: parseFloat(e.target.value) || 0 })}
              required
            />
            <Input
              type="date"
              placeholder="Expiry date"
              value={formData.expiry_date}
              onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
            />
          </div>
          <div>
            <select
              value={formData.supplier_id}
              onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}
              className="w-full border rounded-md px-3 py-2"
            >
              <option value="">Select supplier (optional)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <Button type="submit">{editingBatch ? 'Update' : 'Create'}</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false)
                setFormData({
                  product_id: '',
                  batch_number: '',
                  quantity: 0,
                  cost_price: 0,
                  expiry_date: '',
                  supplier_id: ''
                })
                setEditingBatch(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      <div className="border rounded-lg">
        <table className="w-full">
          <thead className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left text-sm font-medium">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t hover:bg-muted/50">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/renderer/src/components/inventory/StockBatchesTable.tsx
git commit -m "feat: add stock batches table with expiry tracking"
```

---

### Task 14: Wire Up Inventory Page Components

**Files:**
- Modify: `src/renderer/src/pages/InventoryPage.tsx:1-30`

**Step 1: Import and render all table components**

```typescript
// src/renderer/src/pages/InventoryPage.tsx
import { useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { ProductsTable } from '@renderer/components/inventory/ProductsTable'
import { CategoriesTable } from '@renderer/components/inventory/CategoriesTable'
import { SuppliersTable } from '@renderer/components/inventory/SuppliersTable'
import { StockBatchesTable } from '@renderer/components/inventory/StockBatchesTable'
import { useInventoryStore } from '@renderer/stores/inventoryStore'

export function InventoryPage(): React.JSX.Element {
  const setProducts = useInventoryStore((state) => state.setProducts)
  const setCategories = useInventoryStore((state) => state.setCategories)
  const setSuppliers = useInventoryStore((state) => state.setSuppliers)
  const setStockBatches = useInventoryStore((state) => state.setStockBatches)

  useEffect(() => {
    const loadData = async () => {
      const [products, categories, suppliers, stockBatches] = await Promise.all([
        window.electron.listProducts(),
        window.electron.listCategories(),
        window.electron.listSuppliers(),
        window.electron.listStockBatches()
      ])
      setProducts(products)
      setCategories(categories)
      setSuppliers(suppliers)
      setStockBatches(stockBatches)
    }
    loadData()
  }, [setProducts, setCategories, setSuppliers, setStockBatches])

  return (
    <div className="h-full flex flex-col p-6 bg-background">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Inventory Management</h1>
        <p className="text-muted-foreground">Manage products, categories, suppliers, and stock</p>
      </div>

      <Tabs defaultValue="products" className="flex-1">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="stock">Stock Batches</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="flex-1">
          <ProductsTable />
        </TabsContent>

        <TabsContent value="categories" className="flex-1">
          <CategoriesTable />
        </TabsContent>

        <TabsContent value="suppliers" className="flex-1">
          <SuppliersTable />
        </TabsContent>

        <TabsContent value="stock" className="flex-1">
          <StockBatchesTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

**Step 2: Add inventory route to app**

Modify: `src/renderer/src/App.tsx` to add inventory route (if not already there)

**Step 3: Run dev server and test navigation**

Run: `npm run dev`
Expected: Inventory page loads, all tabs render correctly

**Step 4: Commit**

```bash
git add src/renderer/src/pages/InventoryPage.tsx
git commit -m "feat: wire up inventory page with all table components"
```

---

### Task 15: Add CSV Import/Export for Products

**Files:**
- Create: `src/main/services/csv.ts`
- Modify: `src/main/ipc/handlers.ts:25,40`
- Modify: `src/renderer/src/components/inventory/ProductsTable.tsx:10,50`

**Step 1: Create CSV import/export service**

```typescript
// src/main/services/csv.ts
import fs from 'fs'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'
import { getDatabase } from '../db'
import { createProduct, listProducts } from './inventory'

interface ProductCSVRow {
  name: string
  generic_name?: string
  barcode?: string
  sku?: string
  category_id?: string
  supplier_id?: string
  cost_price: number
  unit_price: number
  tax_rate?: number
  reorder_level?: number
  reorder_qty?: number
  unit?: string
}

export async function importProductsFromCSV(filePath: string): Promise<{ imported: number; errors: string[] }> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const rows = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  })

  let imported = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as ProductCSVRow
    try {
      // Validate required fields
      if (!row.name) throw new Error('Name is required')
      if (!row.cost_price || isNaN(Number(row.cost_price))) throw new Error('Valid cost_price required')
      if (!row.unit_price || isNaN(Number(row.unit_price))) throw new Error('Valid unit_price required')

      await createProduct({
        name: row.name,
        generic_name: row.generic_name || '',
        barcode: row.barcode || '',
        sku: row.sku || '',
        category_id: row.category_id || '',
        supplier_id: row.supplier_id || '',
        cost_price: Number(row.cost_price),
        unit_price: Number(row.unit_price),
        tax_rate: row.tax_rate ? Number(row.tax_rate) : 18,
        reorder_level: row.reorder_level ? Number(row.reorder_level) : 10,
        reorder_qty: row.reorder_qty ? Number(row.reorder_qty) : 50,
        unit: row.unit || 'piece'
      })
      imported++
    } catch (error: any) {
      errors.push(`Row ${i + 2}: ${error.message}`)
    }
  }

  return { imported, errors }
}

export async function exportProductsToCSV(filePath: string): Promise<{ exported: number }> {
  const products = listProducts()

  const csvData = products.map((p) => ({
    name: p.name,
    generic_name: p.generic_name || '',
    barcode: p.barcode || '',
    sku: p.sku || '',
    category_id: p.category_id || '',
    supplier_id: p.supplier_id || '',
    cost_price: p.cost_price,
    unit_price: p.unit_price,
    tax_rate: p.tax_rate || 18,
    reorder_level: p.reorder_level || 10,
    reorder_qty: p.reorder_qty || 50,
    unit: p.unit || 'piece',
    total_stock: p.total_stock || 0
  }))

  const csv = stringify(csvData, {
    header: true,
    columns: [
      'name',
      'generic_name',
      'barcode',
      'sku',
      'category_id',
      'supplier_id',
      'cost_price',
      'unit_price',
      'tax_rate',
      'reorder_level',
      'reorder_qty',
      'unit',
      'total_stock'
    ]
  })

  fs.writeFileSync(filePath, csv, 'utf-8')
  return { exported: products.length }
}
```

**Step 2: Register CSV handlers**

```typescript
// Add to src/main/ipc/handlers.ts
import { importProductsFromCSV, exportProductsToCSV } from '../services/csv'

// ... in registerHandlers function:
ipcMain.handle(IPC_CHANNELS.PRODUCT_IMPORT_CSV, async (_event, filePath) => {
  return await importProductsFromCSV(filePath)
})

ipcMain.handle(IPC_CHANNELS.PRODUCT_EXPORT_CSV, async (_event, filePath) => {
  return await exportProductsToCSV(filePath)
})
```

**Step 3: Add import/export buttons to ProductsTable**

```typescript
// Add to ProductsTable.tsx toolbar section
import { dialog } from '@electron/remote'

// ... in ProductsTable component:
const handleImport = async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })

  if (result.canceled) return

  const { imported, errors } = await window.electron.importProductsCsv(result.filePaths[0])
  alert(`Imported ${imported} products. ${errors.length ? `Errors: ${errors.join('\n')}` : ''}`)

  const updated = await window.electron.listProducts()
  useInventoryStore.getState().setProducts(updated)
}

const handleExport = async () => {
  const result = await dialog.showSaveDialog({
    defaultPath: 'products-export.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })

  if (result.canceled) return

  const { exported } = await window.electron.exportProductsCsv(result.filePath)
  alert(`Exported ${exported} products`)
}

// Add buttons to toolbar:
<div className="flex gap-2">
  <Button variant="outline" onClick={handleImport}>Import CSV</Button>
  <Button variant="outline" onClick={handleExport}>Export CSV</Button>
  <Button onClick={() => { ... }}>Add Product</Button>
</div>
```

**Step 4: Install csv-parse and csv-stringify**

Run: `npm install csv-parse csv-stringify`

**Step 5: Commit**

```bash
git add src/main/services/csv.ts src/main/ipc/handlers.ts src/renderer/src/components/inventory/ProductsTable.tsx
git commit -m "feat: add CSV import/export for products"
```

---

### Task 16: Add Low Stock Alert Badge

**Files:**
- Create: `src/renderer/src/components/inventory/LowStockBadge.tsx`
- Modify: `src/renderer/src/components/layout/Sidebar.tsx:15,40`

**Step 1: Create low stock badge component**

```typescript
// src/renderer/src/components/inventory/LowStockBadge.tsx
import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useInventoryStore } from '@renderer/stores/inventoryStore'

export function LowStockBadge(): React.JSX.Element | null {
  const lowStockProducts = useInventoryStore((state) => state.lowStockProducts)
  const setLowStockProducts = useInventoryStore((state) => state.setLowStockProducts)

  useEffect(() => {
    const loadLowStock = async () => {
      const products = await window.electron.getLowStockProducts()
      setLowStockProducts(products)
    }
    loadLowStock()

    // Refresh every 5 minutes
    const interval = setInterval(loadLowStock, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [setLowStockProducts])

  if (lowStockProducts.length === 0) return null

  return (
    <div className="flex items-center gap-2 text-orange-600">
      <AlertTriangle className="h-4 w-4" />
      <span className="text-sm font-medium">{lowStockProducts.length} low stock</span>
    </div>
  )
}
```

**Step 2: Add badge to sidebar navigation**

```typescript
// Modify Sidebar.tsx to show badge next to Inventory link
import { LowStockBadge } from '../inventory/LowStockBadge'

// In navigation links:
<Link to="/inventory" className="...">
  <Package className="h-5 w-5" />
  <span>Inventory</span>
  <LowStockBadge />
</Link>
```

**Step 3: Commit**

```bash
git add src/renderer/src/components/inventory/LowStockBadge.tsx src/renderer/src/components/layout/Sidebar.tsx
git commit -m "feat: add low stock alert badge to sidebar"
```

---

### Task 17: Add TypeScript Types

**Files:**
- Create: `src/renderer/src/types/inventory.ts`
- Modify: `src/renderer/src/types/index.ts:1-5`

**Step 1: Create inventory types**

```typescript
// src/renderer/src/types/inventory.ts
export interface Product {
  id: string
  barcode: string | null
  sku: string | null
  name: string
  generic_name: string | null
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

export interface Category {
  id: string
  name: string
  description: string | null
  parent_id: string | null
  created_at: string
}

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  phone: string | null
  email: string | null
  address: string | null
  lead_time_days: number
  is_active: number
  created_at: string
}

export interface StockBatch {
  id: string
  product_id: string
  product_name?: string
  batch_number: string | null
  quantity: number
  cost_price: number
  expiry_date: string | null
  received_date: string
  supplier_id: string | null
  created_at: string
}
```

**Step 2: Export from index**

```typescript
// src/renderer/src/types/index.ts
export * from './inventory'
export * from './auth'
// ... other exports
```

**Step 3: Commit**

```bash
git add src/renderer/src/types/inventory.ts src/renderer/src/types/index.ts
git commit -m "feat: add TypeScript types for inventory"
```

---

## Part 2 Complete - UI & Features

Tasks 10-17 complete the user interface and features:
- ✅ Products data table with TanStack Table
- ✅ Product form modal with React Hook Form + Zod validation
- ✅ Categories and suppliers tables with inline forms
- ✅ Stock batches table with expiry tracking
- ✅ Wired up inventory page with all components
- ✅ CSV import/export functionality
- ✅ Low stock alert badge in sidebar
- ✅ TypeScript types for type safety

---

## Phase 3 Complete - Summary

**Total Tasks:** 17
**Backend Infrastructure:** Tasks 1-9
**UI Components & Features:** Tasks 10-17

**What We Built:**
- Complete inventory management system
- CRUD operations for products, categories, suppliers, stock batches
- Data tables with sorting, filtering, search
- Form validation with Zod
- CSV import/export
- Low stock alerts
- Expiry date tracking
- Stock adjustments with reason logging

**Tech Stack Used:**
- React 19 + TypeScript
- TanStack Table v8 (data tables)
- React Hook Form v7 + Zod v3 (forms + validation)
- better-sqlite3 (database)
- csv-parse/csv-stringify (CSV operations)
- Radix UI primitives (Tabs, Dialog, etc.)
- Zustand (state management)

**Ready For:**
- Phase 4: Reporting & Analytics
- Phase 5: Advanced Features (batch operations, barcode printing, etc.)

---

_Plan completed: 2025-01-26_
