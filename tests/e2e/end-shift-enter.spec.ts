import { test, expect } from '@playwright/test'
import { launchApp, type LaunchedApp } from './helpers/app'
import { bootToPos } from './helpers/flows'
import { query } from './helpers/seed'

let ctx: LaunchedApp

test.beforeEach(async () => {
  ctx = await launchApp()
  await bootToPos(ctx.page)
})

test.afterEach(async () => {
  await ctx?.close()
})

const activeShifts = (): unknown[] =>
  query(ctx.dbPath, "SELECT id FROM shifts WHERE status = 'active'")

async function openEndShift(): Promise<void> {
  await ctx.page.getByRole('button', { name: /^End Shift$/ }).click()
  await expect(ctx.page.getByText('Closing Cash Count')).toBeVisible()
}

/**
 * A bare Enter on an empty count used to be refused outright with a red error
 * under "Rs. 0.00" — it read as a bug, and a drawer that really was empty could
 * not be closed from the keyboard. One Enter must still never close the shift
 * (a scanner suffix or a bumped key logged whole drawers as shortages), so the
 * first Enter asks and a second one confirms.
 */
test.describe('End Shift: Enter on an empty count', () => {
  test('one Enter only asks; a second Enter ends the shift at 0.00', async () => {
    await openEndShift()

    await ctx.page.keyboard.press('Enter')
    await expect(ctx.page.getByText(/No count entered\. Press Enter again/)).toBeVisible()
    await expect(ctx.page.getByText(/Enter the closing cash count/)).toHaveCount(0)
    expect(activeShifts()).toHaveLength(1)

    // Slower than the numpad's 30 ms scanner-burst filter, as a person would be.
    await ctx.page.waitForTimeout(300)
    await ctx.page.keyboard.press('Enter')

    await expect.poll(() => activeShifts().length, { timeout: 10_000 }).toBe(0)
    const [closed] = query<{ closing_cash: number }>(
      ctx.dbPath,
      'SELECT closing_cash FROM shifts ORDER BY started_at DESC LIMIT 1'
    )
    expect(closed.closing_cash).toBe(0)
  })

  test('typing a digit cancels the pending confirmation', async () => {
    await openEndShift()

    await ctx.page.keyboard.press('Enter')
    await expect(ctx.page.getByText(/Press Enter again/)).toBeVisible()

    await ctx.page.waitForTimeout(300)
    await ctx.page.keyboard.press('5')
    await expect(ctx.page.getByText(/Press Enter again/)).toHaveCount(0)

    // Clearing the count again re-arms from scratch: one Enter still only asks.
    await ctx.page.waitForTimeout(300)
    await ctx.page.keyboard.press('Backspace')
    await ctx.page.waitForTimeout(300)
    await ctx.page.keyboard.press('Enter')
    await expect(ctx.page.getByText(/Press Enter again/)).toBeVisible()
    expect(activeShifts()).toHaveLength(1)
  })
})
