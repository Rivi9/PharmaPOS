import { useCallback, useRef, useState } from 'react'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button, for deletes and other irreversible actions. */
  destructive?: boolean
  /** Single OK button — the replacement for `alert()`. */
  acknowledge?: boolean
}

export interface ConfirmRequest extends ConfirmOptions {
  /** Forces a fresh dialog when one prompt immediately follows another. */
  id: number
}

export interface ConfirmDialogProps {
  request: ConfirmRequest | null
  onSettle: (result: boolean) => void
}

/**
 * Promise-based replacement for the browser's `confirm()` and `alert()`.
 *
 * Chromium renders those as OS-styled modals sized for a mouse: the buttons are
 * around 24px tall, they sit at the top of the window rather than under the
 * finger, and on a kiosk-mode POS they can appear behind the customer display.
 * They also block the renderer thread, so a barcode scanned while one is open
 * is lost.
 *
 * ```tsx
 * const { confirm, notify, confirmProps } = useConfirm()
 * if (!(await confirm({ title: 'Delete X?', destructive: true }))) return
 * // ...
 * <ConfirmDialog {...confirmProps} />
 * ```
 */
export function useConfirm(): {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  notify: (title: string, description?: string) => Promise<boolean>
  confirmProps: ConfirmDialogProps
} {
  const [request, setRequest] = useState<ConfirmRequest | null>(null)
  const resolver = useRef<((result: boolean) => void) | null>(null)
  const nextId = useRef(0)

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    // A second prompt while one is open would strand the first promise, so the
    // outgoing one is resolved as cancelled before it is replaced.
    resolver.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
      setRequest({ ...options, id: nextId.current++ })
    })
  }, [])

  const notify = useCallback(
    (title: string, description?: string) => confirm({ title, description, acknowledge: true }),
    [confirm]
  )

  const onSettle = useCallback((result: boolean) => {
    setRequest(null)
    const resolve = resolver.current
    resolver.current = null
    resolve?.(result)
  }, [])

  return { confirm, notify, confirmProps: { request, onSettle } }
}
