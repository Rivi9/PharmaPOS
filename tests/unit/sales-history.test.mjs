/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain .mjs, no annotations */
// Unit test for the Sales screen's queries and the void / refund rules.
//
// Run with:  npm run test:sales-history
//
// listSalesPage is paged and filtered in SQL, by LOCAL calendar date — a sale
// at 00:30 in Colombo is 19:00 UTC the day before, and must be listed on the day
// it was rung up. quoteRefund is the function createRefund prices with, so the
// figure the screen previews is the figure booked. voidBlockReason is the one
// rule both voidSale and the screen's Void button follow.
//
// Like the ledger test, this re-runs itself under Asia/Colombo where TZ can be
// set that way, so the UTC/local split is really exercised.

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
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-sales-history-test-'))

createRequire(path.join(ROOT, 'package.json'))('esbuild').buildSync({
  entryPoints: { history: path.join(ROOT, 'src/main/services/sales-history.ts') },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outdir: work,
  logLevel: 'error'
})

const require_ = createRequire(path.join(work, 'x.js'))
const { listSalesPage, getSaleDetail, quoteRefund, voidBlockReason, voidCheck } =
  require_('./history.js')

let pass = 0
const failures = []
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL ${name} → got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)
  }
}
const throws = (name, fn, pattern) => {
  try {
    fn()
    failures.push(name)
    console.log(`  FAIL ${name} → did not throw`)
  } catch (e) {
    check(name, pattern.test(e.message) ? 'threw as expected' : e.message, 'threw as expected')
  }
}
const localDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

console.log(`\n(timezone offset ${-new Date(2026, 9, 20).getTimezoneOffset()} min)`)

const db = new DatabaseSync(':memory:')
db.exec(`
  CREATE TABLE users (id TEXT PRIMARY KEY, full_name TEXT NOT NULL);
  CREATE TABLE customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT);
  CREATE TABLE products (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE sales (
    id TEXT PRIMARY KEY, receipt_number TEXT NOT NULL, user_id TEXT, customer_id TEXT,
    subtotal REAL, discount_amount REAL NOT NULL DEFAULT 0, tax_amount REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL, payment_method TEXT NOT NULL, cash_received REAL, card_received REAL,
    change_given REAL, status TEXT NOT NULL, void_reason TEXT, voided_by TEXT, voided_at TEXT,
    customer_name TEXT, customer_phone TEXT, created_at TEXT NOT NULL
  );
  CREATE TABLE sale_items (
    id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, product_id TEXT NOT NULL, product_name TEXT,
    batch_id TEXT, quantity INTEGER NOT NULL, unit_price REAL NOT NULL, line_total REAL NOT NULL,
    cost_price REAL NOT NULL DEFAULT 0, tax_rate REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0, discount_amount REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE sale_refunds (
    id TEXT PRIMARY KEY, sale_id TEXT NOT NULL, user_id TEXT, items TEXT NOT NULL,
    total_refunded REAL NOT NULL, tax_refunded REAL NOT NULL DEFAULT 0,
    cash_refunded REAL NOT NULL DEFAULT 0, restock INTEGER NOT NULL DEFAULT 1, reason TEXT,
    shift_id TEXT, created_at TEXT NOT NULL
  );
  INSERT INTO users VALUES ('u1', 'Kamala Cashier'), ('u2', 'Mala Manager');
  INSERT INTO customers VALUES ('c1', 'Nimal Perera', '0771234567');
  INSERT INTO products VALUES ('p1', 'Amoxil 500mg (renamed)'), ('p2', 'Panadol');
`)

const now = new Date()
const today = localDate(now)
// 00:30 local today — in Colombo, 19:00 UTC YESTERDAY.
const justAfterMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 30)
const yesterdayNoon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0)
const lastWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 12, 0)
// "Rung up just now" — but never before 00:30, so the order below holds whenever it runs.
const later = new Date(Math.max(now.getTime(), justAfterMidnight.getTime() + 60_000))

function sale(id, receipt, created, extra = {}) {
  const s = {
    user_id: 'u1',
    customer_id: null,
    subtotal: 1000,
    discount_amount: 0,
    tax_amount: 0,
    total: 1000,
    payment_method: 'cash',
    cash_received: 1000,
    card_received: 0,
    change_given: 0,
    status: 'completed',
    customer_name: null,
    customer_phone: null,
    void_reason: null,
    voided_by: null,
    ...extra
  }
  db.prepare(
    `INSERT INTO sales (id, receipt_number, user_id, customer_id, subtotal, discount_amount, tax_amount,
                        total, payment_method, cash_received, card_received, change_given, status,
                        customer_name, customer_phone, void_reason, voided_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    receipt,
    s.user_id,
    s.customer_id,
    s.subtotal,
    s.discount_amount,
    s.tax_amount,
    s.total,
    s.payment_method,
    s.cash_received,
    s.card_received,
    s.change_given,
    s.status,
    s.customer_name,
    s.customer_phone,
    s.void_reason,
    s.voided_by,
    created.toISOString()
  )
}
function line(id, saleId, productId, qty, lineTotal, extra = {}) {
  const l = { product_name: null, discount_amount: 0, tax_amount: 0, tax_rate: 0, ...extra }
  db.prepare(
    `INSERT INTO sale_items (id, sale_id, product_id, product_name, quantity, unit_price, line_total,
                             cost_price, tax_rate, tax_amount, discount_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, 40, ?, ?, ?)`
  ).run(
    id,
    saleId,
    productId,
    l.product_name,
    qty,
    lineTotal / qty,
    lineTotal,
    l.tax_rate,
    l.tax_amount,
    l.discount_amount
  )
}
function refund(id, saleId, items, total, created = now) {
  db.prepare(
    `INSERT INTO sale_refunds (id, sale_id, user_id, items, total_refunded, cash_refunded, created_at)
     VALUES (?, ?, 'u2', ?, ?, ?, ?)`
  ).run(id, saleId, JSON.stringify(items), total, total, created.toISOString())
}

// s1: today 00:30, a Rs. 1000 basket less 100, at 18% VAT, to a known customer.
sale('s1', 'R-2026-000001', justAfterMidnight, {
  customer_id: 'c1',
  discount_amount: 100,
  tax_amount: 137.29,
  total: 900,
  cash_received: 900
})
line('s1-a', 's1', 'p1', 10, 1000, {
  product_name: 'Amoxil 500mg',
  discount_amount: 100,
  tax_amount: 137.29,
  tax_rate: 18
})
// s2: yesterday, card, phone typed at the counter but no customer record.
sale('s2', 'R-2026-000002', yesterdayNoon, {
  payment_method: 'card',
  cash_received: 0,
  card_received: 1000,
  customer_name: 'Walk-in',
  customer_phone: '0719876543'
})
line('s2-a', 's2', 'p2', 4, 1000)
// s3: last week, partly refunded.
sale('s3', 'R-2026-000003', lastWeek)
line('s3-a', 's3', 'p2', 5, 500)
line('s3-b', 's3', 'p1', 5, 500)
refund('r1', 's3', [{ product_id: 'p2', quantity: 2 }], 200)
// s4: today, voided.  s5: today, refunded in full.
sale('s4', 'R-2026-000004', later, { status: 'voided', void_reason: 'mis-ring', voided_by: 'u2' })
line('s4-a', 's4', 'p2', 1, 1000)
sale('s5', 'R-2026-000005', later, { status: 'refunded' })
line('s5-a', 's5', 'p2', 2, 1000)
refund('r2', 's5', [{ product_id: 'p2', quantity: 2 }], 1000)

const ids = (page) => page.rows.map((r) => r.id)

console.log('\nThe list is newest first, paged, and counted')
{
  const all = listSalesPage(db, {})
  check('every sale', all.total, 5)
  check('newest first', ids(all), ['s5', 's4', 's1', 's2', 's3'])
  const p2 = listSalesPage(db, { limit: 2, offset: 2 })
  check('a page', ids(p2), ['s1', 's2'])
  check('the count is the whole match, not the page', p2.total, 5)
  const r = all.rows.find((x) => x.id === 's1')
  check('cashier named', r.cashier_name, 'Kamala Cashier')
  check(
    'customer from the record',
    [r.customer_name, r.customer_phone],
    ['Nimal Perera', '0771234567']
  )
  const walkIn = all.rows.find((x) => x.id === 's2')
  check(
    'or from the sale',
    [walkIn.customer_name, walkIn.customer_phone],
    ['Walk-in', '0719876543']
  )
}

console.log('\nStatus: completed, part refunded, refunded, voided')
{
  const byId = Object.fromEntries(listSalesPage(db, {}).rows.map((r) => [r.id, r.status]))
  check('statuses', byId, {
    s5: 'refunded',
    s4: 'voided',
    s1: 'completed',
    s2: 'completed',
    s3: 'part_refunded'
  })
  check('filter: part refunded', ids(listSalesPage(db, { status: 'part_refunded' })), ['s3'])
  check(
    'filter: completed leaves the part refunded out',
    ids(listSalesPage(db, { status: 'completed' })),
    ['s1', 's2']
  )
  check('filter: voided', ids(listSalesPage(db, { status: 'voided' })), ['s4'])
  check(
    'refunded amount listed',
    listSalesPage(db, { status: 'part_refunded' }).rows[0].refunded,
    200
  )
  check('an unknown status is ignored', listSalesPage(db, { status: 'bogus' }).total, 5)
}

console.log('\nSearch: receipt number, customer name, phone in any format')
{
  check('receipt', ids(listSalesPage(db, { search: '000003' })), ['s3'])
  check('full receipt', ids(listSalesPage(db, { search: 'R-2026-000002' })), ['s2'])
  check('customer name', ids(listSalesPage(db, { search: 'nimal' })), ['s1'])
  check('phone as stored', ids(listSalesPage(db, { search: '0771234567' })), ['s1'])
  check('phone typed +94', ids(listSalesPage(db, { search: '+94 77 123 4567' })), ['s1'])
  check('phone on the sale only', ids(listSalesPage(db, { search: '071 987' })), ['s2'])
  check('LIKE wildcards are not wildcards', listSalesPage(db, { search: '%' }).total, 5)
  check('no match', listSalesPage(db, { search: 'R-1999' }).total, 0)
}

console.log('\nDates are the LOCAL calendar day of the sale')
{
  check('today', ids(listSalesPage(db, { startDate: today, endDate: today })), ['s5', 's4', 's1'])
  if (justAfterMidnight.getTimezoneOffset() < 0) {
    check(
      '(00:30 local is yesterday in UTC, and is still today)',
      justAfterMidnight.toISOString().slice(0, 10) === today,
      false
    )
  }
  const y = localDate(yesterdayNoon)
  check('yesterday alone', ids(listSalesPage(db, { startDate: y, endDate: y })), ['s2'])
  check('a range', ids(listSalesPage(db, { startDate: localDate(lastWeek), endDate: y })), [
    's2',
    's3'
  ])
  check(
    'filters combine',
    ids(listSalesPage(db, { startDate: today, endDate: today, status: 'completed' })),
    ['s1']
  )
  check('a malformed date is ignored', listSalesPage(db, { startDate: "today' OR 1=1" }).total, 5)
}

console.log('\nVoid: same day, completed, nothing refunded')
{
  check('today, untouched', voidBlockReason(voidCheck(db, 's1')), null)
  check('yesterday', /Only today/.test(voidBlockReason(voidCheck(db, 's2'))), true)
  check('part refunded', /refunds against it/.test(voidBlockReason(voidCheck(db, 's3'))), true)
  check('voided', /already been voided/.test(voidBlockReason(voidCheck(db, 's4'))), true)
  check('refunded', /refunded in full/.test(voidBlockReason(voidCheck(db, 's5'))), true)
  check('a missing sale', voidCheck(db, 'nope'), null)
}

console.log('\nRefund quote: from the sale, after its discount, the way it was paid')
{
  const q = quoteRefund(db, 's1', [{ product_id: 'p1', quantity: 3 }])
  check('3 of 10 at 90 each', q.amount, 270)
  check('VAT share', q.tax, 41.19)
  check('cash sale: all cash', [q.cash, q.card], [270, 0])
  check('not everything', q.fully_refunded, false)
  const card = quoteRefund(db, 's2', [{ product_id: 'p2', quantity: 1 }])
  check('card sale: back to the card', [card.amount, card.cash, card.card], [250, 0, 250])
  check(
    'what was already refunded counts',
    quoteRefund(db, 's3', [
      { product_id: 'p2', quantity: 3 },
      { product_id: 'p1', quantity: 5 }
    ]).fully_refunded,
    true
  )
  throws(
    'no more than remains',
    () => quoteRefund(db, 's3', [{ product_id: 'p2', quantity: 4, product_name: 'Panadol' }]),
    /only 3 remain/
  )
  throws(
    'listed twice cannot exceed it either',
    () =>
      quoteRefund(db, 's3', [
        { product_id: 'p2', quantity: 2 },
        { product_id: 'p2', quantity: 2 }
      ]),
    /only 1 remain/
  )
  throws(
    'not on the sale',
    () => quoteRefund(db, 's1', [{ product_id: 'p2', quantity: 1 }]),
    /not part/
  )
  throws('a fraction', () => quoteRefund(db, 's1', [{ product_id: 'p1', quantity: 0.5 }]), /whole/)
  throws('voided', () => quoteRefund(db, 's4', [{ product_id: 'p2', quantity: 1 }]), /voided/)
  check('nothing chosen prices at nothing', quoteRefund(db, 's1', []).amount, 0)
}

console.log('\nDetail: lines, refunded quantities, refunds, and what can be done')
{
  const d = getSaleDetail(db, 's1')
  check('name as dispensed, not the renamed product', d.items[0].product_name, 'Amoxil 500mg')
  check(
    'line paid after its discount share',
    [d.items[0].discount_amount, d.items[0].paid],
    [100, 900]
  )
  check('VAT rate from the line', d.sale.vat_rate, 18)
  check(
    'nothing refunded yet',
    [d.items[0].refunded_quantity, d.items[0].refundable_quantity],
    [0, 10]
  )
  check('can void, can refund', [d.void_blocked, d.refund_blocked], [null, null])

  const p = getSaleDetail(db, 's3')
  check('part refunded', p.sale.status, 'part_refunded')
  check(
    'refunded per line',
    p.items.map((i) => [i.product_id, i.refunded_quantity, i.refundable_quantity]),
    [
      ['p2', 2, 3],
      ['p1', 0, 5]
    ]
  )
  check(
    'refund history',
    p.refunds.map((r) => [r.total_refunded, r.user_name, r.items]),
    [[200, 'Mala Manager', [{ product_id: 'p2', product_name: 'Panadol', quantity: 2 }]]]
  )
  check('net of refunds', [p.sale.refunded, p.sale.net_total], [200, 800])
  check('cannot void, can refund the rest', [!!p.void_blocked, p.refund_blocked], [true, null])

  const v = getSaleDetail(db, 's4')
  check(
    'voided: who and why',
    [v.sale.voided_by_name, v.sale.void_reason],
    ['Mala Manager', 'mis-ring']
  )
  check('voided: nothing refundable', v.items[0].refundable_quantity, 0)
  check('voided: refund refused', /voided/.test(v.refund_blocked), true)

  const f = getSaleDetail(db, 's5')
  check('refunded in full: nothing left', /already been refunded/.test(f.refund_blocked), true)
  check('missing sale', getSaleDetail(db, 'nope'), null)
}

console.log(`\n${pass} passed, ${failures.length} failed`)
if (failures.length) {
  console.log('Failed:\n  ' + failures.join('\n  '))
  process.exit(1)
}
