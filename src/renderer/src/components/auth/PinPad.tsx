import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Delete, CornerDownLeft } from 'lucide-react'

interface PinPadProps {
  onSubmit: (pin: string) => void
  maxLength?: number
}

export function PinPad({ onSubmit, maxLength = 4 }: PinPadProps): React.JSX.Element {
  const [pin, setPin] = useState('')

  // Refs mirror the latest values so the keydown listener can be registered once.
  // Re-registering it on every digit tears the listener down mid-keystroke and
  // silently drops keys typed during the gap.
  const pinRef = useRef(pin)
  const maxLengthRef = useRef(maxLength)
  const onSubmitRef = useRef(onSubmit)
  useEffect(() => {
    maxLengthRef.current = maxLength
  }, [maxLength])
  useEffect(() => {
    onSubmitRef.current = onSubmit
  }, [onSubmit])

  /** Update the ref synchronously (before re-render) and the state together. */
  const applyPin = useCallback((next: string): void => {
    pinRef.current = next
    setPin(next)
  }, [])

  const handleNumber = useCallback(
    (num: string): void => {
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
    if (current.length === 0) return
    applyPin('')
    onSubmitRef.current(current)
  }, [applyPin])

  // Keyboard support — registered once on mount
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
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

  return (
    <div className="flex flex-col items-center gap-4 select-none">
      {/* PIN Display */}
      <div className="flex gap-2 mb-2">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-full border-2 border-primary"
            style={{ backgroundColor: i < pin.length ? 'var(--color-primary)' : 'transparent' }}
          />
        ))}
      </div>

      {/* Number Pad */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
          <Button
            key={num}
            variant="outline"
            size="lg"
            className="w-16 h-16 text-xl font-semibold"
            onClick={() => handleNumber(num)}
          >
            {num}
          </Button>
        ))}
        <Button variant="outline" size="lg" className="w-16 h-16" onClick={handleClear}>
          C
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-16 h-16 text-xl font-semibold"
          onClick={() => handleNumber('0')}
        >
          0
        </Button>
        <Button variant="outline" size="lg" className="w-16 h-16" onClick={handleDelete}>
          <Delete className="w-5 h-5" />
        </Button>
      </div>

      {/* Submit */}
      <Button className="w-full mt-2 h-12" size="lg" onClick={handleSubmit} disabled={pin.length === 0}>
        <CornerDownLeft className="w-4 h-4 mr-2" />
        Login
      </Button>
    </div>
  )
}
