import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Delete, CornerDownLeft } from 'lucide-react'

interface PinPadProps {
  onSubmit: (pin: string) => void
  maxLength?: number
  /** Ignore taps and keys, e.g. while the account is locked out. */
  disabled?: boolean
}

export function PinPad({
  onSubmit,
  maxLength = 4,
  disabled = false
}: PinPadProps): React.JSX.Element {
  const [pin, setPin] = useState('')

  // Refs mirror the latest values so the keydown listener can be registered once.
  // Re-registering it on every digit tears the listener down mid-keystroke and
  // silently drops keys typed during the gap.
  const pinRef = useRef(pin)
  const maxLengthRef = useRef(maxLength)
  const onSubmitRef = useRef(onSubmit)
  const disabledRef = useRef(disabled)
  useEffect(() => {
    maxLengthRef.current = maxLength
  }, [maxLength])
  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])
  useEffect(() => {
    disabledRef.current = disabled
  }, [disabled])

  /** Update the ref synchronously (before re-render) and the state together. */
  const applyPin = useCallback((next: string): void => {
    pinRef.current = next
    setPin(next)
  }, [])

  const handleNumber = useCallback(
    (num: string): void => {
      if (disabledRef.current) return
      if (pinRef.current.length < maxLengthRef.current) applyPin(pinRef.current + num)
    },
    [applyPin]
  )

  const handleDelete = useCallback((): void => {
    applyPin(pinRef.current.slice(0, -1))
  }, [applyPin])

  const handleClear = useCallback((): void => {
    applyPin('')
  }, [applyPin])

  const handleSubmit = useCallback((): void => {
    const current = pinRef.current
    if (current.length === 0 || disabledRef.current) return
    applyPin('')
    onSubmitRef.current(current)
  }, [applyPin])

  // Keyboard support — registered once on mount
  useEffect(() => {
    // Same scanner guard as CashNumpad: a barcode scanned at the login screen
    // would otherwise be typed in as PIN attempts and submitted by its trailing
    // Enter, burning failed logins. Also skip while a text field has focus.
    let lastKeyTime = 0
    const SCANNER_THRESHOLD_MS = 30

    const handleKeyDown = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      if (e.repeat) return

      const now = performance.now()
      const sinceLast = now - lastKeyTime
      lastKeyTime = now
      if (sinceLast < SCANNER_THRESHOLD_MS) return

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        handleNumber(e.key)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        handleDelete()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleClear()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNumber, handleDelete, handleClear, handleSubmit])

  const keyClass = 'h-16 w-full rounded-xl text-2xl font-semibold tabular-nums'

  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-6 select-none">
      {/* PIN Display */}
      <div
        className="flex h-6 items-center gap-4"
        role="status"
        aria-label={`${pin.length} of ${maxLength} digits entered`}
      >
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            data-filled={i < pin.length}
            className="size-4 rounded-full border-2 border-primary bg-transparent transition-all duration-100 data-[filled=true]:scale-110 data-[filled=true]:bg-primary"
          />
        ))}
      </div>

      {/* Number Pad */}
      <div className="grid w-full grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
          <Button
            key={num}
            variant="outline"
            className={keyClass}
            disabled={disabled}
            onClick={() => handleNumber(num)}
          >
            {num}
          </Button>
        ))}
        <Button
          variant="ghost"
          className={`${keyClass} text-lg text-muted-foreground`}
          disabled={disabled}
          onClick={handleClear}
          aria-label="Clear"
        >
          C
        </Button>
        <Button
          variant="outline"
          className={keyClass}
          disabled={disabled}
          onClick={() => handleNumber('0')}
        >
          0
        </Button>
        <Button
          variant="ghost"
          className={`${keyClass} text-muted-foreground`}
          disabled={disabled}
          onClick={handleDelete}
          aria-label="Delete last digit"
        >
          <Delete className="size-6" />
        </Button>
      </div>

      {/* Submit */}
      <Button
        className="w-full"
        size="xl"
        onClick={handleSubmit}
        disabled={disabled || pin.length === 0}
      >
        <CornerDownLeft />
        Login
      </Button>
    </div>
  )
}
