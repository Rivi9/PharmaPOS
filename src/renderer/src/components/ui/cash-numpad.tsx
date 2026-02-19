import { useEffect, useRef } from 'react'
import { Delete } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

interface CashNumpadProps {
  /** Current numeric string (e.g. "1234.50") */
  value: string
  /** Called with the new value after each key press */
  onChange: (newValue: string) => void
  /** Called when the user presses Enter on the keyboard */
  onSubmit?: () => void
  /** Extra classes applied to every numpad button */
  buttonClassName?: string
}

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'backspace'] as const

/**
 * 12-button cash numpad (3×4 grid: 7-9 / 4-6 / 1-3 / . 0 ⌫).
 *
 * Touch: click any button.
 * Keyboard: digits, `.`, Backspace / Delete are captured globally
 *   — but only when the active element is NOT an <input> or <textarea>,
 *   so sibling text fields (Notes, Customer name, etc.) still work normally.
 */
export function CashNumpad({ value, onChange, onSubmit, buttonClassName }: CashNumpadProps): React.JSX.Element {
  // Refs so the single keydown listener always sees the latest values
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  const onSubmitRef = useRef(onSubmit)
  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onSubmitRef.current = onSubmit }, [onSubmit])

  /** Apply one key press and call onChange with the resulting string. */
  const applyKey = (key: string, current: string): string | null => {
    if (key === 'backspace') return current.slice(0, -1)
    if (key === '.') {
      if (current.includes('.')) return null  // already has decimal
      return current + '.'
    }
    // Digit — enforce max 2 decimal places
    const dotIndex = current.indexOf('.')
    if (dotIndex !== -1 && current.length - dotIndex > 2) return null
    return current + key
  }

  // Register keyboard listener once; use refs to stay up-to-date
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Don't intercept when a text input / textarea is focused
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      if (e.key === 'Enter') {
        e.preventDefault()
        onSubmitRef.current?.()
        return
      }

      let key: string | null = null
      if (/^\d$/.test(e.key)) key = e.key
      else if (e.key === '.') key = '.'
      else if (e.key === 'Backspace' || e.key === 'Delete') key = 'backspace'

      if (key === null) return

      e.preventDefault()
      const next = applyKey(key, valueRef.current)
      if (next !== null) onChangeRef.current(next)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, []) // empty deps: register once on mount

  const handleClick = (key: string): void => {
    const next = applyKey(key, valueRef.current)
    if (next !== null) onChangeRef.current(next)
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {KEYS.map((key) => (
        <Button
          key={key}
          variant="outline"
          className={cn('text-lg font-semibold', buttonClassName)}
          onClick={() => handleClick(key)}
        >
          {key === 'backspace' ? <Delete className="h-4 w-4" /> : key}
        </Button>
      ))}
    </div>
  )
}
