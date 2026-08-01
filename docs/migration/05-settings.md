# 05 — Settings Registry

All application settings live in the SQLite `settings` table (`key TEXT PK, value TEXT, updated_at TEXT`) and are read/written through IPC (`settings:get`, `settings:set`, `settings:getAll`) or direct prepared statements in main-process services. **All values are strings**; consumers parse numbers/booleans themselves.

## Business & Receipt

| Key | Default (seeded) | Consumers |
|---|---|---|
| `business_name` | `My Pharmacy` | Receipt header, customer display, Setup wizard |
| `business_address` | `''` | Receipt header, Setup wizard |
| `business_phone` | `''` | Receipt header, Setup wizard |
| `vat_rate` | `18` | Tax defaults (Settings → Business) |
| `currency_symbol` | `Rs.` | POS UI, receipts, pole display, everywhere money is formatted |
| `receipt_footer` | `Thank you for your purchase!` | Receipt formatter |

## Thermal Printer (written by `printer:save-config`)

| Key | Default (code fallback) | Meaning |
|---|---|---|
| `printer_type` | `epson` | `epson` \| `star` \| `generic` |
| `printer_interface` | `usb` | `usb` \| `tcp` |
| `printer_path` | — | USB `vid:pid` in decimal, e.g. `1208:3598` |
| `printer_ip` | — | TCP printer IP |
| `printer_port` | `9100` | TCP port |
| `printer_width` | `42` | Receipt width in characters |

## Pole / Customer Display

| Key | Default (seeded) | Meaning |
|---|---|---|
| `display_port` | `''` | Serial COM port (e.g. `COM3`); auto-connect at app start when non-empty |
| `display_baud_rate` | `9600` | Baud rate persisted from the Settings UI. Note: the pole-display service's own `DEFAULT_BAUD` is **2400** (OCPD-LED8 factory default) — the seeded `9600` is what the UI writes/reads. |

## Backup

| Key | Meaning |
|---|---|
| `backup_enabled` | `'true'`/`'false'` — scheduler on/off |
| `backup_frequency` | Schedule frequency (e.g. daily) |
| `backup_time` | Time of day for scheduled backup |
| `backup_password` | Password for backup encryption |
| `last_backup_time` | Timestamp of last successful backup (written by scheduler) |
| `google_drive_token` | Stored Google OAuth token (JSON) for Drive uploads |

## AI

| Key | Meaning |
|---|---|
| `gemini_api_key` | Google Gemini API key; empty string disables AI features (UI clears it by setting `''`) |

## Non-DB Configuration

| Item | Location | Meaning |
|---|---|---|
| First-run flag | `<userData>/.setup-complete` file | Existence = setup finished; content is completion ISO timestamp |
| Database file | `<userData>/pharmapos.db` | Overridable via `TEST_DB_PATH` env var (tests) |
| Log directory | `<userData>/logs/` | winston daily-rotate: `error-%DATE%.log`, `combined-%DATE%.log` |
| `SENTRY_DSN` | Environment variable | Sentry error tracking; only initialized in production |
| Update feed | `https://update.electronjs.org/Rivi9/pharmapos` | Hardcoded via update-electron-app + GitHub publisher config |
