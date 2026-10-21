// Unit test for the Analytics → Reports PDFs.
//
// Run with:  npm run test:pdf
//
// The reports used to carry their own blue/slate palette (blue-800 header,
// slate tables), so they looked like a different product from the teal app.
// They now draw from src/renderer/src/lib/pdf-theme.ts. This checks that
//   1. the PDF palette still matches the light :root tokens in globals.css
//      (a PDF cannot read CSS variables, so the hex values are copies), and
//   2. each report builds, paginates, carries the branded header and footer
//      on every page, and draws in the app's colours rather than the old ones.
//
// Set PDF_OUT=<dir> to keep the generated PDFs for a visual check.

/* eslint-disable @typescript-eslint/explicit-function-return-type -- plain .mjs, no type syntax */

import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-pdf-test-'))
const outFile = path.join(work, 'pdf-reports.js')

// bin/esbuild is a JS shim on Windows but the native binary on macOS/Linux.
const ESBUILD = path.join(ROOT, 'node_modules/esbuild/bin/esbuild')
const esbuildIsJs = fs.readFileSync(ESBUILD).subarray(0, 2).toString() === '#!'

// Bundle a tiny entry that re-exports the builders and the theme.
const entry = path.join(work, 'entry.ts')
fs.writeFileSync(
  entry,
  `export * from ${JSON.stringify(path.join(ROOT, 'src/renderer/src/lib/pdf-reports.ts'))}\n` +
    `export * from ${JSON.stringify(path.join(ROOT, 'src/renderer/src/lib/pdf-theme.ts'))}\n`
)
execFileSync(
  esbuildIsJs ? process.execPath : ESBUILD,
  [
    ...(esbuildIsJs ? [ESBUILD] : []),
    entry,
    '--bundle',
    '--platform=node',
    '--format=cjs',
    // jsPDF's html()/svg plugins load these lazily; reports never use them.
    '--external:canvg',
    '--external:html2canvas',
    '--external:dompurify',
    '--log-level=error',
    `--outfile=${outFile}`
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] }
)

const require_ = createRequire(path.join(work, 'x.js'))
const { buildSalesPdf, buildInventoryPdf, buildProfitLossPdf, PDF_COLORS, PDF_CHART_SERIES, rgb } =
  require_('./pdf-reports.js')

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

// ── 1. Palette mirrors globals.css ──────────────────────────────────────────

function oklchToRgb(L, C, H) {
  const h = (H * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ]
  return lin.map((x) => {
    x = Math.max(0, Math.min(1, x))
    return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055))
  })
}

const css = fs.readFileSync(path.join(ROOT, 'src/renderer/src/styles/globals.css'), 'utf8')
const rootStart = css.indexOf(':root {')
const rootBlock = css.slice(rootStart, css.indexOf('}', rootStart))
const tokens = {}
for (const m of rootBlock.matchAll(/--([\w-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)) {
  tokens[m[1]] = oklchToRgb(Number(m[2]), Number(m[3]), Number(m[4]))
}

// PDF key → globals.css token. primaryPressed is the pressed/hover teal, which
// globals.css spells as --accent-foreground.
const MAP = {
  primary: 'primary',
  primaryPressed: 'accent-foreground',
  primaryForeground: 'primary-foreground',
  accent: 'accent',
  canvas: 'canvas',
  card: 'card',
  muted: 'muted',
  mutedForeground: 'muted-foreground',
  border: 'border',
  foreground: 'foreground',
  success: 'success',
  successMuted: 'success-muted',
  warning: 'warning',
  warningMuted: 'warning-muted',
  destructive: 'destructive',
  info: 'info',
  infoMuted: 'info-muted'
}
const close = (a, b) => a.every((c, i) => Math.abs(c - b[i]) <= 3)

console.log('\nThe PDF palette mirrors the light :root tokens')
check(
  'every PDF colour is mapped to a token',
  Object.keys(PDF_COLORS).sort(),
  Object.keys(MAP).sort()
)
for (const [key, token] of Object.entries(MAP)) {
  check(`${key} ≈ --${token}`, tokens[token] && close(rgb(PDF_COLORS[key]), tokens[token]), true)
}
PDF_CHART_SERIES.forEach((hex, i) =>
  check(`chart series ${i + 1} ≈ --chart-${i + 1}`, close(rgb(hex), tokens[`chart-${i + 1}`]), true)
)

// ── 2. The reports ───────────────────────────────────────────────────────────

/** Every colour a page sets: `r g b rg` (fill) and `r g b RG` (stroke), in 0…255.
 *  jsPDF writes these with two or three decimals depending on the call. */
function coloursIn(raw, op) {
  const out = []
  for (const m of raw.matchAll(new RegExp(`([\\d.]+) ([\\d.]+) ([\\d.]+) ${op}\\b`, 'g'))) {
    out.push([m[1], m[2], m[3]].map((v) => Number(v) * 255))
  }
  return out
}
const usesColour = (raw, hex, op) =>
  coloursIn(raw, op).some((c) => c.every((v, i) => Math.abs(v - rgb(hex)[i]) <= 2))

/** Rendered page streams, text and the number of pages. */
function inspect(doc, file) {
  const bytes = Buffer.from(doc.output('arraybuffer'))
  if (process.env.PDF_OUT) {
    fs.mkdirSync(process.env.PDF_OUT, { recursive: true })
    fs.writeFileSync(path.join(process.env.PDF_OUT, file), bytes)
  }
  const raw = bytes.toString('latin1')
  return { raw, pages: doc.getNumberOfPages(), head: raw.slice(0, 5) }
}

const has = (raw, s) => raw.includes(s)
// Standard-font text is stored in WinAnsi, where the dashes and the middle dot
// are single bytes.
const WINANSI = { '–': '\x96', '—': '\x97', '·': '\xb7' }
const textOp = (s) => `(${s.replace(/[()\\]/g, '\\$&').replace(/[–—·]/g, (c) => WINANSI[c])}) Tj`

function commonChecks(label, report, { title, period, minPages = 1 }) {
  check(`${label}: is a PDF`, report.head, '%PDF-')
  check(`${label}: at least ${minPages} page(s)`, report.pages >= minPages, true)
  check(`${label}: header shows the business name`, has(report.raw, textOp('Test Pharmacy')), true)
  check(`${label}: header shows the title`, has(report.raw, textOp(title)), true)
  check(`${label}: header shows the period`, has(report.raw, textOp(period)), true)
  for (let i = 1; i <= report.pages; i++) {
    check(
      `${label}: footer on page ${i}`,
      has(report.raw, textOp(`Page ${i} of ${report.pages}`)),
      true
    )
  }
  check(
    `${label}: footer names the business`,
    has(report.raw, textOp(`Test Pharmacy  ·  ${title}  ·  Confidential`)),
    true
  )
  check(`${label}: teal brand fill`, usesColour(report.raw, PDF_COLORS.primary, 'rg'), true)
  check(`${label}: muted table header`, usesColour(report.raw, PDF_COLORS.muted, 'rg'), true)
  check(`${label}: canvas zebra rows`, usesColour(report.raw, PDF_COLORS.canvas, 'rg'), true)
  check(`${label}: card borders`, usesColour(report.raw, PDF_COLORS.border, 'RG'), true)
  // The old palette: blue-800 header band and slate-900 text.
  check(`${label}: no old blue-800`, usesColour(report.raw, '#1E40AF', 'rg'), false)
  check(`${label}: no old slate-900 text`, usesColour(report.raw, '#0F172A', 'rg'), false)
}

const days = Array.from({ length: 31 }, (_, i) => ({
  date: `2026-10-${String((i % 31) + 1).padStart(2, '0')}`,
  sales: 1000 + i * 37.5,
  profit: i === 4 ? -120.5 : 200 + i,
  transactions: 10 + i
}))
const sales = {
  start_date: '2026-09-20',
  end_date: '2026-10-20',
  total_sales: 1234567.89,
  total_profit: 234567.12,
  total_cost: 1000000.77,
  total_transactions: 4321,
  total_items_sold: 9876,
  avg_transaction: 285.71,
  daily_breakdown: days,
  top_products: Array.from({ length: 10 }, (_, i) => ({
    product_name: `Paracetamol 500mg Tablets x${i + 1}`,
    quantity: 100 - i,
    revenue: 5000 - i * 100,
    profit: 900 - i * 50
  })),
  payment_methods: [
    { method: 'cash', count: 300, amount: 900000 },
    { method: 'card', count: 120, amount: 300000 },
    { method: 'bank_transfer', count: 4, amount: 34567.89 }
  ]
}

console.log('\nSales report')
const salesPdf = inspect(buildSalesPdf(sales, 'Test Pharmacy', 'Rs.'), 'sales-report.pdf')
commonChecks('sales', salesPdf, {
  title: 'Sales Report',
  period: '20 Sep 2026 – 20 Oct 2026',
  minPages: 2
})
check('sales: money stays in the old format', has(salesPdf.raw, textOp('Rs. 1,234,567.89')), true)
check(
  'sales: a loss day is drawn in destructive',
  usesColour(salesPdf.raw, PDF_COLORS.destructive, 'rg'),
  true
)
check(
  'sales: running header on page 2',
  has(salesPdf.raw, textOp('Sales Report  ·  20 Sep 2026 – 20 Oct 2026')),
  true
)

console.log('\nSales report, empty period')
const emptySales = inspect(
  buildSalesPdf(
    { ...sales, daily_breakdown: [], top_products: [], payment_methods: [], total_profit: 0 },
    'Test Pharmacy',
    'Rs.'
  ),
  'sales-report-empty.pdf'
)
check('empty sales: one page', emptySales.pages, 1)
check('empty sales: says so', has(emptySales.raw, textOp('No sales in this period')), true)

const inventory = {
  total_value: 456789.5,
  total_cost: 321098.25,
  total_items: 80,
  expired_value: 1500,
  expired_cost: 900,
  expired_units: 12,
  by_category: [
    {
      category_name: 'Analgesics',
      item_count: 30,
      total_quantity: 1500,
      total_value: 200000,
      total_cost: 140000
    },
    {
      category_name: 'Antibiotics',
      item_count: 50,
      total_quantity: 900,
      total_value: 256789.5,
      total_cost: 181098.25
    }
  ],
  by_product: Array.from({ length: 80 }, (_, i) => ({
    product_name: `Amoxicillin 250mg Capsules ${i + 1}`,
    quantity: 20 + i,
    cost_per_unit: 12.5,
    unit_price: 18,
    total_cost: (20 + i) * 12.5,
    total_value: (20 + i) * 18
  }))
}

console.log('\nInventory valuation')
const invPdf = inspect(
  buildInventoryPdf(inventory, 'Test Pharmacy', 'Rs.'),
  'inventory-valuation.pdf'
)
const now = new Date()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const todayLabel = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`
commonChecks('inventory', invPdf, {
  title: 'Inventory Valuation Report',
  period: `As of ${todayLabel}`,
  minPages: 2
})
check('inventory: expired stock called out', has(invPdf.raw, textOp('Expired stock')), true)
check(
  'inventory: expired callout in destructive',
  usesColour(invPdf.raw, PDF_COLORS.destructive, 'rg'),
  true
)
check(
  'inventory: sellable-stock note kept (H28)',
  invPdf.raw.includes('Figures cover sellable stock only'),
  true
)

const invNoExpired = inspect(
  buildInventoryPdf({ ...inventory, expired_units: 0 }, 'Test Pharmacy', 'Rs.'),
  'inventory-valuation-no-expired.pdf'
)
check(
  'inventory, nothing expired: no expired callout',
  has(invNoExpired.raw, textOp('Expired stock')),
  false
)

console.log('\nProfit & loss')
const pl = {
  start_date: '2026-08-01',
  end_date: '2026-10-20',
  total_revenue: 900000,
  total_cost: 650000,
  gross_profit: 250000,
  gross_margin_percent: 27.78,
  by_category: [
    {
      category_name: 'Analgesics',
      revenue: 500000,
      cost: 300000,
      profit: 200000,
      margin_percent: 40
    },
    {
      category_name: 'Antibiotics',
      revenue: 380000,
      cost: 320000,
      profit: 60000,
      margin_percent: 15.79
    },
    { category_name: 'Clearance', revenue: 20000, cost: 30000, profit: -10000, margin_percent: -50 }
  ],
  by_month: [
    { month: '2026-08', revenue: 300000, cost: 220000, profit: 80000 },
    { month: '2026-09', revenue: 350000, cost: 250000, profit: 100000 },
    { month: '2026-10', revenue: 250000, cost: 180000, profit: 70000 }
  ]
}
const plPdf = inspect(buildProfitLossPdf(pl, 'Test Pharmacy', 'Rs.'), 'profit-loss.pdf')
commonChecks('p&l', plPdf, { title: 'Profit & Loss Statement', period: '1 Aug 2026 – 20 Oct 2026' })
check('p&l: TOTAL row kept', has(plPdf.raw, textOp('TOTAL')), true)
check('p&l: total row on the accent tint', usesColour(plPdf.raw, PDF_COLORS.accent, 'rg'), true)
check(
  'p&l: loss-making category in destructive',
  usesColour(plPdf.raw, PDF_COLORS.destructive, 'rg'),
  true
)
check('p&l: profit in success', usesColour(plPdf.raw, PDF_COLORS.success, 'rg'), true)

fs.rmSync(work, { recursive: true, force: true })

console.log(`\n${pass}/${pass + failures.length} passed`)
if (failures.length) {
  console.log('failed:\n  ' + failures.join('\n  '))
  process.exit(1)
}
