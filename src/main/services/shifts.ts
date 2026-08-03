import { getDatabase } from './database'

export interface ActiveShift {
  id: string
  user_id: string
  opening_cash: number
  started_at: string
}

/**
 * The caller's own open shift, or null.
 *
 * Single definition on purpose: the shift a sale is booked against must be the
 * one the server believes is open for that user. It used to arrive in the IPC
 * payload, which meant a sale could be attached to a shift that had already been
 * counted and closed — where no cash reconciliation would ever see it.
 */
export function getActiveShiftForUser(userId: string): ActiveShift | null {
  return (
    (getDatabase()
      .prepare(
        `SELECT id, user_id, opening_cash, started_at
         FROM shifts
         WHERE user_id = ? AND status = 'active'
         ORDER BY started_at DESC
         LIMIT 1`
      )
      .get(userId) as ActiveShift | undefined) ?? null
  )
}
