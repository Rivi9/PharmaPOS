# PharmaPOS QA Report

**Date:** 2026-03-11
**Reviewed by:** Code review (source-level analysis)
**Environment:** Windows 10 POS touchscreen + customer pole display

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 4 |
| 🟠 High | 10 |
| 🟡 Medium | 13 |
| ⚪ Low | 10 |
| **Total** | **37** |

---

## 🔴 Critical

### C1 — Expired products can be added to cart without blocking the transaction
**File:** `src/renderer/src/components/pos/ProductEntry.tsx`

The expiry check only sets an `expiryWarning` string — it never blocks the item from being added. `addItem` is called unconditionally even when `days <= 0`. A cashier scanning an expired product sees a yellow warning text but the item still enters the cart and the sale completes. A pharmacy legally cannot dispense expired medicines.

`handleSuggestionSelect` checks for `total_stock === 0` and returns early, but there is no equivalent early return for expired products.

**Fix:** Add a hard block (return early, set an error, do not call `addItem`) when `days <= 0`, matching the out-of-stock guard already present.

---

### C2 — `createSale` result not checked before clearing cart
**File:** `src/renderer/src/components/pos/PaymentModal.tsx`

If `createSale` returns a success-shaped object with `result.success === false`, `clearCart()` still runs (wiping the cart), `addToTodaySales` increments the header total, and `onComplete(undefined, undefined)` opens the receipt preview for a non-existent sale — crashing `getReceipt` in `ReceiptPreview.tsx`.

**Fix:** Check `result.success` before clearing the cart and calling `onComplete`.

---

### C3 — Today's Sales total is hardcoded to `Rs. 0.00`
**File:** `src/renderer/src/pages/POSPage.tsx` line 72

```tsx
<p className="text-lg font-bold">Rs. 0.00</p>
```

This never reads from `shiftStore.todaySalesTotal` and always shows zero regardless of completed sales.

**Fix:** Subscribe to `useShiftStore` and display `todaySalesTotal`, or remove this duplicate display since the header already shows it.

---

### C4 — Default admin credentials hardcoded in source
**File:** `src/renderer/src/pages/LoginPage.tsx`

`password: 'admin123'` and `pin: '0000'` are committed in plaintext. No forced-change flow exists after first login.

**Fix:** Prompt for credentials on first-run setup, or generate a random PIN and display it once at first boot.

---

## 🟠 High

### H1 — Search bar not responding to touch on touchscreen displays
**Files:** `src/renderer/src/components/pos/ProductEntry.tsx`, `src/renderer/src/components/pos/SearchModal.tsx`

On capacitive touchscreens, input fields inside certain flex/overflow containers can become unresponsive to touch events. This is a known Chromium/Electron issue where `overflow: hidden` or `overflow: auto` parent containers intercept touch events before they reach the input. The barcode/search input in `ProductEntry` sits inside a `relative` wrapper inside a `flex` container inside an `overflow-auto` parent — this chain creates conditions where touch focus fails intermittently.

**Fix:** Add `touch-action: manipulation` via `style={{ touchAction: 'manipulation' }}` on affected inputs, and ensure parent containers do not use `overflow: hidden` directly around the input wrapper. Also add explicit `onClick={() => inputRef.current?.focus()}` handlers as a fallback.

---

### H2 — Shopping cart quantity input too narrow — only shows one digit
**File:** `src/renderer/src/components/pos/CartItem.tsx` line 86

```tsx
className="w-12 h-9 text-center text-sm"
```

`w-12` (48px) is not wide enough for two-digit quantities like `10`, `25`, `100`. At `text-sm` on a standard POS font scale, values of `10+` get clipped or the browser auto-shrinks the font, effectively displaying only one digit or showing an illegible truncated number. On a touch-only device the cashier cannot see the actual quantity without zooming.

**Fix:** Increase to `w-16` (64px) minimum, or use `w-14` with `text-xs` to balance space. Also consider a wider touch target for the quantity input itself (`h-11 w-16`) since at `h-9` (36px) it falls below the recommended 44px touch target height.

---

### H3 — `onMouseDown` on dropdown suggestions unreliable on touch
**File:** `src/renderer/src/components/pos/ProductEntry.tsx` line 127

```tsx
onMouseDown={() => handleSuggestionSelect(product)}
```

On physical touchscreens the event order is `touchstart → blur → click`. `onMouseDown` fires before `blur` on mouse devices (enabling the 150ms blur trick), but on touch devices `mousedown` may fire after `blur`, causing the suggestion list to close before the selection is registered. The product is never added to cart and there is no error shown — the tap silently does nothing.

**Fix:** Use `onPointerDown` instead of `onMouseDown`, which fires before `blur` on both mouse and touch input.

---

### H4 — Recall overwrites live cart silently with no confirmation
**Files:** `src/renderer/src/stores/posStore.ts`, `src/renderer/src/components/pos/CartActions.tsx`

`recallHeldSale` sets `items` to the held sale items, discarding the current cart without any warning. The Recall button is only disabled when there is no held sale, not when the cart has items. A cashier who taps Recall mid-transaction loses the current sale with no recovery path.

**Fix:** If `items.length > 0`, show a confirmation dialog before overwriting (similar to the existing Clear Cart confirmation).

---

### H5 — Customer save result ignored — IPC failures are silent
**File:** `src/renderer/src/pages/CustomersPage.tsx`

Both `window.electron.customers.update()` and `window.electron.customers.create()` results are not checked. If the IPC call fails (e.g. duplicate phone number, DB error), the dialog closes and `loadCustomers()` is called with no error shown. The cashier assumes the save succeeded.

**Fix:** Check the returned result and display an error on failure instead of closing the dialog.

---

### H6 — Product and supplier delete failures are silent
**File:** `src/renderer/src/pages/InventoryPage.tsx`

`handleProductDelete` and `handleSupplierDelete` have no error branch when the IPC returns a failure. `handleCategoryDelete` and `handleBatchDelete` do show an alert on failure — the inconsistency means product and supplier failures are invisible.

**Fix:** Add `else { alert(result.error || 'Failed to delete') }` to both handlers.

---

### H7 — No pre-payment stock recheck
**Files:** `src/renderer/src/stores/posStore.ts`, `src/renderer/src/components/pos/PaymentModal.tsx`

Stock is checked once when the item is added to the cart. If stock goes to zero between cart-add and payment completion (inventory adjustment, another terminal), the sale still goes through and can drive stock negative.

**Fix:** Before calling `createSale`, fetch current stock for each cart item and abort with an itemised error if any item is now out of stock.

---

### H8 — Mixed payment card field gives no live mismatch feedback
**File:** `src/renderer/src/components/pos/PaymentModal.tsx`

Manually editing the card amount field does not recalculate cash. The cashier can enter Rs. 500 cash + Rs. 500 card on a Rs. 800 total, see no immediate error, and only get blocked on submit with no indication of which value to fix.

**Fix:** Add live mismatch feedback showing remaining balance as the card amount is changed.

---

### H9 — `formatCurrency` hardcodes `Rs.` instead of using configured currency symbol
**File:** `src/renderer/src/lib/calculations.ts` line 39

```typescript
export function formatCurrency(amount: number): string {
  return `Rs. ${amount.toFixed(2)}`
}
```

If a pharmacy changes `currency_symbol` in Settings, every formatted amount still shows `Rs.` throughout the entire app.

**Fix:** Accept the currency symbol as a parameter or read from the store.

---

### H10 — AI Insights tab renders raw JSON in production
**File:** `src/renderer/src/pages/AnalyticsPage.tsx` line 203

```tsx
<pre className="whitespace-pre-wrap font-sans">{JSON.stringify(item, null, 2)}</pre>
```

Placeholder dev UI is exposed in production. A manager tapping "AI Insights" sees raw JSON objects.

**Fix:** Render structured fields from the AI response, or hide the tab until the feature is complete.

---

## 🟡 Medium

### M1 — Sidebar nav buttons cramped for touchscreen (48×48px, 3-char labels)
**File:** `src/renderer/src/components/layout/Sidebar.tsx`

`w-12 h-12` = 48×48px with labels truncated to 3 characters ("Aud", "Ana", "Inv"). With only `gap-2` (8px) between buttons, fat-finger misses are frequent. `title` tooltips are invisible on touch.

**Fix:** Increase to at least `h-14 w-14` (56px), show full labels below icons, and replace `title` with a press-and-hold tooltip or visible label.

---

### M2 — Manual quantity input silently clamps to max stock with no feedback
**File:** `src/renderer/src/components/pos/CartItem.tsx`

A cashier typing `999` for a product with 5 in stock sees the value silently snap back to 5 with no explanation.

**Fix:** Show a brief "Max: X in stock" message when the entered value exceeds stock.

---

### M3 — Cart item key uses array index
**File:** `src/renderer/src/components/pos/ShoppingCart.tsx` line 47

```tsx
key={`${item.product.id}-${index}`}
```

When an item is removed, all subsequent items are fully remounted. Use `item.product.id` alone as the key.

---

### M4 — VAT rate has no bounds validation
**File:** `src/renderer/src/pages/SettingsPage.tsx`

A cashier can accidentally type `-5` or `150` into the VAT rate field. `parseFloat` in `posStore.ts` would then compute negative or impossibly high tax, corrupting every total in the session.

**Fix:** Clamp to 0–100 on change, or show a validation error on save.

---

### M5 — Currency symbol has no validation
**File:** `src/renderer/src/pages/SettingsPage.tsx`

An empty symbol causes amounts to render as bare numbers. A long string breaks receipt formatting.

**Fix:** Prevent saving an empty symbol, trim whitespace, and cap at ~5 characters.

---

### M6 — Default admin creation can recurse infinitely on DB error
**File:** `src/renderer/src/pages/LoginPage.tsx`

If `createDefaultAdmin()` fails silently, `loadUsers()` is called again (without `await`), finds 0 users, calls `createDefaultAdmin` again — unbounded recursion with no error state.

**Fix:** `await loadUsers()` and add a retry limit or error state.

---

### M7 — StartShiftModal clock never ticks
**File:** `src/renderer/src/components/pos/StartShiftModal.tsx`

`now` is computed once at render time. If the screen is idle, the displayed time is stale.

**Fix:** Use a `useEffect` with a 1-minute interval to update the time state.

---

### M8 — EndShiftModal does not reset closing cash / notes on re-open
**File:** `src/renderer/src/components/pos/EndShiftModal.tsx`

`closingCash` and `notes` are never reset when the dialog reopens. Previous values persist between opens.

**Fix:** Add a `useEffect` that resets fields when `open` becomes `true`.

---

### M9 — AuditLog: only action filter, no date range or user filter
**File:** `src/renderer/src/pages/AuditLogPage.tsx`

With dozens of sales per day, the action-only filter is insufficient for compliance review.

**Fix:** Add date range picker and user selector filters.

---

### M10 — Receipt dialog auto-prints on every re-open
**File:** `src/renderer/src/components/pos/ReceiptPreview.tsx`

`loadReceipt` triggers auto-print whenever `open` changes to `true`. Re-opening the receipt dialog queues a second print job, wasting thermal paper.

**Fix:** Only auto-print once per `saleId` using a `useRef` flag.

---

### M11 — Customer purchase history shows "Loading..." permanently on API failure
**File:** `src/renderer/src/pages/CustomersPage.tsx`

`history` is initialised as `null` and stays `null` if the API call fails. The UI shows "Loading..." indefinitely with no error state.

**Fix:** Set `history` to `[]` after a failed load, or add an explicit error state.

---

### M12 — Product delete does not reload stock batches
**File:** `src/renderer/src/pages/InventoryPage.tsx`

After deleting a product, `loadProducts()` is called but `stockBatches` is not refreshed. Orphaned batches remain visible in the Stock Batches tab until the user manually triggers a reload.

---

### M13 — Sale-level discount has no UI entry point
**File:** `src/renderer/src/components/pos/ShoppingCart.tsx`

`applySaleDiscount` exists in the store and `CartTotals` displays a discount amount when non-zero, but there is no UI in `ShoppingCart` to apply a cart-level discount. The feature is incomplete.

---

## ⚪ Low

| # | File | Issue |
|---|------|-------|
| L1 | `POSPage.tsx` | F8 shortcut clears cart without the confirmation dialog shown on the button |
| L2 | `QuickItems.tsx` | Stock indicator stale mid-sale (shows "1" after last unit is added to cart) |
| L3 | `SearchModal.tsx` | Disabled 0-stock results clutter search — no "in-stock only" toggle |
| L4 | `AnalyticsPage.tsx` | Dashboard data stale after sales — no auto-refresh, manual Refresh button only |
| L5 | `Header.tsx` | "End Shift" label hidden below `sm:` breakpoint — icon-only on small screens |
| L6 | `InventoryPage.tsx` | "0 products imported successfully" is confusing when nothing imported |
| L7 | `ReceiptPreview.tsx` | Receipt width constant `W = 42` duplicated from formatter — single source of truth needed |
| L8 | `EndShiftModal.tsx` | Shows "Cash Sales" only, no combined Total Sales (cash + card) visible to manager |
| L9 | `Sidebar.tsx` | `title` tooltip invisible on touch — cashiers cannot identify icon-only nav items |
| L10 | `ShoppingCart.tsx` | No "Total Sales" on shift summary — manager cannot see combined revenue at a glance |

---

## Fixed (2026-03-11, session 2)

| Issue | Fix |
|-------|-----|
| Search bar unresponsive to touch on touchscreen | Added `style={{ touchAction: 'manipulation' }}` + `onClick` focus fallback to `ProductEntry` and `SearchModal` inputs; changed suggestion `onMouseDown` → `onPointerDown` |
| Cart quantity input clips to one digit | Widened from `w-12` (48px) to `w-16` (64px) in `CartItem.tsx` |

---

## Fixed (2026-03-11, session 1)

The following issues were identified and resolved during the 2026-03-11 dev session:

| Issue | Fix |
|-------|-----|
| Quick items showing stale stock after sale | Added `refreshTrigger` prop; reloads after each `handlePaymentComplete` |
| Checkout dialog retained previous error on reopen | Added `useEffect(() => { if (open) setError('') }, [open])` |
| No inline search suggestions in barcode input | Added debounced dropdown with `onPointerDown`-safe selection |
| Cart items could not scroll past 3 items | Added `min-h-0` to `ShoppingCart` outer div and items container |
| Cart items had box borders with large spacing | Redesigned to flat `border-b` separator style, compact padding |
