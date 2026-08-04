#!/usr/bin/env node
// Driver for the PharmaPOS Electron till.
//
// Two modes:
//   node .claude/skills/run-pharmapos/driver.mjs boot ss:home scan:PARA500 ...
//   node .claude/skills/run-pharmapos/driver.mjs --repl        (commands on stdin)
//
// Batch mode is the primary agent path. There is no tmux on this Windows host,
// so the usual "wrap the REPL in tmux and send-keys" pattern does not apply —
// a command list on argv gives the same scripted control without it.
//
// SAFETY: every run gets a throwaway --user-data-dir AND a throwaway
// TEST_DB_PATH. The real pharmacy database in %APPDATA%/pharma-pos is never
// opened. Do not remove that isolation to "test against real data" — it holds
// live customer records and password hashes.

import { _electron as electron } from 'playwright-core'
import * as readline from 'node:readline'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '../../..')
const SHOT_DIR = process.env.SHOT_DIR || path.join(os.tmpdir(), 'pharmapos-shots')
fs.mkdirSync(SHOT_DIR, { recursive: true })

const ADMIN = { fullName: 'Driver Admin', username: 'driveradmin', password: 'driverpass123' }

let app = null
let page = null
let userDataDir = null
let dbPath = null
const errors = []

const log = (...a) => console.log(...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function electronBinary() {
  // The DEV binary, never out/PharmaPOS-win32-x64/PharmaPOS.exe: electron-forge
  // packages with the EnableNodeCliInspectArguments fuse disabled, so Playwright
  // cannot attach to the packaged app and _electron.launch() dies with a bare
  // "Process failed to launch!". The dev binary runs the same .vite/build output.
  if (process.platform === 'win32')
    return path.join(PROJECT_ROOT, 'node_modules/electron/dist/electron.exe')
  if (process.platform === 'darwin')
    return path.join(
      PROJECT_ROOT,
      'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
    )
  return path.join(PROJECT_ROOT, 'node_modules/electron/dist/electron')
}

function childEnv() {
  // ELECTRON_RUN_AS_NODE is tested for PRESENCE, not value — setting it to ''
  // still boots Electron as plain Node, no window opens, and Playwright reports
  // the same opaque "Process failed to launch!". It has to be deleted. Easy to
  // leave exported in a shell after using electron to run a one-off script.
  const env = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (k !== 'ELECTRON_RUN_AS_NODE' && v !== undefined) env[k] = v
  }
  env.TEST_DB_PATH = dbPath
  return env
}

const COMMANDS = {
  async launch() {
    if (app) return log('already launched')
    userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pharmapos-drv-'))
    dbPath = path.join(userDataDir, 'driver.db')

    app = await electron.launch({
      executablePath: electronBinary(),
      args: [PROJECT_ROOT, `--user-data-dir=${userDataDir}`],
      env: childEnv(),
      timeout: 60_000
    })
    page = await app.firstWindow({ timeout: 60_000 })
    await page.waitForLoadState('domcontentloaded')
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push('console: ' + m.text())
    })
    await sleep(2500)
    log('launched. db:', dbPath)
    log(
      'windows:',
      app
        .windows()
        .map((w) => w.url())
        .join(', ')
    )
  },

  /** Fresh install → wizard → login → shift open → one product seeded. */
  async boot() {
    if (!app) await COMMANDS.launch()
    await COMMANDS.setup()
    await COMMANDS.login()
    await COMMANDS.seed()
    await COMMANDS.shift('5000')
    log('booted: signed in, shift open, PARA500 sellable')
  },

  async setup(businessName = 'Driver Test Pharmacy') {
    await page.getByText('Welcome to PharmaPOS').waitFor({ timeout: 30_000 })
    await fillLabel('Business Name', businessName)
    await clickText('Next')
    await sleep(600)
    await fillLabel('Full Name', ADMIN.fullName)
    await fillLabel('Username', ADMIN.username)
    // Must be >= 8 chars and not equal the username, or Next stays disabled.
    await fillLabel('Password', ADMIN.password)
    await clickText('Next')
    await sleep(600)
    await clickText('Complete Setup')
    // The wizard reloads the window to pick up the new settings.
    await page.getByText(/Select user to login/i).waitFor({ timeout: 30_000 })
    log('setup complete')
  },

  async login() {
    await page.getByText(ADMIN.fullName).first().click()
    // The tile opens a PIN pad. The wizard never sets a PIN, so the password
    // form has to be reached through "Use Password" first.
    await clickText('Use Password')
    const pw = page.locator('input[type="password"]')
    await pw.waitFor({ state: 'visible', timeout: 20_000 })
    await pw.fill(ADMIN.password)
    await clickText('Login')
    await sleep(2000)
    log('logged in')
  },

  async shift(amount = '5000') {
    for (const digit of String(amount)) {
      await page.getByRole('button', { name: digit, exact: true }).first().click()
    }
    await clickText('Start Shift')
    await page.getByPlaceholder(/Scan or enter barcode/i).waitFor({ timeout: 20_000 })
    log('shift open with float', amount)
  },

  /**
   * Insert a sellable product straight into the running instance's database.
   *
   * The BATCH matters as much as the product: deductStockFEFO sells out of
   * stock_batches, so a product with no batch is not sellable and a sale fails
   * with "Insufficient sellable stock" instead of doing what you asked. An
   * expired batch is excluded too, hence the year-out expiry.
   *
   * node:sqlite, not better-sqlite3 — the project's copy is compiled against
   * Electron's ABI and cannot be required from this plain-Node process.
   */
  async seed(barcode = 'PARA500', price = '25', qty = '100') {
    const db = new DatabaseSync(dbPath)
    try {
      const now = new Date().toISOString()
      const expiry = new Date(Date.now() + 365 * 864e5).toISOString().split('T')[0]
      const pid = 'drv-' + barcode
      db.prepare(
        `INSERT OR REPLACE INTO products
           (id,name,barcode,unit_price,cost_price,reorder_level,reorder_qty,
            tax_rate,is_tax_inclusive,is_active,created_at,updated_at)
         VALUES (?,?,?,?,?,10,50,0,1,1,?,?)`
      ).run(pid, 'Paracetamol 500mg', barcode, Number(price), Number(price) * 0.6, now, now)
      db.prepare(
        `INSERT OR REPLACE INTO stock_batches
           (id,product_id,batch_number,quantity,cost_price,expiry_date,received_date,created_at)
         VALUES (?,?,'DRV-1',?,?,?,?,?)`
      ).run('drvb-' + barcode, pid, Number(qty), Number(price) * 0.6, expiry, now, now)
    } finally {
      db.close()
    }
    log('seeded', barcode, 'x' + qty, '@' + price)
  },

  async scan(barcode = 'PARA500') {
    const box = page.getByPlaceholder(/Scan or enter barcode/i)
    await box.fill(barcode)
    await box.press('Enter')
    await sleep(1200)
    log('scanned', barcode)
  },

  /** Open the payment modal, tender cash, confirm. */
  async pay(cash = '100') {
    await clickText('Pay Now')
    await sleep(800)
    await page.locator('#cash-received').fill(String(cash))
    await page.getByRole('button', { name: /^Complete Sale$/ }).click()
    await sleep(2000)
    log('paid', cash)
  },

  async ss(name) {
    if (!page) return log('ERROR: launch first')
    const file = path.join(SHOT_DIR, (name || 'shot-' + Date.now()) + '.png')
    await page.screenshot({ path: file })
    log('screenshot:', file)
  },

  async click(sel) {
    // DOM .click(), not locator.click(): coordinate-based clicking misses when
    // content sits under an overlay, and this app is modal-heavy.
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s)
      if (!el) return 'NOT_FOUND'
      el.click()
      return 'OK'
    }, sel)
    log('click', sel, '→', r)
  },

  /** Click a button/link by its visible text. Most of this UI has no stable ids. */
  async clicktext(...words) {
    const needle = words.join(' ')
    const r = await page.evaluate((t) => {
      const els = [...document.querySelectorAll('button, a, [role="button"]')]
      const el =
        els.find((e) => e.textContent?.trim() === t) ?? els.find((e) => e.textContent?.includes(t))
      if (!el) return 'NOT_FOUND'
      if (el.disabled) return 'DISABLED'
      el.click()
      return 'OK'
    }, needle)
    await sleep(900)
    log('clicktext', JSON.stringify(needle), '→', r)
  },

  async text(sel) {
    log(
      await page.evaluate(
        (s) => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
        sel || null
      )
    )
  },

  /**
   * Evaluate an expression in the renderer. Use for IPC:
   *   eval window.electron.getActiveShift()
   *
   * This is deliberate arbitrary-code execution and is safe here: it is a local
   * developer tool, the expression comes from whoever is running the driver (the
   * same person who could open DevTools), and it executes inside a throwaway
   * profile against a throwaway database. It parses no untrusted input — there is
   * nothing to sanitise, and a JSON parser could not do the job, which is to
   * reach into a live renderer.
   */
  async eval(expr) {
    try {
      const out = await page.evaluate(
        `Promise.resolve(${expr}).then(r => JSON.stringify(r ?? null), e => 'THREW: ' + e.message)`
      )
      log(out)
    } catch (e) {
      log('ERROR:', e.message)
    }
  },

  /** Run read-only SQL against this instance's database. */
  async sql(query) {
    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      log(JSON.stringify(db.prepare(query).all(), null, 1))
    } finally {
      db.close()
    }
  },

  async errors() {
    log(errors.length ? errors.join('\n') : 'no page errors')
  },

  async windows() {
    for (const w of app.windows()) log(' ', w.url())
  },

  async quit() {
    if (!app) return
    // app.close() alone HANGS: the End-Shift close guard answers any quit
    // request with preventDefault() and re-shows the window, by design, so
    // Alt+F4 cannot skip the cash count. Release it the same way the app does
    // when End Shift completes, then close.
    await page
      ?.evaluate(() => window.electron.ipcRenderer.send('app:confirm-close'))
      .catch(() => {})
    const proc = app.process()
    await Promise.race([app.close().catch(() => {}), sleep(5000)])
    if (proc.exitCode === null && !proc.killed) proc.kill()
    app = null
    page = null
    for (let i = 0; i < 6; i++) {
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true })
        break
      } catch {
        await sleep(300)
      }
    }
    log('closed')
  },

  help() {
    log('commands:', Object.keys(COMMANDS).join(', '))
    log('batch:  node driver.mjs boot ss:home scan:PARA500 pay:100 ss:receipt quit')
    log('repl:   node driver.mjs --repl')
  }
}

async function fillLabel(label, value) {
  const field = page.getByLabel(new RegExp(`^\\s*${label}\\s*\\*?\\s*$`, 'i')).first()
  await field.fill(value)
}

async function clickText(t) {
  await page
    .getByRole('button', { name: new RegExp(`^${t}$`, 'i') })
    .first()
    .click()
}

async function run(line) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return
  // `name:arg1:arg2` in batch mode, `name arg1 arg2` in the REPL.
  const parts = trimmed.includes(':') ? trimmed.split(':') : trimmed.split(/\s+/)
  const [cmd, ...args] = parts
  const fn = COMMANDS[cmd]
  if (!fn) return log('unknown command:', cmd, '— try: help')
  await fn(...args)
}

const argv = process.argv.slice(2)

async function runAll(lines) {
  for (const line of lines) {
    try {
      await run(line)
    } catch (e) {
      log('ERROR:', e.message)
      return false
    }
    if (line.trim() === 'quit') return true
  }
  return true
}

if (argv.includes('--repl')) {
  if (process.stdin.isTTY) {
    // A human at a keyboard: one line at a time, and pause the stream while a
    // command runs so a fast typist cannot interleave two.
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.setPrompt('pharmapos> ')
    log('PharmaPOS driver — "help" for commands, "boot" for a ready till')
    rl.prompt()
    rl.on('line', async (line) => {
      rl.pause()
      try {
        await run(line)
      } catch (e) {
        log('ERROR:', e.message)
      }
      if (line.trim() === 'quit') return rl.close()
      rl.resume()
      rl.prompt()
    })
    rl.on('close', async () => {
      await COMMANDS.quit()
      process.exit(0)
    })
  } else {
    // Piped input — how an agent drives this. Read stdin to completion first,
    // then run the lines in order. readline is deliberately NOT used here: it
    // emits every buffered line at once, and no amount of promise-chaining in
    // the handler reliably keeps `close` from racing the queue. Draining the
    // stream first makes the ordering unconditional.
    log('PharmaPOS driver — reading commands from stdin')
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const lines = Buffer.concat(chunks).toString('utf8').split(/\r?\n/)
    const ok = await runAll(lines)
    if (errors.length) log('PAGE ERRORS:\n' + errors.join('\n'))
    await COMMANDS.quit()
    process.exit(ok ? 0 : 1)
  }
} else if (argv.length === 0) {
  COMMANDS.help()
} else {
  let failed = false
  for (const step of argv) {
    try {
      await run(step)
    } catch (e) {
      log('FAILED at', step + ':', e.message)
      failed = true
      break
    }
  }
  if (errors.length) log('PAGE ERRORS:\n' + errors.join('\n'))
  await COMMANDS.quit()
  process.exit(failed ? 1 : 0)
}
