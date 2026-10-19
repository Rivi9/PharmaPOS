import { useState } from 'react'
import { Banknote, Pause, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@renderer/components/ui/alert-dialog'

interface CartActionsProps {
  hasItems: boolean
  hasHeldSale: boolean
  onHold: () => void
  onRecall: () => void
  onClear: () => void
  onPayment: () => void
  /** Text on the pay button, e.g. "Pay Rs. 505.00". */
  payLabel?: string
  /** Optionally control the clear-confirmation dialog so the F8 shortcut can open it too. */
  clearConfirmOpen?: boolean
  onClearConfirmOpenChange?: (open: boolean) => void
}

export function CartActions({
  hasItems,
  hasHeldSale,
  onHold,
  onRecall,
  onClear,
  onPayment,
  payLabel = 'Pay',
  clearConfirmOpen: externalClearConfirmOpen,
  onClearConfirmOpenChange
}: CartActionsProps): React.JSX.Element {
  const [internalClearConfirmOpen, setInternalClearConfirmOpen] = useState(false)
  const [recallConfirmOpen, setRecallConfirmOpen] = useState(false)

  // Controlled when the parent supplies state (POS page, so F8 opens the same
  // dialog), otherwise self-managed.
  const clearConfirmOpen =
    externalClearConfirmOpen !== undefined ? externalClearConfirmOpen : internalClearConfirmOpen
  const setClearConfirmOpen = onClearConfirmOpenChange || setInternalClearConfirmOpen

  const handleClearClick = (): void => {
    setClearConfirmOpen(true)
  }

  const handleClearConfirm = (): void => {
    onClear()
    setClearConfirmOpen(false)
  }

  const handleRecallClick = (): void => {
    if (hasItems) {
      setRecallConfirmOpen(true)
    } else {
      onRecall()
    }
  }

  const handleRecallConfirm = (): void => {
    onRecall()
    setRecallConfirmOpen(false)
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" size="lg" disabled={!hasItems} onClick={onHold}>
          <Pause />
          Hold
        </Button>
        <Button variant="outline" size="lg" disabled={!hasHeldSale} onClick={handleRecallClick}>
          <RotateCcw />
          Recall
        </Button>
        <Button variant="destructive" size="lg" disabled={!hasItems} onClick={handleClearClick}>
          <Trash2 />
          Clear
        </Button>
      </div>

      {/* Pay — the biggest target on the screen */}
      <Button size="xl" disabled={!hasItems} onClick={onPayment} className="h-18 w-full text-2xl">
        <Banknote className="size-7!" />
        {payLabel}
      </Button>

      {/* Recall Confirmation Dialog — shown when cart has unsaved items */}
      <AlertDialog open={recallConfirmOpen} onOpenChange={setRecallConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Current Cart?</AlertDialogTitle>
            <AlertDialogDescription>
              Recalling the held sale will discard the items currently in your cart. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRecallConfirm}>Recall Sale</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Confirmation Dialog */}
      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Shopping Cart?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all items from the current cart. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive-solid" onClick={handleClearConfirm}>
              Clear Cart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
