/**
 * Money helpers shared by the renderer and the main process.
 *
 * Every monetary value must be rounded to 2 decimal places at the point it is
 * computed, not merely when displayed. Rounding only in `toFixed(2)` meant the
 * cart showed Rs. 114.46 while the stored total was 114.46000000000001 — which
 * made the "Exact" cash button fail its own `cash < total` check, and persisted
 * unpayable amounts such as 2701.905 into the database.
 */

/** Round to 2 decimal places, correcting for binary floating-point drift. */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * Compare two money values for "greater than or equal" with a half-cent
 * tolerance, so an exact tender is never rejected by representation error.
 */
export function isAtLeast(amount: number, target: number): boolean {
  return amount >= target - 0.005
}

/**
 * VAT contained *within* a tax-inclusive amount.
 *
 * Prices in this system are shelf/MRP prices that already include VAT, so tax is
 * extracted for reporting and is never added on top. Previously the renderer
 * added the rate to the price while the main process extracted a per-product
 * rate, so the two disagreed and a Rs. 115 pack was charged at Rs. 135.70.
 *
 *   gross 115.00 @ 18%  ->  VAT 17.54, net 97.46
 */
export function extractIncludedTax(grossAmount: number, ratePercent: number): number {
  if (!(ratePercent > 0) || !Number.isFinite(grossAmount)) return 0
  return round2(grossAmount - grossAmount / (1 + ratePercent / 100))
}

/** The portion of a tax-inclusive amount that is actual revenue. */
export function netOfIncludedTax(grossAmount: number, ratePercent: number): number {
  return round2(grossAmount - extractIncludedTax(grossAmount, ratePercent))
}

/**
 * Split a sale-level discount across the lines it was given on, in proportion
 * to each line's total, so the shares add up to the discount exactly.
 *
 * VAT is due on the consideration actually received. A sale-level discount
 * lowers that, so it has to reach each line before the line's VAT is extracted
 * — otherwise the VAT, the net revenue and the P&L are all computed on money
 * the customer never paid. The leftover cents after rounding go to the lines
 * with the largest fractional share (largest remainder), so
 * `SUM(shares) === discount` to the cent and the header can be rebuilt from the
 * lines.
 *
 *   apportionDiscount([600, 400], 100)  ->  [60, 40]
 *   apportionDiscount([1, 1, 1], 1)     ->  [0.34, 0.33, 0.33]
 */
export function apportionDiscount(lineTotals: number[], discount: number): number[] {
  const totalCents = lineTotals.reduce((s, t) => s + Math.max(Math.round(t * 100), 0), 0)
  if (!(discount > 0) || totalCents <= 0) return lineTotals.map(() => 0)

  const discountCents = Math.min(Math.round(discount * 100), totalCents)
  const exact = lineTotals.map(
    (t) => (Math.max(Math.round(t * 100), 0) * discountCents) / totalCents
  )
  const floors = exact.map(Math.floor)
  let left = discountCents - floors.reduce((s, c) => s + c, 0)

  const byRemainder = exact
    .map((e, i) => ({ i, r: e - floors[i] }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
  for (const { i } of byRemainder) {
    if (left <= 0) break
    floors[i]++
    left--
  }

  return floors.map((c) => c / 100)
}

/**
 * VAT for each line of a basket, after its share of the sale discount.
 *
 * The cart and `createSale` both use this, so the VAT on screen, on the receipt,
 * in `sales.tax_amount` and in `SUM(sale_items.tax_amount)` are the same number.
 */
export function basketLineTax(
  lineTotals: number[],
  discount: number,
  ratePercent: number
): { discounts: number[]; taxes: number[]; tax: number } {
  const discounts = apportionDiscount(lineTotals, discount)
  const taxes = lineTotals.map((t, i) => extractIncludedTax(round2(t - discounts[i]), ratePercent))
  return { discounts, taxes, tax: round2(taxes.reduce((s, t) => s + t, 0)) }
}
