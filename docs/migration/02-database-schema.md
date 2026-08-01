# 02 — Database Schema

## Engine & Conventions

- **Engine**: SQLite via `better-sqlite3`, opened with `journal_mode = WAL` and `foreign_keys = ON`
- **Location**: `<userData>/pharmapos.db` (Electron `app.getPath('userData')`); overridable with `TEST_DB_PATH` env var
- **ORM**: Drizzle (`drizzle-orm/sqlite-core`), schema defined in `src/main/db/schema.ts`. Many services also use raw prepared statements directly on the better-sqlite3 handle.
- **Migrations**: one squashed SQL file `src/main/db/migrations/0000_chilly_alice.sql`, imported with Vite `?raw` and executed at startup **only if** the sentinel table `audit_log` is absent (`src/main/db/index.ts`). Drizzle-kit config (`drizzle.config.ts`): dialect `sqlite`, out `./src/main/db/migrations`, dev url `./dev.db`.
- **Primary keys**: TEXT UUIDs generated with `crypto.randomUUID()`
- **Timestamps**: TEXT — ISO strings or SQLite `datetime('now')`
- **Booleans**: INTEGER 0/1
- **Money/quantity**: REAL (quantities on sale_items are INTEGER; batch quantities are REAL)

## Tables (14)

### users
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| username | text | UNIQUE, NOT NULL |
| password_hash | text | NOT NULL (bcrypt, cost 10) |
| full_name | text | NOT NULL |
| role | text | enum `admin` \| `manager` \| `cashier`, NOT NULL, default `cashier` |
| pin_code | text | nullable (quick PIN login) |
| is_active | integer | NOT NULL, default 1 |
| created_at / updated_at | text | NOT NULL |

### categories
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| name | text | UNIQUE, NOT NULL |
| description | text | |
| parent_id | text | FK → categories.id (self-referential hierarchy) |
| created_at | text | NOT NULL |

### suppliers
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| name | text | NOT NULL |
| contact_person / phone / email / address | text | |
| lead_time_days | integer | default 3 |
| is_active | integer | NOT NULL, default 1 |
| created_at | text | NOT NULL |

### products
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| barcode | text | UNIQUE |
| sku | text | UNIQUE |
| name | text | NOT NULL |
| generic_name | text | (pharma generic name) |
| category_id | text | FK → categories.id |
| supplier_id | text | FK → suppliers.id |
| cost_price | real | NOT NULL, default 0 |
| unit_price | real | NOT NULL |
| tax_rate | real | NOT NULL, default 0 |
| is_tax_inclusive | integer | NOT NULL, default 1 |
| reorder_level | integer | NOT NULL, default 10 |
| reorder_qty | integer | NOT NULL, default 50 |
| unit | text | NOT NULL, default `piece` |
| is_active | integer | NOT NULL, default 1 |
| track_expiry | integer | NOT NULL, default 1 |
| created_at / updated_at | text | NOT NULL |

### customers
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| name | text | NOT NULL |
| phone | text | UNIQUE |
| email | text | UNIQUE |
| address / date_of_birth / notes | text | |
| is_active | integer | NOT NULL, default 1 |
| created_at / updated_at | text | NOT NULL |

### shifts
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| user_id | text | NOT NULL, FK → users.id |
| started_at | text | NOT NULL |
| ended_at | text | nullable (open shift) |
| opening_cash | real | NOT NULL, default 0 |
| closing_cash | real | nullable |
| notes | text | |
| status | text | enum `active` \| `closed`, NOT NULL, default `active` |

### stock_batches
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| product_id | text | NOT NULL, FK → products.id |
| batch_number | text | |
| quantity | real | NOT NULL, default 0 |
| cost_price | real | NOT NULL |
| expiry_date | text | nullable |
| received_date | text | NOT NULL |
| supplier_id | text | FK → suppliers.id |
| created_at | text | NOT NULL |

### sales
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| receipt_number | text | UNIQUE, NOT NULL |
| shift_id | text | NOT NULL, FK → shifts.id |
| user_id | text | NOT NULL, FK → users.id |
| customer_id | text | FK → customers.id |
| subtotal / tax_amount / discount_amount | real | NOT NULL, default 0 |
| discount_type | text | enum `percentage` \| `fixed`, nullable |
| discount_value | real | default 0 |
| total | real | NOT NULL, default 0 |
| payment_method | text | enum `cash` \| `card` \| `mixed`, NOT NULL |
| cash_received / card_received / change_given | real | default 0 |
| status | text | enum `completed` \| `voided` \| `refunded`, NOT NULL, default `completed` |
| void_reason | text | |
| customer_name / customer_phone | text | denormalized walk-in customer info |
| created_at | text | NOT NULL |

### sale_items
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| sale_id | text | NOT NULL, FK → sales.id **ON DELETE CASCADE** |
| product_id | text | NOT NULL, FK → products.id |
| batch_id | text | FK → stock_batches.id |
| quantity | integer | NOT NULL |
| unit_price / cost_price | real | NOT NULL (snapshot at sale time) |
| tax_rate / tax_amount / discount_amount | real | NOT NULL, default 0 |
| line_total | real | NOT NULL |
| created_at | text | NOT NULL |

### inventory_adjustments
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| product_id | text | NOT NULL, FK → products.id |
| batch_id | text | FK → stock_batches.id |
| adjustment_type | text | enum `add` \| `remove` \| `correction`, NOT NULL |
| quantity_change | real | NOT NULL |
| reason | text | |
| user_id | text | NOT NULL, FK → users.id |
| created_at | text | NOT NULL |

### sale_refunds
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| sale_id | text | NOT NULL, FK → sales.id |
| user_id | text | NOT NULL, FK → users.id |
| items | text | NOT NULL — **JSON array stored as TEXT** (refunded line items) |
| total_refunded | real | NOT NULL |
| restock | integer | NOT NULL, default 1 |
| reason | text | |
| created_at | text | NOT NULL |

### product_sales_daily (analytics aggregate)
| Column | Type | Constraints |
|---|---|---|
| date | text | composite PK (date, product_id) |
| product_id | text | NOT NULL, FK → products.id |
| quantity_sold | integer | NOT NULL, default 0 |
| revenue / cost / profit | real | NOT NULL, default 0 |

Populated by the daily aggregation job (`src/main/jobs/aggregation.ts` + `src/main/services/analytics/aggregation.ts`, scheduled with node-schedule; also runnable on demand via IPC `analytics:run-aggregation`).

### audit_log
| Column | Type | Constraints |
|---|---|---|
| id | text | PK |
| timestamp | text | NOT NULL |
| user_id | text | FK → users.id |
| user_name | text | |
| action | text | NOT NULL (e.g. `SALE_CREATED`) |
| entity_type | text | NOT NULL |
| entity_id | text | |
| details | text | JSON payload |
| ip_address | text | |

### settings (key/value store)
| Column | Type | Constraints |
|---|---|---|
| key | text | PK |
| value | text | NOT NULL |
| updated_at | text | NOT NULL |

Full key registry: see [05-settings.md](05-settings.md).

## Indexes (beyond UNIQUE column indexes)

```sql
CREATE UNIQUE INDEX idx_shifts_active_user ...   -- one active shift per user
CREATE INDEX idx_sales_shift              ON sales(shift_id);
CREATE INDEX idx_sales_status             ON sales(status);
CREATE INDEX idx_sales_shift_status       ON sales(shift_id, status);
CREATE INDEX idx_sales_user_created       ON sales(user_id, created_at);
CREATE INDEX idx_sale_items_product       ON sale_items(product_id);
CREATE INDEX idx_stock_batches_product_expiry ON stock_batches(product_id, expiry_date);
CREATE INDEX idx_stock_batches_batch_number   ON stock_batches(batch_number);
CREATE INDEX idx_inventory_adj_product    ON inventory_adjustments(product_id);
```

Unique indexes from column constraints: `users.username`, `categories.name`, `customers.phone`, `customers.email`, `products.barcode`, `products.sku`, `sales.receipt_number`.

## Seed Data (in the migration)

Default settings rows (`INSERT OR IGNORE`):

```
business_name     = 'My Pharmacy'
vat_rate          = '18'
currency_symbol   = 'Rs.'
receipt_footer    = 'Thank you for your purchase!'
display_port      = ''
display_baud_rate = '9600'
business_address  = ''
business_phone    = ''
```

Default categories: `Medications`, `Pain Relief`, `Cold & Flu`, `First Aid`, `Personal Care`, `Vitamins` (fixed ids `cat-*`).

A product seeding script exists at `src/main/scripts/seed-products.ts`.

## Model Types

TypeScript model types are inferred from the Drizzle schema and exported from `src/main/db/schema.ts`: `User`, `NewUser`, `Shift`, `Sale`, `NewSale`, `SaleItem`, `NewSaleItem`, `Product`, `NewProduct`, `Customer`, `StockBatch`, `InventoryAdjustment`, `SaleRefund`, `Category`, `Supplier`, `AuditLog`. The renderer maintains its own view types in `src/renderer/src/lib/types.ts` and `src/renderer/src/types/analytics.ts` (snake_case fields matching IPC payloads).
