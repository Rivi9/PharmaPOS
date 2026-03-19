# PharmaPOS QA Report

**Date:** 2026-03-11 (updated with touchscreen pass)
**Reviewed by:** Code review (source-level analysis)
**Environment:** Windows 10 POS touchscreen + customer pole display

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 4 |
| 🟠 High | 10 |
| 🟡 Medium | 13 |
| ⚪ Low | 12 |
| 📱 Touch-specific | 12 (5 High, 7 Medium) |
| **Total** | **49** |

---

## 🔴 Critical

<!-- ### C1 — Expired products can be added to cart without blocking the transaction
**File:** `src/renderer/src/components/pos/ProductEntry.tsx`

The expiry check only sets an `expiryWarning` string — it never blocks the item from being added. `addItem` is called unconditionally even when `days <= 0`. A cashier scanning an expired product sees a yellow warning text but the item still enters the cart and the sale completes. A pharmacy legally cannot dispense expired medicines.

`handleSuggestionSelect` checks for `total_stock === 0` and returns early, but there is no equivalent early return for expired products.

**Fix:** Add a hard block (return early, set an error, do not call `addItem`) when `days <= 0`, matching the out-of-stock guard already present. -->

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

<!-- ### H8 — Mixed payment card field gives no live mismatch feedback
**File:** `src/renderer/src/components/pos/PaymentModal.tsx`

Manually editing the card amount field does not recalculate cash. The cashier can enter Rs. 500 cash + Rs. 500 card on a Rs. 800 total, see no immediate error, and only get blocked on submit with no indication of which value to fix.

**Fix:** Add live mismatch feedback showing remaining balance as the card amount is changed. -->

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
| L11 | `ReceiptPreview.tsx` | Receipt auto-prints on every dialog open — wastes paper when cashier reopens to check |
| L12 | `StockBatchFormDialog.tsx` | Product dropdown in Receive Stock has no search — unusable with large product catalogue |

---

## 📱 Touchscreen-Specific Issues

Second-pass review focused exclusively on touch interaction quality. These are distinct from the general bugs above.

### T1 — Sidebar nav buttons have no active/press state — zero tap feedback
**File:** `src/renderer/src/components/layout/Sidebar.tsx` line 57–61

```tsx
'hover:bg-accent text-muted-foreground hover:text-foreground'
```

`hover:` CSS never fires on capacitive touchscreens — the browser skips it entirely. The inactive nav buttons have **no visual feedback when tapped**: no colour change, no press animation, nothing. On a fast POS workflow a cashier cannot tell if their tap registered.

**Fix:** Add `active:bg-accent active:text-foreground` to the button className. This fires on both touch and mouse press.

---

### T2 — Header Settings and End Shift buttons below 44px touch minimum
**File:** `src/renderer/src/components/layout/Header.tsx` lines 48, 53–62

- Settings: `size="icon"` = 36×36px in shadcn — below 44px minimum
- End Shift: `size="sm"` = 36px height — below 44px minimum, and it's a **critical action** (logs out the cashier)

A cashier rushing at end-of-shift can easily miss the 36px target, especially at arm's reach from a pole display.

**Fix:** Settings → `size="icon"` with `className="h-11 w-11"`; End Shift → `size="default"` with `className="h-11"`.

---

### T3 — LoginPage "Back" and "Use PIN/Password" buttons are 36px
**File:** `src/renderer/src/pages/LoginPage.tsx` lines 157, 160

```tsx
<Button variant="ghost" size="sm" onClick={...}>Back</Button>
<Button variant="ghost" size="sm" onClick={...}>Use Password</Button>
```

`size="sm"` = `h-9` (36px). These are the two most frequently tapped navigation controls on the login screen. Users select the wrong user, then can't reliably tap Back. First interaction with the app fails on touch.

**Fix:** Change to `size="default"` (`h-10`) minimum, or `className="h-12"` to match other login buttons.

---

### T4 — LoginPage password Input has no height — defaults to ~36px
**File:** `src/renderer/src/pages/LoginPage.tsx` line 141

```tsx
<Input type="password" placeholder="Enter password" ... />
```

No `className` is provided, so the input renders at the browser/shadcn default (~36px). Every other input across the app explicitly sets `h-12`. This inconsistency makes the password field noticeably smaller and harder to tap on touch.

**Fix:** Add `className="h-12 text-base"` to match the rest of the app.

---

### T5 — PinPad keydown listener re-registers on every digit typed — race condition on fast input
**File:** `src/renderer/src/components/auth/PinPad.tsx` line 61

```tsx
useEffect(() => {
  window.addEventListener('keydown', handleKeyDown)
  return () => window.removeEventListener('keydown', handleKeyDown)
}, [pin, maxLength, onSubmit])   // ← changes on every digit
```

The listener is torn down and re-attached on every `pin` state change. On a physical keyboard or a rapid-tap touchscreen, a digit pressed during the 1-frame gap between removal and re-add is silently dropped. This causes intermittent missed digits — a PIN of `1234` typed quickly might register as `134`.

**Fix:** Move `handleNumber`, `handleDelete`, `handleSubmit` inside the effect using refs (the same pattern used correctly in `CashNumpad`), then use `[]` as the dependency array.

---

### T6 — EndShiftModal Notes input is 40px — below minimum touch target
**File:** `src/renderer/src/components/pos/EndShiftModal.tsx` line 192

```tsx
<Input placeholder="Any notes for this shift…" className="h-10" />
```

`h-10` = 40px, the only input in the entire app shorter than 44px. On a touch device a pharmacist typing shift notes frequently misses this field and activates the scrollable dialog content behind it instead.

**Fix:** Change to `className="h-12"`.

---

### T7 — CashNumpad and PinPad buttons lack `touch-action: manipulation` and `select-none`
**Files:** `src/renderer/src/components/ui/cash-numpad.tsx`, `src/renderer/src/components/auth/PinPad.tsx`

Both numpad grids allow double-tap-to-zoom (browser default) and text selection on long press. On a POS touchscreen this means:
- Rapid cash entry (e.g. `5`, `0`, `0`) triggers the double-tap zoom on the `0` button, zooming the entire dialog.
- Long-pressing a numpad key shows a text selection popup, blocking the interface.

**Fix:** Add `style={{ touchAction: 'manipulation' }}` to each `<Button>` in both components, and wrap the grid `<div>` with `className="select-none"`.

---

### T8 — No `inputMode` on phone and amount inputs — wrong soft keyboard shown
**Files:** `src/renderer/src/components/pos/PaymentModal.tsx`, `src/renderer/src/components/pos/EndShiftModal.tsx`

On touch devices, tapping an `<input type="text">` opens the full QWERTY keyboard. For numeric-only fields (phone number, cash amounts not using the numpad) this forces cashiers to find the number row or switch keyboard layout.

| Field | Current type | Should be |
|-------|-------------|-----------|
| Customer phone | `text` | `inputMode="tel"` |
| Cash received | `number` | already correct, but lacks `inputMode="decimal"` for iOS |
| Card amount | `number` | `inputMode="decimal"` |
| Notes / names | `text` | `inputMode="text"` (fine, already default) |

**Fix:** Add `inputMode="tel"` to the phone input, `inputMode="decimal"` to cash/card number inputs.

---

### T9 — AlertDialog confirmation buttons are ~40px — too small for destructive touch actions
**File:** `src/renderer/src/components/pos/CartActions.tsx` lines 95–101

```tsx
<AlertDialogCancel>Cancel</AlertDialogCancel>
<AlertDialogAction onClick={handleClearConfirm} ...>Clear Cart</AlertDialogAction>
```

Shadcn's `AlertDialogAction` and `AlertDialogCancel` default to `h-10` (40px). "Clear Cart" is a destructive, irreversible action — if the button is too small, a cashier might accidentally confirm instead of cancel (or vice versa) by tapping the wrong area.

**Fix:** Add `className="h-14 text-base"` to both buttons in the cart clear dialog.

---

### T10 — `hover:` states throughout the app provide zero feedback on touch
**Scope:** App-wide (`Sidebar.tsx`, `SearchModal.tsx`, `InventoryPage.tsx`, tables, etc.)

Patterns like `hover:bg-muted/50`, `hover:bg-accent`, `hover:text-foreground` are used on nearly every interactive element. On touch these states never activate, leaving rows, buttons, and list items with no visual press response. The user cannot tell if their tap landed on the intended target.

**Fix:** Pair each `hover:` with a matching `active:` class:
- `hover:bg-muted/50` → add `active:bg-muted/50`
- `hover:bg-accent` → add `active:bg-accent`
- Interactive table rows in `InventoryPage`, `CustomersPage`, `AuditLogPage` — add `active:bg-muted/60`

---

### T11 — `main` wrapper `overflow-auto` causes scroll conflict with inner scroll areas on touch
**File:** `src/renderer/src/components/layout/MainLayout.tsx` line 47

```tsx
<main className="flex-1 overflow-auto">{renderPage()}</main>
```

On touch, when a user swipes inside `ShoppingCart`'s `overflow-auto` items list, the browser must decide which scroll container to move. Because `main` also has `overflow-auto`, the outer container intercepts swipes that start outside the inner scroll region, scrolling the whole page instead of the cart list. This is most noticeable when there are many cart items.

**Fix:** Change `main` to `overflow-hidden` for pages that manage their own internal scrolling (POS, most pages). Pages that need full-page scroll (InventoryPage, SettingsPage) can opt in with their own `overflow-auto` wrapper.

---

### T12 — Suggestion dropdown in ProductEntry has no max-height — overflows below screen on small displays
**File:** `src/renderer/src/components/pos/ProductEntry.tsx` line 119

```tsx
<div className="absolute left-0 right-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg overflow-hidden">
```

No `max-h-*` is set. With 6 suggestions and each row ~48px, the dropdown is ~288px tall. If `ProductEntry` is near the bottom of its container on a 768px-tall screen, the list overflows below the visible area with no scroll — the bottom suggestions are unreachable without scrolling the page, which closes the dropdown via `onBlur`.

**Fix:** Add `max-h-72 overflow-y-auto` to the dropdown container.

---

## Summary Table — Touch Issues

| ID | File | Severity | Issue |
|----|------|----------|-------|
| T1 | `Sidebar.tsx` | High | No `active:` press state — zero tap feedback on nav buttons |
| T2 | `Header.tsx` | High | Settings (36px) and End Shift (36px) below 44px touch minimum |
| T3 | `LoginPage.tsx` | High | Back / Use-PIN buttons are `h-9` (36px) — first-screen touch failure |
| T4 | `LoginPage.tsx` | Medium | Password input has no height — renders at ~36px |
| T5 | `PinPad.tsx` | High | Keydown listener re-registers on every digit — drops keys on fast input |
| T6 | `EndShiftModal.tsx` | Medium | Notes input `h-10` (40px) — below 44px minimum |
| T7 | `cash-numpad.tsx`, `PinPad.tsx` | High | No `touch-action: manipulation` — double-tap zoom on numpad '0' |
| T8 | `PaymentModal.tsx` | Medium | No `inputMode` on phone/amount fields — wrong soft keyboard |
| T9 | `CartActions.tsx` | Medium | Alert dialog buttons `h-10` (40px) for destructive "Clear Cart" action |
| T10 | App-wide | Medium | `hover:` states unused on touch — no visual tap feedback anywhere |
| T11 | `MainLayout.tsx` | High | `overflow-auto` on `main` conflicts with inner scroll areas |
| T12 | `ProductEntry.tsx` | Medium | Dropdown has no `max-h` — bottom suggestions unreachable on small screen |

---

## Fixed (2026-03-19, session 4)

| Issue | Fix |
|-------|-----|
| C2 — Cart cleared even on failed sale | `PaymentModal.tsx`: guard on `result?.sale_id` before clearing cart / calling `onComplete` |
| C3 — Today's Sales always shows `Rs. 0.00` | `POSPage.tsx`: subscribe to `useShiftStore.todaySalesTotal` + `useSettingsStore.currency_symbol`; use `formatCurrency` |
| C4 — Default admin credentials hardcoded | `LoginPage.tsx`: generate random PIN + password via `crypto.getRandomValues`; show first-run credentials banner |
| H4 — Recall silently discards active cart | `CartActions.tsx`: prompt confirmation dialog when `hasItems && hasHeldSale` before calling `onRecall` |
| H5 — Customer save silently fails | `CustomersPage.tsx`: check `result.success === false`, surface `result.error` in `formError` |
| H6 — Product/supplier delete swallows errors | `InventoryPage.tsx`: `else { alert(result.error) }` branch added to both delete handlers |
| H7 — No stock recheck before payment commit | `PaymentModal.tsx`: sequential `for…of` loop re-checks live stock before `createSale`; aborts with named items if insufficient |
| H9 — `formatCurrency` ignores configured currency | `calculations.ts`: added optional `symbol` param (default `'Rs.'`); all 7 callers updated to pass `currencySymbol` from `settingsStore` |
| H10 — InsightSection renders raw JSON | `AnalyticsPage.tsx`: replaced `JSON.stringify` with labelled field layout (`product_name`, `current_stock`, `order qty`, `priority`, `confidence`, `reason`) |

---

## Fixed (2026-03-19, session 3)

| Issue | Fix |
|-------|-----|
| Receipt auto-prints on every dialog open (L11) | Removed auto-print block from `loadReceipt()`; print only fires from the explicit Print button (`handlePrint`) |
| Restock modal product select has no search (L12) | Replaced shadcn `<Select>` with a typed searchable combobox — client-side filter, absolute dropdown, `onPointerDown` selection |

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
