import { getDatabase } from './database'
import * as inventory from './inventory'

/**
 * Excel catalogue import.
 *
 * This is how a pharmacy loads its opening stock, so the failure modes matter
 * more than the happy path. The previous implementation:
 *
 *  - read ten columns and silently dropped expiry date, batch number, category
 *    and supplier, so a supplier price list containing `Expiry Date` imported
 *    "successfully" with `expiry_date = NULL` — an entire inventory with no
 *    expiry tracking, reported as a clean success (H16);
 *  - used `parseFloat('1,234.50')`, which returns **1**, creating the product at
 *    Rs. 1.00 and counting it as imported with no error (H17);
 *  - used `|| 0` / `|| 5` fallbacks, so a present-but-unreadable tax rate or
 *    reorder level was silently rewritten rather than reported;
 *  - ran one transaction **per row**, so a failure at row 4,000 left 3,999 rows
 *    committed with nothing to roll back to, and 10,000 separate transactions is
 *    what actually froze the main process.
 *
 * The import is now atomic: every row is parsed and validated first, and nothing
 * is written unless the whole sheet is clean. A half-imported medicine catalogue
 * is worse than a refused one — the operator cannot tell which half is missing,
 * and the stock figures are wrong in a way no report reveals.
 */

export interface ImportOutcome {
  imported: number
  batchesCreated: number
  /** Human-readable problems. Capped — see `errorsTruncated`. */
  errors: string[]
  errorsTruncated: number
  totalRows: number
}

const MAX_REPORTED_ERRORS = 50

/** Column aliases, so a supplier's own sheet headings usually just work. */
const COLUMNS = {
  name: ['name', 'product', 'product name', 'description', 'item'],
  generic_name: ['generic_name', 'generic name', 'generic'],
  barcode: ['barcode', 'bar code', 'ean', 'upc'],
  sku: ['sku', 'item code', 'code'],
  cost_price: ['cost_price', 'cost price', 'cost', 'buying price', 'purchase price'],
  unit_price: ['unit_price', 'unit price', 'selling price', 'price', 'mrp', 'retail price'],
  current_stock: ['current_stock', 'current stock', 'stock', 'quantity', 'qty', 'opening stock'],
  tax_rate: ['tax_rate', 'tax rate', 'vat', 'vat rate'],
  reorder_level: ['reorder_level', 'reorder level', 'min stock', 'minimum stock'],
  reorder_qty: ['reorder_qty', 'reorder quantity', 'reorder qty'],
  unit: ['unit', 'uom', 'pack'],
  expiry_date: ['expiry_date', 'expiry date', 'expiry', 'exp date', 'exp', 'best before'],
  batch_number: ['batch_number', 'batch no', 'batch', 'lot', 'lot no'],
  category: ['category', 'category name', 'group'],
  supplier: ['supplier', 'supplier name', 'vendor', 'manufacturer'],
  track_expiry: ['track_expiry', 'track expiry', 'expiry tracked']
}

const normalizeHeader = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/**
 * Parse a spreadsheet cell as a number, or fail.
 *
 * `parseFloat` is the wrong tool: it stops at the first character it cannot read,
 * so `'1,234.50'` becomes `1` and `'12 tablets'` becomes `12`. A price that is
 * silently 1/1000th of the real one is far worse than a rejected row.
 *
 * Real numeric cells arrive as JS numbers and are used directly. Strings must be
 * *entirely* numeric, optionally with comma thousands separators.
 */
function parseNumber(raw: unknown): { ok: true; value: number } | { ok: false; reason: string } {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { ok: true, value: raw } : { ok: false, reason: 'not a number' }
  }
  const text = String(raw ?? '').trim()
  if (text === '') return { ok: false, reason: 'empty' }

  const compact = text.replace(/\s/g, '')
  let candidate = compact
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(compact)) {
    // 1,234 / 1,234.50 — comma thousands separators.
    candidate = compact.replace(/,/g, '')
  } else if (/^-?\d+,\d{1,2}$/.test(compact)) {
    // 1234,50 — comma as the decimal mark, as European sheets write it.
    candidate = compact.replace(',', '.')
  }
  if (!/^-?\d+(\.\d+)?$/.test(candidate)) {
    return { ok: false, reason: `"${text}" is not a number` }
  }
  return { ok: true, value: Number(candidate) }
}

/**
 * Parse a spreadsheet date cell to `YYYY-MM-DD`, or fail.
 *
 * Excel dates arrive as `Date` objects from the parser, as serial numbers from
 * some writers, or as free text. `MM/DD` vs `DD/MM` is genuinely ambiguous, so a
 * slash/dot format is only accepted when the first component cannot be a month —
 * guessing wrong on a medicine expiry is not an acceptable outcome.
 */
function parseExpiry(raw: unknown): { ok: true; value: string } | { ok: false; reason: string } {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { ok: false, reason: 'invalid date' }
    return { ok: true, value: toIsoDate(raw) }
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial: days since 1899-12-30 (the 1900 leap-year bug included).
    const ms = Math.round((raw - 25569) * 86400000)
    const date = new Date(ms)
    if (Number.isNaN(date.getTime())) return { ok: false, reason: 'invalid date serial' }
    return { ok: true, value: toIsoDate(date) }
  }

  const text = String(raw ?? '').trim()
  if (text === '') return { ok: false, reason: 'empty' }

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return isoFromParts(iso[1], iso[2], iso[3], text)

  // YYYY-MM / MM-YYYY: an expiry given to the month means end of that month,
  // which is how a blister pack is actually printed.
  const yearMonth = text.match(/^(\d{4})[-/.](\d{1,2})$/)
  if (yearMonth) return endOfMonth(Number(yearMonth[1]), Number(yearMonth[2]), text)
  const monthYear = text.match(/^(\d{1,2})[-/.](\d{4})$/)
  if (monthYear) return endOfMonth(Number(monthYear[2]), Number(monthYear[1]), text)

  const parts = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (parts) {
    const first = Number(parts[1])
    const second = Number(parts[2])
    let year = Number(parts[3])
    if (year < 100) year += 2000
    if (first > 12 && second <= 12) return isoFromParts(String(year), parts[2], parts[1], text)
    if (second > 12 && first <= 12) return isoFromParts(String(year), parts[1], parts[2], text)
    return {
      ok: false,
      reason: `"${text}" is ambiguous — write expiry dates as YYYY-MM-DD`
    }
  }

  return { ok: false, reason: `"${text}" is not a date — use YYYY-MM-DD` }
}

function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isoFromParts(
  y: string,
  m: string,
  d: string,
  original: string
): { ok: true; value: string } | { ok: false; reason: string } {
  const month = Number(m)
  const day = Number(d)
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, reason: `"${original}" is not a real date` }
  }
  const iso = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const check = new Date(iso + 'T00:00:00Z')
  if (Number.isNaN(check.getTime()) || toIsoDate(check) !== iso) {
    return { ok: false, reason: `"${original}" is not a real date` }
  }
  return { ok: true, value: iso }
}

function endOfMonth(
  year: number,
  month: number,
  original: string
): { ok: true; value: string } | { ok: false; reason: string } {
  if (month < 1 || month > 12) return { ok: false, reason: `"${original}" is not a real date` }
  const last = new Date(Date.UTC(year, month, 0))
  return { ok: true, value: toIsoDate(last) }
}

interface ParsedRow {
  rowNum: number
  product: inventory.ProductData
  stock: number
  expiry: string | null
  batchNumber?: string
  categoryName?: string
  supplierName?: string
}

export function importProductRows(sheetRows: unknown[][]): ImportOutcome {
  const empty: ImportOutcome = {
    imported: 0,
    batchesCreated: 0,
    errors: [],
    errorsTruncated: 0,
    totalRows: 0
  }

  if (!sheetRows.length) return { ...empty, errors: ['The spreadsheet is empty'] }

  const [headerRow, ...dataRows] = sheetRows
  const headerIndexes = new Map<string, number>()
  ;(headerRow ?? []).forEach((cell, index) => {
    const key = normalizeHeader(cell)
    if (key && !headerIndexes.has(key)) headerIndexes.set(key, index)
  })

  const indexOf = (field: keyof typeof COLUMNS): number | undefined => {
    for (const alias of COLUMNS[field]) {
      const idx = headerIndexes.get(normalizeHeader(alias))
      if (idx !== undefined) return idx
    }
    return undefined
  }
  const cell = (row: unknown[], field: keyof typeof COLUMNS): unknown => {
    const idx = indexOf(field)
    return idx === undefined ? undefined : row[idx]
  }
  const has = (field: keyof typeof COLUMNS): boolean => indexOf(field) !== undefined
  const str = (row: unknown[], field: keyof typeof COLUMNS): string =>
    String(cell(row, field) ?? '').trim()

  // Header problems are reported once, not once per row — a missing `name`
  // column previously produced 10,000 identical errors, each rendered as its
  // own <li> in a modal.
  if (!has('name')) {
    return {
      ...empty,
      totalRows: dataRows.length,
      errors: [
        'No "Name" column found. The sheet needs at least Name, Cost Price and Unit Price; ' +
          'Expiry Date, Batch No, Category and Supplier are read when present.'
      ]
    }
  }

  const errors: string[] = []
  const parsed: ParsedRow[] = []
  const seenBarcodes = new Map<string, number>()
  const trackExpiryColumnPresent = has('track_expiry')

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i] ?? []
    const rowNum = i + 2 // 1-indexed, plus the header

    // A trailing blank row is normal in a hand-edited sheet, not an error.
    if (row.every((c) => String(c ?? '').trim() === '')) continue

    const name = str(row, 'name')
    if (!name) {
      errors.push(`Row ${rowNum}: no product name`)
      continue
    }

    const cost = parseNumber(cell(row, 'cost_price'))
    if (!cost.ok && cost.reason !== 'empty') {
      errors.push(`Row ${rowNum} "${name}": cost price ${cost.reason}`)
      continue
    }
    const price = parseNumber(cell(row, 'unit_price'))
    if (!price.ok) {
      errors.push(
        `Row ${rowNum} "${name}": selling price ${price.reason === 'empty' ? 'is missing' : price.reason}`
      )
      continue
    }

    let stock = 0
    const stockRaw = cell(row, 'current_stock')
    if (String(stockRaw ?? '').trim() !== '') {
      const parsedStock = parseNumber(stockRaw)
      if (!parsedStock.ok) {
        errors.push(`Row ${rowNum} "${name}": stock ${parsedStock.reason}`)
        continue
      }
      if (parsedStock.value < 0 || !Number.isInteger(parsedStock.value)) {
        errors.push(`Row ${rowNum} "${name}": stock must be a whole number, not negative`)
        continue
      }
      stock = parsedStock.value
    }

    // Present-but-unreadable is an error; absent is a default. `|| 0` and `|| 5`
    // conflated the two and silently rewrote real values.
    let taxRate = 0
    if (String(cell(row, 'tax_rate') ?? '').trim() !== '') {
      const t = parseNumber(cell(row, 'tax_rate'))
      if (!t.ok) {
        errors.push(`Row ${rowNum} "${name}": tax rate ${t.reason}`)
        continue
      }
      taxRate = t.value
    }

    let reorderLevel = 10
    if (String(cell(row, 'reorder_level') ?? '').trim() !== '') {
      const r = parseNumber(cell(row, 'reorder_level'))
      if (!r.ok) {
        errors.push(`Row ${rowNum} "${name}": reorder level ${r.reason}`)
        continue
      }
      reorderLevel = r.value
    }

    let reorderQty = 50
    if (String(cell(row, 'reorder_qty') ?? '').trim() !== '') {
      const r = parseNumber(cell(row, 'reorder_qty'))
      if (!r.ok) {
        errors.push(`Row ${rowNum} "${name}": reorder quantity ${r.reason}`)
        continue
      }
      reorderQty = r.value
    }

    let trackExpiry = 1
    if (trackExpiryColumnPresent) {
      const raw = str(row, 'track_expiry').toLowerCase()
      if (raw !== '') trackExpiry = ['0', 'no', 'false', 'n'].includes(raw) ? 0 : 1
    }

    let expiry: string | null = null
    const expiryRaw = cell(row, 'expiry_date')
    if (String(expiryRaw ?? '').trim() !== '') {
      const e = parseExpiry(expiryRaw)
      if (!e.ok) {
        errors.push(`Row ${rowNum} "${name}": ${e.reason}`)
        continue
      }
      expiry = e.value
    }

    // The H16 guard. Stock that tracks expiry but carries no expiry date is the
    // exact silent failure this import used to produce for a whole catalogue.
    if (stock > 0 && trackExpiry === 1 && !expiry) {
      errors.push(
        `Row ${rowNum} "${name}": ${stock} in stock but no expiry date. ` +
          'Add an Expiry Date column, or set Track Expiry to "no" for this item.'
      )
      continue
    }

    const barcode = str(row, 'barcode')
    if (barcode) {
      const previous = seenBarcodes.get(barcode)
      if (previous !== undefined) {
        // Left to the database this fails mid-transaction and rolls back the
        // whole file, with an error naming neither row.
        errors.push(`Row ${rowNum} "${name}": barcode ${barcode} already used on row ${previous}`)
        continue
      }
      seenBarcodes.set(barcode, rowNum)
    }

    parsed.push({
      rowNum,
      stock,
      expiry,
      batchNumber: str(row, 'batch_number') || undefined,
      categoryName: str(row, 'category') || undefined,
      supplierName: str(row, 'supplier') || undefined,
      product: {
        name,
        generic_name: str(row, 'generic_name') || undefined,
        barcode: barcode || undefined,
        sku: str(row, 'sku') || undefined,
        cost_price: cost.ok ? cost.value : 0,
        unit_price: price.value,
        tax_rate: taxRate,
        reorder_level: reorderLevel,
        reorder_qty: reorderQty,
        unit: str(row, 'unit') || 'pcs',
        track_expiry: trackExpiry
      }
    })
  }

  // Atomic: refuse the file rather than commit part of a medicine catalogue.
  if (errors.length) {
    return {
      imported: 0,
      batchesCreated: 0,
      errors: errors.slice(0, MAX_REPORTED_ERRORS),
      errorsTruncated: Math.max(0, errors.length - MAX_REPORTED_ERRORS),
      totalRows: dataRows.length
    }
  }

  if (!parsed.length) {
    return { ...empty, totalRows: dataRows.length, errors: ['No data rows found in the sheet'] }
  }

  let batchesCreated = 0
  const db = getDatabase()

  // One transaction for the whole file. Also the fix for the freeze: 10,000
  // separate transactions each pay an fsync, which is what locked up the UI.
  db.transaction(() => {
    const categories = new Map<string, string>()
    for (const c of inventory.getCategories()) categories.set(c.name.toLowerCase(), c.id)
    const suppliers = new Map<string, string>()
    for (const s of inventory.getSuppliers()) suppliers.set(s.name.toLowerCase(), s.id)

    for (const entry of parsed) {
      if (entry.categoryName) {
        const key = entry.categoryName.toLowerCase()
        if (!categories.has(key)) {
          categories.set(key, inventory.createCategory({ name: entry.categoryName }).id)
        }
        entry.product.category_id = categories.get(key)
      }
      if (entry.supplierName) {
        const key = entry.supplierName.toLowerCase()
        if (!suppliers.has(key)) {
          suppliers.set(key, inventory.createSupplier({ name: entry.supplierName }).id)
        }
        entry.product.supplier_id = suppliers.get(key)
      }

      const created = inventory.createProduct(entry.product)

      if (entry.stock > 0) {
        inventory.createStockBatch({
          product_id: created.id,
          quantity: entry.stock,
          cost_price: entry.product.cost_price,
          // Per-batch selling price, so a later price change does not rewrite
          // what this stock was brought in to sell at.
          selling_price: entry.product.unit_price,
          expiry_date: entry.expiry ?? undefined,
          batch_number: entry.batchNumber,
          supplier_id: entry.product.supplier_id
        })
        batchesCreated++
      }
    }
  })()

  return {
    imported: parsed.length,
    batchesCreated,
    errors: [],
    errorsTruncated: 0,
    totalRows: dataRows.length
  }
}
