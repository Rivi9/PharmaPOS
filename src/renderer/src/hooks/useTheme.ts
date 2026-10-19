import { useEffect } from 'react'
import { create } from 'zustand'

export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'pharmapos-theme'
const media = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

/**
 * Appearance is a property of the machine (the till's screen and its lighting),
 * not of the cashier or the shop's data, so it lives in localStorage rather
 * than the settings table and does not follow a backup to another PC.
 */
function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // Storage unavailable — fall through to the default.
  }
  return 'light'
}

function resolve(pref: ThemePreference): 'light' | 'dark' {
  return pref === 'system' ? (media().matches ? 'dark' : 'light') : pref
}

/** Apply before React renders so there is no light flash on a dark till. */
export function applyStoredTheme(): void {
  document.documentElement.classList.toggle('dark', resolve(readPreference()) === 'dark')
}

interface ThemeState {
  preference: ThemePreference
  resolved: 'light' | 'dark'
  setPreference: (pref: ThemePreference) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  preference: readPreference(),
  resolved: resolve(readPreference()),
  setPreference: (preference) => {
    try {
      localStorage.setItem(STORAGE_KEY, preference)
    } catch {
      // Still applied for this session.
    }
    const resolved = resolve(preference)
    document.documentElement.classList.toggle('dark', resolved === 'dark')
    set({ preference, resolved })
  }
}))

/** Mount once (App): follows the OS setting while the preference is "system". */
export function useSystemThemeSync(): void {
  const preference = useThemeStore((s) => s.preference)
  useEffect(() => {
    if (preference !== 'system') return
    const mq = media()
    const onChange = (): void => useThemeStore.getState().setPreference('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [preference])
}
