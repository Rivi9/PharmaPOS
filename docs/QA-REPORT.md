# PharmaPOS QA Report

**Date:** 2026-08-02
**Version reviewed:** 1.0.11 (commit `03bc4b1`)
**Method:** Full source-level review of all ~17,900 lines across `src/main`, `src/preload`, `src/renderer` and `src/shared`, plus the migration SQL, `forge.config.ts`, CI workflow, dependency tree and the E2E suite. Findings were then **re-verified against the live database** (`%APPDATA%/pharma-pos/pharmapos.db`, inspected read-only on a copy).
**Environment:** Windows 10 POS machine, capacitive touchscreen, USB barcode scanner, 80mm thermal printer + cash drawer, serial VFD pole display. Sri Lankan pharmacy — LKR, VAT, tax-reporting obligations.

> This report **supersedes `QA-REPORT.md.old`**, which is retained only as history. Nothing in it was carried forward; every finding below was re-derived from the current code.

---

## Summary

| Severity | Raised | Fixed | Open |
|----------|-------:|------:|-----:|
| 🔴 Critical | 25 | **25** | 0 |
| 🟠 High | 40 | **33** | 7 |
| 🟡 Medium | 32 | **11** | 21 |
| ⚪ Low | 16 | **4** | 12 |
| **Total** | **113** | **73** | **40** |
| 📋 Operator requirements | 5 | **5** | 0 |

**Every Critical and every operator requirement is now closed.** The remaining work is High and below — see [Suggested order of work](#suggested-order-of-work).

Fixed across eleven rounds — see [Fixed in this session](#-fixed-in-this-session) for the detail of each.

| Round | Commit | Closed |
|---|---|---|
| 1 | `56475b9` | C16, L11 + AI insights removed, batch picker |
| 2 | `75436fa`, `0851dba`, `d610807` | C1, C2, C4, C5, C6, C7, C10, C15, C17–C20, C23, C24, H1, H3, H29, H31–H33, H35, H37, M8, M12, L1, L2, R5 |
| 3 | `ba57e9d`, `01006ed` | C8, C9, C14, H8, R3 + 2 Medium |
| 4 | `e9dfeb0`, `792ab82`, `677a2e8` | C3, C13, C25, H2, H26, H27 + install-time migrations |
| 5 | `6ea0576` | C11, C12, H19, H21 (partial) + settings and bootstrap channels gated |
| 6 | `541feb8` | C21, C22, H30 (partial) + versioned encryption container |
| 7 | `87c7d3c`, `816fdd6` | H7, H9, H10, H11, H15, H20, H21, H36 (users) + password rules |
| 8 | `f488d65`, `0d1b1a1` | **R1, R2**, R4, H4, M16 |
| 9 | `3631510`, `1377df2` | H40, M17 + batch history UI, disabled-Delete explanation |
| 10 | `5a5a184`, `b93b886` | H22, H30 (rest), H34, H38, H39, L11 (second half) + native `confirm()`/`alert()` removed, customer erasure, single-instance lock |
| 11 | this round | H12, H14, H23, H25 + admin password rule, 27-test E2E suite, CI |

**Two passes.** Pass 1 (C1–C15, H1–H25) covered the POS, payments, printing, auth/RBAC, inventory and the schema. Pass 2 (C16–C25, H26–H40) covered the areas pass 1 listed as gaps — the full money/analytics verification, report generation, backup/restore, scheduling, logging, auto-update, the audit log, customers, and the admin-screen touch review. **Coverage is now complete**; there is no remaining unreviewed area.

Seven items have since been **fixed** — see [Fixed in this session](#-fixed-in-this-session).

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

### C16 — The nightly job deleted a day of analytics and never rebuilt it ✅ FIXED
**File:** `src/main/jobs/aggregation.ts:2` → `src/main/services/analytics.ts:11`

`jobs/aggregation.ts` imported `aggregateDailySales` from `'../services/analytics'`. There is no `analytics/index.ts`, so that resolved to **`services/analytics.ts`** — a broken duplicate — rather than the working `services/analytics/aggregation.ts` that the IPC handlers use. That implementation runs the delete **first**, unwrapped in a transaction, then throws while *preparing* an INSERT that references `sales.completed_at` and `sale_items.subtotal`, neither of which exists (the real columns are `created_at` and `line_total`):

```ts
db.prepare('DELETE FROM product_sales_daily WHERE date = ?').run(date)   // commits
// …then throws: no such column: s.completed_at
```

The job **is** wired up (`main/index.ts:92`) and the error is swallowed to `console`, which goes nowhere in a packaged app. So every night at 00:05, a day's aggregated revenue, cost, profit and quantity vanished permanently — taking the P&L, category breakdown, top products and trend chart with it. The date arithmetic was also off by a day (local `getDate()` mixed with UTC `toISOString()`), and `runIncrementalAggregation` could never repair it (C24).

**Fixed:** import repointed at the working module, the broken duplicate deleted (it had no other importers), date arithmetic made UTC-consistent.

---

### C17 — Scheduled backups have never run, and cannot
**File:** `src/main/services/backup/scheduler.ts:28`, `src/main/index.ts:84-216`

Two independent blockers. `startBackupScheduler()` is only reachable from an IPC channel — **nothing calls it at startup**, so after every launch there is no job. And even when the Settings button fires it, it reads `backup_enabled` and bails; **no code in the repository ever writes that key**. It logs `Auto-backup is disabled` to a console nobody sees. `stopBackupScheduler()` is never called on quit either. Compounding it, `node-schedule` has no missed-run catch-up, so a POS switched off at 02:00 — the normal state for a shop that closes at night — would get no backup even once the above is fixed.

**Fix:** call `startBackupScheduler()` in `app.whenReady()` after DB init and `stopBackupScheduler()` on confirmed quit; default `backup_enabled` to on (opt-out); add a startup catch-up when `last_backup_time` is older than one interval.

---

### C18 — Restore corrupts the database: the live connection stays open and the stale WAL is left in place
**File:** `src/main/services/backup/database-backup.ts:107-109`, `src/main/services/database.ts:16`

`getDatabase()` opens the database in WAL mode and holds the handle for the process lifetime. `restoreBackup` overwrites the `.db` file **underneath that open handle** and never touches `-wal` / `-shm`. The still-open connection then checkpoints *pre-restore* WAL frames onto the freshly restored file. Best case the restore is silently undone; realistic case is a cross-generation page mix — a corrupt database. The only mitigation is a string asking the user to restart, which nothing enforces. The pre-restore "safety" snapshot has the same flaw, so the rollback copy is itself untrustworthy.

**Fix:** close the DB, delete `-wal`/`-shm`, copy, then `app.relaunch(); app.exit(0)`. Never hand control back to the renderer with a stale handle.

---

### C19 — Restore is unusable from the UI: `window.prompt()` throws in Electron
**File:** `src/renderer/src/pages/SettingsPage.tsx:257`

Electron does not implement `prompt()` — verified empirically against this project's Electron 39 binary, which returns `prompt() is not supported.` The call sits **outside** the `try` block, so it becomes an unhandled rejection: no error, no spinner, nothing happens. This affects encrypted *and* plain backups, and there is no other restore path in the app. Together with C15, C17 and C18, **there is no working disaster recovery of any kind.**

**Fix:** replace with a Radix `Dialog` + password `Input` (both already dependencies) and move the whole flow inside `try/catch`.

---

### C20 — Auto-update and Sentry are inert in the shipped app: `NODE_ENV` is never set
**File:** `src/main/services/updates/auto-updater.ts:14`, `src/main/services/logging/error-handler.ts:14`, `logger.ts:12`

Every update and error-reporting path is gated on `process.env.NODE_ENV === 'production'`. Electron does not set `NODE_ENV`, and nothing in `forge.config.ts`, the Vite configs or the npm scripts injects it. Confirmed **not** statically replaced at build time — the comparison survives as a runtime lookup in the shipped `app.asar`. So on the POS: `updateElectronApp()` is never called, `Sentry.init()` never runs, winston runs at `debug` with a Console transport attached. **The pharmacy will never receive an update and no crash will ever be reported.** The Sentry DSN is unset anyway.

**Fix:** gate on `app.isPackaged`, not `NODE_ENV`. Inject the DSN via a Vite `define`.

---

### C21 — Backup encryption password is never persisted, and scheduled backups are never encrypted
**File:** `src/renderer/src/pages/SettingsPage.tsx:239`, `src/main/services/backup/scheduler.ts:91`

The password is typed, used, and cleared — stored nowhere, with no escrow, hint or verification. PBKDF2-SHA256 100k → AES-256-GCM is sound, which is precisely the problem: one typo makes the archive permanently unreadable, and the pharmacist sees a raw OpenSSL error. Meanwhile the scheduler reads a `backup_password` setting that **no code ever writes**, so every scheduled backup would be unencrypted — and that plain ZIP is what gets uploaded to Drive (C22).

**Fix:** derive the key from `safeStorage` (DPAPI) so backups are always encrypted with no memorised password; if a user password is kept, store a PBKDF2 verifier so a wrong one fails fast.

---

### C22 — An unencrypted database containing customer PII and password hashes is the default Drive upload
**File:** `src/main/services/backup/database-backup.ts:30`, `scheduler.ts:96-109`

With no password — the only reachable state for scheduled backups — the archive is a plain ZIP, and that exact file is streamed to Google Drive. It contains the full `customers` table (name, phone, email, address, date of birth, notes), every sale line item linking a named customer to specific medicines dispensed (de facto health records), and the `users` table with bcrypt password and PIN hashes. The same archives sit unencrypted in `%APPDATA%` where any local process can read them.

**Fix:** refuse to upload anything but an `.encrypted` archive. Also fix the leak on the encryption path: if the final write fails, the plaintext temp ZIP is never unlinked and is then listed as a normal backup.

---

### C23 — `logAudit` silently discards entries whose user id is not a live user
**File:** `src/main/services/audit.ts:60-78`

`audit_log.user_id` has an FK to `users(id)` and foreign keys are enforced. Any `logAudit` with an unknown id throws `SQLITE_CONSTRAINT_FOREIGNKEY`, which the bare `catch {}` discards while the operation itself commits. Combined with C11 (the actor id comes from the renderer), passing a random uuid doesn't merely mis-attribute the action — **the audit row vanishes entirely**. The same happens for a user deleted mid-shift. Affects every call site: sale created, sale refunded, stock adjusted, Excel import, login, shift start/end.

**Fix:** keep the operation alive but never lose the record — log the failure via `logError` and write to a fallback append-only file, or insert with `user_id = NULL` plus `details.claimed_user_id`.

---

### C24 — Voids are never reversed anywhere, and re-aggregation can never repair it
**File:** `src/main/services/sales.ts:248-263`, `src/main/services/analytics/aggregation.ts:67-87`

`createSale` writes the `product_sales_daily` row live; `voidSale` flips the status and leaves it. Every psd consumer — P&L, category breakdown, top products, trend chart — reads psd directly and **cannot** filter by status, because psd has no status dimension. Voiding is also completely unaudited: `SALE_VOIDED` is declared but never emitted, and `voidSale` takes `_userId` and discards it, so the single most likely mechanism for till theft leaves no record of who did it.

The only correction path is unreachable: `runIncrementalAggregation` starts at `MAX(psd.date) + 1 day`, so once any sale happens today it returns `{daysProcessed: 0}` and never recomputes today or any earlier day. Net effect: a mistaken Rs. 15,000 sale that a manager voids is excluded from the Sales Report but still counted in the P&L and the dashboard — the two reports disagree by the full value of every void, permanently.

**Fix:** reverse the psd contribution and restore stock inside a transaction in `voidSale`; record `voided_by`/`voided_at` and emit `SALE_VOIDED`; change incremental aggregation to start at `MAX(psd.date)` and re-aggregate a rolling window.

---

### C25 — Refunds are recorded net of VAT and are invisible to every report and to the drawer
**File:** `src/main/services/sales.ts:357`

Three compounding errors. **Amount:** `totalRefunded = Σ line_total` is pre-VAT and pre-discount — a sale the customer paid Rs. 1,180 for records a Rs. 1,000 refund, so either the customer is shorted or the books are Rs. 180 light. **Status:** `sales.status` is never set to `'refunded'`, so a fully refunded sale still satisfies `status='completed'` in every report and in the drawer calculation, and revenue is never reversed. **Reporting:** `sale_refunds` is read by **no aggregate anywhere** in `src/main`, and no offsetting psd row is written. A month with Rs. 500,000 of sales and Rs. 50,000 of refunds reports Rs. 500,000 in both the Sales Report and the P&L, and the shift expects Rs. 50,000 of cash that is no longer in the drawer.

**Fix:** refund the customer-facing amount (pro-rate `tax_amount` and `discount_amount` across refunded lines), set the status when fully refunded, validate cumulative refunds against the original, write a negative psd row, and subtract cash refunds in `computeShiftExpectedCash`.

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

### H12 ✅ FIXED (round 11) — Expiry dates are never validated
**File:** `src/renderer/src/components/inventory/StockBatchFormDialog.tsx:29`, `src/main/services/inventory.ts:459`
`z.string().optional()` with no date parse and no bounds; main copies the string straight into TEXT. `2020-01-01`, `2026-13-45` and locale-formatted `20/08/2026` all save cleanly, and a batch may expire before it was received. Given expiry is legally critical here, entry is the last place to catch a typo.
**Fix:** Validate the format and parseability, reject past dates (with an explicit opt-in for receiving stock destined for return), enforce `expiry_date > received_date`, and mirror all of it in the main process.

### H13 — Batch quantity can be rewritten with no adjustment record, and no inventory mutation is audited at all
**File:** `src/main/services/inventory.ts:506`, `src/main/ipc/inventory-handlers.ts:107-127`
The Edit pencil issues an absolute `UPDATE … SET quantity = ?` — 5 to 500 or back — with no `inventory_adjustments` row and no `logAudit`. Across the whole inventory handler file `logAudit` appears **twice** (`STOCK_ADJUSTED` on the broken channel of M14, and the Excel import). Creating, updating or deleting products, categories, suppliers and batches leaves **no trace whatsoever**, so shrinkage cannot be attributed and price history cannot be reconstructed for tax.
**Fix:** Route quantity changes through `adjustStockBatch` (delta + reason + user, which already writes adjustments) and drop `quantity` from `updateStockBatch`. Add `logAudit` with before/after values to every mutating handler.

### H14 ✅ FIXED (round 11) — No main-process validation and no CHECK constraints: negative prices and negative stock are storable
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

### H22 — Shift and sale channels are ungated and take the shift/user from the renderer ✅ FIXED (round 10)
**File:** `src/main/ipc/handlers.ts:179,207`, `src/main/ipc/pos-handlers.ts:36`
`SHIFT_START/END/GET_ACTIVE/COMPUTE_EXPECTED_CASH` and `SALE_CREATE` perform no permission check and no ownership validation. Consequently: `endShift({shiftId: <someone else's>, closingCash: 0})` closes another cashier's shift and rewrites their cash figure; with no status check an already-closed shift can be re-closed repeatedly, overwriting `closing_cash`/`ended_at` and duplicating audit rows; `SHIFT_END` returns `{success:true}` when `shiftId` matches nothing (0 rows updated, no audit row) — a pure silent failure; and `SALE_CREATE` takes `user_id`/`shift_id` from the payload, so a sale can be booked against a **closed, already-reconciled** shift and never appear in any cash count.
**Fix:** Resolve the actor from the main-process session, require the permission, add `AND status='active' AND user_id=?` to the End Shift update and throw if `changes === 0`, and look up the caller's own active shift server-side in `createSale`.

### H23 ✅ FIXED (round 11) — PaymentModal and EndShiftModal are taller than the screen; the confirm button is unreachable by touch
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

### H25 — The E2E suite cannot pass and is never run ✅ FIXED (round 11)
**File:** `tests/e2e/pos-workflow.spec.ts`, `.github/workflows/release.yml:26`
The specs target `input[name="username"]`, `input[name="password"]`, `input[name="cashReceived"]` and the strings `Point of Sale` / `Sale Completed` — **none exist**: login is user tiles plus a PIN pad, the password input has no `name`, the cash field is `id="cash-received"`, and the page says "POS Terminal". `beforeEach` is an empty comment stub ("This would insert test products"). CI runs only `npm run publish`, so nothing executes them. The project therefore believes it has regression cover for the POS workflow and has none — which is how the C1–C14 class of defect reached production.
**Fix:** Either repair the selectors and seed fixtures and add a CI job, or delete the suite so it stops implying coverage. Given the money defects above, the first sale-to-receipt test is worth more than any other single change in this report.

---

### H26–H40 — second pass

| # | File | Issue |
|---|------|-------|
| H26 ✅ | `reports.ts:86-90`, `:119-123` | **Sales-report gross profit counts VAT as profit.** `SUM(total − COGS)` uses the VAT-inclusive `total`. A Rs. 1,000 sale at 18% VAT with Rs. 600 COGS reports Rs. 580 profit instead of Rs. 400 — overstated by exactly the VAT liability. The Top Products table in the *same PDF* computes it correctly ex-VAT, so the two tables cannot be reconciled. |
| H27 ✅ | `reports.ts:268-270` vs `:85` | **P&L revenue and Sales-report revenue are different numbers for the same period.** P&L sums `psd.revenue` (ex-VAT, pre-discount); the Sales report sums `sales.total` (VAT-inclusive, post-discount). Neither is net revenue, and if a sale-level discount is ever applied the P&L ignores it entirely. |
| H28 | `reports.ts:197-241` | **Inventory valuation counts expired and depleted batches at full retail**, and values at `products.cost_price` rather than the populated `stock_batches.cost_price`. 500 units of an expired antibiotic at Rs. 85 inflates "Total Stock Value" by Rs. 42,500 of unsaleable goods. |
| H29 ✅ | `google-drive.ts:167`, `scheduler.ts:113` | **Every backup-related settings write throws.** `settings.updated_at` is `NOT NULL` with no default and both writes omit it. So Drive can never be configured, `last_backup_time` is never recorded, and the throw aborts `performScheduledBackup` before retention runs. Every other settings writer in the codebase includes the column. |
| H30 ⚠️ | `google-drive.ts:12-17` | **Drive holds a bare access token in plaintext with no refresh token, no client credentials and no OAuth flow.** Google tokens last ~1 hour, after which uploads 401 forever with the failure reaching only `console.error`. The token is stored in the `settings` table — which is then packed into every backup, so an unencrypted archive contains the credential for the account it was uploaded to. |
| H31 ✅ | `backup-handlers.ts:44-78` | **Backup IPC bypasses the permission middleware.** `BACKUP_DELETE_LOCAL` takes an arbitrary absolute path and `unlinkSync`s it with no permission and no containment check — a cashier session can delete `pharmapos.db` itself. `BACKUP_DRIVE_DOWNLOAD` joins a renderer-supplied filename into a path, so `../../..` escapes the backups directory. |
| H32 ✅ | `database-backup.ts:33-55` | **Disk-full hangs the backup promise and crashes main.** Only `archive.on('error')` is registered; the write stream has none, so `ENOSPC` escalates to an uncaught exception (a modal error box over the sales screen) and the IPC call never settles — the UI sticks on "Creating…" forever. |
| H33 ✅ | `scheduler.ts:62-150` | **Backup failures are invisible.** The whole backup subsystem logs to `console`, never to winston, so a nightly failure lasting months leaves nothing in the log directory, no dialog, no Sentry event, and no UI indicator. |
| H34 ✅ | `main/index.ts:231-244` | **`quitAndInstall()` is blocked by the close guard.** `before-quit` sees `closingConfirmed === false`, calls `preventDefault()` and re-shows the window — while Squirrel has already launched the new process. With no single-instance lock, two processes end up on the same WAL database. Latent only because C20 keeps updates dead. |
| H35 ✅ | `audit.ts:65`, `AuditLogPage.tsx:69` | **Audit timestamps display 5.5 hours early.** `datetime('now')` stores UTC as `"YYYY-MM-DD HH:MM:SS"`, which V8 parses as *local*. A void at 12:00 LKT renders as 6:30 AM, and everything before 05:30 local lands on the previous day. Every other table uses `toISOString()`, so the audit log cannot even be correlated with sales by string comparison. |
| H36 ⚠️ | `audit.ts:3-25` | **13 of 22 declared audit actions are never written.** Missing: all product, batch and user mutations, settings changes, backup create/restore, price changes, void, and failed logins. Password/PIN changes are unlogged; PIN brute-forcing is invisible. |
| H37 ✅ | `pos-handlers.ts:39`, `AuditLogPage.tsx:177` | **Four of the nine emitted actions are attributed to "system".** `logAudit` writes `user_name` only when passed, and sale/refund/stock/import omit it. The viewer renders NULL as *system* and never falls back to `user_id`, so every sale, refund and stock adjustment appears to have been done by nobody. |
| H38 ✅ | `customers.ts:58-77`, `sales.ts:139` | **FIXED (round 10).** **Phone numbers are stored raw**, so `0771234567`, `+94771234567` and `077 123 4567` are three distinct customers past the UNIQUE index — and `createSale` auto-links by exact equality, so a differently-formatted entry silently fails to link and the purchase history is quietly incomplete. |
| H39 ✅ | `customers.ts:35-41,105-152`, `CustomersPage.tsx:100-136` | **FIXED (round 10).** **Customer errors are dead code and there is no erasure path.** The duplicate-phone `UNIQUE` violation rejects the IPC promise, but the handler only checks `result.success === false` — which never happens because create/update return a `Customer` — so the dialog sits there silently. Separately `deleteCustomer` is only a flag flip, and `getCustomerById`/`getByPhone` ignore it, so a "deleted" customer is still fully readable and still auto-links to new sales. |
| H40 ✅ | `ProductsTable.tsx:92` (+3 tables), `InventoryPage.tsx:76` | **Row actions are 32×32px with Delete 8px from Edit, and all rows render at once.** `h-8 w-8 p-0` beats the variant via tailwind-merge, so the effective target is 27% under the minimum with the destructive action adjacent. No pagination or virtualisation anywhere in the four inventory tables — ~10,000 products is ~80,000 DOM nodes in one scroll container. `AuditLogPage` already does this correctly at 50/page. |

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

**Second pass (M23–M32).** `KPICards.tsx:53` computes `total_profit / total_sales` with **no divide-by-zero guard**, so a day with no sales renders "**NaN% margin**" (the neighbouring card guards correctly with `|| 1`). Every date-bounded report uses the **UTC day**, shifting the Asia/Colombo reporting boundary by 5h30m — a monthly VAT return excludes 00:00–05:29 on the first and includes it on the following month's first. `getBackupStatus()` returns `{enabled,lastBackup,nextBackup}` but the renderer casts it to `{running,nextRun}`, so the scheduler dot is permanently grey, "Stop" is unreachable, and repeated clicks silently stack jobs. Retention (`cleanupOldBackups`) can delete the last good archive — manual backups count toward the quota and zero-byte failures are counted as survivors — and Drive-side retention is never called at all. Drive download resolves on the *source* stream's `end` rather than the destination's `finish`, so a restore immediately afterwards can read a truncated file, and there is no upload verification or retry. Nothing validates a backup before overwriting live data: no SQLite header check, no `integrity_check`, no size comparison, and an `.encrypted` archive restored with an empty password fails with an opaque error. The update UI has a dead progress branch, renders "Version **undefined** is ready to install", and forwards update errors to a blocking `alert()` on an hourly poll — a modal freezing the till mid-sale, with no defer option. The audit log has **no indexes at all** and paginates on `ORDER BY timestamp DESC` with no tiebreaker, so rows can be skipped or duplicated between pages; its date/user/entity filters are unreachable from the UI and would not work anyway given H35. Customer purchase history is N+1 with no index on `sale_items(sale_id)` or `sales(customer_id)`, counts fully-refunded sales at full value, and presents a page-limited sum as a lifetime total. Phone and email cannot be cleared once set (`|| undefined` means "leave alone"), and there is no server-side validation of customer input at all.

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

## ✅ Fixed in this session

### Round 11 — a working E2E suite, and the admin password rule

**Reported from the shop floor during a live run of the app:** *"admin account creation still have no password 8+ check."* Correct, and my round-7 note claiming the rule was "enforced in the service so every entry point inherits it" was wrong about this path.

| Item | Change |
|---|---|
| **Setup wizard created the pharmacy's only admin with no account rules at all** | `initializeDatabase` writes the first admin through its own `INSERT` — it has to, because no authenticated user exists yet to pass RBAC — and so inherited none of the checks `createUser` enforces. The "at least 8 characters" line under the field was **copy, never a check**: a one-character password on the account that owns the whole till was accepted, by the wizard *and* by the main process. `assertPasswordStrength` is now exported and called there, alongside username shape (3–32 chars) and non-empty business name and full name. The wizard also validates live, disables **Next** until the password is acceptable, and turns the hint red with the actual reason — so the operator finds out on the field, not after submitting. |
| `INSERT OR IGNORE` swallowed a username collision | The wizard reported success and then nobody could sign in with the credentials they had just chosen. It now checks `changes === 0` and names the taken username. |
| **H25** — the E2E suite could not pass and never ran | It was worse than not existing: it *implied* regression cover for the POS while every selector was fiction. `input[name="username"]`, `input[name="password"]`, `input[name="cashReceived"]`, `text=Point of Sale` — none of those exist. `beforeEach` was an empty comment ("This would insert test products"), the fixture read `src/main/db/schema.sql` which is not a file in this repo, and the launcher pointed at `out/main/index.js` from a build layout the project no longer uses. Deleted and rebuilt: 19 specs across setup, shift guards, customers and a full cash sale. |

| **H23** — the End Shift dialog could not be closed by touch | `max-h` and `overflow` belonged on the base `DialogContent` and were on neither. `EndShiftModal` came to ~842px against the ~696px available on a maximised 1366×768 till, so the whole 48px action row fell off the bottom — and with `onInteractOutside` prevented and the X clipped off the top too, **the shift could not be closed by touch at all**; only a physical Escape key got out. The base now carries `max-h-[90vh] overflow-y-auto`, and both action rows are `sticky bottom-0` so the confirm button stays under the finger however tall the summary grows. That also fixes PaymentModal, where "Complete Sale" started ~215px below the fold and the only thing under the finger in the scroll region was the numpad — a drag inside Chromium's ~8px touch slop registers as a click and injected a stray digit into the amount being confirmed. |
| **H14** — negative prices and negative stock were storable | Nothing validated on the main-process side and the schema carries no CHECK constraints, so a direct IPC call could store a negative unit price — and every total, VAT figure and shift reconciliation downstream of it is then wrong. Money, quantities and names are now validated in `inventory.ts` on **both** the create and update paths (only creates would have been half a fix — an edit stores a negative price just as easily), amounts are rounded to cents on the way in, and implausible magnitudes are rejected as typos. |
| **H12** — expiry dates were never validated | A typo of `2025` for `2035` silently makes a full batch unsellable, because FEFO excludes expired stock; `20265` sorts as a far-future date and defeats every expiry alert the pharmacy relies on. Shape, real-date and plausible-range checks now apply. A **past** expiry is still accepted on purpose — stock does expire on the shelf and the operator has to be able to record what is really there; what is rejected is a date that cannot be true. A blank expiry stores as `NULL`, never `''` (H8). |

**The sale-to-receipt test now exists** — the one the report called worth more than any other single change. It seeds a product and a batch, scans the barcode, tenders cash, then asserts against the database what the UI cannot show: receipt number shape, `total` 25 / tendered 100 / change 75, every stored amount exactly 2dp (C4), stock down by one *in the batch that was dispensed* (H4), `sale_items.cost_price` equal to the batch cost rather than zero or retail (C5), `shift_id` and `user_id` present from the session rather than the payload (H22), and expected drawer cash of 5025 from a 5000 float — cash retained, not cash tendered (C2). Two more cover the guards that have no UI: a sale with no open shift, and an expired-only batch being refused.

**Three things had to be discovered to make Playwright work here**, all now encoded in the harness rather than in someone's memory:

- **The packaged exe cannot be driven.** electron-forge ships with the `EnableNodeCliInspectArguments` fuse disabled, so `_electron.launch()` fails with a bare `Process failed to launch!`. The harness launches the dev Electron binary against the same `.vite/build` output.
- **`ELECTRON_RUN_AS_NODE` is tested for presence, not value.** Passing `''` still boots Electron as plain Node — no window, same opaque launch failure. The key has to be deleted from the child environment. Easy to leave exported after using `electron` to run a one-off script, which is exactly how I hit it.
- **`better-sqlite3` cannot be required from the test process.** It is compiled against Electron's ABI. Fixtures use `node:sqlite`, which ships with the runtime and needs no rebuild.
- **Stale `.vite/build` silently tests the previous commit.** This bit twice — once reporting 5/19 against code I had already fixed. `pretest:e2e` now runs the build, so `npm run test:e2e` cannot test yesterday's bundle.

A fifth thing surfaced only once the specs were green: **`app.close()` never resolves.** The End-Shift close guard answers any quit request with `preventDefault()` and re-shows the window — by design, so Alt+F4 cannot skip the cash count — so Playwright reported a 120-second worker-teardown timeout on runs where every assertion had already passed. Teardown now releases the guard through the same `app:confirm-close` channel the app itself uses when End Shift completes, then closes gracefully. That took the suite from ~13 minutes with three phantom failures to **47 seconds, all green**. Worth knowing outside the tests too: nothing can quit this app programmatically without releasing that guard first, which is exactly why the updater had to (H34).

**Result: 27 specs, all passing, ~1.2 minutes** — setup wizard (5), shift guards (6), customers (5), inventory validation (8), cash sale (3). A new `.github/workflows/ci.yml` runs typecheck and the suite on every push and pull request, on `windows-latest` — a green Linux run would not tell us the shipped artefact works, given native modules and Windows-only Squirrel hooks.

Isolation: every test gets its own `--user-data-dir` *and* its own `TEST_DB_PATH`, so a run can never touch the operator's real database. Verified — the live file's mtime is unchanged across every run in this session.

### Round 10 — customers and the last of the native dialogs (`5a5a184` onward)

**Verified by driving the running app**, not just by typecheck: the built main process was launched under an isolated `--user-data-dir` (the live pharmacy database was never opened) and walked through setup wizard → login → start shift, then each guard was exercised over the real IPC bridge. 20/20 checks pass, no page errors. The single-instance lock was checked with two real processes against one profile: the second launch exits in ~1s and the process count does not change.

This is also how the `%`-search overstatement above was caught — the fix was real but narrower than first written up, and only running it showed that.


| Item | Change |
|---|---|
| **H38** — phone numbers stored raw | `0771234567`, `+94771234567`, `0094771234567`, `94771234567`, `771234567` and `077 123 4567` all normalise to one canonical `0771234567`, on write *and* on lookup. They were six distinct customers as far as the UNIQUE index was concerned, and `createSale` linked by exact string equality — so a sale rung up with the number written differently silently failed to attach, and the purchase history a pharmacist reads before dispensing was quietly incomplete. Verified across 12 input forms; the deployed store has no customers on file yet, so nothing needed migrating. |
| **H39** — dead error handling, and no erasure path | `CustomersPage` checked `result.success === false`, but the handlers report failure by *throwing* and create/update return a `Customer` — so the branch could never run and a duplicate phone or a permission error closed the dialog as though it had saved. Every mutating call site now catches, and a duplicate number gets its own message rather than raw SQLite text. Validation moved out of the renderer into the service, so a direct IPC call can no longer create a customer named `"   "`. Search has `%` and `_` stripped, so a name fragment containing one no longer matches rows the operator never typed; a term made up *only* of wildcards now falls back to the unfiltered list, which is what the empty search box already shows. (Stripping alone did not fix that case — an empty term still `LIKE`-matched everything. Caught by driving the running app.) `getCustomerByPhone` and the till's auto-link now filter on `is_active`, so a removed customer stops collecting history. |
| **H39 (erasure)** — "deleted" customers were fully readable | `deactivateCustomer` only flipped a flag, and `sales` keeps its own denormalised copy of the name and phone on **every** transaction — so a customer who asked to be removed was still in the file, still on each of their receipts, and still in every backup taken since. New admin-only `customers:erase` destroys the identifying fields in one transaction, including the copies on sales rung up before the customer record existed, and writes a `CUSTOMER_ERASED` audit entry naming who did it. The sale rows themselves are kept and re-pointed at a placeholder: they are accounting records that the stock, VAT and shift totals all depend on. Verified on a database copy — personal data gone, 3 sales kept intact with totals and status untouched, no re-link. |
| **~21 native `confirm()`/`alert()` calls, and L11's second half** | All gone. Chromium renders them as OS modals with ~24px buttons at the top of the window, they block the renderer thread — so a barcode scanned while one is open is lost — and on a kiosk-mode till they can surface behind the customer display. Replaced with a promise-based `useConfirm` hook over the existing 44px `AlertDialog`, and with inline banners where a modal was overkill (printer setup, setup wizard, user form). Each prompt now says what will actually happen instead of "Are you sure?" — Remove vs Erase, which deletes refuse and why. The `alert(error.message)` sites that printed **`undefined`** for a non-`Error` throw now go through a shared `ipcErrorMessage()` that also strips Electron's `Error invoking remote method '…':` wrapper. |
| **H22** — shift and sale channels ungated, actor taken from the renderer | `SHIFT_START` took the user id from the payload, `SHIFT_END` took any `shiftId` with no permission, ownership or status check, and `SALE_CREATE` took `user_id` and `shift_id` verbatim. So a renderer could open a shift in another cashier's name; close someone else's shift and rewrite their cash figure; re-close an already reconciled shift, silently overwriting `closing_cash` and `ended_at` and duplicating audit rows; and book a sale against a **closed, already-counted** shift, where no cash reconciliation would ever see it. `SHIFT_END` also returned `{success:true}` when the `shiftId` matched nothing at all — a pure silent failure. All three now resolve the actor from the session and are gated on `shifts:manage` / `sales:create`; End Shift is scoped to `AND status='active'` and throws when zero rows change; a cashier may close only their own shift while a manager may close anyone's; and a user may hold only one open shift. `SHIFT_GET_ACTIVE` ignores its argument and returns the caller's own shift. Verified on a database copy: re-close rejected with `closing_cash` intact at 4800, nonexistent shift reports no change, a closed shift no longer resolves as active, cashier-closing-another-cashier refused. |
| **H34** — `quitAndInstall()` blocked by the close guard, and no single-instance lock | No longer latent: C20 made updates live. `before-quit` saw `closingConfirmed === false`, called `preventDefault()` and re-showed the window *while Squirrel had already launched the replacement* — two processes on one WAL database with two independent receipt-number generators handing out the same receipt number. The flag moved into `src/main/shutdown.ts` so the updater can release it, and the database is now closed **before** `quitAndInstall()` rather than in the `before-quit` cleanup, because Squirrel starts the incoming process the moment this one exits and we do not get to pick the order. Separately, `app.requestSingleInstanceLock()` now guards real launches (Squirrel's own hooks exit before reaching it) and `second-instance` brings the running till forward — double-tapping the shortcut used to look like nothing had happened, so the operator tapped again. |
| **H30 (partial)** — Drive credential in plaintext, failures silent | The token is now DPAPI-wrapped via `safeStorage`, like the recovery key, and any plaintext copy an earlier version left is migrated or dropped on first read. That closes the worst half: the plaintext form lived in the `settings` table, which is packed into every backup, so an archive uploaded to Drive carried the credential for the account it had just been uploaded to. Every Drive call now goes through a wrapper that treats 401/403 as "the sign-in expired", forgets the dead credential and surfaces a reconnect message — the failure previously reached only `console.error`, so backups appeared to be going off-site when they had not for weeks. `last_backup_error` is written on upload failure and the Settings page already renders it. Also fixed here: the download resolved on the *source* stream's `end` rather than the destination's `finish`, so a restore run immediately afterwards could read a truncated file. **Still open:** there is no OAuth consent flow, client credentials or refresh token, so the operator must reconnect roughly hourly. That needs a registered Google Cloud OAuth client — see [What I need from you](#what-i-need-from-you). |
| Update-failure modal over a live till | The hourly update poll forwarded errors to a blocking `alert()`, so a background download problem could freeze the screen mid-sale. It is now a dismissible line inside the update card with a "Try again" button, and the install prompt spells out that the till closes immediately and the cart is lost — it previously said only "Continue?". "Version **undefined** is ready to install" is fixed too. |

### Round 2 — remediation (commits `75436fa`, `0851dba`, `d610807`)

| Item | Change |
|---|---|
| **C15, C17, C18, C19, H29, H31, H32, H33** — no working disaster recovery | `getDatabasePath()` is now the single definition of the database filename. Backups use `VACUUM INTO` (transactionally consistent, WAL-inclusive) instead of copying a live file, and every archive is verified — SQLite header, `integrity_check`, schema probe — before being offered. Restore validates the archive, snapshots the current DB, closes the connection, removes `-wal`/`-shm`, swaps, then relaunches via a new `app:relaunch` channel. The scheduler starts at launch and stops on quit, `backup_enabled` is opt-out with a writer, and a catch-up runs when a window was missed with the machine off. Retention keeps N *valid* archives and never deletes the newest good one. Backup IPC is permission-gated with path containment. `window.prompt()` replaced with an in-app dialog. |
| **C20** — updates and Sentry dead in the shipped app | Gated on `app.isPackaged`, not `NODE_ENV`. |
| **C23, H35, H37** — audit entries silently vanishing | `logAudit` retries with a null actor plus `claimed_user_id` when the FK rejects, and logs a genuine loss. Timestamps stored as ISO-8601 UTC (were rendering 5.5h early). `user_name` resolved so entries stop showing as "system". |
| **C6** — every card sale blanked the app | `card_amount` → `card_received`, guarded, plus an `ErrorBoundary` around `MainLayout` so a render fault degrades to a readable message. |
| **R5** — card payment toggle | `card_payment_enabled` setting with a Cash-only / Cash & Card control. Hides the Card button, falls back to cash mid-entry, and `createSale` rejects non-cash when off. |
| **H1, M12** — print failures invisible | The IPC result is inspected (it resolves `{success:false}` rather than rejecting, so the old catch never fired) and shown with a retry. A second print is marked `*** REPRINT ***`. |
| **C2** — drawer overstated by the day's change | `SUM(cash_received - COALESCE(change_given,0))`. Added `computeShiftCashSales` so the tile can show cash taken rather than cash tendered. |
| **C4** — money never rounded | New `src/shared/money.ts` (`round2`, `isAtLeast`) applied across `calculations.ts` and the sales service. Tender comparison gained a half-cent tolerance, so exact cash is no longer rejected. Discounts clamped to 0…subtotal and 0…100%. |
| **C5** — profit was revenue | COGS now comes from the batches actually dispensed, weighted by quantity, falling back to `products.cost_price`. KPI shows "Cost price not set" rather than a fictitious 100%, and no longer renders "NaN% margin" on a zero-sales day. |
| **C1** — analytics multiplied by transaction count | The cartesian join is gone from `getDailyMetrics` and `getPeriodMetrics`; transaction count is a scalar subquery. |
| **C10** — expired stock sellable | `deductStockFEFO` excludes expired batches, so expired stock cannot be dispensed even if the UI is bypassed. |
| **C24, H3** — voids never reversed | `voidSale` runs in a transaction that returns stock to the originating batch, reverses the daily rollup and writes a `SALE_VOIDED` audit entry. `runIncrementalAggregation` re-aggregates a rolling 7-day window instead of being a permanent no-op. `getTodaySalesTotal` filters `status='completed'` and is scoped to the shift, not the UTC day. |
| **M8** — settings load failure silent | `loadSettings` has a `catch` and a `loadError`; it previously left `isLoading` true forever and computed tax from the 0% fallback all day. |

### Round 3 (commits `ba57e9d`, `01006ed`)

| Item | Change |
|---|---|
| **C14** — no migration versioning | Migrations are tracked with `PRAGMA user_version` and each runs in a transaction. An existing database is adopted as version 1 without re-running the baseline. **Verified against a copy of the deployed database**: 0 → 1 → 2, all 257 products / 2 sales / 4 line items intact, `integrity_check` ok, second run a no-op. Migration 2 adds the void columns, `cash_movements`, nine indexes on full-scanned hot paths, and repairs the empty-string expiry rows (H8). |
| **R3** — no mid-shift cash in/out | `cash_movements` table, a Cash In / Out button on the POS status bar with a numpad dialog, and the movements are now part of the reconciliation: `expected = opening + Σ(cash_received − change_given) + cash_in − cash_out`. End Shift lists cash added and removed, and the Cash Sales tile backs both the float and the movements out so it shows cash *taken*, not cash tendered. |
| **C24 (completion)** | `voided_by` / `voided_at` are now real columns, so void attribution no longer depends on the audit log alone. |
| **C8** — duplicate sales | An in-flight ref latch in `handleComplete`. `processing` only disabled the button and the numpad's global Enter bypassed it, so key-repeat re-entered during the stock-recheck await and committed the sale twice. |
| **C9** — scanner input reaching dialogs | `CashNumpad` and `PinPad` ignore OS key-repeat and discard keys arriving <30ms apart (scanners emit at 1–5ms). `PinPad` gained the input/textarea guard it never had. |
| End Shift accepted a blank count on a stray Enter | Requires a closing count, explains why, and is re-entrancy guarded. |
| Overlay tap discarded a keyed-in payment | `PaymentModal` no longer dismisses on outside interaction; capped at 90vh. |

### Round 4 — the VAT model and install-time migrations (commit `e9dfeb0` onward)

| Item | Change |
|---|---|
| **H2** — cash drawer, and a regression I introduced | Decoupling the drawer from the receipt in round 2 removed `cashdraw` from the print stream without adding the replacement, so the drawer stopped opening entirely. `printer.openDrawer()` now fires straight after the sale commits for cash and mixed payments, so the till opens whether or not the cashier prints and a paper fault cannot lock it. |
| **Migrations now run at install time** | Squirrel runs the executable with `--squirrel-install` / `--squirrel-updated`; nothing handled those, so the app briefly opened a full window during every install and update. The hook is now handled: it migrates the database, manages shortcuts and exits without booting the UI. The startup check remains as the safety net — see [How migrations run](#how-migrations-run). |
| **C13** — refund-with-restock always threw | The write to `products.stock_quantity` — a column that does not exist — raised inside the transaction and rolled the entire refund back *after* cash had been handed over the counter. Stock now goes back into the **originating** `sale_items.batch_id`, so expiry tracking stays truthful. |
| **C25** — refunds net of VAT and invisible everywhere | Refunds are now priced from the original sale rather than the caller's payload (which was trusted verbatim), VAT is apportioned and stored in a new `tax_refunded` column, cumulative quantities are validated against what was actually sold, the sale flips to `refunded` once nothing remains refundable, the daily rollup is reversed, and the cash paid out is subtracted from the drawer via a new `sale_refunds.shift_id` — refunds hit the drawer of the shift that processes them, not the sale's shift. Verified on a copy of the live database: over-refund rejected, stock returned to the right batch, rollup reversed, drawer expectation Rs. 2831.70 → Rs. 2746.75 after an Rs. 84.96 refund. |


**Operator decision:** prices are entered tax-inclusive (shelf/MRP), one global rate applies to everything, existing sales are left as-is.

| Item | Change |
|---|---|
| **C3** — two contradictory VAT models | VAT is now **extracted, never added**, everywhere: `VAT = gross − gross/(1+rate/100)` and `total = subtotal − discount`. `createSale` reads the rate server-side, computes VAT per line, and sets the header to the sum of the lines, so the two reconcile by construction. A default install previously charged Rs. 135.70 for a Rs. 115.00 MRP pack and recorded a header VAT against zero line-item VAT. |
| **H26** — VAT counted as profit | The Sales Report computed `SUM(total − COGS)` on a VAT-inclusive total, booking the pharmacy's VAT liability as profit. Profit is now on net revenue, in both the summary and the daily breakdown. |
| **H27** — two revenue definitions | `product_sales_daily.revenue` is consistently net of VAT in both the live write and the batch aggregation, and the Sales Report now exposes gross, VAT and net side by side — so it reconciles to the drawer *and* to the P&L. |
| Cart/receipt wording | Labelled `incl. VAT (x%)` so it cannot be read as an additional charge; hidden entirely at 0%. |

A test caught a genuine rounding split during this work: extracting VAT from the subtotal gave `117.46` on the real basket `R-2026-003849`, while summing per line gave `117.45`. The cart now sums per line, matching how the sale is stored, so cart, line items and header agree to the cent. Verified that `net + VAT == gross` and that 0% — the deployed store's setting — is a complete no-op.

### Round 7 — auth hardening and inventory accuracy (`87c7d3c`, `816fdd6`)

| Item | Change |
|---|---|
| **H21** — PIN brute-forcing | Migration 4 adds `failed_attempts` and `locked_until`. Login escalates 3 failures → 30s, 5 → 2min, 8+ → 15min, resets on success, and audits `USER_LOGIN_FAILED` / `USER_LOCKED_OUT`. Exhausting the 10,000-PIN space now costs ~2,500 hours instead of minutes. |
| **H20** — last-admin guard bypassable | `deactivateUser` had the guard; `updateUser` did not, so demoting the only admin to Cashier — or `is_active = 0` via the update path — locked everyone out permanently with no in-app recovery. Extracted `assertNotLastAdmin()` and applied it to all three paths. |
| Password and PIN rules | Enforced in the service so every entry point inherits them: 8-character minimum, must not equal the username, PIN 4–6 digits. The change-password dialog only rejected whitespace, and the wizard's "at least 8 characters" copy was never checked. |
| **H36** (users) — no audit trail | `USER_CREATED`, `USER_UPDATED` and `USER_DELETED` were declared but never emitted, so creating an admin or resetting a password left no record — which is what made the privilege-escalation holes undetectable. Now emitted with the changed fields and role transition, never the secrets. |
| **H7 / H9** — wrong stock everywhere on the POS | `searchProducts`, `getProductByBarcode` and `getQuickItems` counted depleted and expired batches as sellable, and took `nearest_expiry` from batches sold out years ago — which is why good stock showed a red EXPIRED banner and staff learned to ignore it. `getQuickItems` also multiplied stock by the number of days the product had sold on. Verified on live data: a product with 60 + 40 sellable, 25 expired and one empty batch, sold on three days, reported **375 units and 24 sales**; it now reports the correct **100 and 6**. |
| **H10** — category rename impossible | The handler passed an object into a three-argument signature, so better-sqlite3 threw and the dialog silently sat there. Now object-shaped, and it persists `parent_id`. |
| **H15** — CSV corruption and formula injection | Quoting alone does not escape an embedded quote, so `6" Crepe Bandage` shifted every column after it; a leading `=`/`+`/`-`/`@` was evaluated by Excel. Cells are escaped and prefixed, and the file carries a UTF-8 BOM. |
| **H11** — silent saves that wiped the form | Submit handlers acted only on success while the dialogs always `reset()`, so a duplicate barcode blanked everything with no message. Handlers now throw and the dialogs keep the input and show why. |

### Round 6 — backup confidentiality (commit `541feb8`)

| Item | Change |
|---|---|
| **C22** — PII uploaded in the clear | An unencrypted archive holding the full customers table, every line item linking a named customer to the medicines dispensed to them, and the users table with password and PIN hashes was the *default* payload — sitting in `%APPDATA%` and streamed to Google Drive as-is. Encryption is no longer optional, and the plaintext intermediate is removed in a `finally`, including on the failure path where it previously survived. |
| **C21** — encryption key never persisted | The password was never stored, so an encrypted archive was unrecoverable the moment it was mistyped; and the scheduler read a `backup_password` setting that no code ever wrote, so every scheduled backup would have been unencrypted anyway. Replaced with a recovery key stored only in `safeStorage` (DPAPI) form. **It is deliberately also transcribable** — a purely machine-bound key would make every archive unreadable the moment the POS dies, which is the disaster backups exist for. Restore tries this machine's key first, then an operator-entered recovery key, so replacement hardware works. |
| Container format | Versioned: `[magic][version][iterations][salt][iv][tag][ciphertext]`, standard 12-byte GCM nonce (was 16), PBKDF2 raised to 200k. The KDF cost can now be raised later without orphaning archives, and a non-backup file fails with a clear message. |

Verified: round-trips; none of the customer name, phone, address, `admin`, `$2b$10$` or `customers` appears anywhere in the ciphertext; tampered ciphertext and wrong keys fail closed; non-backup input is rejected.

### Round 5 — authorisation and credentials (commit `6ea0576`)

| Item | Change |
|---|---|
| **C11** — authorisation trusted the renderer | `withPermission` took a `userId` off the IPC payload, and `auth:getUsers` hands out every user's id and role *before* login — so any renderer context could act as the admin across all 55 gated channels. The authenticated user now lives in `src/main/ipc/session.ts`, keyed to the calling webContents, set only by a successful login and cleared by a new `auth:logout`. All 55 call sites converted; audit entries and service calls use `actingUserId(event)`, so the trail names the real actor. Sessions are pruned when a renderer is destroyed. |
| **C12** — PIN hash shipped to the renderer | Login stripped `password_hash` but left `pin_code`, and `USER_LIST` returned it for everyone. bcrypt over a 4-digit PIN is 10,000 candidates — the admin's PIN was recoverable offline in minutes with no failed-login trace. Both now return `pin_set: boolean`. The legacy plaintext comparison branch is also gone. |
| **H19** — editing a user destroyed their PIN | The form was prefilled from that field, so saving any unrelated change sent the bcrypt hash back as the new PIN and re-hashed it. The field is now always blank, submitted only when typed, and validated as 4–6 digits. |
| `auth:createUser` was an open admin factory | Accepted any role at any time with no check. Now first-run only, refuses once any user exists, forces `admin`, and writes an audit entry. |
| `settings:set` was completely ungated | `setSetting('vat_rate','0')` from any renderer changed the tax on every subsequent sale. Now gated on `settings:update`, whitelisted by key, validates the VAT rate, and emits `SETTINGS_UPDATED` with before/after values. |

### Receipt output — from three scanned bills of the deployed store

Analysed real printed receipts from Nirogya Medical Center (`docs/bill-outputs.pdf`).

| Defect seen on the bill | Fix |
|---|---|
| `Azithromycin- 50` — name truncated to the 16-char column | Long names print in full on their own line with figures aligned underneath. A pharmacy receipt must never hide the strength dispensed. |
| Every amount sat one column short of the separator rules | Amount rows were 29+12 = 41 against 42-wide rules. Columns now sum to exactly the printer width. |
| `Date: 7/18/2026, 10:03:06 AM` — US format | Explicit `DD/MM/YYYY HH:MM`, identical in both processes. The printer used `toLocaleString()` with no locale; the preview used `en-LK`. |
| Grand total truncated above Rs. 10,000 (C7) | The double-width row no longer clips the amount. Verified: Rs. 125,000.50 prints intact. |
| Card receipts showed no amount; mixed derived it from `total − cash` | Both read `card_received`. |

**Preview and print are now the same document.** Both build from a new `src/shared/receipt.ts`. They had drifted on date format, separators (the preview used Unicode box-drawing that the CP437 encoder renders as `?`), the `Receipt:`/`Receipt #:` label, blank lines, the customer block position and the card amount. The preview also reads `printer_width` from settings, so a 58mm/32-column configuration previews at 32 columns.

### Round 1

| Item | Change |
|---|---|
| **C16** — nightly job wiped analytics | `jobs/aggregation.ts` repointed from the broken `services/analytics.ts` duplicate to the working `services/analytics/aggregation.ts`; the duplicate deleted (no other importers); date arithmetic made UTC-consistent. **This was destroying data every night.** |
| **AI insights removed entirely** | Deleted `services/ai/`, `ipc/ai-handlers.ts` and the dead `components/analytics/AIInsightsPanel.tsx`; removed the Analytics AI tab and its inline panel, the Settings AI tab and Gemini key handling, the preload `ai` surface, the AI IPC channels, the `AIInsight` type and store state; dropped `@google/generative-ai`. No pharmacy or customer data can now leave the machine via AI. |
| Stock-batch picker could not be scrolled by touch | Selection moved `onPointerDown` → `onClick`. Pointerdown fires the instant a finger lands, so dragging to scroll selected whichever row was under the initial touch; the existing 150ms blur delay outlives the click. |
| Stock-batch picker showed nothing on an empty search | An empty box now browses the whole catalogue, as does re-focusing after a selection; capped at 100 rows with a "keep typing to narrow" hint. |
| Batch picker rows / list sizing | Rows `min-h-11`, list `max-h-64` with `overscroll-contain`. |
| **L11** — `(null)` SKU | Guarded via a shared `productLabel()` helper. |
| `Button` `sm` variant was 40px | Raised to `h-11`. The file comment claimed every variant met the 44px minimum; `sm` did not, and it is used for most primary actions on the Inventory and Audit pages. |

Verified after the changes: `npm run typecheck` clean (node + web), renderer bundles via `vite build`.

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

## How migrations run

Schema versions are tracked in the database itself with `PRAGMA user_version`. `src/main/db/index.ts` holds an ordered `MIGRATIONS` array; each entry runs inside a transaction and bumps the version in the same transaction, so a migration either fully applies or does not apply at all.

There are **two** trigger points, deliberately:

1. **At install/update (Windows, Squirrel).** Squirrel launches the installed exe with `--squirrel-install` or `--squirrel-updated`. `handleSquirrelEvent()` in `src/main/index.ts` intercepts this, calls `migrateDatabaseOnly()` (open → migrate → close), manages the desktop shortcut, and exits **without creating a window**. So by the time the pharmacy opens the new version, the schema is already current.
2. **At every startup**, as the safety net. `initializeDatabase()` → `initDb()` re-checks `user_version` and applies anything outstanding.

Keeping both matters. The install hook alone is not sufficient because it has a time limit and can be killed, a zip/portable build never runs Squirrel hooks at all, and **restoring an older backup puts an out-of-date database under a current app** — only the startup check catches that. Because `initDb` is version-guarded, the second check costs one `PRAGMA` read when there is nothing to do.

**Behaviour on an existing database.** A database created before versioning existed reports `user_version = 0`. The runner probes for a known table: if the schema is already there it is adopted as version 1 *without re-running the baseline*, then later migrations apply normally. Verified against a copy of the deployed database — 0 → 1 → 2 with all rows intact and `integrity_check` returning `ok`.

**Adding a migration.** Append to `MIGRATIONS` with the next version number and idempotent DDL (`IF NOT EXISTS`, additive columns), and update `src/main/db/schema.ts` to match. Never edit `0000_chilly_alice.sql` — it is the baseline for fresh installs only, and changing it would desync every machine already in the field.

**Two caveats worth knowing.** A migration that fails at install is logged and swallowed so it cannot brick the installer; the startup path then retries and surfaces the error. And `app.exit(0)` is used rather than `app.quit()` in the hook, because the End-Shift close guard would otherwise trap the installer process.

---

## 🏗️ Build, CI, dependencies

- **CI runs no tests and no lint.** `release.yml` runs `npm ci --legacy-peer-deps` then `npm run publish`. Typecheck runs (it's chained into `publish`); lint and Playwright do not. `--legacy-peer-deps` is also now unnecessary.
- **Operator decision (2026-08-03): dependency versions are to be left as they are.** The advisories below are therefore accepted risk, not outstanding work. Revisit if `drizzle-orm` or `jspdf` is bumped for another reason — a Drizzle minor can change query behaviour, so the money verification should be re-run afterwards.
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

## Coverage

Both passes together cover the entire codebase: the POS cart and money math; payment, sale persistence, receipts, printing, drawer and pole display; auth, session, shift lifecycle, RBAC, user management and first-run setup; inventory, products, categories, suppliers, batches, import/export, schema and migration; the full analytics and reporting layer including P&L and inventory valuation; backup, restore, scheduling, Google Drive, encryption, logging and auto-update; the audit log and customer registry; the shared UI primitives and every screen for touch; and build, CI, dependencies and the test suite.

**There is no remaining unreviewed area.** The gaps listed after pass 1 — backup/Drive/scheduler, AI insights, audit and customer services, report generation, logging/auto-update, and the admin-screen touch pass — have all been closed by pass 2, except AI insights, which was removed outright rather than reviewed.

One caveat on confidence: every finding is derived from source, and the ones marked *Reported from the running app* or *verified on live data* were additionally reproduced against the operator's database. Nothing here has been validated on the physical POS hardware — printer, drawer, pole display and scanner behaviour are reasoned from the code.

---

## Suggested order of work

**Done (36 findings + 2 requirements):** C1, C2, C3, C4, C5, C6, C7, C8, C9, C10, C14, C15, C16, C17, C18, C19, C20, C23, C24, H1, H3, H8, H26, H27, H29, H31, H32, H33, H35, H37, M8, M12, plus several Medium touch/UX items, R3 and R5, the receipt layout, AI removal and the batch-picker fixes.

**Next, in order:**

1. **H16, H17** — Excel import discards expiry date, batch number, category and supplier, mangles numbers and can half-apply. It is how a pharmacy loads its catalogue, so it is the largest remaining hole.
2. **H5, H13** — unlimited refunds beyond what was sold, and batch quantity rewritable with no adjustment record.
3. **H28** — inventory valuation counts expired and depleted batches at full retail.
4. **H18, H6** — 10k-product touch performance, and the dead graphical customer display.
5. **H30 (rest)** — a real Google Drive OAuth flow. Blocked on a registered OAuth client; see [What I need from you](#what-i-need-from-you).
6. Dependency bumps: `drizzle-orm` ≥0.45.2 and `jspdf` >4.2.0 both ship with published advisories. **Held at the operator's instruction** until after the current update is pushed.

### Original order (retained for reference)

1. **C15, C17, C18, C19** — backup and restore as one piece of work. Right now there is *no* working disaster recovery: backup targets the wrong filename, the scheduler never starts, restore corrupts the DB by leaving a stale WAL, and the restore dialog throws. Everything below is safer once a restorable, verified backup exists.
2. **C20** — one-line gate change (`app.isPackaged`, not `NODE_ENV`). Until it lands the pharmacy can never receive any of these fixes, and no crash is ever reported.
3. **C6 + R5** — the card-sale crash and the card-payment toggle.
4. **C2 + R3** — change-given plus mid-shift cash in/out, in the same function.
5. **C1, C5, C24, C25, H26, H27** — the reporting layer as one piece: the fan-out join, the cost basis, void and refund reversal, and picking a single revenue/profit definition. Fixing these piecemeal will not make the reports agree with each other.
6. **C4, C3** — rounding (mechanical), then choose one VAT model. C3 needs a pricing decision before code.
7. **C14** — must land before the next release ships a migration.
8. **C21, C22** — encrypt backups unconditionally and stop uploading PII in the clear.
9. **C7, C8, C9** — sale integrity and the printed total.
10. **C11, C12, C10, C23, H24** — the main-process session (which also retires H24 and makes the audit trail trustworthy), then hash exposure, then the expiry block.
11. **R1 + R2 + H4** — per-batch pricing and batch history together.
12. **H25** — a sale-to-receipt E2E test, so none of the above can silently regress.
