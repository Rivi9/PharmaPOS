# PharmaPOS — Drizzle ORM + RBAC + Schema Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace raw-SQL data layer with Drizzle ORM, fix all 22 schema issues, enforce RBAC at every IPC handler, fix business logic bugs, add customer history at POS, merge AI nav into Analytics.

**Architecture:** Drizzle wraps existing better-sqlite3 instance (no new process). `src/main/db/schema.ts` is the single source of truth. `drizzle-kit generate` produces a SQL migration file imported via `?raw` and applied at startup (same pattern as old schema.sql). All services rewritten with Drizzle typed queries. `withPermission()` middleware wraps every gated IPC handler. Frontend gates use a `usePermission` hook.

**Tech Stack:** Electron 39, electron-vite 5, React 19, better-sqlite3 12, drizzle-orm, drizzle-kit (dev), bcryptjs, Zustand, TypeScript 5.9

**Design doc:** `docs/plans/2026-02-17-drizzle-rbac-schema-overhaul.md` — read this before starting for full schema definitions and rationale.

---

## Phase 1: Drizzle Foundation

### Task 1: Install packages

**Step 1:** `npm install drizzle-orm`
**Step 2:** `npm install --save-dev drizzle-kit`
**Step 3:** Verify: `npx drizzle-kit --version` → prints version
**Step 4:** Commit: `chore: install drizzle-orm and drizzle-kit`

---

### Task 2: Create drizzle.config.ts

**File:** `drizzle.config.ts` (root)

```ts
import { defineConfig } from 'drizzle-kit'
export default defineConfig({
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations',
  dialect: 'sqlite',
  dbCredentials: { url: './dev.db' }
})
```

**Commit:** `chore: add drizzle-kit config`

---

### Task 3: Create src/main/db/schema.ts

**File:** `src/main/db/schema.ts` — replaces `schema.sql`

Write all table definitions using `sqliteTable()` from `drizzle-orm/sqlite-core`.
Full table specs in design doc Section 4.1. Key changes vs old schema:
- `shifts`: remove `expected_cash` column
- `stock_batches.quantity`: `real()` not `integer()`
- `sales`: `shift_id NOT NULL`, `customer_id` FK added directly
- `customers`: remove `loyalty_points`, add `email` unique
- `product_sales_daily`: composite PK `(date, product_id)` — no UUID id
- Add `inventory_adjustments` table
- Add `sale_refunds` table

Export inferred types at bottom:
```ts
export type User = typeof users.$inferSelect
export type Sale = typeof sales.$inferSelect
// ... all tables
```

**Type-check:** `npx tsc --noEmit`
**Commit:** `feat: add drizzle schema, all 22 schema fixes applied`

---

### Task 4: Generate + edit migration SQL

**Step 1:** `npx drizzle-kit generate`
→ Creates `src/main/db/migrations/0001_initial.sql`

**Step 2:** Open the generated SQL and append manually (drizzle-kit cannot generate these):
```sql
-- Partial unique index: one active shift per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_active_user
ON shifts(user_id) WHERE status = 'active';

-- Ensure stock_batches.quantity has CHECK constraint
-- (edit the CREATE TABLE stock_batches line to add CHECK(quantity >= 0) on quantity column)

-- Missing composite indexes
CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_shift_status ON sales(shift_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_user_created ON sales(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_product_expiry ON stock_batches(product_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_batches_batch_number ON stock_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_inventory_adj_product ON inventory_adjustments(product_id);
```

**Step 3:** Append seed data at end of migration SQL:
```sql
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('business_name', 'My Pharmacy'),
  ('vat_rate', '18'),
  ('currency_symbol', 'Rs.'),
  ('receipt_footer', 'Thank you for your purchase!'),
  ('display_port', ''),
  ('display_baud_rate', '9600'),
  ('business_address', ''),
  ('business_phone', '');

INSERT OR IGNORE INTO categories (id, name, description) VALUES
  ('cat-medications', 'Medications', 'Prescription and OTC medications'),
  ('cat-pain-relief', 'Pain Relief', 'Painkillers and anti-inflammatory'),
  ('cat-cold-flu', 'Cold & Flu', 'Cold, flu, and allergy medications'),
  ('cat-first-aid', 'First Aid', 'Bandages, antiseptics, first aid supplies'),
  ('cat-personal-care', 'Personal Care', 'Hygiene and personal care products'),
  ('cat-vitamins', 'Vitamins', 'Vitamins and supplements');
```

**Commit:** `feat: add initial drizzle migration with all schema fixes and seed data`

---

### Task 5: Create src/main/db/index.ts + update database.ts

**File 1:** `src/main/db/index.ts`

```ts
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import migrationSql from './migrations/0001_initial.sql?raw'

export type DB = BetterSQLite3Database<typeof schema>
let _db: DB | null = null

export function getDb(): DB {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

export function initDb(sqlite: import('better-sqlite3').Database): DB {
  // Apply migration SQL (same pattern as old schema.sql?raw)
  sqlite.exec(migrationSql)
  _db = drizzle(sqlite, { schema })
  return _db
}
```

**File 2:** Update `src/main/services/database.ts` — replace `schemaSql` import and `database.exec(schemaSql)` call with `initDb(sqlite)`. Keep `getDatabase()` for raw transactions. Remove column migration try/catch block.

**Type-check:** `npx tsc --noEmit` (expect errors from services — fixed in Phase 2)
**Commit:** `feat: wire drizzle into database initializer`

---

## Phase 2: Service Rewrites

> **Pattern for all services:** Import `getDb` from `'../db/index'`, import table refs and types from `'../db/schema'`, use `eq/and/or/like/desc/asc/sql` from `'drizzle-orm'`. For transactions, use `getDatabase().transaction(() => { ... })()` — Drizzle queries work inside raw better-sqlite3 transactions.
>
> Every `UPDATE` call MUST include `updatedAt: new Date().toISOString()` for tables that have `updated_at`.

---

### Task 6: Rewrite users/user-management.ts (+ PIN hashing)

**File:** `src/main/services/users/user-management.ts`

Key changes vs current:
- All `db.prepare(...).get/all/run()` → Drizzle query builder
- `createUser`: hash PIN with `bcrypt.hash(pin, 10)` before storing
- `updateUser`: hash new PIN if provided
- `verifyPinCode`: fetch all users with PIN, iterate `bcrypt.compare()` (cannot do bcrypt in SQL)
- `deactivateUser`: use Drizzle count to check last admin
- Every update includes `updatedAt: now()`

**Type-check + commit:** `feat: rewrite user-management with drizzle + bcrypt PIN hashing`

---

### Task 7: Rewrite products.ts

**File:** `src/main/services/products.ts`

Key changes:
- `searchProducts`: use `or(like(...))` with `and(eq(isActive, 1))`; stock subquery via `sql\`...\``
- `getQuickItems`: 7-day sales subquery via `sql\`...\``
- `getLowStockProducts`: subquery for stock total, filter where stock <= reorderLevel
- `createProduct`, `updateProduct` (with `updatedAt`), `deleteProduct` (soft delete with `updatedAt`)

**Type-check + commit:** `feat: rewrite products service with drizzle`

---

### Task 8: Rewrite inventory.ts (+ fix inventory_adjustments)

**File:** `src/main/services/inventory.ts`

Key changes:
- All category/supplier/stock batch CRUD → Drizzle
- `adjustStockBatch`: no more try-catch swallow — writes to `inventory_adjustments` table for real
- `deleteCategory`: check for active products before allowing delete
- `deleteStockBatch`: check quantity = 0 before allowing delete

**Type-check + commit:** `feat: rewrite inventory with drizzle, fix inventory_adjustments tracking`

---

### Task 9: Rewrite customers.ts

**File:** `src/main/services/customers.ts`

Key changes:
- Standard CRUD with Drizzle
- Add `getCustomerPurchaseHistory(customerId, limit = 10)`:
  - Query recent sales by `customer_id`
  - For each sale, join `sale_items` with `products` to get product names
  - Return `[{ ...sale, items: [{ productName, quantity, lineTotal }] }]`

**Type-check + commit:** `feat: rewrite customers with drizzle + purchase history query`

---

### Task 10: Rewrite sales.ts (tax fix, customer auto-link, remove expected_cash update)

**File:** `src/main/services/sales.ts`

Key changes:
1. `generateReceiptNumber`: use Drizzle select instead of prepare
2. `deductStockFEFO`: use Drizzle select for batches; keep raw `prepare().run()` for UPDATE inside transaction
3. `createSale`:
   - Auto-link customer: if `customer_phone` provided, `SELECT id FROM customers WHERE phone = ?` → set `customerId`
   - Per-item tax: `taxRate` from product, `taxAmount` = inclusive: `lineTotal - lineTotal/(1 + rate/100)`, exclusive: `lineTotal * rate/100`
   - Write `taxRate` and `taxAmount` to each `saleItems` row
   - `product_sales_daily` upsert: use raw `ON CONFLICT(date, product_id) DO UPDATE` (composite PK, no UUID)
   - **REMOVE** the `UPDATE shifts SET expected_cash = expected_cash + ?` statement entirely
4. Add `voidSale(saleId, userId, reason)`: validate reason non-empty, check status='completed', update to 'voided'
5. Add `createRefund(params)`: insert `sale_refunds`, update sale status, optionally restock batches
6. Add `computeShiftExpectedCash(shiftId, openingCash)`: `SELECT COALESCE(SUM(cash_received),0) FROM sales WHERE shift_id=? AND status='completed'`, return `openingCash + sum`

**Type-check + commit:** `feat: rewrite sales with drizzle, fix tax, customer link, void, refund, remove expected_cash counter`

---

## Phase 3: RBAC Middleware + IPC

### Task 11: Create src/main/ipc/middleware.ts

**File:** `src/main/ipc/middleware.ts`

```ts
import { getUserById } from '../services/users/user-management'
import { hasPermission, type Permission } from '../services/users/permissions'

export async function withPermission<T>(
  userId: string,
  permission: Permission,
  handler: () => T | Promise<T>
): Promise<T> {
  const user = getUserById(userId)
  if (!user) throw new Error('User not found')
  if (!user.isActive) throw new Error('Account inactive')
  if (!hasPermission(user.role as any, permission)) {
    throw new Error(`Permission denied: requires "${permission}"`)
  }
  return handler()
}
```

**Commit:** `feat: add withPermission RBAC middleware`

---

### Task 12: Add new IPC channels

**File:** `src/main/ipc/channels.ts`

Add:
```ts
SALE_VOID: 'sale:void',
SALE_REFUND: 'sale:refund',
CUSTOMER_PURCHASE_HISTORY: 'customer:purchase-history',
SHIFT_COMPUTE_EXPECTED_CASH: 'shift:compute-expected-cash',
```

**Commit:** `feat: add channels for void, refund, purchase history, expected cash`

---

### Task 13: Apply RBAC to user-handlers.ts

**File:** `src/main/ipc/user-handlers.ts`

- Handlers receive `{ userId, ...data }` instead of just `data`
- Wrap with `withPermission`:
  - `USER_LIST`, `USER_GET` → `'users:view'`
  - `USER_CREATE` → `'users:create'`
  - `USER_UPDATE`, `USER_CHANGE_PASSWORD` → `'users:update'`
  - `USER_DELETE` → `'users:delete'`
- Leave `USER_VERIFY_PASSWORD`, `USER_VERIFY_PIN`, `USER_CHECK_PERMISSION` unwrapped (login flow)

**Commit:** `feat: RBAC on user IPC handlers`

---

### Task 14: Apply RBAC to inventory-handlers.ts

**File:** `src/main/ipc/inventory-handlers.ts`

All handlers receive `{ userId, ...data }`. Permission map:
- `*_LIST` → `'inventory:view'`
- `*_CREATE` → `'inventory:create'`
- `*_UPDATE`, `ADJUST` → `'inventory:update'`
- `*_DELETE` → `'inventory:delete'`
- `EXPORT_CSV` → `'inventory:import_export'`

Update `adjustStockBatch` call to pass `userId`.

**Commit:** `feat: RBAC on inventory IPC handlers`

---

### Task 15: Apply RBAC to pos, audit, analytics, backup handlers

**Files:** `pos-handlers.ts`, `audit-handlers.ts`, `analytics-handlers.ts`, `backup-handlers.ts`

**pos-handlers.ts:**
- `SALE_CREATE`: already has `user_id` in saleData — no change needed for RBAC (cashier always has `sales:create`)
- Add handler for `SALE_VOID` → `withPermission(userId, 'sales:void', ...)`
- Add handler for `SALE_REFUND` → `withPermission(userId, 'sales:refund', ...)`
- Add handler for `CUSTOMER_PURCHASE_HISTORY` → no permission gate (cashier needs this)
- Add handler for `SHIFT_COMPUTE_EXPECTED_CASH` → no permission gate

**audit-handlers.ts:** Wrap with `'reports:view'`
**analytics-handlers.ts:** Reports with `'reports:view'`; report generation with `'reports:generate'`
**backup-handlers.ts:** create → `'backup:create'`; restore → `'backup:restore'`

**Commit:** `feat: RBAC on pos/audit/analytics/backup handlers, add void/refund/history handlers`

---

### Task 16: Update preload/index.ts

**File:** `src/preload/index.ts`

Add new API methods:
```ts
// in sales section:
void: (params: { userId: string; saleId: string; reason: string }) =>
  ipcRenderer.invoke(IPC_CHANNELS.SALE_VOID, params),
refund: (params: any) => ipcRenderer.invoke(IPC_CHANNELS.SALE_REFUND, params),

// in customers section:
purchaseHistory: (customerId: string) =>
  ipcRenderer.invoke(IPC_CHANNELS.CUSTOMER_PURCHASE_HISTORY, customerId),

// in shifts section:
computeExpectedCash: (shiftId: string, openingCash: number) =>
  ipcRenderer.invoke(IPC_CHANNELS.SHIFT_COMPUTE_EXPECTED_CASH, { shiftId, openingCash }),
```

Update inventory API wrappers to accept and forward `userId`.

**Type-check + commit:** `feat: expose void, refund, purchase history, expected cash in preload`

---

## Phase 4: Frontend RBAC

### Task 17: Shared permissions + usePermission hook + PermissionGate

**Problem:** `permissions.ts` is in `src/main/` — can't directly import into renderer without path issues in electron-vite.

**Solution:** Create `src/shared/permissions.ts` with just the `hasPermission` function and `Permission` type. Import from `shared/` in both main (replace current import) and renderer.

**Files:**
- Create: `src/shared/permissions.ts` — copy `Permission` type, `Role` type, `ROLE_PERMISSIONS`, `hasPermission`, `getRolePermissions`, `requirePermission`, `getPermissionDescription`
- Modify: `src/main/services/users/permissions.ts` — re-export from `'../../../shared/permissions'`
- Create: `src/renderer/src/hooks/usePermission.ts`
- Create: `src/renderer/src/components/PermissionGate.tsx`

**usePermission.ts:**
```ts
import { useAuthStore } from '@renderer/stores/authStore'
import { hasPermission, type Permission } from '../../../../shared/permissions'

export function usePermission(permission: Permission): boolean {
  const role = useAuthStore(s => s.user?.role)
  return role ? hasPermission(role as any, permission) : false
}
```

**PermissionGate.tsx:**
```tsx
import { type Permission } from '../../../../shared/permissions'
import { usePermission } from '../hooks/usePermission'
interface Props { permission: Permission; children: React.ReactNode; fallback?: React.ReactNode }
export function PermissionGate({ permission, children, fallback = null }: Props) {
  return <>{usePermission(permission) ? children : fallback}</>
}
```

**Type-check + commit:** `feat: shared permissions module, usePermission hook, PermissionGate`

---

### Task 18: Update Sidebar — role filtering + remove AI item

**File:** `src/renderer/src/components/layout/Sidebar.tsx`

- Remove `Bot` icon import (no more AI nav item)
- Each nav item gets a `permission` field
- Extract a `NavButton` sub-component that calls `usePermission()` (hooks can't be in `.map()`)
- Nav items: `pos`→`sales:create`, `inventory`→`inventory:view`, `analytics`→`reports:view`, `customers`→`sales:create`, `users`→`users:view`, `audit`→`reports:view`, `settings`→`settings:view`
- Remove `{ id: 'ai', ... }` entry entirely

**File:** `src/renderer/src/components/layout/MainLayout.tsx`

- Remove `case 'ai': return <AnalyticsPage />`

**Commit:** `feat: sidebar role-based filtering, remove duplicate AI nav item`

---

### Task 19: Update EndShiftModal — compute expected cash from DB

**File:** `src/renderer/src/components/pos/EndShiftModal.tsx`

Replace:
```ts
const expectedCash = openingCash + todaySalesTotal
```

With a `useEffect` that calls `window.electron.shifts.computeExpectedCash(shift.id, openingCash)` on modal open and stores result in local state. This reads from actual completed sales, so voided sales don't inflate the expected figure.

**Commit:** `fix: expected cash computed from DB at shift-end (void-safe)`

---

### Task 20: PaymentModal — customer phone lookup + purchase history

**File:** `src/renderer/src/components/pos/PaymentModal.tsx`

In the Customer Phone `<Input>` `onChange`:
- Debounce 400ms on phone changes (use `useEffect` + `setTimeout`/`clearTimeout`)
- When phone length >= 7: call `window.electron.customers.getByPhone(phone)`
- If found: call `window.electron.customers.purchaseHistory(customer.id)`, store result in state, auto-fill `customerName`
- Render a scrollable panel below phone input showing:
  - Customer name in green ("Customer found: X")
  - List of past sales: date, total, and items (productName × qty per line)
- If not found or phone too short: hide panel

**Commit:** `feat: POS customer phone lookup with purchase history panel`

---

### Task 21: AnalyticsPage — add AI Insights tab

**File:** `src/renderer/src/pages/AnalyticsPage.tsx`

- Add a new `<TabsTrigger value="ai">AI Insights</TabsTrigger>` tab
- Add matching `<TabsContent value="ai">` with an `AIInsightsPanel` sub-component
- `AIInsightsPanel` has a "Generate Insights" button that calls:
  - `window.electron.ai.getReorderSuggestions()`
  - `window.electron.ai.getSalesForecast()`
  - `window.electron.ai.getDeadStockDetection()`
  - in parallel via `Promise.all`
- Renders results in labelled sections (Reorder Suggestions, Sales Forecast, Dead Stock)
- Empty state: "Click Generate Insights to analyse inventory with AI"

**Commit:** `feat: AI Insights tab in AnalyticsPage`

---

## Phase 6: Cleanup + Verification

### Task 22: Delete schema.sql

```bash
rm src/main/db/schema.sql
grep -r "schema.sql" src/   # expect no results
```

**Commit:** `chore: delete schema.sql (replaced by drizzle schema.ts + migration)`

---

### Task 23: Full type-check + build

```bash
npx tsc --noEmit    # expect zero errors
npm run build       # expect success
```

---

### Task 24: Manual verification checklist

Start dev: `npm run dev`

- [ ] App starts, DB created without errors
- [ ] Setup wizard shows on first run
- [ ] Can create admin user with PIN set
- [ ] Admin logs in via password and via PIN
- [ ] **Cashier sidebar:** shows POS, Inventory, Customers only
- [ ] **Manager sidebar:** shows POS, Inventory, Analytics, Customers, Users, Audit
- [ ] **Admin sidebar:** shows all items including Settings
- [ ] Cashier cannot reach Settings or Users pages
- [ ] POS: complete a cash sale — no SQLite errors
- [ ] POS: complete a card sale — no SQLite errors
- [ ] PaymentModal: enter a registered phone → customer name fills, history panel appears
- [ ] PaymentModal: enter unknown phone → no panel
- [ ] Analytics page: "AI Insights" tab visible, "Generate Insights" button works
- [ ] End shift: expected cash figure excludes voided sales
- [ ] Voiding a sale requires non-empty reason

**Final commit:**
```bash
git tag v1.1.0-drizzle
```

---

## Drizzle Quick Reference

```ts
import { eq, and, or, like, desc, asc, sql, count } from 'drizzle-orm'
import { getDb } from '../db/index'
import { tableName } from '../db/schema'

// SELECT one
db.select().from(table).where(eq(table.id, id)).get()

// SELECT all with filter
db.select().from(table).where(and(eq(table.isActive, 1), like(table.name, '%q%'))).all()

// INSERT
db.insert(table).values({ id: crypto.randomUUID(), ...data }).run()

// UPDATE (always include updatedAt for tables that have it)
db.update(table).set({ field: value, updatedAt: new Date().toISOString() }).where(eq(table.id, id)).run()

// DELETE
db.delete(table).where(eq(table.id, id)).run()

// Transaction (raw better-sqlite3 wrapping Drizzle calls)
getDatabase().transaction(() => {
  db.insert(sales).values(...).run()
  db.insert(saleItems).values(...).run()
})()
```
