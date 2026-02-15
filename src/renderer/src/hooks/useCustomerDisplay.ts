import { useEffect } from 'react'
import { usePOSStore } from '../stores/posStore'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * Syncs cart state to the customer-facing display window via IPC.
 * Subscribe to POS store changes and push updates whenever the cart or totals change.
 */
export function useCustomerDisplay(): void {
  const settings = useSettingsStore((state) => state.settings)

  useEffect(() => {
    // Subscribe to POS store changes and push to customer display
    const unsubscribe = usePOSStore.subscribe((state) => {
      const displayData = {
        items: state.items.map((item) => ({
          name: item.product.name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          line_total: item.line_total
        })),
        subtotal: state.subtotal(),
        discount_amount: state.discountAmount(),
        tax_amount: state.taxAmount(),
        total: state.total(),
        currency: settings.currency_symbol,
        business_name: settings.business_name
      }

      window.electron.display.update(displayData).catch(() => {
        // Customer display may not be connected — silently ignore
      })
    })

    return unsubscribe
  }, [settings.currency_symbol, settings.business_name])
}
