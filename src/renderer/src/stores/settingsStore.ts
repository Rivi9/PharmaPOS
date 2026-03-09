import { create } from 'zustand'

interface Settings {
  business_name: string
  business_address: string
  business_phone: string
  vat_rate: string
  currency_symbol: string
  receipt_footer: string
}

interface SettingsState {
  settings: Settings
  isLoading: boolean
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
    receipt_footer: ''
  },
  isLoading: true,

  loadSettings: async () => {
    set({ isLoading: true })
    const allSettings = await window.electron.getAllSettings()
    set({
      settings: { ...get().settings, ...allSettings },
      isLoading: false
    })
  },

  updateSetting: async (key, value) => {
    await window.electron.setSetting(key, value)
    set({ settings: { ...get().settings, [key]: value } })
  }
}))
