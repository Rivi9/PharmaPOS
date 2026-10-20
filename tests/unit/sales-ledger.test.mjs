// Unit test for the sales ledger: discount apportioning, the product_sales_daily
// rebuild, the Sales-Report arithmetic it shares, and migration 9's repair.
//
// Run with:  npm run test:ledger
//
// The audit's example: a Rs. 1000 basket, 10% off, 18% VAT, paid 900. The VAT
// was extracted from the pre-discount 1000 (152.54, not 137.29), the P&L booked
// 847.46 of revenue instead of 762.71, the Sales Report said 747.46, a partial
// refund was put back into the rollup every time Analytics was opened, and the
// rollup was keyed by the UTC date so a sale at 00:30 in Colombo landed on the
// day before.
//
// Dates: SQLite's 'localtime' and JS local dates both follow the process
// timezone. The test re-runs itself under Asia/Colombo (UTC+5:30, the shop's
// zone) where TZ can be set that way, so the UTC/local split is really exercised.

import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32' && process.env.TZ !== 'Asia/Colombo') {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    env: { ...process.env, TZ: 'Asia/Colombo' }
  })
  process.exit(r.status ?? 1)
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-ledger-test-'))

createRequire(path.join(ROOT, 'package.json'))('esbuild').buildSync({
  entryPoints: {
    money: path.join(ROOT, 'src/shared/money.ts'),
    ledger: path.join(ROOT, 'src/main/services/analytics/ledger.ts'),
    repair: path.join(ROOT, 'src/main/db/repair-sales-ledger.ts'),
    calculations: path.join(ROOT, 'src/renderer/src/lib/calculations.ts')
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: work,
  logLevel: 'error'
})

const require_ = createRequire(path.join(work, 'x.js'))
const { apportionDiscount, basketLineTax, extractIncludedTax } = require_('./money.js')
const { saleLedger, rebuildProductSalesDaily, refundLineAmounts } = require_('./ledger.js')
const { repairSalesLedger } = require_('./repair.js')
const { calculateItemsTax } = require_('./calculations.js')

let pass = 0
const failures = []
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log(`  ok   ${name} → ${JSON.stringify(actual)}`)
  } else {
    failures.push(name)
    console.log(`  FAIL ${name} → got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  }
}
const sum = (xs) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100
const localDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

console.log(`\n(timezone offset ${-new Date(2026, 9, 20).getTimezoneOffset()} min)`)

console.log('\nThe sale discount is split across the lines, to the cent')
check('600 + 400 less 100', apportionDiscount([600, 400], 100), [60, 40])
check('three equal lines less 1.00', apportionDiscount([1, 1, 1], 1), [0.34, 0.33, 0.33])
check('shares always add up', sum(apportionDiscount([33.33, 12.5, 7.17, 99.99], 17.77)), 17.77)
check('no discount, no shares', apportionDiscount([10, 20], 0), [0, 0])
check('never more than the basket', sum(apportionDiscount([10, 20], 50)), 30)

console.log('\nVAT is on what was paid, not on the pre-discount total')
check('Rs. 1000 less 10% at 18%', basketLineTax([1000], 100, 18).tax, 137.29)
check('(the old figure, from 1000)', extractIncludedTax(1000, 18), 152.54)
const basket = basketLineTax([770, 230], 100, 18)
check('header VAT is the sum of line VAT', basket.tax, sum(basket.taxes))
check(
  'the cart shows the same VAT the server stores',
  calculateItemsTax(
    [{ line_total: 770 }, { line_total: 230 }].map((l) => ({
      ...l,
      quantity: 1,
      unit_price: l.line_total
    })),
    18,
    100
  ),
  basket.tax
)
check('at 0% there is no VAT at all', basketLineTax([1000], 100, 0).tax, 0)

// ── A database with the columns the ledger reads ──────────────────────────────
function freshDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE sales (
      id TEXT PRIMARY KEY, subtotal REAL, discount_amount REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0, total REAL NOT NULL, payment_method TEXT NOT NULL,
      status TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE sale_items (
      id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL, line_total REAL NOT NULL, cost_price REAL NOT NULL,
      tax_rate REAL NOT NULL DEFAULT 0, tax_amount REAL NOT NULL DEFAULT 0,
      discount_amount REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE sale_refunds (
      id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, items TEXT NOT NULL,
      total_refunded REAL NOT NULL, tax_refunded REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE product_sales_daily (
      date TEXT NOT NULL, product_id TEXT NOT NULL, quantity_sold INTEGER NOT NULL DEFAULT 0,
      revenue REAL NOT NULL DEFAULT 0, cost REAL NOT NULL DEFAULT 0, profit REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (date, product_id)
    );
    INSERT INTO products VALUES ('p1', 'Amoxil 500mg'), ('p2', 'Panadol');
  `)
  return db
}

// 00:30 local on 15 March 2026 — in Colombo that is 19:00 UTC on the 14th.
const lateNight = new Date(2026, 2, 15, 0, 30)
const noon = new Date(2026, 2, 15, 12, 0)

/** A sale as createSale now writes it: discount shares and VAT on each line. */
function insertSale(db, { id, created, lines, discount = 0, rate = 18, status = 'completed' }) {
  const totals = lines.map((l) => l.line_total)
  const { discounts, taxes, tax } = basketLineTax(totals, discount, rate)
  const subtotal = sum(totals)
  db.prepare(
    `INSERT INTO sales (id, subtotal, discount_amount, tax_amount, total, payment_method, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'cash', ?, ?)`
  ).run(
    id,
    subtotal,
    discount,
    tax,
    Math.round((subtotal - discount) * 100) / 100,
    status,
    created.toISOString()
  )
  lines.forEach((l, i) =>
    db
      .prepare(
        `INSERT INTO sale_items (id, sale_id, product_id, quantity, line_total, cost_price, tax_rate, tax_amount, discount_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        `${id}-${i}`,
        id,
        l.product_id,
        l.quantity,
        l.line_total,
        l.cost_price,
        rate,
        taxes[i],
        discounts[i]
      )
  )
}

console.log('\nThe rollup is net of the discount and keyed by the LOCAL date')
{
  const db = freshDb()
  insertSale(db, {
    id: 's1',
    created: lateNight,
    discount: 100,
    lines: [{ product_id: 'p1', quantity: 10, line_total: 1000, cost_price: 50 }]
  })
  rebuildProductSalesDaily(db)
  const rows = db.prepare('SELECT * FROM product_sales_daily').all()
  check('one row', rows.length, 1)
  check('dated the local day of the sale', rows[0].date, localDate(lateNight))
  if (lateNight.getTimezoneOffset() < 0) {
    check('(not the UTC date)', rows[0].date === lateNight.toISOString().slice(0, 10), false)
  }
  check('revenue is 900 less its VAT', rows[0].revenue, 762.71)
  check('profit on net revenue', rows[0].profit, 262.71)
}

console.log('\nA partial refund comes off the rollup, every time it is rebuilt')
{
  const db = freshDb()
  insertSale(db, {
    id: 's2',
    created: noon,
    discount: 100,
    lines: [
      { product_id: 'p1', quantity: 4, line_total: 600, cost_price: 80 },
      { product_id: 'p2', quantity: 10, line_total: 400, cost_price: 20 }
    ]
  })
  const [line] = db.prepare("SELECT * FROM sale_items WHERE id = 's2-0'").all()
  const back = refundLineAmounts(line, 1)
  check('refund priced after the discount share', back.gross, 135) // (600 - 60) / 4
  db.prepare(
    `INSERT INTO sale_refunds (id, sale_id, items, total_refunded, tax_refunded) VALUES ('r1', 's2', ?, ?, ?)`
  ).run(JSON.stringify([{ product_id: 'p1', quantity: 1 }]), back.gross, back.tax)

  rebuildProductSalesDaily(db)
  const once = db.prepare("SELECT * FROM product_sales_daily WHERE product_id = 'p1'").all()[0]
  check('3 of 4 units remain sold', once.quantity_sold, 3)
  check(
    'revenue is the 3 kept units, net',
    once.revenue,
    Math.round((540 - line.tax_amount - back.net) * 100) / 100
  )
  check('cost of the 3 kept units', once.cost, 240)

  rebuildProductSalesDaily(db, { start: localDate(noon), end: localDate(noon) })
  const twice = db.prepare("SELECT * FROM product_sales_daily WHERE product_id = 'p1'").all()[0]
  check('rebuilding again changes nothing', twice, once)

  // The Sales Report's totals come from the same entries.
  const { entries, sales } = saleLedger(db, { start: localDate(noon), end: localDate(noon) })
  const psdNet = db
    .prepare('SELECT ROUND(SUM(revenue), 2) AS r FROM product_sales_daily')
    .all()[0].r
  check('report net == rollup net', sum(entries.map((e) => e.net)), psdNet)
  check('one transaction', sales.length, 1)
  check(
    'report gross == paid less refunded',
    sum(entries.map((e) => e.gross)),
    Math.round((900 - back.gross) * 100) / 100
  )
}

console.log('\nVoided and fully refunded sales contribute nothing')
{
  const db = freshDb()
  insertSale(db, {
    id: 'v',
    created: noon,
    status: 'voided',
    lines: [{ product_id: 'p1', quantity: 1, line_total: 50, cost_price: 10 }]
  })
  insertSale(db, {
    id: 'f',
    created: noon,
    status: 'refunded',
    lines: [{ product_id: 'p1', quantity: 1, line_total: 50, cost_price: 10 }]
  })
  check('no rows', rebuildProductSalesDaily(db), 0)
}

console.log('\nMigration 9 repairs discounted sales written before the fix')
{
  const db = freshDb()
  // As the old createSale stored it: no discount on the lines, VAT from 1000.
  db.prepare(
    `INSERT INTO sales (id, subtotal, discount_amount, tax_amount, total, payment_method, status, created_at)
     VALUES ('old', 1000, 100, 152.54, 900, 'cash', 'completed', ?)`
  ).run(lateNight.toISOString())
  db.prepare(
    `INSERT INTO sale_items (id, sale_id, product_id, quantity, line_total, cost_price, tax_rate, tax_amount, discount_amount)
     VALUES ('old-0', 'old', 'p1', 10, 1000, 50, 18, 152.54, 0)`
  ).run()
  // And the rollup row it wrote, under the UTC date with the gross-of-discount net.
  db.prepare(`INSERT INTO product_sales_daily VALUES (?, 'p1', 10, 847.46, 500, 347.46)`).run(
    lateNight.toISOString().slice(0, 10)
  )

  repairSalesLedger(db)
  const [sale] = db.prepare("SELECT tax_amount FROM sales WHERE id = 'old'").all()
  const [item] = db
    .prepare("SELECT tax_amount, discount_amount FROM sale_items WHERE id = 'old-0'")
    .all()
  check('line carries its discount share', item.discount_amount, 100)
  check('line VAT on what was paid', item.tax_amount, 137.29)
  check('header VAT is the line VAT', sale.tax_amount, 137.29)
  const rows = db.prepare('SELECT date, revenue FROM product_sales_daily').all()
  check('rollup rebuilt on the local date', rows, [{ date: localDate(lateNight), revenue: 762.71 }])

  repairSalesLedger(db)
  const again = db
    .prepare("SELECT tax_amount, discount_amount FROM sale_items WHERE id = 'old-0'")
    .all()[0]
  check('running it twice is harmless', again, item)
  check('rollup unchanged', db.prepare('SELECT date, revenue FROM product_sales_daily').all(), rows)
}

console.log(`\n${pass} passed, ${failures.length} failed`)
if (failures.length) {
  console.log('Failed:\n  ' + failures.join('\n  '))
  process.exit(1)
}
