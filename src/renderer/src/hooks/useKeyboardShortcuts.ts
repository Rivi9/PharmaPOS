import { useEffect } from 'react'

export interface KeyboardShortcutHandlers {
  onF2?: () => void // Open search
  onF4?: () => void // Hold sale
  onF5?: () => void // Recall sale
  onF8?: () => void // Clear cart
  onF9?: () => void // Payment
  onEscape?: () => void // Close modals
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        // Allow Escape to close modals even when in input
        if (event.key === 'Escape' && handlers.onEscape) {
          handlers.onEscape()
        }
        return
      }

      switch (event.key) {
        case 'F2':
          event.preventDefault()
          handlers.onF2?.()
          break
        case 'F4':
          event.preventDefault()
          handlers.onF4?.()
          break
        case 'F5':
          event.preventDefault()
          handlers.onF5?.()
          break
        case 'F8':
          event.preventDefault()
          handlers.onF8?.()
          break
        case 'F9':
          event.preventDefault()
          handlers.onF9?.()
          break
        case 'Escape':
          handlers.onEscape?.()
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlers])
}
