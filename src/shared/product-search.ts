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

/**
 * Substring filter text. No boundary normalisation here: a substring match does
 * not care about punctuation, and the replace() chain is the most expensive part
 * of the query, so it is only computed for rows that already matched.
 */
const haystack = (a: string): string =>
  `(' ' || ${a}.name || ' ' || COALESCE(${a}.generic_name, '') || ' ' || COALESCE(${a}.sku, '') || ' ' || COALESCE(${a}.barcode, ''))`

/** Sellable stock: positive, unexpired batches (matches deductStockFEFO). */
export const SELLABLE_BATCH = `b.product_id = p.id AND b.quantity > 0
  AND (b.expiry_date IS NULL OR b.expiry_date = '' OR b.expiry_date >= date('now','localtime'))`

interface Parsed {
  raw: string
  tokens: string[]
  phrase: string
}

function parse(query: string): Parsed | null {
  const raw = query.trim()
  const tokens = tokenize(raw)
  if (tokens.length === 0) return null
  return { raw, tokens, phrase: tokens.join(' ') }
}

function filterSql(a: string, { raw, tokens }: Parsed): { sql: string; params: unknown[] } {
  return {
    sql: `(${a}.barcode = ? OR ${tokens.map(() => `${haystack(a)} LIKE ?`).join(' AND ')})`,
    params: [raw, ...tokens.map((t) => `%${t}%`)]
  }
}

/**
 * Rank CASE over columns: id/name/generic/sku/barcode of alias `a`, plus the
 * boundary-normalised `nameWords`, `genericWords`, `allWords` expressions.
 */
function rankSql(
  a: string,
  words: { nameWords: string; genericWords: string; allWords: string },
  { raw, tokens, phrase }: Parsed
): { sql: string; params: unknown[] } {
  const sql = `CASE
      WHEN ${a}.barcode = ? OR ${a}.sku = ? COLLATE NOCASE THEN 0
      WHEN ${a}.name LIKE ? THEN 1
      WHEN ${a}.generic_name LIKE ? THEN 2
      WHEN ${words.nameWords} LIKE ? THEN 3
      WHEN ${words.genericWords} LIKE ? THEN 4
      WHEN ${tokens.map(() => `${words.nameWords} LIKE ?`).join(' AND ')} THEN 5
      WHEN ${tokens.map(() => `${words.allWords} LIKE ?`).join(' AND ')} THEN 6
      ELSE 7
    END`
  const params = [
    raw,
    raw,
    `${phrase}%`,
    `${phrase}%`,
    `% ${phrase}%`,
    `% ${phrase}%`,
    ...tokens.map((t) => `% ${t}%`),
    ...tokens.map((t) => `% ${t}%`)
  ]
  return { sql, params }
}

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
  const parsed = parse(query)
  if (!parsed) return null
  const filter = filterSql('p', parsed)
  const rank = rankSql(
    'p',
    {
      nameWords: wordBoundaries(`(' ' || p.name)`),
      genericWords: wordBoundaries(`(' ' || COALESCE(p.generic_name, ''))`),
      allWords: wordBoundaries(haystack('p'))
    },
    parsed
  )
  return { where: filter.sql, whereParams: filter.params, rank: rank.sql, rankParams: rank.params }
}

/**
 * The till search: ranked active products with sellable stock, FEFO batch price
 * and nearest expiry. Returns null for a blank query.
 *
 * Three stages, so a one-letter query over a 10k catalogue stays cheap:
 *  1. `cand` — plain substring filter; boundary-normalised text computed once
 *     per matching row (MATERIALIZED stops SQLite re-evaluating it per use).
 *  2. `pool` — rank and keep the best `limit * 4` by rank, then shorter name.
 *  3. stock, batch price and expiry for the pool only; in-stock rows are moved
 *     ahead within their rank. An in-stock row can only be missed when more
 *     than `limit * 4` equally-ranked, shorter-named rows are all out of stock.
 */
export function productSearchQuery(
  query: string,
  { limit = 20 }: { limit?: number } = {}
): { sql: string; params: unknown[] } | null {
  const parsed = parse(query)
  if (!parsed) return null
  const filter = filterSql('p', parsed)
  const rank = rankSql(
    'c',
    { nameWords: 'c.name_words', genericWords: 'c.generic_words', allWords: 'c.all_words' },
    parsed
  )
  const pool = Math.max(limit * 4, 40)

  const sql = `
    WITH cand AS MATERIALIZED (
      SELECT
        p.id, p.name, p.generic_name, p.sku, p.barcode,
        ${wordBoundaries(`(' ' || p.name)`)} AS name_words,
        ${wordBoundaries(`(' ' || COALESCE(p.generic_name, ''))`)} AS generic_words,
        ${wordBoundaries(haystack('p'))} AS all_words
      FROM products p
      WHERE p.is_active = 1 AND ${filter.sql}
    ),
    pool AS (
      SELECT c.id, ${rank.sql} AS search_rank
      FROM cand c
      ORDER BY search_rank ASC, length(c.name) ASC, c.name ASC
      LIMIT ?
    ),
    stocked AS (
      SELECT
        pool.id,
        pool.search_rank,
        COALESCE((SELECT SUM(b.quantity) FROM stock_batches b
                  WHERE b.product_id = pool.id AND b.quantity > 0
                    AND (b.expiry_date IS NULL OR b.expiry_date = '' OR b.expiry_date >= date('now','localtime'))), 0) AS total_stock
      FROM pool
    ),
    picked AS (
      SELECT s.*, p.name AS sort_name
      FROM stocked s JOIN products p ON p.id = s.id
      ORDER BY s.search_rank ASC, (s.total_stock > 0) DESC, length(p.name) ASC, p.name ASC
      LIMIT ?
    )
    SELECT
      p.*,
      m.search_rank,
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
    FROM picked m
    JOIN products p ON p.id = m.id
    ORDER BY m.search_rank ASC, (m.total_stock > 0) DESC, length(p.name) ASC, p.name ASC
  `
  return { sql, params: [...filter.params, ...rank.params, pool, limit] }
}
