import { test, expect } from '@playwright/test'
import { launchApp, ipc, type LaunchedApp } from './helpers/app'
import { completeSetup, login } from './helpers/flows'
import { query } from './helpers/seed'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
  await completeSetup(ctx.page)
  await login(ctx.page)
})

test.afterEach(async () => {
  await ctx?.close()
})

/**
 * H22. These channels had no permission check, no ownership check and no status
 * check, and took the actor from the IPC payload — so a renderer could open a
 * shift in another cashier's name, close someone else's shift and rewrite their
 * cash figure, or re-close a shift that had already been counted.
 */
test.describe('shift guards', () => {
  test('the actor comes from the session, not the payload', async () => {
    const started = await ipc(ctx.page, `window.electron.startShift({ openingCash: 5000 })`)
    expect(started).toMatchObject({ success: true })

    const active = await ipc(ctx.page, `window.electron.getActiveShift()`)
    expect(active).toMatchObject({ opening_cash: 5000, status: 'active' })

    const [row] = query<{ user_id: string }>(ctx.dbPath, 'SELECT user_id FROM shifts')
    const [admin] = query<{ id: string }>(ctx.dbPath, 'SELECT id FROM users')
    expect(row.user_id).toBe(admin.id)
  })

  test('only one shift can be open per user', async () => {
    await ipc(ctx.page, `window.electron.startShift({ openingCash: 5000 })`)
    const second = await ipc(ctx.page, `window.electron.startShift({ openingCash: 100 })`)
    expect(String(second)).toMatch(/already have a shift open/i)
    expect(query(ctx.dbPath, "SELECT id FROM shifts WHERE status='active'")).toHaveLength(1)
  })

  test('a negative opening float is refused', async () => {
    const bad = await ipc(ctx.page, `window.electron.startShift({ openingCash: -5 })`)
    expect(String(bad)).toMatch(/valid opening float/i)
  })

  test('ending a shift that does not exist throws instead of reporting success', async () => {
    const bogus = await ipc(
      ctx.page,
      `window.electron.endShift({ shiftId: 'no-such-shift', closingCash: 0 })`
    )
    expect(String(bogus)).toMatch(/no longer exists/i)
  })

  test('a reconciled shift cannot be re-closed', async () => {
    await ipc(ctx.page, `window.electron.startShift({ openingCash: 5000 })`)
    const active = (await ipc(ctx.page, `window.electron.getActiveShift()`)) as { id: string }

    const closed = await ipc(
      ctx.page,
      `window.electron.endShift({ shiftId: ${JSON.stringify(active.id)}, closingCash: 4800 })`
    )
    expect(closed).toMatchObject({ success: true })

    const again = await ipc(
      ctx.page,
      `window.electron.endShift({ shiftId: ${JSON.stringify(active.id)}, closingCash: 0 })`
    )
    expect(String(again)).toMatch(/already been closed/i)

    // The original count survived the second attempt.
    const [row] = query<{ closing_cash: number; status: string }>(
      ctx.dbPath,
      'SELECT closing_cash, status FROM shifts WHERE id = ?',
      active.id
    )
    expect(row).toMatchObject({ closing_cash: 4800, status: 'closed' })
  })

  test('a negative closing count is refused', async () => {
    await ipc(ctx.page, `window.electron.startShift({ openingCash: 100 })`)
    const active = (await ipc(ctx.page, `window.electron.getActiveShift()`)) as { id: string }
    const bad = await ipc(
      ctx.page,
      `window.electron.endShift({ shiftId: ${JSON.stringify(active.id)}, closingCash: -1 })`
    )
    expect(String(bad)).toMatch(/counted cash/i)
  })
})
