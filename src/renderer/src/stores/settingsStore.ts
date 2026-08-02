import { create } from 'zustand'

interface Settings {
  business_name: string
  business_address: string
  business_phone: string
  vat_rate: string
  currency_symbol: string
  receipt_footer: string
  /** '0' hides card payment entirely — for a pharmacy with no card terminal. */
  card_payment_enabled: string
  /** Printer columns. The preview reads this too, so it matches the printout. */
  printer_width: string
}

interface SettingsState {
  settings: Settings
  isLoading: boolean
  /** Set when settings could not be read; money must not be computed from defaults. */
  loadError: string | null
  loadSettings: () => Promise<void>
  updateSetting: (key: keyof Settings, value: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    business_name: '',
    business_address: '',
    business_phone: '',
    vat_rate: '0',
    currency_symbol: 'Rs.',
    receipt_footer: '',
    card_payment_enabled: '1',
    printer_width: '42'
  },
  isLoading: true,
  loadError: null,

  loadSettings: async () => {
    set({ isLoading: true, loadError: null })
    try {
      const allSettings = await window.electron.getAllSettings()
      set({ settings: { ...get().settings, ...allSettings }, isLoading: false })
    } catch (err) {
      // Previously unhandled: isLoading stayed true forever and the cart silently
      // computed tax from the 0% fallback for the rest of the day.
      console.error('Failed to load settings:', err)
      set({ isLoading: false, loadError: (err as Error).message || 'Failed to load settings' })
    }
  },

  updateSetting: async (key, value) => {
    await window.electron.setSetting(key, value)
    set({ settings: { ...get().settings, [key]: value } })
  }
}))
