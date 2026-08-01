# 01 — Tech Stack

## Runtime & Core Frameworks

| Layer | Technology | Version (package.json) |
|---|---|---|
| Desktop shell | Electron | ^39.2.6 |
| Language | TypeScript | ^5.9.3 |
| UI framework | React + React DOM | ^19.2.1 |
| Styling | Tailwind CSS (v4, via `@tailwindcss/vite`) | ^4.1.18 |
| UI primitives | Radix UI (`alert-dialog`, `dialog`, `label`, `select`, `slot`, `tabs`) + shadcn-style local components | — |
| Icons | lucide-react | ^0.562.0 |
| State management | Zustand | ^5.0.10 |
| Forms | react-hook-form + @hookform/resolvers + Zod (^4.3.6) | ^7.71.1 |
| Tables | @tanstack/react-table | ^8.21.3 |
| Charts | Recharts | ^3.7.0 |
| Database | better-sqlite3 (native) | ^12.6.2 |
| ORM | drizzle-orm (`drizzle-orm/better-sqlite3`) | ^0.45.1 |
| Password hashing | bcryptjs (cost 10) | ^3.0.3 |
| Serial (pole display) | serialport (native) | ^13.0.0 |
| USB (thermal printer) | usb (native) | ^2.17.0 |
| Scheduling | node-schedule | ^2.1.1 |
| Logging | winston + winston-daily-rotate-file | ^3.19.0 / ^5.0.0 |
| Error tracking | @sentry/electron | ^6.6.0 |
| AI | @google/generative-ai (model `gemini-pro`) | ^0.24.1 |
| Google Drive | googleapis (Drive v3, OAuth2) | ^171.2.0 |
| Archiving (backups) | archiver + extract-zip | ^4.0.2 / ^2.0.1 |
| CSV | csv-parse + csv-stringify | ^6.x |
| Excel import | read-excel-file | ^6.0.1 |
| PDF reports | jspdf + jspdf-autotable | ^4.2.0 / ^5.0.7 |
| Auto-update | update-electron-app (Squirrel + update.electronjs.org) | ^3.1.2 |
| Utility CSS | clsx, tailwind-merge, class-variance-authority | — |
| Electron helpers | @electron-toolkit/utils, @electron-toolkit/preload | ^4.0.0 / ^3.0.2 |

### Native modules (require rebuild for Electron ABI)

`better-sqlite3`, `usb`, `serialport` — all three are:

- externalized in the main-process Vite config (`serialport` and `usb` only in main; `better-sqlite3` also in preload config)
- unpacked from asar (`**/*.node` plus the module directories, see packaging below)

## Build & Packaging Pipeline

- **Orchestrator**: Electron Forge (`@electron-forge/cli` ^7.11.1)
- **Bundler**: `@electron-forge/plugin-vite` with three separate Vite configs:
  - `vite.main.config.ts` — main process; externals: `better-sqlite3`, `serialport`, `usb`
  - `vite.preload.config.ts` — preload; external `better-sqlite3`; output filename forced to `preload.js`
  - `vite.renderer.config.ts` — renderer; root `src/renderer`, plugins `@vitejs/plugin-react` + `@tailwindcss/vite`, alias `@renderer` → `src/renderer/src`, outDir forced to project-root `.vite/renderer/main_window` (packaged main loads `app.asar/.vite/renderer/main_window/index.html`)
- **Entry point**: `"main": ".vite/build/index.js"`
- **Renderer URL loading** (main process) uses Forge-injected globals `MAIN_WINDOW_VITE_DEV_SERVER_URL` / `MAIN_WINDOW_VITE_NAME` (dev server in dev, bundled HTML in production).

### forge.config.ts (key facts)

- `packagerConfig.ignore`: keeps only `/.vite` and `/node_modules` (the Vite plugin default drops externalized native modules — this override is load-bearing)
- `asar.unpack: '**/*.node'`, `asar.unpackDir: '**/node_modules/{better-sqlite3,usb,serialport,@serialport}'`
- App name `PharmaPOS`, icon `./build/icon`, `extraResource: ['./resources']`
- Makers:
  - **Squirrel.Windows** (`PharmaPOS-Setup.exe`, setup icon `./build/icon.ico`, iconUrl points at raw GitHub `Rivi9/pharmapos/main/build/icon.ico`) → output `out/make/squirrel.windows/x64/`
  - **ZIP** for darwin
- Plugins: `AutoUnpackNativesPlugin` + `VitePlugin`
- Publisher: **GitHub** (`Rivi9/pharmapos`, `prerelease: false`)

### Auto-update

`update-electron-app` + Electron built-in `autoUpdater` (Squirrel protocol) checking `https://update.electronjs.org/Rivi9/pharmapos`. Initialized in `src/main/services/updates/auto-updater.ts`, wired to the main window; renderer shows `UpdateNotification`.

## npm Scripts

| Script | Command |
|---|---|
| `dev` / `start` | `electron-forge start` |
| `package` | `npm run typecheck && electron-forge package` |
| `make` | `npm run typecheck && electron-forge make` |
| `publish` | `npm run typecheck && electron-forge publish` |
| `typecheck` | `tsc --noEmit` against `tsconfig.node.json` and `tsconfig.web.json` |
| `lint` | `eslint --cache .` (flat config, `eslint.config.mjs`) |
| `format` | `prettier --write .` |
| `test:e2e` | `playwright test` (plus `:ui`, `:debug` variants) |

Note: npm install currently requires `--legacy-peer-deps` (eslint-plugin-react peer-dep conflict with eslint 9/10).

## TypeScript Configuration

- `tsconfig.json` — composite root
- `tsconfig.node.json` — main + preload (node context)
- `tsconfig.web.json` — renderer (web context)
- Path alias `@renderer/*` → `src/renderer/src/*`

## Testing

- **Playwright** E2E tests in `tests/e2e/`, configured in `playwright.config.ts`: `workers: 1`, `fullyParallel: false` (Electron cannot run parallel instances), 30 s test timeout, HTML reporter, trace/video/screenshot on failure.
- The database service honours `TEST_DB_PATH` env var to point tests at an isolated SQLite file.

## Assets

- `build/` — `icon.ico`, `icon.icns`, `icon.png`, `entitlements.mac.plist`
- `resources/` — `icon.png` (shipped via `extraResource`)

## Target Environment

- Windows 10 POS machine, touchscreen-first UI (large touch targets, on-screen numeric pads)
- Customer-facing pole display on a serial COM port (see [06-integrations.md](06-integrations.md))
- ESC/POS thermal receipt printer via USB or TCP:9100
- Window: 900×670 created hidden, maximized on `ready-to-show`, `autoHideMenuBar: true`, `sandbox: false` with a preload bridge; external links open in the OS browser (window-open handler denies and calls `shell.openExternal`)
