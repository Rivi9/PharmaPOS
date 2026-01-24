# Phase 2: Core POS - Design Document

**Date:** 2025-01-24
**Status:** Approved for Implementation
**Dependencies:** Phase 1 (Foundation) Complete

---

## Table of Contents

1. [Overview & Architecture](#overview--architecture)
2. [Data Flow & Core Workflows](#data-flow--core-workflows)
3. [UI Components & Interactions](#ui-components--interactions)
4. [Payment & Receipt Generation](#payment--receipt-generation)
5. [Database Operations & IPC Handlers](#database-operations--ipc-handlers)
6. [Implementation Details & File Structure](#implementation-details--file-structure)

---

## Overview & Architecture

### Goal
Build a complete point-of-sale terminal where cashiers can scan products, build a cart, apply discounts, take payment, and complete sales with automatic inventory deduction.

### Key Features

- **Hybrid checkout flow** - Quick-pay for single items, full cart for multiple
- **Barcode-first entry** - Auto-focused input with search fallback
- **Auto-populated quick items** - Top 8 best-sellers updated daily
- **Dual discount system** - Both line-item and sale-level discounts
- **Cash + Card payment** - Track payment methods (no hardware integration yet)
- **Screen receipt preview** - Display receipt (no printing yet)
- **Automatic FEFO stock deduction** - First Expiry, First Out from batches
- **Sale-level tax calculation** - 18% VAT on entire sale
- **Hold one sale** - Pause current sale, recall later
- **Void in-progress sales** - Cancel before payment only

### Technical Approach

```
POS Page Component
├── ProductEntry (barcode input + search)
├── QuickItems (auto-populated grid)
├── ShoppingCart (Zustand store)
│   ├── CartItems list
│   ├── CartTotals (subtotal, tax, discount, total)
│   └── CartActions (hold, clear, void)
├── PaymentModal
│   └── ReceiptPreview
└── StatusBar (shift info, sales today)
```

### State Management

- **`usePOSStore`** - Shopping cart, held sale, current sale state
- **`useProductStore`** - Product search cache, quick items
- **`useShiftStore`** - Active shift info, today's sales total

---

## Data Flow & Core Workflows

### Workflow 1: Add Product to Cart (Barcode)

```
1. Barcode scanner sends input → auto-focused input field captures
2. Query database: SELECT product + available stock batches (FEFO ordered)
3. Check stock availability:
   - If stock available → add to cart (qty: 1)
   - If insufficient → show error "Only X available"
   - If not found → show "Product not found"
4. Calculate line total: (unit_price × qty) + line_discount
5. Recalculate cart totals (subtotal, tax, grand total)
6. Clear barcode input, ready for next scan
```

### Workflow 2: Quick Single-Item Sale

```
1. Scan product OR click quick item
2. If cart is empty OR has only this item → show "Quick Pay" option
3. Click Quick Pay → skip to payment modal
4. Complete payment → save sale → show receipt
5. Fast path for single-item purchases
```

### Workflow 3: Complete Multi-Item Sale

```
1. Build cart (scan/add multiple items)
2. Apply line discounts (optional, per item)
3. Apply sale discount (optional, entire cart)
4. Click "Pay Now" → Payment Modal opens
5. Select payment method (Cash/Card/Mixed)
6. If cash: enter amount → calculate change
7. Complete payment:
   - Generate receipt number (R-YYYY-NNNNNN)
   - Save sale to database
   - Deduct stock from batches (FEFO)
   - Update shift totals
   - Show receipt preview
8. Clear cart, ready for next customer
```

### FEFO Stock Deduction Logic

```sql
-- When item sold, deduct from earliest expiry batch first
SELECT id, quantity, expiry_date
FROM stock_batches
WHERE product_id = ? AND quantity > 0
ORDER BY
  CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
  expiry_date ASC,
  received_date ASC
```

Deduct quantity needed from batches in order until fulfilled.

---

## UI Components & Interactions

### ProductEntry Component

```tsx
- Auto-focused barcode input field (always ready)
- On Enter: lookup product, add to cart, clear input
- "Search" button/icon → opens search modal
- Search modal:
  - Fuzzy search by name, generic name, barcode, SKU
  - Shows results in list (name, price, stock)
  - Click result → add to cart, close modal
- Keyboard shortcut: F2 to focus search
```

### QuickItems Component

```tsx
- 4×2 grid (8 items total)
- Auto-populated from product_sales_daily:
  - Top 8 products by quantity sold (last 7 days)
  - Updates daily
- Each tile shows:
  - Product name (truncated)
  - Price
  - Stock level indicator (green/yellow/red)
- Click → add to cart (qty: 1)
- Falls back to default items if no sales history
```

### ShoppingCart Component

```tsx
CartItem row:
- Product name + generic name (if exists)
- Quantity spinner (±1 buttons, manual input)
- Unit price (editable for line discount)
- Line total
- Remove button (×)

Cart footer:
- Subtotal: Sum of all line totals
- Discount: (if sale discount applied)
- Tax (18%): calculated on (subtotal - discount)
- Total: Final amount

Actions:
- "Hold" button → save current cart, start fresh
- "Recall" button → restore held sale (if exists)
- "Clear" button → confirm, then empty cart
- "Void" button → only visible if sale not completed
```

### Discount UI

```tsx
Line discount:
- Click price in cart row → edit modal
- Enter new price OR discount % → recalculates

Sale discount:
- "Add Discount" button above totals
- Modal: Choose percentage OR fixed amount
- Shows before/after total
- Applied after line discounts
```

---

## Payment & Receipt Generation

### PaymentModal Component

Opens when: "Pay Now" clicked or Quick Pay triggered

**Layout:**
```
┌─────────────────────────────────────┐
│  Complete Sale - Rs. 1,121.00       │
├─────────────────────────────────────┤
│  Payment Method:                    │
│  [ Cash ] [ Card ] [ Mixed ]        │
│                                     │
│  Cash Received:  [_________]        │
│  Change:         Rs. 79.00          │
│                                     │
│  [Optional] Customer Info:          │
│  Name:  [________________]          │
│  Phone: [________________]          │
│                                     │
│  [ Cancel ]      [ Complete Sale ]  │
└─────────────────────────────────────┘
```

**Payment logic:**
- **Cash:** Enter amount → auto-calculate change
  - If less than total → show error
- **Card:** Just mark as paid (amount = total)
- **Mixed:** Enter cash amount, card = remainder
  - Validate cash + card = total

**On "Complete Sale":**
1. Validate payment amounts
2. Generate receipt number
3. Save sale to database (with all line items)
4. Deduct stock from batches (FEFO)
5. Update shift sales total
6. Close modal → show receipt preview

### ReceiptPreview Component

Shows after successful payment:

```
┌────────────────────────────────┐
│         MY PHARMACY            │
│     123 Main Street, Colombo   │
│        Tel: 011-2345678        │
├────────────────────────────────┤
│ Receipt #: R-2025-001234       │
│ Date: 2025-01-24  Time: 14:35  │
│ Cashier: Admin                 │
├────────────────────────────────┤
│ Item              Qty    Price │
│ ────────────────────────────── │
│ Panadol 500mg      2   320.00  │
│ Strepsils Honey    1   180.00  │
├────────────────────────────────┤
│ Subtotal:             500.00   │
│ Discount:             -50.00   │
│ VAT (18%):             81.00   │
│ ══════════════════════════════ │
│ TOTAL:             Rs. 531.00  │
│ ══════════════════════════════ │
│ Cash:                 600.00   │
│ Change:                69.00   │
├────────────────────────────────┤
│  Thank you for your purchase!  │
└────────────────────────────────┘
```

**Actions:**
- [ Copy to Clipboard ] (copies as text)
- [ New Sale ] (close preview, start fresh)

**Auto-closes after 30 seconds OR on new barcode scan**

### Receipt Number Format

- `R-YYYY-NNNNNN` (R-2025-000001, R-2025-000002...)
- Sequential within year
- Reset counter on January 1st

---

## Database Operations & IPC Handlers

### New IPC Channels

Add to `src/main/ipc/channels.ts`:

```typescript
// Product search
PRODUCT_SEARCH: 'product:search'
PRODUCT_GET_BY_BARCODE: 'product:getByBarcode'
PRODUCT_GET_QUICK_ITEMS: 'product:getQuickItems'

// Cart & Sales
SALE_CREATE: 'sale:create'
SALE_GET_RECEIPT: 'sale:getReceipt'
SALE_GET_TODAY_TOTAL: 'sale:getTodayTotal'

// Stock
STOCK_CHECK_AVAILABILITY: 'stock:checkAvailability'
STOCK_DEDUCT: 'stock:deduct'
```

### Key Database Queries

**1. Product Search with Stock:**

```sql
SELECT
  p.*,
  COALESCE(SUM(sb.quantity), 0) as total_stock,
  MIN(sb.expiry_date) as nearest_expiry
FROM products p
LEFT JOIN stock_batches sb ON p.id = sb.product_id
WHERE p.is_active = 1
  AND (p.name LIKE ? OR p.barcode = ? OR p.generic_name LIKE ?)
GROUP BY p.id
LIMIT 20
```

**2. Get Quick Items (Top 8 Best Sellers):**

```sql
SELECT
  p.*,
  COALESCE(SUM(sb.quantity), 0) as stock,
  COALESCE(SUM(psd.quantity_sold), 0) as sales_7d
FROM products p
LEFT JOIN stock_batches sb ON p.id = sb.product_id
LEFT JOIN product_sales_daily psd
  ON p.id = psd.product_id
  AND psd.date >= date('now', '-7 days')
WHERE p.is_active = 1
GROUP BY p.id
ORDER BY sales_7d DESC
LIMIT 8
```

**3. FEFO Stock Deduction:**

```typescript
async function deductStock(productId: string, qtyNeeded: number) {
  // Get batches in FEFO order
  const batches = db.prepare(`
    SELECT id, quantity, expiry_date
    FROM stock_batches
    WHERE product_id = ? AND quantity > 0
    ORDER BY
      CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END,
      expiry_date ASC,
      received_date ASC
  `).all(productId)

  let remaining = qtyNeeded
  const deductions = []

  for (const batch of batches) {
    if (remaining <= 0) break

    const deduct = Math.min(batch.quantity, remaining)
    deductions.push({ batchId: batch.id, quantity: deduct })
    remaining -= deduct
  }

  if (remaining > 0) {
    throw new Error('Insufficient stock')
  }

  // Apply deductions in transaction
  db.transaction(() => {
    for (const { batchId, quantity } of deductions) {
      db.prepare(`
        UPDATE stock_batches
        SET quantity = quantity - ?
        WHERE id = ?
      `).run(quantity, batchId)
    }
  })()

  return deductions
}
```

**4. Create Sale (Transaction):**

```typescript
async function createSale(saleData) {
  return db.transaction(() => {
    // 1. Insert sale header
    const saleId = generateId()
    db.prepare(`INSERT INTO sales (...) VALUES (...)`).run(...)

    // 2. Insert sale items
    for (const item of saleData.items) {
      const itemId = generateId()
      db.prepare(`INSERT INTO sale_items (...) VALUES (...)`).run(...)

      // 3. Deduct stock (FEFO)
      const batches = deductStock(item.productId, item.quantity)

      // 4. Record which batch was used
      db.prepare(`UPDATE sale_items SET batch_id = ? WHERE id = ?`)
        .run(batches[0].batchId, itemId)
    }

    // 5. Update shift totals
    db.prepare(`
      UPDATE shifts
      SET expected_cash = expected_cash + ?
      WHERE id = ?
    `).run(saleData.total, saleData.shiftId)

    return saleId
  })()
}
```

---

## Implementation Details & File Structure

### New Files for Phase 2

```
src/renderer/src/
├── pages/
│   └── POSPage.tsx                    # Main POS terminal page
├── components/
│   └── pos/
│       ├── ProductEntry.tsx           # Barcode input + search trigger
│       ├── SearchModal.tsx            # Product search dialog
│       ├── QuickItems.tsx             # 4×2 grid of best sellers
│       ├── ShoppingCart.tsx           # Cart display with items
│       ├── CartItem.tsx               # Single cart row
│       ├── CartTotals.tsx             # Subtotal, tax, discount, total
│       ├── CartActions.tsx            # Hold, recall, clear, void buttons
│       ├── PaymentModal.tsx           # Payment method + amounts
│       ├── ReceiptPreview.tsx         # Receipt display after sale
│       └── DiscountModal.tsx          # Apply line/sale discount
├── stores/
│   ├── posStore.ts                    # Cart state, held sale, totals
│   ├── productStore.ts                # Product cache, quick items
│   └── shiftStore.ts                  # Active shift, today's total
└── lib/
    ├── calculations.ts                # Tax, discount, change calculations
    └── receipt.ts                     # Receipt text formatting

src/main/
├── ipc/
│   └── pos-handlers.ts                # POS-specific IPC handlers
└── services/
    ├── sales.ts                       # Sale creation, FEFO deduction
    └── products.ts                    # Product queries, quick items
```

### Keyboard Shortcuts

```
F1  → Focus barcode input (always ready)
F2  → Open search modal
F3  → Apply sale discount
F4  → Hold current sale
F5  → Recall held sale
F8  → Clear cart (with confirmation)
F9  → Payment (if cart not empty)
F12 → Void current sale (if in progress)
Esc → Close any open modal
```

### posStore Structure

```typescript
interface POSStore {
  // Cart
  items: CartItem[]
  addItem: (product: Product, quantity: number) => void
  updateQuantity: (index: number, quantity: number) => void
  removeItem: (index: number) => void
  applyLineDiscount: (index: number, newPrice: number) => void
  clearCart: () => void

  // Discounts
  saleDiscount: { type: 'percentage' | 'fixed', value: number } | null
  applySaleDiscount: (type, value) => void

  // Totals (computed)
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number

  // Hold/Recall
  heldSale: CartState | null
  holdCurrentSale: () => void
  recallHeldSale: () => void

  // Status
  saleInProgress: boolean
}
```

### Error Handling

**Stock check errors:**
- "Product not found" → Clear input, focus ready
- "Insufficient stock (only X available)" → Don't add, show warning
- "No stock available" → Don't add, show error

**Payment errors:**
- "Cash received less than total" → Prevent completion
- "Payment amounts don't match total" → Show validation

**Database errors:**
- Sale creation failed → Rollback, show error, keep cart
- Stock deduction failed → Rollback entire transaction

### Edge Cases

1. **Barcode scanner malfunction** → Search modal fallback
2. **Held sale exists** → Warn before overwriting on new hold
3. **Quantity spinner** → Min: 1, Max: available stock
4. **Empty cart** → Disable payment button
5. **Negative prices** → Prevent, show validation
6. **Very long product names** → Truncate in cart, full in tooltip
7. **No active shift** → Redirect to shift start page

---

## Summary

Phase 2 delivers a complete, functional POS terminal with:

✅ Hybrid checkout flow (quick-pay + full cart)
✅ Barcode-first product entry with search fallback
✅ Auto-populated quick items from sales data
✅ Dual discount system (line + sale level)
✅ Multi-payment support (cash, card, mixed)
✅ Screen receipt preview
✅ Automatic FEFO stock deduction
✅ Hold/recall sales capability
✅ Void in-progress transactions
✅ Comprehensive keyboard shortcuts

**Next Phase:** Phase 3 - Inventory Management (product CRUD, stock receiving, batch tracking, CSV import)

---

*Document created: 2025-01-24*
