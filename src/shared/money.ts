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
