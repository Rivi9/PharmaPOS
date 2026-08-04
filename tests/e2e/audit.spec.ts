import { test, expect } from '@playwright/test'
import { launchApp, ipc, ipcError, type LaunchedApp } from './helpers/app'
import { completeSetup, login } from './helpers/flows'
import { query, seedProduct } from './helpers/seed'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
  await completeSetup(ctx.page)
  await login(ctx.page)
})

test.afterEach(async () => {
  await ctx?.close()
})

interface AuditRow {
  action: string
  entity_type: string
  entity_id: string | null
  user_id: string | null
  user_name: string | null
  details: string | null
}

const auditRows = (dbPath: string, action?: string): AuditRow[] =>
  action
    ? query<AuditRow>(dbPath, 'SELECT * FROM audit_log WHERE action = ? ORDER BY timestamp', action)
    : query<AuditRow>(dbPath, 'SELECT * FROM audit_log ORDER BY timestamp')

/**
 * H13: across the whole inventory handler file `logAudit` appeared twice.
 * Creating, updating or deleting products, categories, suppliers and batches
 * left no trace whatsoever, so shrinkage could not be attributed to anyone and
 * price history could not be reconstructed for tax.
 */
test.describe('inventory audit trail', () => {
  test('creating, editing and discontinuing a product is all recorded', async () => {
    const created = (await ipc(
      ctx.page,
      `window.electron.createProduct('x', { name: 'Audited Product', cost_price: 10, unit_price: 20 })`
    )) as { success: boolean; data: { id: string } }
    const id = created.data.id

    expect(auditRows(ctx.dbPath, 'PRODUCT_CREATED')).toHaveLength(1)

    await ipc(
      ctx.page,
      `window.electron.updateProduct('x', ${JSON.stringify(id)}, { unit_price: 35 })`
    )

    const updates = auditRows(ctx.dbPath, 'PRODUCT_UPDATED')
    expect(updates).toHaveLength(1)
    // Before AND after, so the change can be reconstructed rather than guessed.
    expect(JSON.parse(updates[0].details ?? '{}').changes).toMatchObject({
      unit_price: { from: 20, to: 35 }
    })

    // A price move also gets its own entry — a tax audit reads PRICE_CHANGED and
    // should not have to sift every unrelated edit to find it.
    const priceChanges = auditRows(ctx.dbPath, 'PRICE_CHANGED')
    expect(priceChanges).toHaveLength(1)
    expect(JSON.parse(priceChanges[0].details ?? '{}').unit_price).toMatchObject({
      from: 20,
      to: 35
    })

    await ipc(ctx.page, `window.electron.deleteProduct('x', ${JSON.stringify(id)})`)
    expect(auditRows(ctx.dbPath, 'PRODUCT_DELETED')).toHaveLength(1)

    // Every entry names the real actor, not "system" (H37).
    const [admin] = query<{ id: string }>(ctx.dbPath, 'SELECT id FROM users')
    for (const row of auditRows(ctx.dbPath)) {
      if (row.action === 'USER_LOGIN') continue
      expect(row.user_id, `${row.action} has no actor`).toBe(admin.id)
      expect(row.user_name, `${row.action} is attributed to nobody`).toBeTruthy()
    }
  })

  test('an unchanged edit writes no audit noise', async () => {
    const created = (await ipc(
      ctx.page,
      `window.electron.createProduct('x', { name: 'Same', cost_price: 10, unit_price: 20 })`
    )) as { data: { id: string } }
    await ipc(
      ctx.page,
      `window.electron.updateProduct('x', ${JSON.stringify(created.data.id)}, { unit_price: 20 })`
    )
    expect(auditRows(ctx.dbPath, 'PRODUCT_UPDATED')).toHaveLength(0)
  })

  test('categories and suppliers are recorded', async () => {
    await ipc(ctx.page, `window.electron.createCategory('x', { name: 'Antibiotics' })`)
    await ipc(ctx.page, `window.electron.createSupplier('x', { name: 'Acme Pharma' })`)
    expect(auditRows(ctx.dbPath, 'CATEGORY_CREATED')).toHaveLength(1)
    expect(auditRows(ctx.dbPath, 'SUPPLIER_CREATED')).toHaveLength(1)
  })

  test('a batch quantity edit becomes a recorded stock adjustment', async () => {
    const p = seedProduct(ctx.dbPath, { quantity: 100 })

    // The Edit pencil used to issue an absolute UPDATE with no adjustment row.
    const result = await ipc(
      ctx.page,
      `window.electron.updateStockBatch('x', ${JSON.stringify(p.batchId)}, { quantity: 60, adjustment_reason: 'Damaged in transit' })`
    )
    expect(result).toMatchObject({ success: true })

    const [batch] = query<{ quantity: number }>(
      ctx.dbPath,
      'SELECT quantity FROM stock_batches WHERE id = ?',
      p.batchId
    )
    expect(batch.quantity).toBe(60)

    const adjustments = query<{ quantity_change: number; reason: string; user_id: string }>(
      ctx.dbPath,
      'SELECT quantity_change, reason, user_id FROM inventory_adjustments'
    )
    expect(adjustments).toHaveLength(1)
    expect(adjustments[0].quantity_change).toBe(-40)
    expect(adjustments[0].reason).toBe('Damaged in transit')
    expect(adjustments[0].user_id).toBeTruthy()

    const audit = auditRows(ctx.dbPath, 'STOCK_ADJUSTED')
    expect(audit).toHaveLength(1)
    expect(JSON.parse(audit[0].details ?? '{}')).toMatchObject({ from: 100, to: 60 })
  })

  test('setting a batch quantity without a reason still records the movement', async () => {
    // The renderer requires a reason, but the channel must not depend on it —
    // an adjustment with a default reason beats an unrecorded one.
    const p = seedProduct(ctx.dbPath, { quantity: 10 })
    await ipc(
      ctx.page,
      `window.electron.updateStockBatch('x', ${JSON.stringify(p.batchId)}, { quantity: 4 })`
    )
    const adjustments = query<{ quantity_change: number; reason: string }>(
      ctx.dbPath,
      'SELECT quantity_change, reason FROM inventory_adjustments'
    )
    expect(adjustments).toHaveLength(1)
    expect(adjustments[0].quantity_change).toBe(-6)
    expect(adjustments[0].reason).toBeTruthy()
  })

  test('the service refuses a bare quantity write', async () => {
    // Belt and braces: the handler routes quantity through adjustStockBatch, and
    // the service refuses it outright so no future caller can bypass the record.
    const p = seedProduct(ctx.dbPath, { quantity: 10 })
    const negative = await ipc(
      ctx.page,
      `window.electron.updateStockBatch('x', ${JSON.stringify(p.batchId)}, { quantity: -5 })`
    )
    expect(ipcError(negative)).toMatch(/whole number|negative/i)
    const [row] = query<{ quantity: number }>(
      ctx.dbPath,
      'SELECT quantity FROM stock_batches WHERE id = ?',
      p.batchId
    )
    expect(row.quantity).toBe(10)
  })

  test('editing other batch fields is recorded without touching quantity', async () => {
    const p = seedProduct(ctx.dbPath, { quantity: 25 })
    await ipc(
      ctx.page,
      `window.electron.updateStockBatch('x', ${JSON.stringify(p.batchId)}, { batch_number: 'NEW-1' })`
    )
    expect(query(ctx.dbPath, 'SELECT id FROM inventory_adjustments')).toHaveLength(0)
    const audit = auditRows(ctx.dbPath, 'STOCK_BATCH_UPDATED')
    expect(audit).toHaveLength(1)
    expect(JSON.parse(audit[0].details ?? '{}').changes).toMatchObject({
      batchNumber: { from: 'E2E-B1', to: 'NEW-1' }
    })
    const [row] = query<{ quantity: number }>(
      ctx.dbPath,
      'SELECT quantity FROM stock_batches WHERE id = ?',
      p.batchId
    )
    expect(row.quantity).toBe(25)
  })
})
