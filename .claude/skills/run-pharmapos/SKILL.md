---
name: run-pharmapos
description: Build, run, drive and screenshot the PharmaPOS Electron till. Use when asked to start or launch the app, take a screenshot of a screen, reproduce a POS/inventory/shift bug, exercise an IPC channel, or run the E2E tests.
---

PharmaPOS is an Electron pharmacy till (React renderer, better-sqlite3, electron-forge + Vite). It has a window, so it is driven programmatically through the REPL/batch driver at `.claude/skills/run-pharmapos/driver.mjs`, which uses Playwright's `_electron`.

All paths below are relative to the repo root. Every command here was run on this Windows host (Git Bash) and worked.

## ⚠️ Never point the app at the real database

The operator's live pharmacy data — customer records, password hashes, every sale — is at `%APPDATA%/pharma-pos/pharmapos.db`. The driver gives every run a throwaway `--user-data-dir` **and** a throwaway `TEST_DB_PATH`. Do not remove that isolation to "test against real data"; copy the file to a scratch directory and point `TEST_DB_PATH` at the copy instead.

A fresh profile means every run starts at the first-run setup wizard. That is expected — `boot` walks it.

## Prerequisites

No system packages. Windows host, and:

```bash
node --version    # v24.13.0 here; must be >= 22.5 for `node:sqlite`
npm --version     # 11.6.2
```

`node:sqlite` is required because the project's `better-sqlite3` is compiled against **Electron's** ABI and cannot be `require`d from a plain-Node process. The driver and the E2E fixtures both use `node:sqlite` for database access.

## Build

`.vite/build` must be current or you will drive **the previous commit's code** — see Gotchas.

```bash
npx electron-forge package
```

Slow (~1 min) because it also packages to `out/`, but it is the only command that regenerates `.vite/build`. `npx vite build` does **not** work standalone — the forge plugin supplies the entry, so it fails with `Could not resolve entry module "index.html"`.

## Run (agent path) — batch mode

Commands as argv, executed in order, then the app closes. This is the primary path: there is no tmux on this host, so the usual "wrap a REPL in tmux and send-keys" pattern does not apply.

```bash
node .claude/skills/run-pharmapos/driver.mjs boot ss:01-till scan:PARA500 ss:02-cart pay:100 ss:03-receipt errors quit
```

That produces a completed cash sale and three screenshots. Verified output:

```
launched. db: C:\Users\Rivindu\AppData\Local\Temp\pharmapos-drv-sKDRaI\driver.db
setup complete
logged in
seeded PARA500 x100 @25
shift open with float 5000
booted: signed in, shift open, PARA500 sellable
screenshot: ...\01-till.png
scanned PARA500
screenshot: ...\02-cart.png
paid 100
screenshot: ...\03-receipt.png
no page errors
closed
```

Screenshots land in `%TEMP%/pharmapos-shots` unless you set `SHOT_DIR`:

```bash
SHOT_DIR=/tmp/shots node .claude/skills/run-pharmapos/driver.mjs boot ss:home quit
```

**Look at the screenshot.** A blank frame means the app did not really start.

### Commands

| command | what it does |
|---|---|
| `launch` | start the app on a throwaway profile |
| `boot` | launch + setup wizard + login + seed a product + open a shift → a usable till |
| `setup[:name]` | walk the first-run wizard |
| `login` | sign in as the wizard admin |
| `shift[:float]` | key the opening float on the numpad and open the shift |
| `seed[:barcode:price:qty]` | insert a sellable product **and a stock batch** |
| `bigseed[:count]` | seed a large catalogue (default 10,000 products, 2 batches each) for perf work |
| `scan:<barcode>` | type a barcode into Product Entry and press Enter |
| `pay:<cash>` | Pay Now → fill cash → Complete Sale |
| `ss[:name]` | screenshot |
| `click:<css>` | DOM `.click()` on a selector |
| `clicktext:<text>` | click a button by its visible text — most of this UI has no stable ids |
| `tab:<label>` | switch a Radix tab (`clicktext` cannot — see Gotchas) |
| `sleep:<ms>` | wait, for debounced UI |
| `time:<runs>:<expr>` | time a renderer expression and report the payload size |
| `text[:css]` | print `innerText` |
| `eval:<expr>` | evaluate in the renderer — this is how you reach IPC |
| `sql:<query>` | read-only SQL against this run's database |
| `errors` | page errors collected since launch |
| `windows` | list windows |
| `quit` | release the close guard, close, delete the profile |

Arguments are `:`-separated in batch mode and space-separated in the REPL.

### Reproducing a screen you cannot reach by barcode

Most of this UI has no stable ids, so `clicktext` is the way in. To photograph
the End Shift dialog (which needs a signed-in user with an open shift):

```bash
SHOT_DIR=/tmp/shots node .claude/skills/run-pharmapos/driver.mjs boot "clicktext:End Shift" ss:endshift quit
```

Quote the argument — the text contains a space. Same for the payment modal:

```bash
SHOT_DIR=/tmp/shots node .claude/skills/run-pharmapos/driver.mjs boot scan:PARA500 "clicktext:Pay Now" ss:payment quit
```

### Reproducing a bug against real data

`PHARMA_SEED_DB` starts from a **copy** of an existing database — how to
reproduce an operator-reported problem, or watch a migration run against real
rows. The source file is copied, never opened, so it cannot be modified:

```bash
cp "$APPDATA/pharma-pos/pharmapos.db" /tmp/live-copy.db
PHARMA_SEED_DB=/tmp/live-copy.db node .claude/skills/run-pharmapos/driver.mjs   launch "sql:PRAGMA user_version" "sql:SELECT COUNT(*) AS products FROM products" quit
```

```
seeded from /tmp/live-copy.db
[ { "user_version": 6 } ]
[ { "products": 257 } ]
```

### Measuring performance

`bigseed` plus `time` is how the H18 paging work was measured — and the only
reason the 4.2 MB payload was noticed at all:

```bash
node .claude/skills/run-pharmapos/driver.mjs launch setup login bigseed:10000 \
  "time:3:window.electron.listProductsPage('x', { limit: 50, offset: 0 })" quit
```

```json
{"ms":[7,3,3],"payloadBytes":20918}
```

`time` reports both duration and serialised payload size, because over IPC the
second matters as much as the first.

### Reaching IPC and the database

`eval` runs in the renderer, so the whole preload bridge is available — that is the fastest way to exercise a channel without building UI for it:

```bash
node .claude/skills/run-pharmapos/driver.mjs boot "eval:window.electron.getActiveShift()" quit
```

```json
{"id":"e8f6ef8c-...","user_id":"d432f707-...","opening_cash":5000,"status":"active","user_name":"Driver Admin"}
```

`sql` asserts what the UI cannot show:

```bash
node .claude/skills/run-pharmapos/driver.mjs boot scan:PARA500 pay:100 "sql:SELECT receipt_number, total, change_given FROM sales" quit
```

```json
[ { "receipt_number": "R-2026-000001", "total": 25, "change_given": 75 } ]
```

## Run (agent path) — piped REPL

Same commands on stdin. Useful when the list is long or generated:

```bash
printf 'boot\nscan:PARA500\npay:100\nsql:SELECT receipt_number, total FROM sales\nerrors\nquit\n' \
  | node .claude/skills/run-pharmapos/driver.mjs --repl
```

Interactive at a terminal: `node .claude/skills/run-pharmapos/driver.mjs --repl`.

## Test

The E2E suite (27 specs, ~1.2 min) shares the same launch approach — see `tests/e2e/helpers/app.ts`.

```bash
npm run test:e2e            # pretest:e2e rebuilds first — always use this, not `npx playwright test`
npm run typecheck           # node + web
```

```
27 passed (1.2m)
```

## Run (human path)

```bash
npm run dev
```

Opens a real window against the **live** database. Only for hands-on use on a machine whose data you do not mind touching.

## Gotchas

- **The packaged exe cannot be driven.** electron-forge disables the `EnableNodeCliInspectArguments` fuse, so Playwright cannot attach to `out/PharmaPOS-win32-x64/PharmaPOS.exe` and `_electron.launch()` fails with a bare `Process failed to launch!`. The driver launches `node_modules/electron/dist/electron.exe` against the same `.vite/build` output. Use the packaged exe only for things that need a real install (single-instance lock, Squirrel hooks).

- **`ELECTRON_RUN_AS_NODE` is tested for presence, not value.** If it is exported at all — even as `''` — Electron boots as plain Node, no window opens, and you get the *same* opaque `Process failed to launch!`. Running as Node instead surfaces as `TypeError: Cannot read properties of undefined (reading 'isPackaged')`. The driver deletes the key from the child environment; if you launch Electron by hand, `unset ELECTRON_RUN_AS_NODE` first. It is easy to leave exported after using `electron` to run a one-off script.

- **Stale `.vite/build` silently tests the previous commit.** Nothing warns you. This produced a run where 14 of 19 specs "failed" against code that was already fixed, with failure messages describing the *old* behaviour exactly. Always `npx electron-forge package` (or `npm run test:e2e`, which does it) after editing `src/`.

- **`app.close()` never resolves.** The End-Shift close guard answers any quit request with `preventDefault()` and re-shows the window — deliberately, so Alt+F4 cannot skip the cash count. Playwright reports this as a 120-second worker-teardown timeout *after every assertion has already passed*. `quit` releases the guard first by sending `app:confirm-close`, the same channel the app uses when End Shift completes. Anything that needs to quit this app programmatically must do the same.

- **A product with no stock batch is not sellable.** `deductStockFEFO` sells out of `stock_batches`, and expired batches are excluded. `seed` inserts both, with an expiry a year out; a near-dated or batch-less fixture makes a sale fail with `Insufficient sellable stock` rather than the thing you were testing.

- **The login tile opens a PIN pad, not a password box.** The setup wizard never sets a PIN, so `Use Password` has to be clicked first. This is why the old E2E specs' `input[name="password"]` could never have worked.

- **The wizard's `Next` is disabled until the admin password is valid** (≥ 8 characters and not equal to the username). A short password looks like a broken button.

- **Two IPC error conventions are both in use.** The shift, customer and setup channels *reject* (so the message arrives wrapped in Electron's `Error invoking remote method …`), while the inventory channels *return* `{ success: false, error }`. Asserting with `String(result)` on the second kind silently yields `"[object Object]"`, which matches no pattern and reads like the validation never fired. `tests/e2e/helpers/app.ts` exports `ipcError()` for this.

- **`npm install` rewrites `package-lock.json`** — 666 insertions / 681 deletions here with no dependency change, because npm 11 reformats it. Dependency versions are deliberately pinned (see `docs/QA-REPORT.md`), so use `npm ci`, or `git checkout -- package-lock.json` afterwards.

- **Radix tabs ignore a DOM `.click()`.** `clicktext:Stock Batches` reports `OK` and nothing happens — Radix's Tabs listen for real pointer events. That is the most misleading kind of failure, so there is a separate `tab:` command that uses Playwright's own click.

- **Debounced search needs `sleep`.** The Inventory search box debounces ~250 ms before hitting the database. A screenshot taken immediately after typing shows the *previous* result set, which looks like a filtering bug and is not one.

- **`npx vite build` does not work.** The forge Vite plugin supplies the entry; standalone it fails with `Could not resolve entry module "index.html"`.

## Troubleshooting

- **`Process failed to launch!`** → `unset ELECTRON_RUN_AS_NODE`, then confirm `.vite/build/index.js` exists (`npx electron-forge package`). Do not point the driver at the packaged exe.
- **`TypeError: Cannot read properties of undefined (reading 'isPackaged')`** → Electron is running as Node. Same fix.
- **`The module … better_sqlite3.node was compiled against a different Node.js version`** → you are requiring `better-sqlite3` from a plain-Node process. Use `node:sqlite`.
- **`Worker teardown timeout` / `Test timeout … while running "afterEach" hook`, but the assertions passed** → something quit the app without releasing the close guard.
- **Assertions describe behaviour you already fixed** → stale `.vite/build`. Rebuild.
- **`Insufficient sellable stock`** → the product has no batch, or its only batch is expired.
- **Temp profiles piling up in `%TEMP%/pharmapos-drv-*`** → a crashed run never reached `quit`. Safe to delete; `rm -rf "$TEMP"/pharmapos-drv-*`.
