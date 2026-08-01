# 06 — Hardware & External Integrations

## Thermal Receipt Printer (ESC/POS)

Files: `src/main/services/printer/thermal-printer.ts`, `escpos-builder.ts`, `receipt-formatter.ts`, IPC in `src/main/ipc/printer-handlers.ts`, UI wizard `components/settings/PrinterSetupWizard.tsx`.

- **Protocol**: raw ESC/POS built by a custom builder (`escpos-builder.ts`) — no third-party printer library
- **Transports**:
  - **USB** via the `usb` package; device addressed as decimal `vid:pid` (setting `printer_path`); `printer:list-usb` enumerates candidates
  - **TCP** raw socket to `printer_ip`:`printer_port` (default 9100)
- **Printer types**: `epson` | `star` | `generic` (command variations)
- **Width**: configurable characters per line, default 42
- **Capabilities**: sale receipt (`printer:print-receipt`), end-of-shift report (`printer:print-shift-report`), cash-drawer kick (`printer:open-drawer`), test print
- **Receipt content** (receipt-formatter): business name/address/phone header, receipt number, items, totals, tax, payment/change, `receipt_footer`, currency from `currency_symbol`

## Customer Pole Display (serial)

File: `src/main/services/pole-display.ts`; IPC handlers live directly in `src/main/index.ts`.

- **Device**: OCPD-LED8 8-digit LED pole display
- **Transport**: `serialport` package; factory default **2400 baud, 8N1, no handshake** (service `DEFAULT_BAUD = 2400`; the Settings UI persists `display_baud_rate`, seeded `9600`)
- **Protocol commands** (from the vendor manual, documented in the source):
  - `\x0C` — clear
  - `ESC @` (`\x1B\x40`) — initialize
  - `ESC Q A <digits> CR` — display digits (only `0-9`, `-`, `.`; max 8 digits / 15 chars with decimals)
  - `ESC s n` — label LEDs: `0` off, `1` Price, `2` Total, `3` Collect, `4` Change
- **Behavior**: auto-connects at startup from saved `display_port`/`display_baud_rate`; shows welcome on connect; cart updates show running total (Price/Total LED); sale completion shows total then change (Collect/Change LEDs); closed on app quit

There is also an in-app **CustomerDisplayPage** (React) that renders an itemized customer-facing cart view for a second monitor, fed by the same cart-update/sale-complete events (see [04-screens.md](04-screens.md)).

## Gemini AI

Files: `src/main/services/ai/gemini.ts`, `insights.ts`; IPC `src/main/ipc/ai-handlers.ts`.

- SDK: `@google/generative-ai`, model **`gemini-pro`**
- API key read from setting `gemini_api_key` (managed in Settings → AI); features return a friendly "configure API key" message when absent
- Features: reorder suggestions, sales forecast, dead-stock detection, natural-language query — each builds a prompt from local DB aggregates and calls `generateContent`

## Backups

Files: `src/main/services/backup/{database-backup,encryption,google-drive,scheduler}.ts`; IPC `backup-handlers.ts`.

- **Local**: database backed up (archiver/zip) with **password-based encryption** (`encryption.ts`, password from setting `backup_password`); restore via `extract-zip`; list/delete local backups
- **Google Drive**: `googleapis` Drive v3 with an OAuth2 client; token persisted in setting `google_drive_token`; backups uploaded into a named app folder (created if missing); list/download/delete supported
- **Scheduler**: `node-schedule` job controlled by settings `backup_enabled` / `backup_frequency` / `backup_time`; records `last_backup_time`; uploads to Drive when a token is configured

## Error Tracking & Logging

- **Sentry** (`@sentry/electron/main`): initialized only in production, DSN from `SENTRY_DSN` env; global handlers capture uncaught exceptions and unhandled rejections; user context attached on login (`Sentry.setUser`)
- **winston** + daily-rotate-file: logs to `<userData>/logs/error-%DATE%.log` and `combined-%DATE%.log`; helpers `logInfo` / `logError` used throughout the main process
- **Audit trail**: separate from logs — DB table `audit_log` written by IPC handlers for business actions (sales, voids, refunds, inventory changes, user management)

## Auto-Update

File: `src/main/services/updates/auto-updater.ts`.

- `update-electron-app` wrapping Electron's built-in Squirrel `autoUpdater`
- Feed: `https://update.electronjs.org/Rivi9/pharmapos` (GitHub releases published by `electron-forge publish`)
- Renderer receives update events and shows `UpdateNotification`; manual control via `updates:check` / `updates:download` / `updates:install`

## Scheduled Jobs

- **Daily sales aggregation** (`src/main/jobs/aggregation.ts` → `services/analytics/aggregation.ts`): node-schedule job rolling `sales`/`sale_items` into `product_sales_daily` (per product, per day: quantity, revenue, cost, profit); also triggerable via IPC `analytics:run-aggregation`
- **Backup scheduler** (above)
