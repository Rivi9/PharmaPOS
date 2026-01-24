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
  AlertDialogTitle,
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
  onPayment,
}: CartActionsProps): React.JSX.Element {
  const [clearConfirmOpen, setCleared ConfirmOpen] = useState(false)

  const handleClearClick = () => {
    setCleared ConfirmOpen(true)
  }

  const handleClearConfirm = () => {
    onClear()
    setClearConfirmOpen(false)
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {/* Hold Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={!hasItems}
          onClick={onHold}
          className="flex items-center gap-2"
        >
          <Pause className="h-4 w-4" />
          <span>Hold</span>
          <span className="text-xs text-muted-foreground">(F4)</span>
        </Button>

        {/* Recall Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={!hasHeldSale}
          onClick={onRecall}
          className="flex items-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          <span>Recall</span>
          <span className="text-xs text-muted-foreground">(F5)</span>
        </Button>

        {/* Clear Button */}
        <Button
          variant="outline"
          size="sm"
          disabled={!hasItems}
          onClick={handleClearClick}
          className="flex items-center gap-2 text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          <span>Clear</span>
          <span className="text-xs text-muted-foreground">(F8)</span>
        </Button>
      </div>

      {/* Pay Button */}
      <Button
        size="lg"
        disabled={!hasItems}
        onClick={onPayment}
        className="w-full text-base font-semibold"
      >
        Pay Now (F9)
      </Button>

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
            <AlertDialogAction onClick={handleClearConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Clear Cart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
