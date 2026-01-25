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

  addToTodaySales: (amount) => {
    set((state) => ({
      todaySalesTotal: state.todaySalesTotal + amount
    }))
  }
}))
