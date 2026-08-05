import { useEffect, useRef } from 'react'

export interface KeyboardShortcutHandlers {
  onF2?: () => void // Open search
  onF4?: () => void // Hold sale
  onF5?: () => void // Recall sale
  onF8?: () => void // Clear cart
  onF9?: () => void // Payment
  onEscape?: () => void // Close modals
}

export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers): void {
  // `handlers` is a fresh object literal on every render, so depending on it
  // detached and re-attached the window listener on each one. A ref keeps one
  // listener for the component's life while still calling the latest handlers.
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const handlers = handlersRef.current
      const target = event.target as HTMLElement
      const inTextField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'

      // M2: the input guard used to return before the F-key switch, and
      // ProductEntry keeps the barcode box focused permanently so a scan is never
      // missed — which meant **F2/F4/F5/F8/F9 never fired during normal
      // checkout**, the only time they are wanted. Function keys carry no text,
      // so they cannot conflict with typing; only the printable-character
      // shortcuts need the guard, and there are none.
      if (inTextField && !/^F\d{1,2}$/.test(event.key) && event.key !== 'Escape') {
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
  }, [])
}
