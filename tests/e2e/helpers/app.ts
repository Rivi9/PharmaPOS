import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'fs'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'

const PROJECT_ROOT = path.resolve(__dirname, '../../..')

/**
 * The DEV Electron binary, not the packaged exe.
 *
 * electron-forge ships the packaged app with the `EnableNodeCliInspectArguments`
 * fuse disabled, so Playwright cannot attach to it — `_electron.launch()` fails
 * with a bare "Process failed to launch!". The dev binary runs the same
 * `.vite/build` output, so this tests the real bundle either way.
 *
 * Resolved through the `electron` package rather than a hardcoded
 * `node_modules/electron/dist/...` path: since Electron 42, `npm ci` no longer
 * downloads the binary, and requiring the package downloads it on first use
 * and returns its path.
 */
function electronBinary(): string {
  return createRequire(path.join(PROJECT_ROOT, 'package.json'))('electron') as string
}

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
  /** The SQLite file this instance is using — seed helpers write straight to it. */
  dbPath: string
  userDataDir: string
  /** Console/page errors seen since launch. Assert this is empty. */
  errors: string[]
  close: () => Promise<void>
}

/**
 * Launch the app fully isolated: its own userData directory AND its own database
 * file, so a test can never touch the operator's real pharmacy data. Each call
 * starts from a blank slate, which means the first screen is the setup wizard.
 */
export async function launchApp(): Promise<LaunchedApp> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-e2e-'))
  const dbPath = path.join(userDataDir, 'test.db')

  // Electron tests for the PRESENCE of ELECTRON_RUN_AS_NODE, not its value, so
  // setting it to '' is still enough to make it boot as plain Node — the window
  // never opens and Playwright reports a bare "Process failed to launch!". It has
  // to be deleted. Worth guarding: it is easy to leave exported in a shell after
  // using `electron` to run a one-off script.
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }
  env.TEST_DB_PATH = dbPath

  const app = await electron.launch({
    executablePath: electronBinary(),
    args: [PROJECT_ROOT, `--user-data-dir=${userDataDir}`],
    env,
    timeout: 60_000
  })

  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded')

  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })

  const close = async (): Promise<void> => {
    // The End-Shift close guard answers a quit request with `preventDefault()`
    // and re-shows the window — by design, so Alt+F4 cannot skip the cash count.
    // A bare `app.close()` therefore never resolves and Playwright reports a
    // 120s worker-teardown timeout even when every assertion passed.
    //
    // Release the guard the same way the app itself does when End Shift
    // completes, then close gracefully. Killing the process instead leaves
    // Playwright's own handle waiting, which produces the same timeout at worker
    // teardown rather than per test.
    await page.evaluate(() => window.electron.ipcRenderer.send('app:confirm-close')).catch(() => {})

    const proc = app.process()
    await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5_000))])
    if (proc.exitCode === null && !proc.killed) proc.kill()

    // Windows holds the SQLite file open briefly after the process dies.
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true })
        return
      } catch {
        await new Promise((r) => setTimeout(r, 300))
      }
    }
  }

  return { app, page, dbPath, userDataDir, errors, close }
}

/**
 * Call a preload-exposed IPC method from inside the renderer and return its
 * result, or `THREW: <message>` on rejection.
 *
 * Every gated channel resolves the acting user from the main-process session, so
 * these only work once signed in — which is exactly what makes them worth
 * asserting on.
 */
export async function ipc(page: Page, expression: string): Promise<unknown> {
  return page.evaluate(
    `(${expression}).then(r => r === undefined ? 'OK' : r, e => 'THREW: ' + e.message)`
  )
}

/**
 * The failure message from an IPC call, however that channel reports failure.
 *
 * The two conventions are both in use and neither is going away cheaply: the
 * shift, customer and setup channels reject (so the message arrives wrapped in
 * Electron's `Error invoking remote method …`), while the inventory channels
 * return a `{ success: false, error }` envelope. Asserting with `String(result)`
 * silently produces `"[object Object]"` for the second kind — which matches no
 * pattern and reads like the validation never fired.
 */
export function ipcError(result: unknown): string {
  if (typeof result === 'string') return result
  if (result && typeof result === 'object') {
    const envelope = result as { success?: boolean; error?: string }
    if (envelope.success === false) return envelope.error ?? '(no error message)'
    return `(unexpected success: ${JSON.stringify(result)})`
  }
  return String(result)
}
