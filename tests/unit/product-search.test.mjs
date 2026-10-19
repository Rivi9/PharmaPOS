// Unit test for the till's product search ranking.
//
// Run with:  npm run test:search
//
// The old search was one `LIKE '%query%'` per column, ordered by name and cut
// to six rows in the dropdown. Typing "azi" matched Azigen, Azileb, both
// Azithromycin lines, Silver Sulfadiazine, Clofazimine, Diazide and Gliclazide,
// so the product the cashier wanted fell off the end of an alphabetical list.
// "azithromycin 500" matched nothing when the strength lived in the brand name
// and the molecule in generic_name. The SQL here is run against node:sqlite
// with names taken from the shop's own product list.

import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-search-test-'))
const outFile = path.join(work, 'product-search.js')

// esbuild's JS API rather than `node node_modules/esbuild/bin/esbuild`: on
// macOS that path is the native binary, not a JS shim.
createRequire(path.join(ROOT, 'package.json'))('esbuild').buildSync({
  entryPoints: [path.join(ROOT, 'src/shared/product-search.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: outFile,
  logLevel: 'error'
})

const require_ = createRequire(path.join(work, 'x.js'))
const { tokenize, productSearchQuery } = require_('./product-search.js')

const db = new DatabaseSync(':memory:')
db.exec(`
  CREATE TABLE products (
    id TEXT PRIMARY KEY, barcode TEXT, sku TEXT, name TEXT NOT NULL, generic_name TEXT,
    unit_price REAL NOT NULL, is_active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE stock_batches (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL, quantity REAL NOT NULL,
    selling_price REAL, expiry_date TEXT, received_date TEXT NOT NULL
  );
  CREATE INDEX idx_stock_batches_product_expiry ON stock_batches(product_id, expiry_date);
`)

// [name, generic, sku, barcode, stock]
const catalogue = [
  ['Azigen 500mg', 'Azithromycin', 'AZG500', '4790001', 12],
  ['Azigen Syr', 'Azithromycin', 'AZGSYR', '4790002', 5],
  ['Azileb Syr200', 'Azithromycin', 'AZL200', '4790003', 0],
  ['Azithromycin 250mg', 'Azithromycin', 'AZT250', '4790004', 30],
  ['Azithromycin 500mg', 'Azithromycin', 'AZT500', '4790005', 40],
  ['Azithromycin Syrup', 'Azithromycin', 'AZTSYR', '4790006', 3],
  ['Burna Cream- (Silver Sulfardiazine)', 'Silver Sulfadiazine', 'BRN01', '4790007', 8],
  ['Clofazimine', 'Clofazimine', 'CLF01', '4790008', 4],
  ['Diazide 40mg', 'Gliclazide', 'DZD40', '4790009', 9],
  ['Gliclazide 80mg', 'Gliclazide', 'GLZ80', '4790010', 20],
  ['Paracetamol 500mg', 'Paracetamol', 'PARA500', '4790011', 100],
  ['Panadol 500mg', 'Paracetamol', 'PAN500', '4790012', 50],
  ['Amoxicillin 500mg', 'Amoxicillin', 'AMX500', '4790013', 25],
  ['Inactive Azi Thing', 'Azithromycin', 'OLD1', '4790014', 99]
]
const insP = db.prepare(
  'INSERT INTO products (id,barcode,sku,name,generic_name,unit_price,is_active) VALUES (?,?,?,?,?,?,?)'
)
const insB = db.prepare(
  'INSERT INTO stock_batches (id,product_id,quantity,selling_price,expiry_date,received_date) VALUES (?,?,?,?,?,?)'
)
catalogue.forEach(([name, generic, sku, barcode, stock], i) => {
  const id = 'p' + i
  insP.run(id, barcode, sku, name, generic, 10 + i, name.startsWith('Inactive') ? 0 : 1)
  if (stock > 0) insB.run('b' + i, id, stock, null, '2099-01-01', '2026-01-01')
})

const search = (q, limit = 20) => {
  const built = productSearchQuery(q, { limit })
  if (!built) return []
  return db.prepare(built.sql).all(...built.params).map((r) => r.name)
}

let pass = 0
const failures = []
const check = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log(`  ok   ${name}`)
  } else {
    failures.push(name)
    console.log(`  FAIL ${name}\n       got  ${JSON.stringify(actual)}\n       want ${JSON.stringify(expected)}`)
  }
}

console.log('\nTokenising')
check('lower-cases and splits on whitespace', tokenize('  Azithromycin   500 '), ['azithromycin', '500'])
check('LIKE wildcards are not search terms', tokenize('%_ para%'), ['para'])
check('blank query has no tokens', tokenize('   '), [])
check('no query is built for a blank search', productSearchQuery('  ', { limit: 5 }), null)

console.log('\n"azi": names that start with it come before names that merely contain it')
const azi = search('azi')
check(
  'first five are the Azi… products, in stock first, shortest name first',
  azi.slice(0, 5),
  ['Azigen Syr', 'Azigen 500mg', 'Azithromycin 250mg', 'Azithromycin 500mg', 'Azithromycin Syrup']
)
check('the out-of-stock Azi… product follows the in-stock ones', azi[5], 'Azileb Syr200')
check(
  'mid-word matches (…diazine, Clofazimine, Gliclazide) rank below',
  azi.indexOf('Clofazimine') > 5 && azi.indexOf('Gliclazide 80mg') > 5,
  true
)
check('inactive products never appear', azi.includes('Inactive Azi Thing'), false)

console.log('\nEvery word must match, in any field and any order')
check(
  '"azithromycin 500" finds the exact name, then the brand that carries the strength',
  search('azithromycin 500'),
  ['Azithromycin 500mg', 'Azigen 500mg']
)
check('"para 500" finds Paracetamol 500mg first', search('para 500')[0], 'Paracetamol 500mg')
check('word order does not matter', search('500 para')[0], 'Paracetamol 500mg')
check('a generic name finds its brands', search('paracetamol').sort(), ['Panadol 500mg', 'Paracetamol 500mg'])
check('a word that matches nothing empties the list', search('azithromycin 999'), [])

console.log('\nCodes')
check('exact barcode ranks first', search('4790005')[0], 'Azithromycin 500mg')
check('exact SKU ranks first, case-insensitive', search('amx500')[0], 'Amoxicillin 500mg')
check('word start after punctuation counts: "silver"', search('silver')[0], 'Burna Cream- (Silver Sulfardiazine)')

console.log('\nLimit')
check('limit caps the rows', search('a', 3).length, 3)

console.log(`\n${pass} passed, ${failures.length} failed`)
fs.rmSync(work, { recursive: true, force: true })
if (failures.length) process.exit(1)
