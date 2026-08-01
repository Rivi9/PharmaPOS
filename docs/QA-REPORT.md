# PharmaPOS QA Report

**Date:** 2026-08-02
**Version reviewed:** 1.0.11 (commit `03bc4b1`)
**Method:** Full source-level review of all ~17,900 lines across `src/main`, `src/preload`, `src/renderer` and `src/shared`, plus the migration SQL, `forge.config.ts`, CI workflow, dependency tree and the E2E suite. Findings were then **re-verified against the live database** (`%APPDATA%/pharma-pos/pharmapos.db`, inspected read-only on a copy).
**Environment:** Windows 10 POS machine, capacitive touchscreen, USB barcode scanner, 80mm thermal printer + cash drawer, serial VFD pole display. Sri Lankan pharmacy — LKR, VAT, tax-reporting obligations.

> This report **supersedes `QA-REPORT.md.old`**, which is retained only as history. Nothing in it was carried forward; every finding below was re-derived from the current code.

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 15 |
| 🟠 High | 25 |
| 🟡 Medium | 22 |
| ⚪ Low | 11 |
| **Total** | **73** |

Plus **5 operator requirements** raised from the shop floor — see [Operator requirements](#-operator-requirements).

**Confirmed against live data.** Four Critical findings were reproduced numerically from the operator's own database, including both figures reported from the running app:

| Observed in the app | Actual data | Verdict |
|---|---|---|
| Analytics: Total Sales `Rs. 4799.50`, Profit `Rs. 4799.50` (100.0% margin), Items Sold `46` | True revenue `Rs. 2399.75`, true items `23`, true cost `Rs. 0` | Every figure doubled by a join defect (C1); margin fictitious (C5) |
| End Shift: Cash Sales `Rs. 5500.00`, Expected in drawer `Rs. 5500.00`, Total Sales `Rs. 2831.70` | Cash actually retained `Rs. 2831.70`; change given `Rs. 2668.30` | Drawer overstated by exactly `Rs. 2668.30` (C2) |
| Receipt `R-2026-000001` total | Stored as `2701.905` — three decimal places | Unpayable amount persisted (C4) |
| VAT on both sales | Header tax `19.80` / `412.155`; line-item tax `0` / `0` | Two contradictory VAT models (C3) |
| Backup: `ENOENT … stat 'pharma-pos\database.db'`, list shows `Invalid Date • 0.00 MB` | Real DB is `pharmapos.db` | Backup **and restore** both target the wrong filename (C15) |

### The short version

The transactional core is sound — `createSale` is genuinely atomic, stock cannot go negative, foreign keys are enforced. **What is broken is nearly everything that reports or reconciles money**, plus authorisation, which is effectively decorative. In its current state the app will mis-state revenue, profit, VAT and drawer cash on every single day of trading, and a cashier can grant themselves admin from the DevTools console.

---

## 🔴 Critical

### C1 — Every analytics KPI is multiplied by the number of transactions that day
**File:** `src/main/services/analytics/queries.ts:30-31` (and identically `:60-61`)
**Reported from the running app.**

`getDailyMetrics` joins a per-product table to a per-sale table with no aggregation boundary, producing a cartesian product. With *N* product rows and *M* completed sales for the date, every `SUM(psd.…)` is summed *M* times over:

```sql
FROM product_sales_daily psd
LEFT JOIN sales s ON date(s.created_at) = psd.date AND s.status = 'completed'
WHERE psd.date = ?
```

`COUNT(DISTINCT s.id)` is correct (the `DISTINCT` saves it), so `transaction_count` is right while **`total_sales`, `total_profit`, `total_cost` and `items_sold` are all inflated by exactly that count.** Reproduced from live data — true revenue `2399.75`, 2 completed sales, so the dashboard displays `4799.50`; true quantity 23 displays as 46. `avg_transaction` divides the inflated revenue by the honest count, so it coincidentally lands on the *correct* revenue figure — which is why `Rs. 2399.75` appears as "Avg Transaction" while the real day's revenue is hidden.

At 50 sales/day this over-reports revenue **fiftyfold**. `getPeriodMetrics` has the identical defect and feeds the trend chart, so history is wrong too.

**Fix:** Never join the two fact tables. Aggregate `product_sales_daily` alone, and obtain `transaction_count` from an independent scalar subquery:
```sql
SELECT ?, COALESCE(SUM(revenue),0), COALESCE(SUM(profit),0), COALESCE(SUM(cost),0),
       (SELECT COUNT(*) FROM sales WHERE date(created_at)=? AND status='completed'),
       COALESCE(SUM(quantity_sold),0)
FROM product_sales_daily WHERE date = ?
```
`getTopProducts` and `getCategoryBreakdown` were checked and are **not** affected — they join `products` by primary key.

---

### C2 — Expected drawer cash adds the cash tendered and never subtracts the change given
**File:** `src/main/services/sales.ts:269-276`
**Reported from the running app.**

`cash_received` stores what the customer *handed over*; `change_given` stores what went back. Expected cash must net the two. It does not:

```sql
SELECT COALESCE(SUM(cash_received), 0) as total FROM sales WHERE shift_id = ? AND status = 'completed'
```

Verified on live data for the operator's only shift: the formula yields **5500.00**, the cash actually retained is **2831.70**, overstatement **2668.30** — matching the End Shift screen exactly. Every cash sale inflates the expectation by its change, so the cashier is accused of being short by the entire day's change, and that shortfall is written into the audit log as fact. The same number is mislabelled as the "Cash Sales" tile, where it reads *higher than total sales* — the visible tell that something is wrong.

**Fix:** `SUM(cash_received - COALESCE(change_given, 0))`. Single point of change: both the End Shift display and the `SHIFT_ENDED` audit record call this one function. Rename the tile to "Cash Tendered" or compute retained cash for it.

---

### C3 — Two contradictory VAT models; the default install adds 18% to prices the schema calls tax-inclusive
**File:** `src/renderer/src/stores/posStore.ts:157-162` vs `src/main/services/sales.ts:193-201`

The renderer takes the single global `settings.vat_rate` and **adds** it on top (`total = subtotal − discount + tax`). The main process independently computes each `sale_items.tax_amount` from the **per-product** `tax_rate` / `is_tax_inclusive`. The seeded defaults make these irreconcilable: `vat_rate = '18'`, while `products.tax_rate` defaults to `0` and `is_tax_inclusive` defaults to `1`.

Verified on live data — both sales carry a header tax (`19.80`, `412.155`) against line-item tax of **`0`**. So:
- A product entered at its printed MRP of Rs. 115 is charged to the customer at Rs. 135.70.
- **Any VAT return built from line items reports zero VAT on VAT-charged sales.**
- If an operator later sets a product's `tax_rate` to 18 while `is_tax_inclusive` stays 1, VAT is charged twice — once inside the price, once by the renderer.
- A mixed basket of exempt and standard-rate goods is taxed uniformly, because the cart ignores per-product rates entirely.

**Fix:** Choose one model — for Sri Lankan tax-inclusive shelf pricing, extract per line (`line_total − line_total/(1+rate/100)`) using the product's own rate, and make `total = subtotal − discount` with no add-on. Have the renderer call the *same shared function* the main process uses so cart, receipt and DB cannot diverge, and snapshot the effective rate onto the sale row. Do not ship an 18% default that silently marks up every price on first run.

---

### C4 — No rounding anywhere in the money math; sub-cent amounts are charged and stored
**File:** `src/renderer/src/lib/calculations.ts:3-37`

Nothing in `calculateLineTotal → calculateSubtotal → calculateTax → calculateTotal → calculateChange` rounds. Rounding exists **only** in `formatCurrency`'s `toFixed(2)`, i.e. for display. Verified in live data: sale `R-2026-000001` is stored with `total = 2701.905`, `tax_amount = 412.155`, `change_given = 2298.095` — an amount that cannot be tendered in cents, let alone in rupees.

Two consequences:
1. **Exact cash is rejected.** `Exact` sends `total.toFixed(2)`, then `validatePayment` compares it against the *unrounded* float. Where the float exceeds its own 2dp display, `cashReceivedNum < total` is true and the sale is blocked with the self-contradicting `Insufficient cash. Need Rs. 0.00 more.` Both reviewers measured this independently at roughly 37–49% of realistic price/quantity combinations at 18% VAT.
2. Stored totals disagree with printed receipts, and `SUM(total)` disagrees with both.

**Fix:** Add `const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100` and apply it in all five functions — ideally compute in integer cents throughout. Independently, make the tender comparison tolerant: `if (cashReceivedNum < total - 0.005)`.

---

### C5 — Profit and margin are fiction: no cost basis is ever captured
**File:** `src/main/services/sales.ts:190`, `src/main/db/schema.ts:53`
**Reported from the running app.**

`cost = (product?.costPrice ?? 0) × quantity`, so `profit = line_total − 0 = line_total`. Verified on live data: **all 257 products and all 257 stock batches have `cost_price = 0`**, and all 4 recorded line items have `cost_price = 0`. Hence the dashboard's `Profit Rs. 4799.50 / 100.0% margin` — profit is just revenue restated, and it is *also* doubled by C1.

Two distinct defects compound here:
- Nothing requires or defaults a real cost. `cost_price` is `NOT NULL DEFAULT 0` with no validation at any layer, and the Excel importer accepts a sheet with no cost column.
- Cost is read from `products.cost_price` even though the pharmacy enters cost **per batch** when receiving stock (`stock_batches.cost_price`). Batch cost is captured and then never used, so even a diligent operator gets 100% margin.

**Fix:** Take the cost from the batch actually dispensed (`deductStockFEFO` already returns them — see H4), fall back to `products.cost_price`, and refuse to compute a margin at all when cost is 0: show "—" or "cost not set" rather than "100.0%". Require `cost_price > 0` on product create/import, and add a one-off report listing products with no cost so the existing 257 can be corrected.

---

### C6 — Every card sale blanks the entire application
**File:** `src/renderer/src/components/pos/ReceiptPreview.tsx:25,165,168`

The interface declares `card_amount`, but the column is `card_received` (`schema.ts:134`) and `getReceipt` does `SELECT s.*`. So `receipt.sale.card_amount` is `undefined` and `undefined.toFixed(2)` throws — inside **`formatReceiptText()`, which is called during render** (`:219`), not in an event handler. There is **no `ErrorBoundary` anywhere in the codebase** (verified: zero matches for `ErrorBoundary|componentDidCatch`), so React unmounts the entire root. The POS goes blank immediately after every card sale and needs a restart. The sale itself commits, so money and stock are safe — but the till stops selling.

**Fix:** Rename to `card_received` in the interface and both usages, guard with `if (!receipt?.sale) return ''`, and add an error boundary around the POS route so no formatting bug can ever take the till down again.

**Also required by the operator:** ship a `card_payment_enabled` setting (default on) that hides the Card button in `PaymentModal` and forces `payment_method = 'cash'`. A pharmacy with no card terminal should not be able to reach this path at all, and turning it off is the immediate mitigation while the crash is being fixed. Note the Mixed button is already commented out (`PaymentModal.tsx:252-259`), so the toggle governs Cash-only vs Cash+Card. Validate it server-side too — `createSale` should reject a card payment when the setting is off, rather than trusting the renderer.

---

### C7 — The printed grand total is silently truncated on any sale ≥ Rs. 10,000
**File:** `src/main/services/printer/receipt-formatter.ts:170`

The TOTAL row prints at double character size, so the column budget is halved to `floor(42/2) = 21`, giving the amount column `floor(0.5 × 21) = 10` characters. `"Rs." + total.toFixed(2)` is 11 characters at Rs. 10,000 — and `tableRow` **truncates rather than overflows** (`:41`). Verified by executing the real formatter:

```
real Rs. 10000.00  prints  "TOTAL:    Rs.10000.0"
real Rs. 12345.67  prints  "TOTAL:    Rs.12345.6"
real Rs. 125000.50 prints  "TOTAL:    Rs.125000."
```

The customer's only legal record of what they were charged shows a different, smaller number. The on-screen preview uses a 12-character field and shows it correctly, so the cashier cannot see the discrepancy.

**Fix:** Emit the label and the amount as separate double-width segments and never truncate the amount — truncate only the label. Add a regression test asserting a Rs. 1,000,000 total round-trips intact.

---

### C8 — Holding or double-tapping Enter commits the sale twice
**File:** `src/renderer/src/components/pos/PaymentModal.tsx:131`, `src/renderer/src/components/ui/cash-numpad.tsx:67`

`CashNumpad` binds a **global** `keydown` listener that maps Enter straight to `onSubmit` → `handleComplete`. `handleComplete` has **no reentrancy guard** — `setProcessing(true)` disables the *button*, which the keyboard path bypasses. The first call then awaits one IPC round-trip per cart line (`:145-151`), a window of tens to hundreds of milliseconds. OS key-repeat or a second tap re-enters; both pass the stock recheck and both call `createSale`.

Result: two sale rows, two receipt numbers, stock deducted twice, `product_sales_daily` inflated twice, drawer expectation double-counted. `EndShiftModal.handleEndShift` shares the defect (and can close a shift twice, see H20).

**Fix:** An in-flight ref latch as the first statement of `handleComplete`, released in `finally`. Ignore auto-repeat (`if (e.repeat) return`). Best of all, stop binding an irreversible action to a bare Enter.

---

### C9 — Scanning a barcode with the payment dialog open commits the sale with the barcode as cash received
**File:** `src/renderer/src/components/ui/cash-numpad.tsx:61-83`

The barcode scanner is a keyboard. `CashNumpad`'s global listener swallows every digit whenever focus is **not** in a text input — and Radix autofocuses the dialog's first focusable node, which is a `<Button>`, not the cash field. So the very common reflex of scanning one more item while the payment dialog is up types e.g. `8901234567890` into Cash Received, and the scanner's trailing CR fires `handleComplete`. Validation passes (`cash >= total`), and the sale commits instantly and unconfirmed with `cash_received = 8901234567890`.

That single value destroys the shift's drawer reconciliation (C2 sums it) and prints an absurd change amount. The same shape applies to `StartShiftModal` (opens a shift with a multi-billion float) and to `PinPad`, which has **no input guard at all**, so scanner digits become PIN attempts.

**Fix:** Scope the listener to the dialog rather than `window`. Add scanner detection — ignore keys arriving <30ms apart (scanners emit at 1–5ms; humans cannot). Reject a tender wildly above the total without explicit confirmation. Remove the bare-Enter submit.

---

### C10 — Expired medicine is sellable, and FEFO deliberately dispenses the expired batch first
**File:** `src/main/services/sales.ts:76-88`, `src/renderer/src/components/pos/ProductEntry.tsx:137-147`

The batch query filters only `quantity > 0` and orders `expiry_date ASC`, so an expired batch is **preferentially** depleted. Nothing blocks the sale at any layer: `ProductEntry` sets an advisory orange banner and then calls `addItem` regardless; `QuickItems.handleQuickAdd` has no expiry check at all; `checkStockAvailability` has no expiry predicate. For a pharmacy this is a regulatory failure, not a UX nit.

*Latent in the current dataset* — the live DB has 0 expired batches holding stock today — but the code path is fully open and will fire the first time stock ages on the shelf.

**Fix:** Add `AND (expiry_date IS NULL OR expiry_date >= date('now','localtime'))` to `deductStockFEFO` and `checkStockAvailability` so expired stock can never be dispensed even if the UI is bypassed. Exclude expired quantity from sellable `total_stock`, hard-block `addItem` on `days <= 0` in all four entry paths, and surface expired stock as a quarantine queue in Inventory rather than a warning at the till. If an override is ever needed, gate it behind a manager PIN and audit it.

---

### C11 — Authorisation trusts a user id supplied by the renderer, and three channels have no check at all
**File:** `src/main/ipc/middleware.ts:4`, `src/main/ipc/handlers.ts:54,128,159`, `src/main/ipc/setup-handlers.ts:10`

There is **no session state in the main process**. Every gated handler authorises against a `userId` that arrives in the IPC payload:

```ts
export async function withPermission<T>(userId: string, permission: Permission, handler: …) {
  const user = getUserById(userId)          // ← from the renderer
```

And `AUTH_GET_USERS` is ungated, returning every active user's `id` **and** `role` before anyone logs in — so the admin's id is simply handed out. Combined, any renderer code can act as admin against every `withPermission` channel (users, inventory, analytics, audit, backup, void, refund), and the audit rows that do get written name the admin as the actor.

Three channels are worse — **no permission check whatsoever**:
- `AUTH_CREATE_USER` (`handlers.ts:128`) — takes no `userId`, accepts any string as `role`, writes no audit row. One console call mints an admin.
- `SETUP_INITIALIZE` (`setup-handlers.ts:10`) — re-runnable at any time; inserts another admin and overwrites business name, address, phone and currency mid-shift.
- `SETTINGS_SET` (`handlers.ts:159`) — no permission, no key whitelist, no validation. `setSetting('vat_rate','0')` changes the tax on every subsequent sale immediately, because the live cart reads it.

**Fix:** Hold the authenticated user in main, keyed by `event.sender.id`, set only by `AUTH_LOGIN` and cleared on logout. Change the signature to `withPermission(event, permission, handler)` and ignore any renderer-supplied id. Delete `AUTH_CREATE_USER`; make `initializeDatabase` throw unless the users table is empty; gate `SETTINGS_SET` on `settings:update` with a key whitelist and numeric validation for `vat_rate`.

---

### C12 — The bcrypt hash of every 4-digit PIN is shipped to the renderer
**File:** `src/main/ipc/handlers.ts:84,106`, `src/main/ipc/user-handlers.ts:31`

Login deliberately strips one secret and leaves the other:

```ts
const { password_hash, ...safeUser } = user   // pin_code survives
```

and `mapUser` returns `pin_code: u.pinCode` for **every** user in `USER_LIST`. A 4-digit PIN is 10,000 candidates; bcrypt at cost 10 makes that an offline dictionary attack of minutes on a laptop. Combined with C11 (any role can call `USER_LIST`), any cashier can silently recover the admin PIN with no failed-login trace anywhere.

**Fix:** Never send hash material over IPC. Return `pin_set: !!u.pinCode` and destructure both secrets out of the login result: `const { password_hash, pin_code, ...safeUser } = user`.

---

### C13 — Refund-with-restock always throws and rolls back, after the cash has been handed over
**File:** `src/main/services/sales.ts:392-394`

```ts
rawDb.prepare(`UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?`)
```

There is **no `stock_quantity` column** — verified absent from both `schema.ts` and the migration; stock lives only in `stock_batches`, and `total_stock` is a `SUM()` alias. So the statement raises `no such column` inside `rawDb.transaction(...)`, discarding the whole refund: no `sale_refunds` row, no stock returned, while the customer has already been paid at the counter. Not reachable from the current UI, but the handler is registered and the preload exposes it, so it fails the moment refunds are wired up.

**Fix:** Delete those three lines — the preceding `stock_batches` increment is correct and sufficient. Restock into the **originating** `sale_items.batch_id` so expiry tracking stays truthful, and write an `inventory_adjustments` row per item.

---

### C14 — No migration versioning: the next schema change will break every deployed machine
**File:** `src/main/db/index.ts:16`

```ts
const schemaExists = sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='audit_log'`).get()
if (!schemaExists) { sqlite.exec(migrationSql) }
```

Two failures. First, there is no `user_version` or `__drizzle_migrations` check, so `0001_*.sql` will **never** be applied to an existing install — given this app auto-updates via Squirrel, the next migration ships an update that crashes with `no such column` on the pharmacy's live database. Second, `audit_log` is the *first* `CREATE TABLE` in the file and `exec` is not wrapped in a transaction, so a power cut mid-bootstrap (a POS reality) creates `audit_log` and nothing else — and on next launch the sentinel says "schema exists", leaving the database permanently unusable.

**Fix:** Wrap the bootstrap in `sqlite.transaction(...)`, and drive migrations off `PRAGMA user_version` (or Drizzle's `migrate()` with the journal already present in `meta/`) so each numbered migration applies exactly once and future ones are picked up. Do this **before** the next release, because it cannot be fixed retroactively on machines already in the field.

---

### C15 — Backup and restore both target a database file that does not exist; there is no working disaster recovery
**File:** `src/main/services/backup/database-backup.ts:19,43,75,108`
**Reported from the running app.**

The app's database is `pharmapos.db` (`services/database.ts:14`), but the backup service hardcodes `database.db` in **four** places. Hence the operator's error:

```
Error invoking remote method 'backup:create':
ENOENT: no such file or directory, stat 'C:\Users\Rivindu\AppData\Roaming\pharma-pos\database.db'
```

Backup failing loudly is the *lesser* problem. Three worse ones sit behind it:

1. **Restore would silently restore nothing.** `restoreBackup` copies the archived file to `path.join(userData, 'database.db')` (`:108`) — a path the application never opens. If a backup did exist, an operator recovering from data loss would see "restore successful", reopen the app, and find their live `pharmapos.db` completely untouched. That is worse than no backup feature, because it converts a recoverable incident into a confident data loss.
2. **A failed backup leaves a corrupt artifact that is offered for restore.** The screenshot shows one entry at `0.00 MB` — `archiver` created the output file before the source `stat` failed. Nothing validates a backup's integrity, and that empty zip has a Restore button next to it.
3. **Timestamps are unparseable.** `listBackups:140` recovers the timestamp with `timestampMatch[1].replace(/-/g, ':')`, which replaces *every* hyphen including the date separators: `2026-08-01T19-05-46-769Z` → `2026:08:01T19:05:46:769Z` → **Invalid Date**, exactly as displayed.

Separately, even with the filename corrected the backup would be **unsafe**: `archive.file(dbPath)` is a raw copy of a live SQLite database opened in WAL mode. Committed transactions still in `pharmapos.db-wal` would be missing, and the copy can be internally inconsistent. (The `-wal` file on this machine is currently 4 MB against a 299 KB main database — i.e. most recent data lives in the WAL.)

**Fix:** Derive the path from one exported constant shared with `services/database.ts` — never repeat the filename. Use SQLite's online backup API or `VACUUM INTO 'target.db'` so the copy is transactionally consistent and WAL-inclusive, instead of `fs` copying. After writing, reopen the archive and run `PRAGMA integrity_check` before reporting success; delete the artifact if it fails. Fix the timestamp by capturing the ISO string in the manifest rather than reverse-engineering it from the filename, and show size from `stats.size` only for validated archives. Finally, make `restoreBackup` verify the target path is the live database and require the app to relaunch afterwards.

---

## 🟠 High

### H1 — Print failure is swallowed twice; the cashier is never told the receipt did not print
**File:** `src/main/ipc/printer-handlers.ts:54-63`, `src/renderer/src/components/pos/ReceiptPreview.tsx:190-204`
The handler catches everything and **resolves** `{success:false, error}`. The caller `await`s it with only a `catch`, which therefore never runs, and never inspects `success`. Printer unplugged, port claimed, or TCP timeout → the button flips back to "Print" with no message. The customer leaves with no receipt and, because the drawer pulse rides in the same buffer, the till never opens.
**Fix:** Inspect the result, surface the error prominently with a Retry, and keep the modal open until the cashier prints or explicitly dismisses.

### H2 — The cash drawer only opens if the cashier manually presses Print and it succeeds
**File:** `src/main/services/printer/receipt-formatter.ts:213-215`
The drawer pulse is emitted **only** inside the receipt byte stream. Press Close instead of Print (or hit any print fault) and you have a committed cash sale with a locked drawer. A working `printer.openDrawer()` IPC exists and is called by nothing.

**Confirmed operator requirement: printing must stay manual.** Verified that it already is — `printReceipt` has exactly one caller in the whole renderer, `handlePrint` on the Print button (`ReceiptPreview.tsx:190`), and the auto-print that once lived in `loadReceipt` is gone. So the fix must **not** be "auto-print after commit".

**Fix:** Decouple the drawer from the receipt. Remove `cashdraw(2)` from `printReceipt` (which also stops reprints re-opening the till, M12) and instead fire the independent `printer.openDrawer()` immediately after `createSale` succeeds for cash and mixed payments. The drawer then opens on every cash sale regardless of whether the cashier prints, and a paper or printer fault can never lock the till.

### H3 — Voiding a sale restores nothing
**File:** `src/main/services/sales.ts:248-263`
`voidSale` flips `status` and stops. Deducted `stock_batches` stay deducted; `product_sales_daily` revenue/cost/profit stay inflated. Inventory permanently under-reports and profit over-reports. Separately `getTodaySalesTotal` (`:312`) has **no status filter**, so voided sales still count toward the header and the End Shift "Total Sales" tile — while `computeShiftExpectedCash` *does* filter, so the two disagree by construction.
**Fix:** Transactionally re-add each `sale_items` quantity to its recorded `batch_id` and apply negative deltas to `product_sales_daily`. Add `AND status='completed'` to `getTodaySalesTotal`.

### H4 — Multi-batch lines record only the first batch, and cost comes from the product not the batch
**File:** `src/main/services/sales.ts:209,190`
`deductStockFEFO` returns every batch it touched; the insert stores `batches[0].batch_id`. Selling 10 units across a 4-unit and a 6-unit batch records one batch id — **a manufacturer recall cannot identify which customers received the affected lot**, which is a traceability requirement for a pharmacy. The same line takes cost from `products.cost_price` rather than the batches actually dispensed (compounding C5).
**Fix:** One `sale_items` row per batch touched (or a `sale_item_batches` child table), each using its own batch `cost_price`.

### H5 — A sale can be refunded without limit, for more than was sold
**File:** `src/main/services/sales.ts:353-355`
`createRefund` guards on `status !== 'completed'` but **never sets the status to `refunded`**, so the guard always passes and the same sale can be refunded repeatedly, restocking each time. The caller's `items` array is trusted and stored as opaque JSON with no check against what was sold, so a refund of 100 units against a 1-unit sale is accepted.
**Fix:** Inside the transaction, aggregate prior refunds, validate cumulative quantity ≤ sold quantity and unit price against the sold price, then set `status='refunded'` (or track `refunded_total` for partials).

### H6 — The graphical customer-facing display is entirely dead code
**File:** `src/renderer/src/pages/CustomerDisplayPage.tsx:47-48`, `src/main/index.ts:153-172`
The page listens for `display:cart-updated` and `display:sale-completed`. **Nothing ever sends either channel** — the only `webContents.send` calls in main are `app:close-requested` and `update-status` (verified). The page is also never imported by any router or window, and `createWindow()` is called once. The display IPC handlers write only to the serial pole display and return `{success:true}` unconditionally even with nothing connected, while the renderer's `.catch(() => {})` guarantees silence. So the second customer-facing screen never shows anything.
**Fix:** Create a second `BrowserWindow` on the secondary display rendering this page, have both handlers forward to it as well as the serial port, and return a falsy result when neither sink is present.

### H7 — `getQuickItems` fan-out multiplies displayed stock
**File:** `src/main/services/products.ts:176`
Same class of bug as C1: two independent one-to-many joins under one `GROUP BY`. A product with 2 batches (60+40=100) that sold on 3 of the last 7 days yields 6 rows, so `SUM(sb.quantity)` reports **300**. The POS quick-items panel shows triple the real stock, and "best seller" ordering is weighted by batch count.
**Fix:** Replace both aggregates with correlated scalar subqueries.

### H8 — Blank expiry is stored as `''`, which silently suppresses every expiry warning for that product
**File:** `src/main/services/inventory.ts:472`
`expiryDate: data.expiry_date ?? null` — `??` does not convert the empty string that react-hook-form submits. Because `'' < '2025-01-01'`, `MIN(sb.expiry_date)` returns `''`, and `if (product.nearest_expiry)` is **false** for `''` — so the product shows *no* expiry warning even when another batch expired last year. FEFO is also inverted (`''` scores as not-null and sorts first, so unknown-expiry stock is consumed before near-expiry stock), and the expiry-alert report matches `''` with a NULL day count. `updateStockBatch:526` uses `|| null` and so disagrees with the create path. *Latent in the current dataset (0 rows), live in the code.*
**Fix:** `expiryDate: data.expiry_date?.trim() || null` (same for `batchNumber`, `supplierId`), plus a one-off repair `UPDATE stock_batches SET expiry_date=NULL WHERE expiry_date=''`.

### H9 — `nearest_expiry` and `total_stock` include depleted batches, so good stock is flagged EXPIRED
**File:** `src/main/services/products.ts:37,82,176`
`searchProducts`, `getProductByBarcode` and `getQuickItems` join `stock_batches` with no `quantity > 0` filter — unlike `getProductsWithStock:217`, which has it. A batch that expired in 2024 and sold out still sets `nearest_expiry`, so the till shows a red **EXPIRED** banner on perfectly good stock. This trains staff to ignore the banner, which is precisely what makes C10 dangerous. The same product shows different expiry data on the POS and the Inventory screen.
**Fix:** Add `AND sb.quantity > 0` to all three, and return sellable stock separately from expired stock.

### H10 — Renaming a category can never succeed, and fails silently
**File:** `src/main/ipc/inventory-handlers.ts:67`, `src/main/services/inventory.ts:247`
The handler passes the whole data object where a string is expected (`updateCategory(id, name, description?)`), so Drizzle binds an object and better-sqlite3 throws `can only bind numbers, strings…`. `wrap()` converts it to `{success:false}` and the submit handler has no failure branch — the dialog just sits there. Category rename is 100% broken with zero feedback, and `parent_id` is never written even once fixed (the correctly-shaped `updateCategoryLegacy:299` is dead code).
**Fix:** Call the legacy 1-object version, rename it, delete the 3-arg one.

### H11 — Failed inventory saves are invisible *and* wipe the user's input
**File:** `src/renderer/src/pages/InventoryPage.tsx:112`, `src/renderer/src/components/inventory/ProductFormDialog.tsx:113`
All four submit handlers are `if (result.success) { …close… }` with no `else`, while the dialog **always** calls `reset()`. A duplicate barcode therefore blanks the entire form (create) or silently reverts the edits (update) with no message shown. A cashier — who holds `inventory:view` and can reach the page — gets this on every save attempt.
**Fix:** Add `else { setFormError(result.error) }` to all four, surface it in the dialog, and only `reset()` on success.

### H12 — Expiry dates are never validated
**File:** `src/renderer/src/components/inventory/StockBatchFormDialog.tsx:29`, `src/main/services/inventory.ts:459`
`z.string().optional()` with no date parse and no bounds; main copies the string straight into TEXT. `2020-01-01`, `2026-13-45` and locale-formatted `20/08/2026` all save cleanly, and a batch may expire before it was received. Given expiry is legally critical here, entry is the last place to catch a typo.
**Fix:** Validate the format and parseability, reject past dates (with an explicit opt-in for receiving stock destined for return), enforce `expiry_date > received_date`, and mirror all of it in the main process.

### H13 — Batch quantity can be rewritten with no adjustment record, and no inventory mutation is audited at all
**File:** `src/main/services/inventory.ts:506`, `src/main/ipc/inventory-handlers.ts:107-127`
The Edit pencil issues an absolute `UPDATE … SET quantity = ?` — 5 to 500 or back — with no `inventory_adjustments` row and no `logAudit`. Across the whole inventory handler file `logAudit` appears **twice** (`STOCK_ADJUSTED` on the broken channel of M14, and the Excel import). Creating, updating or deleting products, categories, suppliers and batches leaves **no trace whatsoever**, so shrinkage cannot be attributed and price history cannot be reconstructed for tax.
**Fix:** Route quantity changes through `adjustStockBatch` (delta + reason + user, which already writes adjustments) and drop `quantity` from `updateStockBatch`. Add `logAudit` with before/after values to every mutating handler.

### H14 — No main-process validation and no CHECK constraints: negative prices and negative stock are storable
**File:** `src/main/services/inventory.ts:53`, `src/main/db/migrations/0000_chilly_alice.sql:64-85`
The UI zod schemas are the only gate and the Excel importer bypasses them entirely, so `unit_price = -50` imports fine. `adjustStockBatch` applies `quantity + ?` with no floor, so `-999` leaves `quantity = -900`, which then *subtracts* from `SUM(sb.quantity)` and understates that product's stock. The migration has zero `CHECK` clauses.
**Fix:** One shared zod schema used by the IPC handler **and** the importer; add `CHECK (quantity >= 0)`, `CHECK (unit_price >= 0)`, `CHECK (cost_price >= 0)`; clamp adjustments at 0.

### H15 — CSV export corrupts on embedded quotes, is formula-injectable, and has no BOM
**File:** `src/main/services/inventory.ts:639`
`row.map(cell => `"${cell}"`)` — a product named `6" Crepe Bandage` shifts **every subsequent column** for that row in Excel. A name starting `=`, `+`, `-` or `@` is executed as a formula on open. No UTF-8 BOM, so Sinhala/Tamil names open as mojibake.
**Fix:** Escape by doubling quotes, prefix `'` to cells matching `/^[=+\-@\t\r]/`, and prepend `﻿`.

### H16 — Excel import silently discards expiry date, batch number, category and supplier
**File:** `src/main/ipc/inventory-handlers.ts:264-287`
Only ten columns are read; `createStockBatch` is called with just product, quantity and cost. A supplier price list containing `Expiry Date` and `Batch No` imports "successfully" with `expiry_date = NULL`. So a 10,000-line opening-stock import produces an entire inventory **with no expiry tracking**, reported as a clean success, while `track_expiry` defaults to 1 and claims otherwise.
**Fix:** Read and resolve those columns; reject a row with `current_stock > 0` and no expiry when `track_expiry = 1`.

### H17 — Import mangles numbers, half-applies, and can freeze the app
**File:** `src/main/ipc/inventory-handlers.ts:246-278`
`parseFloat('1,234.50')` returns **1** — the product is created at Rs. 1.00 and counted as imported with no error. `|| 0` on `tax_rate` and `|| 5` on `reorder_level` silently rewrite legitimate values. The transaction is **per row**, so a failure at row 4,000 leaves 3,999 committed with no rollback. A missing `name` column produces one error per row, all rendered as `<li>` — 10k DOM nodes in a modal. The whole loop is synchronous on the main process with no progress indicator.
**Fix:** Reject non-numeric cells outright (or read the native cell type), validate the header row up front, wrap the whole import in one transaction after a dry-run pass, and cap displayed errors at ~50.

### H18 — 10k products will lock up the touchscreen
**File:** `src/main/services/inventory.ts:29,483`, `src/renderer/src/components/inventory/ProductsTable.tsx:145`
`listProducts()` has no `LIMIT` and no pagination — it aggregates every product against every batch, sorts by an **unindexed** `products.name`, ships ~10k rows over IPC, and the table renders them all (8 columns ≈ 80k DOM nodes, no virtualisation). Every save re-runs all of it three times over. Search is client-side, so the full fetch is unavoidable.
**Fix:** Server-side pagination and search pushed into SQL, `CREATE INDEX idx_products_name`, and virtualise the two large tables.

### H19 — Editing any user silently destroys their PIN login
**File:** `src/renderer/src/components/users/UserFormModal.tsx:37`, `src/main/services/users/user-management.ts:114`
The form pre-fills `pin_code` with what the API returns — which per C12 is the **bcrypt hash**. Saving any unrelated change (a name typo) sends that 60-character hash back as the new PIN and `updateUser` hashes it again, storing `bcrypt(bcrypt(pin))`. The cashier's PIN pad stops working, nobody knows why, and the original PIN is unrecoverable.
**Fix:** Never load an existing PIN. Leave the field blank with "leave blank to keep current PIN", include it in the payload only when typed, and validate `/^\d{4,6}$/`.

### H20 — The last-admin guard is bypassable; one careless edit locks everyone out permanently
**File:** `src/main/services/users/user-management.ts:107,199`
`deactivateUser` refuses to deactivate the last active admin, but `updateUser` has no such guard for **either** path: change the only admin's role to Cashier via the UI, or call `users.update(adminId, adminId, {is_active: 0})`. There are then zero admins, nobody can create users, restore backups or change settings, and there is no out-of-app recovery.
**Fix:** Extract `assertNotLastAdmin(id)` and call it from `updateUser` whenever `role !== 'admin'` or `is_active === 0`. Also refuse role/active changes to the acting user's own account.

### H21 — PIN login has no rate limiting, lockout, or failed-attempt record
**File:** `src/main/ipc/handlers.ts:69`
No attempt counter, no delay, no lockout, and `logAudit` fires only on success — there is no `USER_LOGIN_FAILED` action at all. From the login screen a script can enumerate all 10,000 PINs and **nothing in the database or audit log ever shows it happened**. `PinPad` accepts any length ≥ 1 and `UserFormModal` imposes no minimum, so 1-digit PINs are creatable. A legacy plain-text comparison branch (`user.pin_code === pin`) also remains.
**Fix:** Persist `failed_attempts` / `locked_until`, back off after 3 and hard-lock around 8, audit every failure, enforce 4–6 digits, and delete the plain-text branch.

### H22 — Shift and sale channels are ungated and take the shift/user from the renderer
**File:** `src/main/ipc/handlers.ts:179,207`, `src/main/ipc/pos-handlers.ts:36`
`SHIFT_START/END/GET_ACTIVE/COMPUTE_EXPECTED_CASH` and `SALE_CREATE` perform no permission check and no ownership validation. Consequently: `endShift({shiftId: <someone else's>, closingCash: 0})` closes another cashier's shift and rewrites their cash figure; with no status check an already-closed shift can be re-closed repeatedly, overwriting `closing_cash`/`ended_at` and duplicating audit rows; `SHIFT_END` returns `{success:true}` when `shiftId` matches nothing (0 rows updated, no audit row) — a pure silent failure; and `SALE_CREATE` takes `user_id`/`shift_id` from the payload, so a sale can be booked against a **closed, already-reconciled** shift and never appear in any cash count.
**Fix:** Resolve the actor from the main-process session, require the permission, add `AND status='active' AND user_id=?` to the End Shift update and throw if `changes === 0`, and look up the caller's own active shift server-side in `createSale`.

### H23 — PaymentModal and EndShiftModal are taller than the screen; the confirm button is unreachable by touch
**File:** `src/renderer/src/components/pos/EndShiftModal.tsx:108`, `src/renderer/src/components/ui/dialog.tsx:39`, `src/renderer/src/components/pos/PaymentModal.tsx:228`
Measured against the available ~696px on a maximised 1366×768 POS:
- **EndShiftModal ≈ 842px** with `max-w-md` only — the base `DialogContent` sets **no `max-h` and no overflow**, so ~73px is clipped off the bottom and the entire 48px action row sits inside it. `onInteractOutside` is prevented and the X is clipped off the top, so **the shift cannot be closed by touch at all** — only a physical Escape key escapes.
- **PaymentModal ≈ 875px** against `max-h-[95vh]` ≈ 661px. It *can* scroll, but "Complete Sale" starts ~215px below the fold on every sale, and the only thing under the finger in the scroll region is the numpad — a drag inside Chromium's ~8px touch slop registers as a **click**, injecting a stray digit into the amount being confirmed. A returning customer's purchase history adds another ~200px.
**Fix:** Add `max-h-[90vh] overflow-y-auto` to the base `DialogContent`, and make both action rows `sticky bottom-0`. Reclaim height by collapsing EndShiftModal's 2×2 summary to one compact row and hiding PaymentModal's customer block behind a toggle.

### H24 — Seven screens send an empty-string user id into permission-gated IPC
**File:** `AnalyticsPage.tsx:17`, `InventoryPage.tsx:28`, `AuditLogPage.tsx:35`, `CustomersPage.tsx:30` (also `UsersPage.tsx:27`, `AIInsightsPanel.tsx:16`, `ReportsPanel.tsx:475`)

Every one derives `const userId = user?.id ?? ''` and passes it straight to `withPermission`, where `getUserById('')` returns undefined and the handler throws **`User not found`**. This fires whenever a component's effect runs before the auth store has hydrated, and again if a component is still mounted after logout.

The failure is then invisible or misleading, depending on the screen: the Inventory loaders have no error branch (M19), so the page renders *"No products found — create your first product"* to a pharmacy with 10,000 products; elsewhere the raw string surfaces in a native `alert()`. A cashier reporting "my inventory disappeared" is most likely hitting this, not data loss.

**Fix:** Don't fabricate an id. Type the value as `string | undefined`, skip the load entirely while it is undefined (`if (!userId) return`), and render a distinct "not signed in" state rather than an empty list. Once C11's main-process session lands, the renderer stops passing an id at all and this class of bug disappears — so treat this as the interim guard.

### H25 — The E2E suite cannot pass and is never run
**File:** `tests/e2e/pos-workflow.spec.ts`, `.github/workflows/release.yml:26`
The specs target `input[name="username"]`, `input[name="password"]`, `input[name="cashReceived"]` and the strings `Point of Sale` / `Sale Completed` — **none exist**: login is user tiles plus a PIN pad, the password input has no `name`, the cash field is `id="cash-received"`, and the page says "POS Terminal". `beforeEach` is an empty comment stub ("This would insert test products"). CI runs only `npm run publish`, so nothing executes them. The project therefore believes it has regression cover for the POS workflow and has none — which is how the C1–C14 class of defect reached production.
**Fix:** Either repair the selectors and seed fixtures and add a CI job, or delete the suite so it stops implying coverage. Given the money defects above, the first sale-to-receipt test is worth more than any other single change in this report.

---

## 🟡 Medium

| # | File | Issue |
|---|------|-------|
| M1 | `posStore.ts:173-182` | One hold slot, overwritten unconditionally. Holding a second sale silently destroys the first, with no warning — while the Recall path *does* confirm, showing the intent. |
| M2 | `useKeyboardShortcuts.ts:17-23` | The input guard returns before the F-key switch, and `ProductEntry` keeps the barcode box focused permanently — so **F2/F4/F5/F8/F9 never fire during normal checkout**. Also `[handlers]` deps re-register the listener every render. |
| M3 | `ProductEntry.tsx:44-54`, `SearchModal.tsx:41-53` | Debounced searches have no staleness guard; an in-flight response can reopen a stale dropdown over an already-cleared input, and the next tap adds the wrong medicine. |
| M4 | `posStore.ts:88-109` | The cart holds a frozen stock snapshot; after a restock, one tap of "−" can silently drop the quantity charged (5 → 3). |
| M5 | `posStore.ts:62` | Scanning an item already at its stock limit is a completely silent no-op — no error, no beep. The cashier rescans or assumes it was added. |
| M6 | `pole-display.ts:116-122` | `showSaleComplete` writes the total, then `clearCart()`'s subscription overwrites it with `0.00` milliseconds later; 3s later the change is written and **stays on the VFD indefinitely**, showing the previous customer's change to the next one. |
| M7 | `pole-display.ts:19` vs `index.ts:138,181` | `DEFAULT_BAUD = 2400` (the documented device default) is dead code; auto-connect and the seeded setting both use **9600** (confirmed in live DB), so the VFD shows garbage out of the box — indistinguishable from "no display fitted". |
| M8 | `settingsStore.ts:30-37` | `loadSettings` has no `catch` and is fired unawaited. A failed read leaves `isLoading` true forever and the **hardcoded fallbacks in force — `vat_rate: '0'`** — so the POS trades all day charging no VAT with no visible error. |
| M9 | `sales.ts:203-218,295-304` | Product names are not snapshotted onto `sale_items`; `getReceipt` recovers them by join, so renaming a product **retroactively rewrites every past receipt**, and deleting one yields a `null` name. |
| M10 | `receipt-formatter.ts:108` | Item names hard-truncated to 16 chars, not wrapped. "Paracetamol 500mg Tablet" and "…Syrup" both print as `Paracetamol 500m` — indistinguishable on a dispensing record. |
| M11 | `escpos-builder.ts:19` | Non-ASCII maps to `0x3f`, so Sinhala/Tamil product, business or footer text prints as `????????`. |
| M12 | `ReceiptPreview.tsx:190-204` | Reprints are unlimited and unmarked — two byte-identical documents that each look like the original invoice, and each one re-kicks the drawer. |
| M13 | `pos-handlers.ts:39-49`, `audit.ts:75-77` | The `SALE_CREATED` audit insert sits **outside** the sale transaction and is wrapped in a bare `catch {}`, so a disk-full or locked DB yields a committed sale with no audit record and no signal. |
| M14 | `preload/index.ts:101`, `inventory-handlers.ts:129` | `stock:batchAdjust` never sends `productId`, which is `NOT NULL` — the insert fails and rolls back the quantity change. The **only audited stock-adjustment path in the app is unreachable**, and this handler alone isn't wrapped in `wrap()`. |
| M15 | `PaymentModal.tsx:145-151` | The pre-payment recheck looks products up by **name** against a `LIMIT 20` search, so a product named "Zinc" (sorting after "Calcium + Zinc" etc.) is reported out of stock when it is not, with no way to proceed. Also one IPC round-trip per cart line. |
| M16 | `inventory.ts:186`, `queries.ts:166` | Low-stock alerts include every product that has **never** been stocked (`0 <= reorder_level`), so after a partial import the banner reads "8,000+" and real reorder signals are lost. |
| M17 | `inventory.ts:173,483,343` | Soft-deleted products keep live batches visible and can even **receive new stock**; deactivated suppliers stay selectable with no marker; and a soft-deleted product can never be reactivated from the UI. |
| M18 | `inventory.ts:506` | `updateStockBatch` silently drops `received_date` and `product_id` — correcting a mis-keyed received date appears to succeed and changes nothing. Empty `fields` would also produce invalid SQL. |
| M19 | `InventoryPage.tsx:76-109` | Every loader is `if (success)` with no else, so a failed read renders "No products found — create your first product" to a pharmacy with 10,000 products. |
| M20 | `schema.ts:53-55` | All money is SQLite `REAL`. Combined with C4 this is how `2701.905` got stored. Day totals drift from the sum of printed receipts. |
| M21 | `inventory.ts:463`, `StockBatchesTable.tsx:52` | Dates use `toISOString()` (UTC) while the shop is UTC+5:30 — stock received at 02:00 local is dated the previous day, and from 05:30 local on the expiry day a batch renders "(Expired)" a day early. |
| M22 | `AlertsPanel.tsx:12`, `AnalyticsPage.tsx:80` | Low-stock and expiry alerts are pure props with no refresh of their own — the only way to update them is the page-level Refresh, which re-runs the whole dashboard. Alerts therefore go stale as soon as stock moves, and there is no auto-refresh. See [R4](#-operator-requirements). |

Also Medium, from the auth review: logout does not clear the cart or held sale (**cashier B can complete cashier A's basket against B's shift**); there is no idle lock and no way to log out without ending the shift; End Shift commits on a bare Enter with a blank count; Start/End Shift and Login swallow IPC errors entirely (a duplicate-shift rejection leaves the button doing nothing forever); an interrupted setup wizard silently discards the admin password; there is **no single-instance lock**, so double-tapping the shortcut runs two processes against one SQLite file with two receipt-number generators; shift figures mix "today in UTC" with "whole shift" so an overnight shift reports Total Sales 0 against a full drawer; user management writes **no audit trail at all**; and passwords have no strength rules. Touch-side: `SelectContent` clamps its scroll viewport to the 40px trigger height (one visible option); `SelectTrigger`/`SelectItem`/`TabsTrigger` are all under 44px with no `active:` state; destructive confirms place Cancel 8px from the destructive action; a stray overlay tap discards a keyed-in payment; ~21 native `confirm()`/`alert()` calls remain across the admin screens.

---

## ⚪ Low

| # | File | Issue |
|---|------|-------|
| L1 | `receipt-formatter.ts:124-128` | Totals rows are 41 of 42 chars, so every amount sits one column short of the rules above and below. |
| L2 | `receipt-formatter.ts:197-203` | Card receipts print no amount at all; mixed derives the card figure instead of reading `card_received`. |
| L3 | `ReceiptPreview.tsx:74,155` | Reprints label VAT with **today's** rate against the historical amount; a zero-VAT receipt omits the VAT line entirely, and no VAT registration number is ever printed. |
| L4 | `shiftStore.ts:31-35` | `todaySalesTotal` is an optimistic renderer counter never decremented on void/refund and only re-synced at login, so the header drifts upward all shift. |
| L5 | `pole-display.ts:41-58` | A failed serial open leaks the `SerialPort` object; the reuse guard misses a port that closed itself. |
| L6 | `receipt-formatter.ts:223` | `printShiftReport` is implemented and exposed but never called — the X-report handed over with the drawer is never produced. |
| L7 | `posStore.ts:43-48` | Cart and held sale are memory-only; `Ctrl+R` (the default menu is still installed) or a power blip discards both. |
| L8 | `ProductEntry.tsx:197`, `QuickItems.tsx:83`, `SearchModal.tsx:131` | Currency hardcoded `Rs.` in the three product-picking surfaces while the cart honours the setting — two currencies on one screen. |
| L9 | `CartItem.tsx:9-14` (+3 copies) | Days-to-expiry compares a UTC-parsed date against local midnight, so every countdown is a day optimistic and "expires today" never appears. |
| L10 | `schema.ts:106` vs `:156` | Batch quantity is `REAL` but sale quantity is `INTEGER`: fractional units can be received and never sold, and float residue keeps a batch matching `quantity > 0` forever. |
| L11 | `StockBatchFormDialog.tsx:109` | `setProductSearch(\`${product.name} (${product.sku})\`)` is unguarded, so a product with no SKU shows literally **`Panadol 500mg (null)`** in the Receive Stock field. `LowStockAlert.tsx:25` guards the same expression correctly — copy that. Related: eight `alert(error.message)` call sites print **`undefined`** when a non-`Error` is thrown. |

Also Low: `reactivateUser` validates nothing and silently no-ops; an admin can deactivate their own account; `user:stats` and `shift:compute-expected-cash` are ungated; the discount engine is wired into store and schema but has **no UI** and its amount is unclamped (a percentage over 100 would produce a negative total); `Product.sku` is typed non-nullable so `(null)` is rendered to users; dialog close buttons are 16×16px with hover-only feedback; `title` is the only label on the header Settings button.

---

## 📋 Operator requirements

Raised from the shop floor. These are **feature gaps, not defects** — but several are the correct long-term fix for a Critical above, so they are sequenced against them.

### R1 — Per-batch selling price
**Today:** `stock_batches` records `cost_price` only; the selling price always comes from `products.unit_price`. When the same medicine is bought at two different costs, or an old batch must be cleared at a lower price, the system cannot represent it.
**Needs:** `stock_batches.selling_price` (nullable — fall back to `products.unit_price` when unset), exposed in the Receive Stock and Edit Batch dialogs. Because the cart is built before a batch is chosen, the POS must resolve the price from the batch FEFO *will* pick, and re-resolve if the quantity spans batches. Simplest correct behaviour: price each unit at the price of the batch it is actually drawn from, and show the cashier a per-line breakdown when a line spans two prices.
**Interacts with:** C3 (whatever VAT model is chosen must apply per batch price), C5.

### R2 — Stock batch history: what each batch cost and what it sold for
**Today:** `sale_items` stores a single `batch_id` — the **first** batch touched (H4) — and a `cost_price` copied from the product, which is `0` for all 257 products (C5). So batch-level margin is unanswerable, and a recall cannot identify who received an affected lot.
**Needs:** one row per batch consumed, each carrying batch id, quantity, the batch's `cost_price` and the `selling_price` actually charged. Either split `sale_items` per batch or add a `sale_item_batches` child table. Then a per-batch ledger becomes derivable: received qty/cost, sold qty/price, remaining, realised margin, and full recall traceability.
**Confirms the FEFO assumption:** oldest-expiry-first is already what `deductStockFEFO` does (`sales.ts:76-88`) — verified, and it is the right basis for this. It must first be corrected to skip **expired** batches (C10).
**This requirement is the proper fix for C5 and H4** — implement them together rather than patching cost separately.

### R3 — Add cash to the drawer mid-shift
**Today:** the only cash inputs are `shifts.opening_cash` at start and `closing_cash` at end. A mid-shift float top-up, a petty-cash payout, or a bank drop cannot be recorded, so any such movement shows up as an unexplained drawer discrepancy.
**Needs:** a `cash_movements` table (`shift_id`, `user_id`, `type: 'in'|'out'`, `amount`, `reason`, `created_at`), a Cash In / Cash Out action on the POS screen behind a permission, an audit entry per movement, and — critically — inclusion in the reconciliation:
`expected = opening + Σ(cash_received − change_given) + Σ(cash_in) − Σ(cash_out) − Σ(cash_refunds)`
**Blocked by / blocks:** this is the same function as C2. Fix C2's change-given term and add these terms in one change, or the drawer will still not balance.

### R4 — Refresh alerts on demand
**Today:** `AlertsPanel` takes `lowStockAlerts` / `expiryAlerts` as props with no refresh of its own (M22); only the dashboard-wide Refresh updates them, and nothing is automatic. Alerts go stale the moment stock moves.
**Needs:** a refresh control on the panel itself, plus a refresh after any stock mutation (sale, receive, adjust) and a periodic poll. Note the underlying queries need fixing first or the refreshed numbers will still be wrong: low-stock counts every never-stocked product (M16) and expiry alerts match empty-string dates (H8).

### R5 — Setting to disable card payments
Covered in full under **C6**. Ship the toggle with the crash fix.

---

## 🏗️ Build, CI, dependencies

- **CI runs no tests and no lint.** `release.yml` runs `npm ci --legacy-peer-deps` then `npm run publish`. Typecheck runs (it's chained into `publish`); lint and Playwright do not. `--legacy-peer-deps` is also now unnecessary.
- **`npm audit`: 62 vulnerabilities — 2 critical, 33 high.** Most are the Electron Forge build chain (`tar`, `@electron/rebuild`), which is build-time only. Three ship in the app and matter: **`drizzle-orm@0.45.1`** (high — SQL injection via improperly escaped identifiers; fixed in 0.45.2), **`jspdf@4.2.0`** (critical — PDF object injection / HTML injection; used by the PDF report export), and **`electron@39.6.1`** / **`vite@7.3.1`** (high). All four have fixes available.
- **DevTools is reachable in the packaged app.** `Menu.setApplicationMenu` is never called, so Electron installs its default menu with View → Toggle Developer Tools; `autoHideMenuBar` only hides it until Alt. `optimizer.watchWindowShortcuts` blocks the *keystrokes* but not the menu item. This is the enabling step for C11 and C12 — set `Menu.setApplicationMenu(null)` in production and close DevTools on open.
- **Good:** the CSP is present and tight (`default-src 'self'; script-src 'self'`), `contextIsolation` is left at its secure default with a `contextBridge` preload, and `PRAGMA foreign_keys = ON` and WAL are both set on the single shared connection. `sandbox: false` is the one webPreferences weakness.

---

## ✅ Verified correct

Recorded so the report shows coverage, not just defects.

- **`createSale` is genuinely atomic.** Header insert, line items, FEFO decrements and the daily rollup all run in one `db.transaction(...)()`, and Drizzle and raw SQL share the *same* better-sqlite3 connection — so a partial failure really does roll everything back. No async work inside the transaction.
- **Stock cannot go negative.** `deductStockFEFO` selects only `quantity > 0`, clamps each deduction, and throws **before** any `UPDATE` if the requirement isn't met. A batch appears once in the ordered set, so no double-decrement.
- **Sale history survives product deletion** — `deleteProduct` is a soft delete and the `sale_items` FK is `no action`, so the tax/audit trail cannot be destroyed. `sale_items` correctly cascades from `sales`.
- **No Drizzle-vs-migration drift.** All 14 tables, columns, types, defaults, NOT NULL, UNIQUE and FK definitions match exactly; the migration's extra partial index and seed rows are deliberate.
- **Password hashing is correct** — bcrypt cost 10 for both passwords and PINs, compared with `bcrypt.compare`; no plaintext credential is written by any current path, and no credential is logged.
- **One active shift per user is enforced in the DB** by a partial unique index (the renderer just handles the resulting error badly, M-list).
- **Receipt numbers** are zero-padded so `ORDER BY` string-sorts correctly, generated inside the transaction, and UNIQUE-constrained.
- **Login honours deactivation**, and `withPermission` re-checks `isActive` on every call.
- **`getTopProducts` and `getCategoryBreakdown`** join by primary key and are free of the C1 fan-out. `listCategories`/`listSuppliers` correctly use `COUNT(DISTINCT …)`.
- **Touch baseline is now sound** in `button.tsx`, `input.tsx` and `alert-dialog.tsx` (all variants ≥44px, every `hover:` paired with `active:`), and `globals.css` already sets `touch-action: manipulation` and `user-select: none` globally. The `min-h-0` flex chain is correct end-to-end on the POS page. `ReceiptPreview`, `SearchModal`, `StartShiftModal`, `LoginPage`, `Sidebar` and `CartActions` were each measured and fit the screen.
- **`ProductEntry` focus discipline** is right — `autoComplete="off"` on the scanner input and refocus after every add path, so the scanner is never left without a target.
- **`CashNumpad.applyKey`** cannot produce a negative or malformed amount, and `calculateChange` is floored at 0.
- **USB/TCP printer transports** release the interface in a `finally`, and TCP times out at 5s and destroys the socket — no handle leak on an offline printer.
- **Windows close-interception** works as designed, with the renderer listener registered once via a ref so it cannot go stale.
- **Printing is triggered only by the Print button** — confirmed against the operator's requirement. `printReceipt` has exactly one caller in the renderer (`ReceiptPreview.handlePrint`), and the auto-print previously in `loadReceipt` has been removed. No code path prints a receipt without an explicit tap. H2 has been rewritten to preserve this.

---

## Coverage and gaps

Reviewed in full: the POS cart and money math; payment, sale persistence, receipts, printing, drawer and pole display; auth, session, shift lifecycle, RBAC, user management and first-run setup; inventory, products, categories, suppliers, batches, import/export and the database schema and migration; the analytics query layer; the shared UI primitives and the POS/shell screens for touch; build, CI, dependencies and the test suite.

**Not yet reviewed** — two reviewers were lost to a session limit before finishing, so these areas are outstanding and should not be read as clean:

1. **Backup and restore** — `database-backup.ts` has now been reviewed (see C15). Still outstanding: `google-drive.ts` (token handling and refresh), `scheduler.ts` (drift, overlap, missed runs while the POS is powered off at the scheduled 02:00, retention pruning deleting the only good archive), and where the backup encryption password is stored.
2. **AI insights** (`services/ai/insights.ts`) — whether the Gemini key is stored in plaintext, whether customer PII or sales data leaves the machine, prompt injection via product names, and cost/timeout bounds.
3. **Audit log service** (`services/audit.ts`) and **customers service** — append-only guarantees and tamper resistance.
4. **Report generation** (`services/analytics/reports.ts`, `ReportsPanel.tsx`) — the P&L and inventory-valuation SQL, and the jsPDF/Excel export paths. Note these inherit C1's fan-out if they share those queries, and the critical `jspdf` advisory applies here.
5. **Logging and auto-update** (`services/logging/*`, `services/updates/*`).
6. **Touch review of the admin and data screens** — the six admin pages and the inventory/users/analytics tables. Specifically unverified: whether table row actions are hover-only (unreachable on touch), whether `ProductFormDialog`/`StockBatchFormDialog` fit on screen, and the ~21 native `confirm()`/`alert()` call sites.

---

## Suggested order of work

1. **C15** — backup/restore is a one-line filename fix away from working, and until it does there is **no disaster recovery at all**. Do the consistent-copy and integrity-check work in the same pass; everything below is safer once a restorable backup exists.
2. **C6 + R5** — one-word rename, an error boundary, and the card-payment toggle. Stops the till dying on card sales, and the toggle is an immediate mitigation.
3. **C2 + R3** — fix the change-given term and add cash in/out in one change to `computeShiftExpectedCash`, or the drawer still will not balance.
4. **C1** — the analytics join; small, local, and makes the dashboard honest.
5. **C4, C3** — rounding first (mechanical), then choose one VAT model. C3 needs a pricing decision before code.
6. **C14** — must land before the next release ships a migration, or field databases break.
7. **C5 + H4 + R1 + R2** — do batch pricing and batch history together as one piece of work; that is what makes profit real, and patching cost separately would be thrown away.
8. **C8, C9, C7** — sale integrity and the printed total.
9. **C11, C12, C10, H24** — the main-process session (which also retires H25), then hash exposure, then the expiry block.
10. **H25** — a single sale-to-receipt E2E test, so none of the above can silently regress.
