import { rebuildProductSalesDaily, type SqlHandle } from '../services/analytics/ledger'
import { apportionDiscount, extractIncludedTax, round2 } from '../../shared/money'

/**
 * Version 9, the data half. Runs inside the migration's transaction, after its
 * SQL, and only once (user_version); every step is also safe to repeat.
 */
export function repairSalesLedger(sqlite: SqlHandle): void {
  // 1. The sale-level discount never reached the lines: each line's VAT was
  //    extracted from its pre-discount total and the header VAT overwritten with
  //    their sum, so a Rs. 1000 basket sold for 900 at 18% stored VAT 152.54
  //    instead of 137.29 and booked 847.46 of revenue the shop never received.
  //    Split each such sale's discount across its lines and re-extract the VAT,
  //    exactly as createSale now does. Only sales whose lines carry no discount
  //    yet are touched, so this cannot apply twice.
  const discounted = sqlite
    .prepare(
      `SELECT id, discount_amount FROM sales s
       WHERE discount_amount > 0
         AND NOT EXISTS (SELECT 1 FROM sale_items si WHERE si.sale_id = s.id AND si.discount_amount <> 0)`
    )
    .all() as Array<{ id: string; discount_amount: number }>
  const lineStmt = sqlite.prepare(
    'SELECT id, line_total, tax_rate FROM sale_items WHERE sale_id = ? ORDER BY rowid'
  )
  const setLine = sqlite.prepare(
    'UPDATE sale_items SET discount_amount = ?, tax_amount = ? WHERE id = ?'
  )
  const setHeader = sqlite.prepare('UPDATE sales SET tax_amount = ? WHERE id = ?')
  for (const sale of discounted) {
    const lines = lineStmt.all(sale.id) as Array<{
      id: string
      line_total: number
      tax_rate: number
    }>
    if (lines.length === 0) continue
    const shares = apportionDiscount(
      lines.map((l) => l.line_total),
      sale.discount_amount
    )
    let headerTax = 0
    lines.forEach((line, i) => {
      const tax = extractIncludedTax(round2(line.line_total - shares[i]), line.tax_rate ?? 0)
      headerTax = round2(headerTax + tax)
      setLine.run(shares[i], tax, line.id)
    })
    setHeader.run(headerTax, sale.id)
  }

  // 2. Rebuild the whole rollup from the sales: on local dates (it was keyed by
  //    the UTC date, so 00:00–05:29 local landed on the previous day), net of
  //    the discount, and with partial refunds subtracted.
  rebuildProductSalesDaily(sqlite)
}
