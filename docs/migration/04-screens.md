# 04 — Screens & UI

## Application Flow (top-level state machine in `App.tsx`)

There is **no router** — screen selection is state-driven:

```
first run?  ──yes──► SetupWizardPage
    │no
not authenticated? ──yes──► LoginPage
    │no
no active shift?   ──yes──► StartShiftModal (full-screen gate)
    │no
MainLayout (Header + Sidebar + current page)
```

`UpdateNotification` is mounted in every state. OS window close (Alt+F4 / X) triggers the End Shift modal first if a shift is active (see IPC doc).

## MainLayout Navigation

`MainLayout` holds `currentPage` state (default `pos`) and renders a page via switch. The `Sidebar` (16 px-wide icon rail, touch-sized 48×48 buttons) shows items filtered by RBAC permission (`usePermission` hook):

| id | Label | Icon | Required permission | Page component |
|---|---|---|---|---|
| pos | POS | ShoppingCart | `sales:create` | `POSPage` |
| inventory | Inventory | Package | `inventory:view` | `InventoryPage` |
| analytics | Analytics | BarChart3 | `reports:view` | `AnalyticsPage` |
| customers | Customers | Users | `sales:create` | `CustomersPage` |
| users | Users | UserCog | `users:view` | `UsersPage` |
| audit | Audit Log | ClipboardList | `reports:view` | `AuditLogPage` |
| settings | Settings | Settings | `settings:view` | `SettingsPage` |

`Header` shows the logged-in user, an End Shift action, and a shortcut to Settings.

## Pages

### SetupWizardPage (`pages/SetupWizardPage.tsx`)
First-run wizard: business name/address/phone, currency symbol, and creation of the first **admin** account (username, password, full name). Calls `setup:initialize` then `setup:complete`.

### LoginPage (`pages/LoginPage.tsx`)
User picker (from `auth:getUsers`) + credential entry. Supports **PIN login** via a touch `PinPad` component (`components/auth/PinPad.tsx`) and password fallback.

### POSPage (`pages/POSPage.tsx`) — main sales screen
Composition:
- `ProductEntry` — barcode/text entry field (keyboard-wedge scanner friendly)
- `QuickItems` — grid of active products with stock, nearest expiry, and 7-day sales (refreshes after each sale)
- `ShoppingCart` — `CartItem` rows, `CartTotals`, `CartActions`
- `SearchModal` — full product search (F2)
- `PaymentModal` — cash/card/mixed tender, `cash-numpad` touch numpad, change calculation
- `ReceiptPreview` — post-sale receipt view/print
- `StartShiftModal` / `EndShiftModal` — opening cash count / closing count with expected-cash reconciliation and printable shift report
- `useCustomerDisplay` hook — mirrors cart state to the customer display / pole display

Keyboard shortcuts (`hooks/useKeyboardShortcuts.ts`):

| Key | Action |
|---|---|
| F2 | Open product search |
| F4 | Hold current sale |
| F5 | Recall held sale |
| F8 | Clear cart |
| F9 | Open payment |
| Escape | Close modal |

Cart features in `posStore`: add/remove/update quantity, per-sale discount (percentage/fixed), hold **one** sale and recall it, walk-in customer name/phone, linked registered customer.

### InventoryPage (`pages/InventoryPage.tsx`)
Tabbed management screen:
- **Products** — `ProductsTable` + `ProductFormDialog` (all product fields incl. barcode, SKU, generic name, pricing, tax, reorder levels, expiry tracking)
- **Categories** — `CategoriesTable` + `CategoryFormDialog` (supports parent category)
- **Suppliers** — `SuppliersTable` + `SupplierFormDialog`
- **Stock Batches** — `StockBatchesTable` (batch number, quantity, cost, expiry, received date, supplier) + adjustments
- `LowStockAlert` banner; CSV/Excel import and CSV export

### AnalyticsPage (`pages/AnalyticsPage.tsx`)
Dashboard composed of:
- `KPICards` — daily/period metrics
- `SalesTrendChart` (Recharts)
- `CategoryBreakdownChart`
- `TopProductsList`
- `AlertsPanel` — low stock + expiry alerts
- `ReportsPanel` — sales / inventory valuation / profit-loss reports (PDF export)
- `AIInsightsPanel` — Gemini-backed reorder suggestions, forecast, dead stock, natural query

### CustomersPage (`pages/CustomersPage.tsx`)
Customer CRUD (name, unique phone/email, address, DOB, notes) with purchase history view.

### UsersPage (`pages/UsersPage.tsx`)
`UsersTable` + `UserFormModal`: create/update/deactivate users, set role (admin/manager/cashier), password and PIN.

### AuditLogPage (`pages/AuditLogPage.tsx`)
Filterable audit log viewer with CSV export.

### SettingsPage (`pages/SettingsPage.tsx`)
Five tabs:
| Tab | Contents |
|---|---|
| **Printer** | `PrinterSetupWizard` — type (epson/star/generic), interface (USB/TCP), device/IP+port, receipt width, test print |
| **Business** | Business Information (name/address/phone) · Tax & Currency (`vat_rate`, `currency_symbol`) · Receipt (`receipt_footer`) |
| **Display** | Pole display COM port + baud rate, connect/test |
| **Backup** | Local + Google Drive backups, schedule (enabled/frequency/time), encryption password |
| **AI** | Gemini API key management |

### CustomerDisplayPage (`pages/CustomerDisplayPage.tsx`)
Customer-facing screen (for the second display): listens for cart-update and sale-complete events; shows itemized cart (name, qty, price, line total), subtotal/discount/tax/total with business name, then a sale-complete summary (total, cash received, change) that clears after 5 s.

## State Stores (Zustand, `src/renderer/src/stores/`)

| Store | Responsibility |
|---|---|
| `authStore` | Current user, `isAuthenticated`, login/logout |
| `shiftStore` | `currentShift`, today's sales total |
| `posStore` | Cart items, totals, discount, held sale, customer link |
| `productStore` | Product search/quick items caches |
| `inventoryStore` | Inventory page data (products, categories, suppliers, batches) |
| `analyticsStore` | Dashboard metrics/report state |
| `settingsStore` | Loaded settings map (e.g. `currency_symbol`), `loadSettings()` on app start |

## Hooks

- `usePermission(permission)` — RBAC check against current user's role
- `useKeyboardShortcuts(handlers)` — POS function keys
- `useCustomerDisplay()` — pushes cart/sale events to the customer display + pole display

## Shared UI Components (`components/ui/`)

shadcn-style wrappers over Radix: `button`, `card`, `dialog`, `alert-dialog`, `input`, `label`, `select`, `tabs`, `progress`, plus a custom touch `cash-numpad` (supports physical Backspace/Delete too). Utility `cn()` (clsx + tailwind-merge) in `lib/utils.ts`.

## RBAC Matrix (`src/shared/permissions.ts`)

24 permissions across sales, inventory, analytics/reports, customers, shifts, users, settings, backup. Role grants:

- **admin** — everything
- **manager** — everything except `users:create/update/delete`, `settings:*`, and `backup:restore` (has `users:view`, `backup:create`)
- **cashier** — `sales:create`, `sales:view_all`, `inventory:view`, `customers:create`, `shifts:manage`

`PermissionGate` component hides UI behind a permission; the same matrix is enforced server-side in IPC middleware.
