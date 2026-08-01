# PharmaPOS — Migration Specification

This document set captures the **current state** of PharmaPOS (v1.0.11) in enough detail to rebuild it as a fresh project. It describes what the application *is* — stacks, database schema, models, IPC surface, screens, settings, and hardware/cloud integrations — not how development should be carried out.

## Application Summary

PharmaPOS is an offline-first **Electron desktop Point-of-Sale application for pharmacies**, targeting a Windows 10 POS machine with a touchscreen and a customer-facing serial pole display. All data lives in a local SQLite database; optional cloud features are Google Drive backups, Gemini AI insights, Sentry error tracking, and GitHub-hosted auto-updates.

Core capabilities:

- **Sales / POS** — barcode-driven cart, quick items, hold/recall sale, cash/card/mixed payments, discounts, void and refund, thermal receipt printing, cash drawer control
- **Shift management** — opening/closing cash counts, expected-cash computation, enforced end-of-shift on app close
- **Inventory** — products, hierarchical categories, suppliers, expiry-tracked stock batches (FEFO-relevant), adjustments, CSV import/export, low-stock and expiry alerts
- **Customers** — customer registry with purchase history
- **Users & RBAC** — admin/manager/cashier roles, password + PIN login, permission matrix enforced in the main process
- **Analytics & reports** — daily aggregation job, KPI dashboard, sales trend, category breakdown, top products, sales/inventory-valuation/profit-loss reports
- **AI (Gemini)** — reorder suggestions, sales forecast, dead-stock detection, natural-language queries
- **Backups** — local encrypted backups, Google Drive upload, scheduled backups
- **Audit log** — every sensitive action recorded and queryable/exportable

## Document Index

| Document | Contents |
|---|---|
| [01-tech-stack.md](01-tech-stack.md) | Runtime, frameworks, all dependencies, build/packaging pipeline, project configuration files |
| [02-database-schema.md](02-database-schema.md) | Full SQLite schema (14 tables), indexes, seed data, migration strategy, DB conventions |
| [03-ipc-api.md](03-ipc-api.md) | Complete IPC channel registry and the preload API exposed to the renderer |
| [04-screens.md](04-screens.md) | Application flow, every screen/page, component inventory, state stores, keyboard shortcuts |
| [05-settings.md](05-settings.md) | The settings key/value registry (DB-backed) with defaults and consumers |
| [06-integrations.md](06-integrations.md) | Thermal printer, pole display, Gemini AI, Google Drive backup, Sentry, logging, auto-update |

## Source Layout (reference)

```
src/
├── main/                 # Electron main process
│   ├── index.ts          # Entry: window, close-interception, pole-display IPC
│   ├── db/               # Drizzle schema + squashed SQL migration
│   ├── ipc/              # Channel constants + per-domain IPC handlers + RBAC middleware
│   ├── jobs/             # Scheduled jobs (daily sales aggregation)
│   └── services/         # Business logic (sales, inventory, printer, backup, AI, ...)
├── preload/              # contextBridge API (window.electron)
├── renderer/src/         # React UI (pages, components, zustand stores, hooks)
└── shared/               # Code shared across processes (permissions matrix)
```