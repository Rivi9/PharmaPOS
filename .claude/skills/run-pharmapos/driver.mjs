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
import { createRequire } from 'node:module'
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
  // Requiring the package returns the binary's path — and since Electron 42,
  // which no longer downloads it during `npm ci`, downloads it on first use.
  return createRequire(path.join(PROJECT_ROOT, 'package.json'))('electron')
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

    // PHARMA_SEED_DB=<file> starts from a COPY of an existing database — the way
    // to reproduce an operator-reported bug, or to watch migrations run against
    // real data. It is copied, never opened in place, so the source is untouched.
    if (process.env.PHARMA_SEED_DB) {
      fs.copyFileSync(process.env.PHARMA_SEED_DB, dbPath)
      log('seeded from', process.env.PHARMA_SEED_DB)
    }

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
    await page.getByPlaceholder(/Scan a barcode/i).waitFor({ timeout: 20_000 })
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

  /**
   * Seed a large catalogue, for measuring what a real pharmacy's 10k products
   * actually cost. Two batches per product, so the stock aggregate has to touch
   * both — a one-batch fixture understates it.
   */
  async bigseed(count = '10000') {
    const total = Number(count)
    const db = new DatabaseSync(dbPath)
    try {
      const now = new Date().toISOString()
      const expiry = new Date(Date.now() + 300 * 864e5).toISOString().split('T')[0]
      db.exec('BEGIN')
      const prod = db.prepare(
        `INSERT INTO products (id,name,barcode,sku,unit_price,cost_price,reorder_level,reorder_qty,
                               tax_rate,is_tax_inclusive,is_active,created_at,updated_at)
         VALUES (?,?,?,?,?,?,10,50,0,1,1,?,?)`
      )
      const batch = db.prepare(
        `INSERT INTO stock_batches (id,product_id,batch_number,quantity,cost_price,selling_price,
                                    expiry_date,received_date,created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      for (let i = 0; i < total; i++) {
        const id = 'bulk' + i
        prod.run(
          id,
          `Medicine ${String(i).padStart(5, '0')}`,
          'BULK' + i,
          'SKU' + i,
          25 + (i % 90),
          15,
          now,
          now
        )
        batch.run('bb' + i + 'a', id, 'B1', 40, 15, 25, expiry, now, now)
        batch.run('bb' + i + 'b', id, 'B2', 10, 16, 26, expiry, now, now)
      }
      db.exec('COMMIT')
    } finally {
      db.close()
    }
    log('bigseed:', total, 'products,', total * 2, 'batches')
  },

  /** Time a renderer expression, repeated. `time:3:window.electron.listProducts('x')` */
  async time(spec) {
    const match = spec.match(/^(\d+):([\s\S]+)$/)
    const runs = match ? Number(match[1]) : 1
    const expr = match ? match[2] : spec
    const out = await page.evaluate(
      `(async () => {
        const times = []
        let size = 0
        for (let i = 0; i < ${runs}; i++) {
          const s = performance.now()
          const r = await (${expr})
          times.push(Math.round(performance.now() - s))
          try { size = JSON.stringify(r).length } catch { size = -1 }
        }
        return JSON.stringify({ ms: times, payloadBytes: size })
      })()`
    )
    log(out)
  },

  /**
   * Seed a small catalogue with the shop's own product names (from
   * `Pharmacy POS.xlsx`), including the "azi" cluster the ranked search was
   * built for, one out-of-stock line and one expiring in 12 days.
   */
  async rxseed() {
    const db = new DatabaseSync(dbPath)
    const rows = [
      // name, generic, sku, barcode, price, stock, expiryDays
      ['Azigen 500mg', 'Azithromycin', 'AZG500', '4790001', 72, 8, 400],
      ['Azigen Syr', 'Azithromycin', 'AZGSYR', '4790002', 540, 5, 400],
      ['Azileb Syr200', 'Azithromycin', 'AZL200', '4790003', 590, 0, 400],
      ['Azithromycin 250mg', 'Azithromycin', 'AZT250', '4790004', 48, 30, 400],
      ['Azithromycin 500mg', 'Azithromycin', 'AZT500', '4790005', 85, 240, 12],
      ['Azithromycin Syrup', 'Azithromycin', 'AZTSYR', '4790006', 640, 36, 400],
      [
        'Burna Cream- (Silver Sulfardiazine)',
        'Silver Sulfadiazine',
        'BRN01',
        '4790007',
        380,
        8,
        400
      ],
      ['Clofazimine', 'Clofazimine', 'CLF01', '4790008', 120, 4, 400],
      ['Diazide 40mg', 'Gliclazide', 'DZD40', '4790009', 14, 90, 400],
      ['Gliclazide 80mg', 'Gliclazide', 'GLZ80', '4790010', 18, 120, 400],
      ['Panadol 500mg', 'Paracetamol', 'PAN500', '4790012', 6, 500, 400],
      ['Amoxicillin 500mg', 'Amoxicillin', 'AMX500', '4790013', 22, 25, 400],
      ['Cetirizine 10mg', 'Cetirizine', 'CTZ10', '4790014', 9, 300, 400],
      ['Metformin 500mg', 'Metformin', 'MTF500', '4790015', 7, 600, 400],
      ['Omeprazole 20mg', 'Omeprazole', 'OMP20', '4790016', 15, 150, 400],
      ['Salbutamol Inhaler', 'Salbutamol', 'SAL100', '4790017', 950, 12, 400]
    ]
    try {
      const now = new Date().toISOString()
      db.exec('BEGIN')
      const prod = db.prepare(
        `INSERT OR REPLACE INTO products (id,name,generic_name,barcode,sku,unit_price,cost_price,reorder_level,
           reorder_qty,tax_rate,is_tax_inclusive,is_active,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,10,50,0,1,1,?,?)`
      )
      const batch = db.prepare(
        `INSERT OR REPLACE INTO stock_batches (id,product_id,batch_number,quantity,cost_price,expiry_date,received_date,created_at)
         VALUES (?,?,'RX-1',?,?,?,?,?)`
      )
      for (const [name, generic, sku, barcode, price, stock, expiryDays] of rows) {
        const id = 'rx-' + sku
        prod.run(id, name, generic, barcode, sku, price, price * 0.6, now, now)
        if (stock > 0) {
          const expiry = new Date(Date.now() + expiryDays * 864e5).toISOString().split('T')[0]
          batch.run('rxb-' + sku, id, stock, price * 0.6, expiry, now, now)
        }
      }
      db.exec('COMMIT')
    } finally {
      db.close()
    }
    log('rxseed:', rows.length, 'products')
  },

  /** Type into the till's product box without pressing Enter: `type:azi`. */
  async type(text = '') {
    const box = page.getByPlaceholder(/Scan a barcode/i)
    await box.click()
    await box.fill('')
    await box.pressSequentially(text, { delay: 40 })
    await sleep(700)
    log('typed', JSON.stringify(text))
  },

  async scan(barcode = 'PARA500') {
    const box = page.getByPlaceholder(/Scan a barcode/i)
    await box.fill(barcode)
    await box.press('Enter')
    await sleep(1200)
    log('scanned', barcode)
  },

  /** Open the payment modal, tender cash, confirm. */
  async pay(cash = '100') {
    await page.getByRole('button', { name: /^Pay /i }).first().click()
    await sleep(800)
    await page.locator('#cash-received').fill(String(cash))
    await page.getByRole('button', { name: /^Complete Sale$/ }).click()
    await sleep(2000)
    log('paid', cash)
  },

  /**
   * Switch a Radix tab by its label. `tab:Stock Batches`
   *
   * `clicktext` cannot do this: Radix's Tabs listen for real pointer events, so a
   * DOM `.click()` reports OK and changes nothing — the most misleading kind of
   * failure. This uses Playwright's own click, which sends real events.
   */
  async tab(name) {
    await page.getByRole('tab', { name: new RegExp(name, 'i') }).click()
    await sleep(900)
    log('tab', JSON.stringify(name))
  },

  /**
   * Reload the renderer, as Ctrl+R does — the default Electron menu is still
   * installed, so an operator can trigger this by accident. Anything the app
   * keeps only in memory is gone afterwards.
   */
  async reload() {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await sleep(2500)
    log('reloaded')
  },

  /** Wait, for debounced UI. `sleep:1500` */
  async sleep(ms = '1000') {
    await sleep(Number(ms))
    log('slept', ms + 'ms')
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

  /**
   * Save every download (the Reports tab's PDFs, CSV exports) into `dir`,
   * default SHOT_DIR, instead of Electron's Save dialog — which nothing can
   * click from here. Run it after `launch`/`boot`, before the download.
   */
  async downloads(dir = SHOT_DIR) {
    const target = path.resolve(dir)
    fs.mkdirSync(target, { recursive: true })
    await app.evaluate(
      ({ session }, { target, sep }) => {
        session.defaultSession.on('will-download', (_e, item) => {
          item.setSavePath(target + sep + item.getFilename())
        })
      },
      { target, sep: path.sep }
    )
    log('downloads go to', target)
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
  //
  // These commands take the rest of the line VERBATIM. Splitting them on every
  // colon truncated any JS object literal or SQL cast — `eval:...{name:'x'}`
  // arrived as `...{name` and failed with a bare `SyntaxError: Unexpected token`
  // that pointed nowhere near the real cause.
  const FREEFORM = new Set(['eval', 'sql', 'clicktext', 'text', 'click', 'time', 'tab', 'type'])
  const separator = trimmed.includes(':') ? ':' : ' '
  const head = trimmed.split(/[: ]/)[0]

  let cmd, args
  if (FREEFORM.has(head)) {
    const rest = trimmed.slice(head.length + 1).trim()
    cmd = head
    args = rest ? [rest] : []
  } else {
    const parts = separator === ':' ? trimmed.split(':') : trimmed.split(/\s+/)
    cmd = parts[0]
    args = parts.slice(1)
  }

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
