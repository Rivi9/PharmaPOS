import { create } from 'zustand'
import { usePOSStore } from './posStore'

interface User {
  id: string
  username: string
  full_name: string
  role: 'admin' | 'manager' | 'cashier'
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => {
    // Release the main-process session too, or the renderer would keep its
    // authorisation after the UI has signed out.
    window.electron.logout().catch(() => {
      /* already gone */
    })

    // Signing out has to empty the till. The cart and the held sale survived a
    // logout, so cashier B arriving at the same machine could complete cashier
    // A's basket — against B's shift, and under B's name on the receipt and in
    // the audit log.
    usePOSStore.getState().clearCart()
    usePOSStore.getState().discardHeldSale()

    set({ user: null, isAuthenticated: false })
  }
}))
