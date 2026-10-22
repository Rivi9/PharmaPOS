import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import migrationSql from './migrations/0000_chilly_alice.sql?raw'
import { repairSalesLedger } from './repair-sales-ledger'

export type DB = BetterSQLite3Database<typeof schema>

let _db: DB | null = null

export function getDb(): DB {
  if (!_db) throw new Error('Database not initialized. Call initDb() first.')
  return _db
}

/**
 * Schema migrations, applied in order and tracked with `PRAGMA user_version`.
 *
 * Version 1 is the baseline schema. Anything after it must be additive and
 * idempotent where possible, because it runs against live pharmacy databases.
 *
 * Previously there was no version tracking at all: the bootstrap probed for a
 * single table and, finding it, skipped everything — so a second migration file
 * would never have reached any deployed machine.
 */
type Sqlite = import('better-sqlite3').Database

const MIGRATIONS: Array<{ version: number; sql: string; run?: (sqlite: Sqlite) => void }> = [
  {
    version: 2,
    sql: `
      -- Who voided a sale and when. Until now this was only recoverable from the
      -- audit log, and voiding is the most likely route for till theft.
      ALTER TABLE sales ADD COLUMN voided_by text;
      ALTER TABLE sales ADD COLUMN voided_at text;

      -- Mid-shift cash in/out (float top-up, petty cash, bank drop). Without it
      -- any such movement showed up as an unexplained drawer discrepancy.
      CREATE TABLE IF NOT EXISTS cash_movements (
        id text PRIMARY KEY NOT NULL,
        shift_id text NOT NULL,
        user_id text NOT NULL,
        type text NOT NULL,
        amount real NOT NULL,
        reason text NOT NULL,
        created_at text NOT NULL,
        FOREIGN KEY (shift_id) REFERENCES shifts(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements(shift_id);

      -- Hot paths that were doing full scans.
      CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
      CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
      CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
      CREATE INDEX IF NOT EXISTS idx_psd_product ON product_sales_daily(product_id);
      CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp, id);
      CREATE INDEX IF NOT EXISTS idx_audit_action_ts ON audit_log(action, timestamp);
      CREATE INDEX IF NOT EXISTS idx_audit_user_ts ON audit_log(user_id, timestamp);

      -- Repair: an empty string sorts before every real date, so MIN(expiry_date)
      -- returned '' and suppressed the expiry warning for the whole product.
      UPDATE stock_batches SET expiry_date = NULL WHERE expiry_date = '';
    `
  },
  {
    version: 3,
    sql: `
      -- A refund is paid out of the drawer of the shift that processes it, which
      -- is not necessarily the shift that made the sale. Without this the cash
      -- paid out was invisible to the end-of-shift reconciliation.
      ALTER TABLE sale_refunds ADD COLUMN shift_id text REFERENCES shifts(id);
      ALTER TABLE sale_refunds ADD COLUMN tax_refunded real NOT NULL DEFAULT 0;
      CREATE INDEX IF NOT EXISTS idx_sale_refunds_shift ON sale_refunds(shift_id);
      CREATE INDEX IF NOT EXISTS idx_sale_refunds_sale ON sale_refunds(sale_id);
    `
  },
  {
    version: 4,
    sql: `
      -- Login throttling. A 4-digit PIN is 10,000 candidates and there was no
      -- counter, no lockout and no audit row for failures, so the whole space
      -- could be walked from the login screen leaving no trace anywhere.
      ALTER TABLE users ADD COLUMN failed_attempts integer NOT NULL DEFAULT 0;
      ALTER TABLE users ADD COLUMN locked_until text;
    `
  },
  {
    version: 5,
    sql: `
      -- R1: per-batch selling price. NULL means "use the product's price", so
      -- existing stock keeps behaving exactly as it does today.
      ALTER TABLE stock_batches ADD COLUMN selling_price real;

      -- R2: which batches a sale line actually drew from, and at what cost and
      -- price. sale_items stores only ONE batch_id, so a line spanning two
      -- batches lost the rest — a recall could not identify who received a lot,
      -- and per-batch margin was unanswerable.
      CREATE TABLE IF NOT EXISTS sale_item_batches (
        id text PRIMARY KEY NOT NULL,
        sale_id text NOT NULL,
        sale_item_id text NOT NULL,
        batch_id text NOT NULL,
        product_id text NOT NULL,
        quantity real NOT NULL,
        cost_price real NOT NULL,
        selling_price real NOT NULL,
        created_at text NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
        FOREIGN KEY (sale_item_id) REFERENCES sale_items(id) ON DELETE CASCADE,
        FOREIGN KEY (batch_id) REFERENCES stock_batches(id),
        FOREIGN KEY (product_id) REFERENCES products(id)
      );
      CREATE INDEX IF NOT EXISTS idx_sib_batch ON sale_item_batches(batch_id);
      CREATE INDEX IF NOT EXISTS idx_sib_sale ON sale_item_batches(sale_id);
      CREATE INDEX IF NOT EXISTS idx_sib_product ON sale_item_batches(product_id);
    `
  },
  {
    version: 6,
    sql: `
      -- The OCPD-LED8 pole display runs at 2400 baud from the factory, but the
      -- settings seed shipped 9600. A serial port opens happily at the wrong
      -- rate, so nothing ever detected it: the app reported the display
      -- connected, every update returned success, and the pole stayed blank.
      --
      -- Only rows still holding the wrong default are touched. An operator who
      -- deliberately set 1200 or 19200 for different hardware keeps their value.
      UPDATE settings
      SET value = '2400', updated_at = datetime('now')
      WHERE key = 'display_baud_rate' AND value = '9600';
    `
  },
  {
    version: 7,
    sql: `
      -- M9: the product name as dispensed. getReceipt recovered it by joining
      -- products, so renaming a product retroactively rewrote every past
      -- receipt, and deleting one blanked the name on its history. A receipt is
      -- the dispensing record; it has to say what was handed over.
      ALTER TABLE sale_items ADD COLUMN product_name text;

      -- Backfill from the current names. Imperfect for anything renamed before
      -- now — that history is simply gone — but it is the best available, and it
      -- stops the rewriting from here on.
      UPDATE sale_items
      SET product_name = (SELECT p.name FROM products p WHERE p.id = sale_items.product_id)
      WHERE product_name IS NULL;
    `
  },
  {
    version: 8,
    sql: `
      -- L10: stock_batches.quantity is REAL but sale_items.quantity is INTEGER, so
      -- a fractional quantity could be received and then never sold — and float
      -- residue like 0.0000001 keeps a batch matching quantity > 0 forever, so
      -- it stays in the FEFO queue, is counted as sellable, and blocks the batch
      -- from ever being deleted.
      --
      -- Validation now rejects fractional quantities on every write. This repairs
      -- what is already stored: anything within a rounding error of a whole number
      -- is snapped to it, and the tiny residue that is really zero becomes zero.
      UPDATE stock_batches SET quantity = 0 WHERE quantity > 0 AND quantity < 0.001;
      UPDATE stock_batches
      SET quantity = CAST(ROUND(quantity) AS INTEGER)
      WHERE quantity <> CAST(ROUND(quantity) AS INTEGER);
    `
  },
  {
    version: 9,
    sql: `
      -- The part of a refund paid out in cash. Every refund used to come out of
      -- the expected drawer, so a card refund (reversed to the card, no cash
      -- across the counter) reported the cashier short by its amount. Existing
      -- rows follow the original tender: cash in full, card not at all, and a
      -- mixed sale in proportion to the cash it was paid with.
      ALTER TABLE sale_refunds ADD COLUMN cash_refunded real NOT NULL DEFAULT 0;
      UPDATE sale_refunds
      SET cash_refunded = COALESCE((
        SELECT ROUND(sale_refunds.total_refunded * CASE s.payment_method
          WHEN 'cash' THEN 1.0
          WHEN 'mixed' THEN MAX(0.0, MIN(1.0,
            (s.cash_received - COALESCE(s.change_given, 0)) / NULLIF(s.total, 0)))
          ELSE 0.0 END, 2)
        FROM sales s WHERE s.id = sale_refunds.sale_id
      ), 0);
    `,
    run: repairSalesLedger
  },
  {
    version: 10,
    sql: `
      -- The Sales screen lists every sale newest first, a page at a time. Without
      -- this, each page sorted the whole sales table to find its 50 rows.
      CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    `
  }
]

const LATEST_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 1)

export function initDb(sqlite: import('better-sqlite3').Database): DB {
  let version = sqlite.pragma('user_version', { simple: true }) as number

  if (version === 0) {
    const schemaExists = sqlite
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='audit_log'`)
      .get()

    if (schemaExists) {
      // Database predates version tracking but already has the baseline schema.
      sqlite.pragma('user_version = 1')
    } else {
      // Transactional: a power cut mid-bootstrap previously left the first table
      // created and nothing else, and the old sentinel then reported "schema
      // exists" forever, leaving the database permanently unusable.
      sqlite.transaction(() => {
        sqlite.exec(migrationSql)
        sqlite.pragma('user_version = 1')
      })()
    }
    version = 1
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= version) continue
    sqlite.transaction(() => {
      sqlite.exec(migration.sql)
      migration.run?.(sqlite)
      sqlite.pragma(`user_version = ${migration.version}`)
    })()
    version = migration.version
  }

  if (version !== LATEST_VERSION) {
    throw new Error(
      `Database is at version ${version} but the application expects ${LATEST_VERSION}`
    )
  }

  _db = drizzle(sqlite, { schema })
  return _db
}
