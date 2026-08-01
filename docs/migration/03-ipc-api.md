# 03 — IPC API Surface

All main↔renderer communication goes through `ipcMain.handle` / `ipcRenderer.invoke` channels declared as constants in `src/main/ipc/channels.ts` and exposed to the renderer as a typed `window.electron` object via `contextBridge` (`src/preload/index.ts`, typed in `src/preload/index.d.ts`). Handlers are registered per domain from `src/main/ipc/handlers.ts` (`registerIpcHandlers()`); an RBAC middleware (`src/main/ipc/middleware.ts`) guards permission-sensitive handlers using the matrix in `src/shared/permissions.ts`. Mutating handlers write to the audit log.

## Channel Registry

### Auth & Users
| Channel | Purpose |
|---|---|
| `auth:login` | Login with `{ userId, pin? , password? }` |
| `auth:logout` | Logout |
| `auth:getUsers` | List users for the login screen |
| `auth:createUser` | Create user (username, password, fullName, role, pin?) |
| `user:list` / `user:get` / `user:create` / `user:update` / `user:delete` | User management CRUD |
| `user:change-password` / `user:verify-password` / `user:verify-pin` | Credential operations |
| `user:stats` | Per-user statistics |
| `user:check-permission` / `user:get-permissions` | RBAC queries |

### Settings
| Channel | Purpose |
|---|---|
| `settings:get` | Get one value by key |
| `settings:set` | Upsert `{ key, value }` |
| `settings:getAll` | All key/value pairs |

### Shifts
| Channel | Purpose |
|---|---|
| `shift:start` | `{ userId, openingCash }` |
| `shift:end` | `{ shiftId, closingCash, notes? }` |
| `shift:getActive` | Active shift for a user |
| `shift:compute-expected-cash` | Expected drawer cash for reconciliation |

### Products & Stock (POS side)
| Channel | Purpose |
|---|---|
| `product:search` | Text search |
| `product:getByBarcode` | Barcode lookup |
| `product:getQuickItems` | Active products with total stock, nearest expiry, 7-day sales (for the quick-items grid) |
| `stock:checkAvailability` | Stock check for a product |
| `stock:deduct` | Deduct stock `{ productId, quantity }` |

### Sales
| Channel | Purpose |
|---|---|
| `sale:create` | Create sale (writes sale + items, deducts stock, audits `SALE_CREATED`) |
| `sale:getReceipt` | Receipt data for a sale |
| `sale:getTodayTotal` | Today's total for a shift |
| `sale:void` | `{ userId, saleId, reason }` |
| `sale:refund` | `{ userId, saleId, items[], reason?, restock? }` |

### Inventory Management
| Channel | Purpose |
|---|---|
| `product:list` / `product:create` / `product:update` / `product:delete` | Product CRUD (userId-scoped for RBAC/audit) |
| `product:lowStock` | Products at/below reorder level |
| `category:list` / `category:create` / `category:update` / `category:delete` | Category CRUD |
| `supplier:list` / `supplier:create` / `supplier:update` / `supplier:delete` | Supplier CRUD |
| `stock:batchList` / `stock:batchCreate` / `stock:batchUpdate` / `stock:batchDelete` / `stock:batchAdjust` | Stock batch CRUD + adjustments |
| `product:importCsv` / `product:exportCsv` | CSV import/export (import also accepts Excel via read-excel-file; header mapping like `tax_rate`/`Tax Rate`) |

### Customers
| Channel | Purpose |
|---|---|
| `customer:list` / `customer:get` / `customer:getByPhone` | Lookup |
| `customer:create` / `customer:update` / `customer:delete` | CRUD |
| `customer:purchase-history` | Sales history per customer |

### Analytics & Reports
| Channel | Purpose |
|---|---|
| `analytics:daily-metrics` / `analytics:period-metrics` | KPI metrics |
| `analytics:top-products` | Top sellers |
| `analytics:category-breakdown` | Revenue by category |
| `analytics:low-stock-alerts` / `analytics:expiry-alerts` | Alert feeds |
| `analytics:sales-report` / `analytics:inventory-valuation` / `analytics:profit-loss-report` | Reports (PDF export via jspdf) |
| `analytics:run-aggregation` | Manually run daily aggregation into `product_sales_daily` |

### AI (Gemini)
| Channel | Purpose |
|---|---|
| `ai:reorder-suggestions` | Reorder quantity suggestions |
| `ai:sales-forecast` | Sales forecasting |
| `ai:dead-stock-detection` | Dead stock detection |
| `ai:natural-query` | Natural-language question over business data |

### Backup
| Channel | Purpose |
|---|---|
| `backup:create` / `backup:restore` | Local encrypted backup create/restore |
| `backup:list-local` / `backup:delete-local` | Local backup management |
| `backup:drive-auth` / `backup:drive-upload` / `backup:drive-list` / `backup:drive-download` / `backup:drive-delete` | Google Drive operations |
| `backup:scheduler-start` / `backup:scheduler-stop` / `backup:scheduler-status` | Scheduled backups (node-schedule) |

### Printer (ESC/POS thermal)
| Channel | Purpose |
|---|---|
| `printer:get-config` / `printer:save-config` | Config in settings table |
| `printer:initialize` / `printer:test` | Connect / test print |
| `printer:list-usb` | Enumerate USB printers |
| `printer:print-receipt` | Print sale receipt |
| `printer:print-shift-report` | Print end-of-shift report |
| `printer:open-drawer` | Kick cash drawer |

### Customer / Pole Display (serial)
| Channel | Purpose |
|---|---|
| `display:update` | Push last cart item + running total |
| `display:sale-complete` | Show total + change |
| `display:list-ports` | Enumerate serial COM ports |
| `display:connect` / `display:disconnect` | Open/close port (connect persists `display_port`/`display_baud_rate` settings) |
| `display:test` / `display:get-status` | Test message / connection status |

### Updates, Setup, Audit, App Lifecycle
| Channel | Purpose |
|---|---|
| `updates:check` / `updates:download` / `updates:install` | Auto-update control |
| `setup:is-first-run` | True until `<userData>/.setup-complete` flag file exists |
| `setup:initialize` | Seed business settings + first admin user |
| `setup:complete` | Write the setup-complete flag |
| `audit:query` / `audit:export-csv` | Audit log query and CSV export |
| `app:close-requested` (main→renderer event) | OS close intercepted; renderer must run End Shift flow |
| `app:confirm-close` (renderer→main, `send`) | Renderer confirms; main destroys the window |
| `db:query` | Generic DB query channel |

## Preload API Shape

`window.electron` groups the channels into ergonomic methods (examples):

```ts
window.electron.login({ userId, pin })
window.electron.getSetting('currency_symbol')
window.electron.startShift({ userId, openingCash })
window.electron.searchProducts(query)
window.electron.createSale(saleData)
window.electron.refund({ userId, saleId, items, reason, restock })
window.electron.listProducts(userId)          // inventory calls carry userId for RBAC + audit
window.electron.setup.isFirstRun()
window.electron.ipcRenderer.on('app:close-requested', handler)  // raw listener access for events
```

Payloads use snake_case field names on the wire (matching DB columns); the renderer's `lib/types.ts` mirrors this.

## Close-Interception Protocol (important behavior)

Two-layer guard so a cashier cannot exit without ending a shift (`src/main/index.ts` + `App.tsx`):

1. `mainWindow.on('close')` — `preventDefault()` unless `closingConfirmed`, then send `app:close-requested` to the renderer.
2. `app.on('before-quit')` — if not confirmed (Windows edge cases), restore/focus the window and re-send the request.

Renderer: if a shift is active, open the End Shift modal; on completion (or if no shift), send `app:confirm-close`. Main then destroys the window and on final quit closes the pole display and the database.
