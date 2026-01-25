import { useState, useEffect } from 'react'
import { Button } from '@renderer/components/ui/button'
import { Delete, CornerDownLeft } from 'lucide-react'

interface PinPadProps {
  onSubmit: (pin: string) => void
  maxLength?: number
}

export function PinPad({ onSubmit, maxLength = 4 }: PinPadProps): React.JSX.Element {
  const [pin, setPin] = useState('')

  const handleNumber = (num: string): void => {
    if (pin.length < maxLength) {
      setPin((prev) => prev + num)
    }
  }

  const handleDelete = (): void => {
    setPin((prev) => prev.slice(0, -1))
  }

  const handleClear = (): void => {
    setPin('')
  }

  const handleSubmit = (): void => {
    if (pin.length > 0) {
      onSubmit(pin)
      setPin('')
    }
  }

  // Add keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Handle number keys (0-9)
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        handleNumber(e.key)
      }
      // Handle backspace/delete
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        handleDelete()
      }
      // Handle enter to submit
      else if (e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
      // Handle escape to clear
      else if (e.key === 'Escape') {
        e.preventDefault()
        handleClear()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pin, maxLength, onSubmit])

  return (
    <div className="flex flex-col items-center gap-4">
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
            className="w-14 h-14 text-xl font-semibold"
            onClick={() => handleNumber(num)}
          >
            {num}
          </Button>
        ))}
        <Button variant="outline" size="lg" className="w-14 h-14" onClick={handleClear}>
          C
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-14 h-14 text-xl font-semibold"
          onClick={() => handleNumber('0')}
        >
          0
        </Button>
        <Button variant="outline" size="lg" className="w-14 h-14" onClick={handleDelete}>
          <Delete className="w-5 h-5" />
        </Button>
      </div>

      {/* Submit */}
      <Button className="w-full mt-2" size="lg" onClick={handleSubmit} disabled={pin.length === 0}>
        <CornerDownLeft className="w-4 h-4 mr-2" />
        Login
      </Button>
    </div>
  )
}
