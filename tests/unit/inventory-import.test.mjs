// Unit test for the Excel catalogue import.
//
// Run with:  npm run test:import
//
// Why this is not a Playwright spec: the risky part of the import is pure
// parsing and validation, and it lives in the main process. Driving it through
// the real IPC channel would mean stubbing `dialog.showOpenDialog` and shipping
// a binary .xlsx fixture — and the project has no xlsx *writer* dependency, only
// a reader. `importProductRows` takes already-parsed rows, which is exactly the
// seam to test: arrays in, decisions out.
//
// No test framework: esbuild (already present via Vite) bundles the module with
// the database and inventory layers stubbed, so this runs on plain Node with no
// native modules and no new dependencies.

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-import-test-'))
const servicesDir = path.join(work, 'services')
fs.mkdirSync(servicesDir, { recursive: true })

// Stubs sit beside the bundle so its own `require('./database')` and
// `require('./inventory')` resolve to them.
fs.writeFileSync(
  path.join(servicesDir, 'database.js'),
  `exports.getDatabase = () => ({ transaction: (fn) => () => fn() })\n`
)
fs.writeFileSync(
  path.join(servicesDir, 'inventory.js'),
  `const calls = { products: [], batches: [], categories: [], suppliers: [] }
exports.__calls = calls
exports.getCategories = () => []
exports.getSuppliers = () => []
exports.createCategory = (d) => { calls.categories.push(d); return { id: 'cat-' + calls.categories.length } }
exports.createSupplier = (d) => { calls.suppliers.push(d); return { id: 'sup-' + calls.suppliers.length } }
exports.createProduct = (d) => { calls.products.push(d); return { id: 'p-' + calls.products.length } }
exports.createStockBatch = (d) => { calls.batches.push(d); return { id: 'b-' + calls.batches.length } }
`
)

// bin/esbuild is a JS shim on Windows but the native binary on macOS/Linux.
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild')
const esbuildIsJs = fs.readFileSync(ESBUILD).subarray(0, 2).toString() === '#!'

execFileSync(
  esbuildIsJs ? process.execPath : ESBUILD,
  [
    ...(esbuildIsJs ? [ESBUILD] : []),
    path.join(ROOT, 'src/main/services/inventory-import.ts'),
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--external:./database',
    '--external:./inventory',
    `--outfile=${path.join(servicesDir, 'inventory-import.js')}`
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] }
)

const require_ = createRequire(path.join(servicesDir, 'x.js'))
const { importProductRows } = require_('./inventory-import.js')
const inv = require_('./inventory.js')

let pass = 0
const failures = []
const check = (name, cond, detail) => {
  if (cond) {
    pass++
    console.log('  ok   ' + name)
  } else {
    failures.push(name)
    console.log('  FAIL ' + name + (detail ? ' — ' + detail : ''))
  }
}
const reset = () => {
  const c = inv.__calls
  c.products.length = 0
  c.batches.length = 0
  c.categories.length = 0
  c.suppliers.length = 0
}

const H = [
  'Name',
  'Cost Price',
  'Unit Price',
  'Current Stock',
  'Expiry Date',
  'Batch No',
  'Category',
  'Supplier',
  'Tax Rate'
]
const row = (o = {}) => [
  o.name ?? 'Paracetamol 500mg',
  o.cost ?? 10,
  o.price ?? 25,
  o.stock ?? 50,
  o.expiry ?? '2027-06-30',
  o.batch ?? 'B1',
  o.cat ?? 'Analgesics',
  o.sup ?? 'Acme',
  o.tax ?? 0
]

let r

console.log('\nH17 — number parsing')
reset()
r = importProductRows([H, row({ price: '1,234.50' })])
check(
  'comma thousands parsed, not truncated to 1 (parseFloat returned 1)',
  r.imported === 1 && inv.__calls.products[0].unit_price === 1234.5,
  JSON.stringify(r.errors)
)
reset()
r = importProductRows([H, row({ price: '1234,50' })])
check(
  'European decimal comma parsed',
  r.imported === 1 && inv.__calls.products[0].unit_price === 1234.5,
  JSON.stringify(r.errors)
)
reset()
r = importProductRows([H, row({ price: '12 tablets' })])
check(
  'non-numeric price refused rather than read as 12',
  r.imported === 0 && /not a number/.test(r.errors[0] ?? ''),
  JSON.stringify(r.errors)
)
reset()
r = importProductRows([H, row({ tax: 'abc' })])
check(
  'unreadable tax rate is an error, not a silent 0',
  r.imported === 0 && /tax rate/.test(r.errors[0] ?? ''),
  JSON.stringify(r.errors)
)
reset()
r = importProductRows([
  ['Name', 'Cost Price', 'Unit Price', 'Current Stock', 'Expiry Date'],
  ['Aspirin', 5, 12, 3, '2027-01-31']
])
check(
  'an absent optional column takes the documented default',
  r.imported === 1 && inv.__calls.products[0].reorder_level === 10,
  JSON.stringify(r.errors)
)

console.log('\nH16 — expiry, batch, category, supplier are no longer dropped')
reset()
r = importProductRows([H, row()])
check(
  'expiry reaches the batch',
  inv.__calls.batches[0]?.expiry_date === '2027-06-30',
  JSON.stringify(inv.__calls.batches[0])
)
check(
  'batch number reaches the batch',
  inv.__calls.batches[0]?.batch_number === 'B1',
  JSON.stringify(inv.__calls.batches[0])
)
check(
  'category resolved and linked',
  inv.__calls.categories.length === 1 && inv.__calls.products[0].category_id === 'cat-1',
  JSON.stringify(inv.__calls.products[0])
)
check(
  'supplier resolved and linked',
  inv.__calls.suppliers.length === 1 && inv.__calls.products[0].supplier_id === 'sup-1',
  JSON.stringify(inv.__calls.products[0])
)
reset()
r = importProductRows([H, row({ expiry: '' })])
check(
  'stock with no expiry is refused — this was a whole catalogue silently untracked',
  r.imported === 0 && /no expiry date/i.test(r.errors[0] ?? ''),
  JSON.stringify(r.errors)
)
reset()
r = importProductRows([H.concat(['Track Expiry']), row({ expiry: '' }).concat(['no'])])
check(
  'Track Expiry = no allows stock without an expiry',
  r.imported === 1,
  JSON.stringify(r.errors)
)
reset()
r = importProductRows([H, row({ expiry: '', stock: 0 })])
check(
  'zero stock needs no expiry and creates no batch',
  r.imported === 1 && inv.__calls.batches.length === 0,
  JSON.stringify(r.errors)
)

console.log('\nExpiry formats')
for (const [input, expected] of [
  ['2027-06-30', '2027-06-30'],
  ['30/06/2027', '2027-06-30'],
  ['06-2027', '2027-06-30'],
  ['2027-06', '2027-06-30']
]) {
  reset()
  r = importProductRows([H, row({ expiry: input })])
  check(
    `${input} → ${expected}`,
    r.imported === 1 && inv.__calls.batches[0]?.expiry_date === expected,
    JSON.stringify(r.errors)
  )
}
reset()
r = importProductRows([H, row({ expiry: '06/07/2027' })])
check(
  'ambiguous DD/MM vs MM/DD is refused, not guessed',
  r.imported === 0 && /ambiguous/i.test(r.errors[0] ?? ''),
  JSON.stringify(r.errors)
)
reset()
r = importProductRows([H, row({ expiry: new Date(Date.UTC(2028, 2, 15)) })])
check(
  'a real Date cell is accepted',
  r.imported === 1 && inv.__calls.batches[0]?.expiry_date === '2028-03-15',
  JSON.stringify(r.errors)
)

console.log('\nAtomicity, duplicates, error capping')
reset()
r = importProductRows([
  H,
  row({ name: 'Good' }),
  row({ name: 'Bad', price: 'xx' }),
  row({ name: 'Also good' })
])
check(
  'one bad row writes nothing — a per-row transaction left 3,999 of 4,000 committed',
  r.imported === 0 && inv.__calls.products.length === 0,
  JSON.stringify({ imported: r.imported, written: inv.__calls.products.length })
)
reset()
r = importProductRows([
  H.concat(['Barcode']),
  row({ name: 'A' }).concat(['DUP']),
  row({ name: 'B' }).concat(['DUP'])
])
check(
  'a duplicate barcode within the sheet is caught before the database, naming both rows',
  r.imported === 0 && /already used on row 2/.test(r.errors[0] ?? ''),
  JSON.stringify(r.errors)
)
reset()
const many = [H]
for (let i = 0; i < 200; i++) many.push(row({ name: 'Item ' + i, price: 'bad' }))
r = importProductRows(many)
check(
  'errors capped at 50, with a count of the rest',
  r.errors.length === 50 && r.errorsTruncated === 150,
  JSON.stringify({ shown: r.errors.length, truncated: r.errorsTruncated })
)
check('total row count reported', r.totalRows === 200, String(r.totalRows))

console.log('\nHeader and shape validation')
r = importProductRows([
  ['Cost Price', 'Unit Price'],
  [1, 2]
])
check(
  'a missing Name column is reported once, not once per row',
  r.errors.length === 1 && /No "Name" column/.test(r.errors[0]),
  JSON.stringify(r.errors)
)
r = importProductRows([])
check(
  'an empty sheet is reported',
  r.errors.length === 1 && /empty/i.test(r.errors[0]),
  JSON.stringify(r.errors)
)
reset()
r = importProductRows([H, row({ name: 'Real' }), ['', '', '', '', '', '', '', '', '']])
check(
  'a trailing blank row is ignored rather than reported',
  r.imported === 1 && r.errors.length === 0,
  JSON.stringify(r.errors)
)

console.log('\nR1 — per-batch selling price')
reset()
r = importProductRows([H, row({ price: 25 })])
check(
  'the batch records the price it was brought in to sell at',
  inv.__calls.batches[0]?.selling_price === 25,
  JSON.stringify(inv.__calls.batches[0])
)

fs.rmSync(work, { recursive: true, force: true })

console.log(`\n${pass}/${pass + failures.length} passed`)
if (failures.length) {
  console.log('failed:\n  ' + failures.join('\n  '))
  process.exit(1)
}
