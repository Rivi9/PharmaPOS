import { useState } from 'react'
import { Pause, RotateCcw, Trash2 } from 'lucide-react'
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
}

export function CartActions({
  hasItems,
  hasHeldSale,
  onHold,
  onRecall,
  onClear,
  onPayment
}: CartActionsProps): React.JSX.Element {
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [recallConfirmOpen, setRecallConfirmOpen] = useState(false)

  const handleClearClick = () => {
    setClearConfirmOpen(true)
  }

  const handleClearConfirm = () => {
    onClear()
    setClearConfirmOpen(false)
  }

  const handleRecallClick = () => {
    if (hasItems) {
      setRecallConfirmOpen(true)
    } else {
      onRecall()
    }
  }

  const handleRecallConfirm = () => {
    onRecall()
    setRecallConfirmOpen(false)
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {/* Hold Button */}
        <Button
          variant="outline"
          disabled={!hasItems}
          onClick={onHold}
          className="h-12 flex flex-col items-center gap-1 py-2"
        >
          <Pause className="h-5 w-5" />
          <span className="text-xs">Hold</span>
        </Button>

        {/* Recall Button */}
        <Button
          variant="outline"
          disabled={!hasHeldSale}
          onClick={handleRecallClick}
          className="h-12 flex flex-col items-center gap-1 py-2"
        >
          <RotateCcw className="h-5 w-5" />
          <span className="text-xs">Recall</span>
        </Button>

        {/* Clear Button */}
        <Button
          variant="outline"
          disabled={!hasItems}
          onClick={handleClearClick}
          className="h-12 flex flex-col items-center gap-1 py-2 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-5 w-5" />
          <span className="text-xs">Clear</span>
        </Button>
      </div>

      {/* Pay Button — large, easy to tap */}
      <Button disabled={!hasItems} onClick={onPayment} className="w-full h-16 text-xl font-bold">
        Pay Now
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
            <AlertDialogAction
              onClick={handleClearConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear Cart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
