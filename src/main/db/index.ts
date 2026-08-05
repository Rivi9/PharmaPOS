import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import migrationSql from './migrations/0000_chilly_alice.sql?raw'

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
const MIGRATIONS: Array<{ version: number; sql: string }> = [
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
