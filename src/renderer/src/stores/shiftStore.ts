import { create } from 'zustand'

interface Shift {
  id: string
  user_id: string
  user_name: string
  started_at: string
  expected_cash: number
}

interface ShiftStore {
  currentShift: Shift | null
  todaySalesTotal: number
  setCurrentShift: (shift: Shift | null) => void
  setTodaySalesTotal: (total: number) => void
  addToTodaySales: (amount: number) => void
  /**
   * Re-read the shift's takings from the database (L4).
   *
   * `addToTodaySales` is an optimistic renderer counter that was only ever added
   * to and only re-synced at login, so anything that reduces takings — a void, a
   * refund — left the header reading high for the rest of the shift. The database
   * figure is filtered to completed sales in this shift, so it is the truth.
   */
  refreshTodaySales: (shiftId: string) => Promise<void>
}

export const useShiftStore = create<ShiftStore>((set) => ({
  currentShift: null,
  todaySalesTotal: 0,

  setCurrentShift: (shift) => {
    set({ currentShift: shift })
  },

  setTodaySalesTotal: (total) => {
    set({ todaySalesTotal: total })
  },

  // Kept for the instant feedback after a sale; `refreshTodaySales` then
  // reconciles it against the database, so a drift cannot accumulate.
  addToTodaySales: (amount) => {
    set((state) => ({
      todaySalesTotal: state.todaySalesTotal + amount
    }))
  },

  refreshTodaySales: async (shiftId) => {
    try {
      const total = await window.electron.getTodaySalesTotal(shiftId)
      if (typeof total === 'number') set({ todaySalesTotal: total })
    } catch {
      // Leave the optimistic figure rather than zeroing a real number.
    }
  }
}))
