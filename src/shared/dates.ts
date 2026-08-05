/**
 * Local calendar dates, not UTC ones.
 *
 * M21: `new Date().toISOString().split('T')[0]` yields the **UTC** date. The shop
 * runs at UTC+5:30, so stock received at 02:00 local was dated the previous day,
 * and every date-bounded report shifted its boundary by 5h30m — a monthly VAT
 * return excluded 00:00–05:29 on the first of the month and included it in the
 * next one. Sales are stored as full ISO timestamps and compared with SQLite's
 * `date(created_at)`, which reads them as UTC, so the two disagreed by design.
 *
 * Everything a human calls "a date" — a received date, an expiry, a report
 * boundary, today — has to be the local calendar date.
 */

/** `YYYY-MM-DD` in the machine's own timezone. */
export function localDateString(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Local date `days` before or after today. Negative goes back. */
export function localDateOffset(days: number, from: Date = new Date()): string {
  const date = new Date(from)
  date.setDate(date.getDate() + days)
  return localDateString(date)
}

/**
 * Whole days from today until `isoDate`, on the local calendar.
 *
 * Comparing a parsed UTC midnight against local midnight made every countdown a
 * day optimistic, so "expires today" never appeared (L9).
 */
export function daysUntil(isoDate: string, from: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate ?? '')
  if (!match) return null
  const target = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}
