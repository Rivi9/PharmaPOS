import { useEffect, useState } from 'react'

interface DisplayCartItem {
  name: string
  quantity: number
  unit_price: number
  line_total: number
}

interface DisplayCartData {
  items: DisplayCartItem[]
  subtotal: number
  discount_amount: number
  tax_amount: number
  total: number
  currency: string
  business_name: string
}

interface SaleCompleteData {
  total: number
  cash_received: number
  change_given: number
  currency: string
}

export function CustomerDisplayPage(): React.JSX.Element {
  const [cart, setCart] = useState<DisplayCartData | null>(null)
  const [saleComplete, setSaleComplete] = useState<SaleCompleteData | null>(null)

  useEffect(() => {
    // Listen for cart updates from main window
    const handleCartUpdate = (_event: any, data: DisplayCartData) => {
      setCart(data)
      setSaleComplete(null)
    }

    const handleSaleComplete = (_event: any, data: SaleCompleteData) => {
      setSaleComplete(data)
      // Clear cart after 5 seconds
      setTimeout(() => {
        setSaleComplete(null)
        setCart(null)
      }, 5000)
    }

    window.electron.ipcRenderer.on('display:cart-updated', handleCartUpdate)
    window.electron.ipcRenderer.on('display:sale-completed', handleSaleComplete)

    return () => {
      window.electron.ipcRenderer.removeListener('display:cart-updated', handleCartUpdate)
      window.electron.ipcRenderer.removeListener('display:sale-completed', handleSaleComplete)
    }
  }, [])

  const currency = cart?.currency ?? 'Rs.'
  const businessName = cart?.business_name ?? 'PharmaPOS'

  // Thank you / idle screen
  if (!cart || cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex flex-col items-center justify-center text-white">
        <div className="text-center space-y-6">
          <div className="text-6xl font-bold">{businessName}</div>
          <div className="text-3xl opacity-80">Welcome!</div>
          <div className="text-xl opacity-60">Please wait while your items are being processed</div>
        </div>
      </div>
    )
  }

  // Sale complete screen
  if (saleComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 flex flex-col items-center justify-center text-white">
        <div className="text-center space-y-8">
          <div className="text-8xl">✓</div>
          <div className="text-5xl font-bold">Thank You!</div>
          <div className="text-3xl opacity-90">
            Total: {currency} {saleComplete.total.toFixed(2)}
          </div>
          {saleComplete.cash_received > 0 && (
            <>
              <div className="text-2xl opacity-80">
                Cash: {currency} {saleComplete.cash_received.toFixed(2)}
              </div>
              <div className="text-3xl font-semibold">
                Change: {currency} {saleComplete.change_given.toFixed(2)}
              </div>
            </>
          )}
          <div className="text-xl opacity-60">Please come again!</div>
        </div>
      </div>
    )
  }

  // Active cart screen
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="bg-blue-700 px-8 py-4 flex items-center justify-between">
        <div className="text-2xl font-bold">{businessName}</div>
        <div className="text-lg opacity-80">{new Date().toLocaleTimeString()}</div>
      </div>

      {/* Cart Items */}
      <div className="flex-1 px-8 py-4 overflow-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400 text-sm uppercase">
              <th className="pb-3 font-medium">Item</th>
              <th className="pb-3 font-medium text-center w-20">Qty</th>
              <th className="pb-3 font-medium text-right w-32">Price</th>
              <th className="pb-3 font-medium text-right w-36">Total</th>
            </tr>
          </thead>
          <tbody>
            {cart.items.map((item, index) => (
              <tr key={index} className="border-b border-gray-800 py-3">
                <td className="py-3 text-lg">{item.name}</td>
                <td className="py-3 text-center text-lg">{item.quantity}</td>
                <td className="py-3 text-right text-lg">
                  {currency} {item.unit_price.toFixed(2)}
                </td>
                <td className="py-3 text-right text-lg font-semibold">
                  {currency} {item.line_total.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div className="bg-gray-900 px-8 py-6 space-y-2">
        <div className="flex justify-between text-gray-400 text-lg">
          <span>Subtotal</span>
          <span>
            {currency} {cart.subtotal.toFixed(2)}
          </span>
        </div>
        {cart.discount_amount > 0 && (
          <div className="flex justify-between text-green-400 text-lg">
            <span>Discount</span>
            <span>
              - {currency} {cart.discount_amount.toFixed(2)}
            </span>
          </div>
        )}
        {cart.tax_amount > 0 && (
          <div className="flex justify-between text-gray-400 text-lg">
            <span>Tax</span>
            <span>
              {currency} {cart.tax_amount.toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between text-white font-bold pt-2 border-t border-gray-700">
          <span className="text-3xl">TOTAL</span>
          <span className="text-4xl text-blue-400">
            {currency} {cart.total.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}
