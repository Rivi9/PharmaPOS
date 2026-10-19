/**
 * Ranked product search, shared by the till and the inventory screens.
 *
 * The old query was one `LIKE '%query%'` per column ordered by name, so typing
 * "azi" listed Azigen, Azileb, Azithromycin, Silver Sulfadiazine, Clofazimine…
 * alphabetically and the six-row dropdown cut off the product the cashier was
 * after; "azithromycin 500" found nothing when the strength sat in the brand
 * name and the molecule in generic_name.
 *
 * Now every whitespace-separated word must appear somewhere in name, generic
 * name, SKU or barcode (any order), and rows are ranked:
 *
 *   0  exact barcode / SKU               (scanner, or a typed code)
 *   1  name starts with the query        "azi" → Azithromycin 500mg
 *   2  generic name starts with it       "parac" → Panadol (Paracetamol)
 *   3  a word in the name starts with it "500" → Azigen 500mg
 *   4  a word in the generic starts with it
 *   5  every word starts a word in the name  "para 500" → Paracetamol 500mg
 *   6  every word starts a word somewhere    "para 500" → Panadol (Paracetamol)
 *   7  substring anywhere                    "azi" → Sulfadiazine
 *
 * then in-stock before out-of-stock, shorter names first (closer match), then
 * name. Stock and batch price are computed only for the rows returned.
 *
 * Pure string building with positional `?` params — runs on better-sqlite3 in
 * the app and on node:sqlite in tests/unit/product-search.test.mjs.
 */

export const MAX_SEARCH_TOKENS = 6

/** Lower-cased words of a query. LIKE wildcards and the escape char are dropped. */
export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[%_\\]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TOKENS)
}

// Punctuation treated as a word boundary, so "(Silver" and "Cream-" start words.
const wordBoundaries = (expr: string): string =>
  `replace(replace(replace(replace(${expr}, '(', ' '), ')', ' '), '-', ' '), '/', ' ')`

const HAYSTACK = wordBoundaries(
  `(' ' || p.name || ' ' || COALESCE(p.generic_name, '') || ' ' || COALESCE(p.sku, '') || ' ' || COALESCE(p.barcode, ''))`
)
const NAME_WORDS = wordBoundaries(`(' ' || p.name)`)
const GENERIC_WORDS = wordBoundaries(`(' ' || COALESCE(p.generic_name, ''))`)

/** Sellable stock: positive, unexpired batches (matches deductStockFEFO). */
export const SELLABLE_BATCH = `b.product_id = p.id AND b.quantity > 0
  AND (b.expiry_date IS NULL OR b.expiry_date = '' OR b.expiry_date >= date('now','localtime'))`

export interface ProductSearchSql {
  /** Boolean SQL over alias `p` (products). */
  where: string
  whereParams: unknown[]
  /** Integer SQL rank over alias `p`, lower is better. */
  rank: string
  rankParams: unknown[]
}

/** WHERE + rank fragments for callers that build their own statement (inventory). */
export function productSearchSql(query: string): ProductSearchSql | null {
  const raw = query.trim()
  const tokens = tokenize(raw)
  if (tokens.length === 0) return null
  const phrase = tokens.join(' ')

  const where = `(p.barcode = ? OR ${tokens.map(() => `${HAYSTACK} LIKE ?`).join(' AND ')})`
  const whereParams = [raw, ...tokens.map((t) => `%${t}%`)]

  const rank = `CASE
      WHEN p.barcode = ? OR p.sku = ? COLLATE NOCASE THEN 0
      WHEN p.name LIKE ? THEN 1
      WHEN p.generic_name LIKE ? THEN 2
      WHEN ${NAME_WORDS} LIKE ? THEN 3
      WHEN ${GENERIC_WORDS} LIKE ? THEN 4
      WHEN ${tokens.map(() => `${NAME_WORDS} LIKE ?`).join(' AND ')} THEN 5
      WHEN ${tokens.map(() => `${HAYSTACK} LIKE ?`).join(' AND ')} THEN 6
      ELSE 7
    END`
  const rankParams = [
    raw,
    raw,
    `${phrase}%`,
    `${phrase}%`,
    `% ${phrase}%`,
    `% ${phrase}%`,
    ...tokens.map((t) => `% ${t}%`),
    ...tokens.map((t) => `% ${t}%`)
  ]
  return { where, whereParams, rank, rankParams }
}

/**
 * The till search: ranked active products with sellable stock, FEFO batch price
 * and nearest expiry. Returns null for a blank query.
 */
export function productSearchQuery(
  query: string,
  { limit = 20 }: { limit?: number } = {}
): { sql: string; params: unknown[] } | null {
  const frag = productSearchSql(query)
  if (!frag) return null

  // Inner query ranks and picks the rows; only those get the batch-price and
  // expiry subqueries. Stock is needed for ordering so it is computed for every
  // match, but that is one index range per product.
  const sql = `
    SELECT
      p.*,
      m.total_stock,
      COALESCE((
        SELECT b.selling_price FROM stock_batches b
        WHERE ${SELLABLE_BATCH} AND b.selling_price IS NOT NULL
        ORDER BY
          CASE WHEN b.expiry_date IS NULL OR b.expiry_date = '' THEN 1 ELSE 0 END,
          b.expiry_date ASC, b.received_date ASC
        LIMIT 1
      ), p.unit_price) as batch_unit_price,
      (
        SELECT MIN(b.expiry_date) FROM stock_batches b
        WHERE b.product_id = p.id AND b.quantity > 0
          AND b.expiry_date IS NOT NULL AND b.expiry_date <> ''
      ) as nearest_expiry
    FROM (
      SELECT
        p.id,
        ${frag.rank} AS search_rank,
        COALESCE((SELECT SUM(b.quantity) FROM stock_batches b WHERE ${SELLABLE_BATCH}), 0) AS total_stock
      FROM products p
      WHERE p.is_active = 1 AND ${frag.where}
      ORDER BY search_rank ASC, (total_stock > 0) DESC, length(p.name) ASC, p.name ASC
      LIMIT ?
    ) m
    JOIN products p ON p.id = m.id
    ORDER BY m.search_rank ASC, (m.total_stock > 0) DESC, length(p.name) ASC, p.name ASC
  `
  return { sql, params: [...frag.rankParams, ...frag.whereParams, limit] }
}
