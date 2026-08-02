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
