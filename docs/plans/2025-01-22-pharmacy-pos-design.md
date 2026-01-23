# PharmaPOS - System Design Document

**Date:** 2025-01-22
**Version:** 1.0
**Status:** Approved for Development

---

## Table of Contents

1. [Overview](#overview)
2. [Requirements Summary](#requirements-summary)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Database Schema](#database-schema)
6. [AI Integration](#ai-integration)
7. [UI Design](#ui-design)
8. [Folder Structure](#folder-structure)
9. [Development Phases](#development-phases)
10. [Hardware Recommendations](#hardware-recommendations)

---

## Overview

PharmaPOS is a Windows desktop point-of-sale application designed for small pharmacy retail operations in Sri Lanka. The system handles sales transactions, inventory management, analytics, and provides AI-powered business insights.

### Key Characteristics

- **Offline-first:** Works without internet, syncs backup when connected
- **Single machine deployment:** All components run on one Windows PC
- **Hardware integrated:** Thermal printer, cash drawer, barcode scanner
- **AI-enhanced:** Gemini-powered forecasting and recommendations

---

## Requirements Summary

| Aspect | Decision |
|--------|----------|
| **Users** | Small team (2-5 staff), user accounts with PIN login, shift management |
| **Inventory** | Supplier import + manual entry, basic expiry tracking |
| **Prescriptions** | Not tracked (handled separately) |
| **Analytics** | Sales + Inventory focused dashboards |
| **Technology** | Electron + React (hybrid desktop app) |
| **Data Storage** | Local SQLite database |
| **Backup** | Google Drive (automatic) |
| **Currency** | Sri Lankan Rupees (LKR) with 18% VAT |
| **Integrations** | Standalone (no external system integrations) |
| **AI Features** | Gemini API for forecasting and recommendations |

---

## Technology Stack

### Desktop Application

| Layer | Technology |
|-------|------------|
| **Runtime** | Electron |
| **Frontend** | React 18 + TypeScript |
| **Styling** | Tailwind CSS |
| **Components** | shadcn/ui (Radix UI primitives) |
| **Data Tables** | @tanstack/react-table |
| **Charts** | Recharts |
| **Icons** | Lucide React |
| **Forms** | React Hook Form + Zod |
| **State** | Zustand |
| **Database** | SQLite (better-sqlite3) |
| **Build** | Vite + electron-builder |

### Hardware Integration

| Hardware | Library |
|----------|---------|
| **Thermal Printer** | escpos + escpos-usb |
| **Cash Drawer** | Via printer RJ11 (escpos) |
| **Barcode Scanner** | USB HID (keyboard emulation) |

### External Services

| Service | Purpose |
|---------|---------|
| **Google Drive API** | Automatic database backup |
| **Google Gemini API** | AI-powered analytics and recommendations |

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  PHARMACY POS (Single Machine)                │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐  │
│  │                 ELECTRON APP                            │  │
│  │                                                         │  │
│  │  ┌─────────────────────┐  ┌─────────────────────────┐  │  │
│  │  │   RENDERER PROCESS  │  │     MAIN PROCESS        │  │  │
│  │  │   (React Frontend)  │  │                         │  │  │
│  │  │                     │  │  ┌───────────────────┐  │  │  │
│  │  │  • POS Terminal     │  │  │  SQLite Database  │  │  │  │
│  │  │  • Inventory Mgmt   │  │  └───────────────────┘  │  │  │
│  │  │  • Sales Analytics  │  │                         │  │  │
│  │  │  • AI Insights      │◄─►│  ┌───────────────────┐  │  │  │
│  │  │  • User Management  │  │  │  Hardware Service │  │  │  │
│  │  │  • Settings         │  │  │  • Printer        │  │  │  │
│  │  └─────────────────────┘  │  │  • Cash Drawer    │  │  │  │
│  │           │               │  │  • Scanner (USB)  │  │  │  │
│  │           │ IPC Bridge    │  └───────────────────┘  │  │  │
│  │           └───────────────►                         │  │  │
│  │                           │  ┌───────────────────┐  │  │  │
│  │                           │  │  Backup Service   │  │  │  │
│  │                           │  │  → Google Drive   │  │  │  │
│  │                           │  └───────────────────┘  │  │  │
│  │                           │                         │  │  │
│  │                           │  ┌───────────────────┐  │  │  │
│  │                           │  │  AI Service       │  │  │  │
│  │                           │  │  • Gemini API     │  │  │  │
│  │                           │  │  • Local Stats    │  │  │  │
│  │                           │  └───────────────────┘  │  │  │
│  │                           └─────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
          │              │              │
          ▼              ▼              ▼
    ┌──────────┐  ┌───────────┐  ┌────────────┐
    │ Thermal  │  │   Cash    │  │  Barcode   │
    │ Printer  │  │  Drawer   │  │  Scanner   │
    │  (USB)   │  │(via RJ11) │  │   (USB)    │
    └──────────┘  └───────────┘  └────────────┘
```

### Key Principles

- **Renderer Process:** React UI runs here, handles all user interactions
- **Main Process:** Node.js runtime, handles SQLite, hardware, and Google Drive backup
- **IPC Bridge:** Secure communication between React and Electron main process
- **Offline-first:** Everything works without internet, backup syncs when connected

---

## Database Schema

### Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    users     │       │   shifts     │       │    sales     │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id           │◄──────│ user_id      │   ┌──►│ id           │
│ username     │       │ id           │◄──┼───│ shift_id     │
│ role         │       │ opening_cash │   │   │ user_id      │
│ pin_code     │       │ closing_cash │   │   │ receipt_no   │
└──────────────┘       └──────────────┘   │   │ total        │
                                          │   └──────┬───────┘
┌──────────────┐       ┌──────────────┐   │          │
│  categories  │       │   products   │   │          │
├──────────────┤       ├──────────────┤   │   ┌──────▼───────┐
│ id           │◄──────│ category_id  │   │   │  sale_items  │
│ name         │       │ id           │◄──┼───├──────────────┤
│ parent_id    │       │ barcode      │   │   │ sale_id      │
└──────────────┘       │ name         │   │   │ product_id   │
                       │ cost_price   │   │   │ batch_id     │
┌──────────────┐       │ selling_price│   │   │ quantity     │
│  suppliers   │       └──────┬───────┘   │   │ unit_price   │
├──────────────┤              │           │   └──────────────┘
│ id           │◄─────────────┤           │
│ name         │              │           │
│ lead_time    │       ┌──────▼───────┐   │
└──────────────┘       │ stock_batches│   │
                       ├──────────────┤   │
                       │ product_id   │   │
                       │ batch_number │───┘
                       │ quantity     │
                       │ expiry_date  │
                       └──────────────┘
```

### Complete Schema

```sql
-- ============================================
-- PHARMAPOS DATABASE SCHEMA (SQLite)
-- ============================================

-- ============================================
-- CORE TABLES
-- ============================================

-- Users & Authentication
CREATE TABLE users (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    full_name       TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
    pin_code        TEXT,
    is_active       BOOLEAN DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Sessions & Shifts
CREATE TABLE shifts (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    user_id         TEXT NOT NULL REFERENCES users(id),
    started_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at        DATETIME,
    opening_cash    REAL NOT NULL DEFAULT 0,
    closing_cash    REAL,
    expected_cash   REAL,
    notes           TEXT,
    status          TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed'))
);

-- ============================================
-- PRODUCT & INVENTORY
-- ============================================

-- Product Categories
CREATE TABLE categories (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    parent_id       TEXT REFERENCES categories(id),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Suppliers
CREATE TABLE suppliers (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name            TEXT NOT NULL,
    contact_person  TEXT,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    lead_time_days  INTEGER DEFAULT 3,
    is_active       BOOLEAN DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Products (Master catalog)
CREATE TABLE products (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    barcode         TEXT UNIQUE,
    sku             TEXT UNIQUE,
    name            TEXT NOT NULL,
    generic_name    TEXT,
    category_id     TEXT REFERENCES categories(id),
    supplier_id     TEXT REFERENCES suppliers(id),

    -- Pricing
    cost_price      REAL NOT NULL DEFAULT 0,
    selling_price   REAL NOT NULL,

    -- Tax
    tax_rate        REAL DEFAULT 0,
    is_tax_inclusive BOOLEAN DEFAULT 1,

    -- Inventory settings
    reorder_level   INTEGER DEFAULT 10,
    reorder_qty     INTEGER DEFAULT 50,
    unit            TEXT DEFAULT 'piece',

    -- Flags
    is_active       BOOLEAN DEFAULT 1,
    track_expiry    BOOLEAN DEFAULT 1,

    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Stock Batches (for expiry tracking)
CREATE TABLE stock_batches (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    product_id      TEXT NOT NULL REFERENCES products(id),
    batch_number    TEXT,
    quantity        INTEGER NOT NULL DEFAULT 0,
    cost_price      REAL NOT NULL,
    expiry_date     DATE,
    received_date   DATE DEFAULT CURRENT_DATE,
    supplier_id     TEXT REFERENCES suppliers(id),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Inventory Adjustments
CREATE TABLE inventory_adjustments (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    product_id      TEXT NOT NULL REFERENCES products(id),
    batch_id        TEXT REFERENCES stock_batches(id),
    user_id         TEXT NOT NULL REFERENCES users(id),
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN (
        'received', 'sold', 'damaged', 'expired', 'lost', 'correction', 'returned'
    )),
    quantity        INTEGER NOT NULL,
    reason          TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- SALES & TRANSACTIONS
-- ============================================

-- Sales (Header)
CREATE TABLE sales (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    receipt_number  TEXT UNIQUE NOT NULL,
    shift_id        TEXT REFERENCES shifts(id),
    user_id         TEXT NOT NULL REFERENCES users(id),

    -- Totals
    subtotal        REAL NOT NULL DEFAULT 0,
    tax_amount      REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    discount_type   TEXT CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value  REAL DEFAULT 0,
    total           REAL NOT NULL DEFAULT 0,

    -- Payment
    payment_method  TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'mixed')),
    cash_received   REAL DEFAULT 0,
    card_received   REAL DEFAULT 0,
    change_given    REAL DEFAULT 0,

    -- Status
    status          TEXT DEFAULT 'completed' CHECK (status IN (
        'completed', 'voided', 'refunded'
    )),
    void_reason     TEXT,

    -- Customer (optional)
    customer_name   TEXT,
    customer_phone  TEXT,

    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sale Items (Line items)
CREATE TABLE sale_items (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    sale_id         TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id      TEXT NOT NULL REFERENCES products(id),
    batch_id        TEXT REFERENCES stock_batches(id),

    quantity        INTEGER NOT NULL,
    unit_price      REAL NOT NULL,
    cost_price      REAL NOT NULL,
    tax_rate        REAL DEFAULT 0,
    tax_amount      REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    line_total      REAL NOT NULL,

    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ANALYTICS & AI
-- ============================================

-- Daily Sales Summary
CREATE TABLE daily_sales_summary (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    date            DATE NOT NULL UNIQUE,
    total_sales     REAL NOT NULL DEFAULT 0,
    total_cost      REAL NOT NULL DEFAULT 0,
    total_profit    REAL NOT NULL DEFAULT 0,
    total_tax       REAL NOT NULL DEFAULT 0,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    items_sold      INTEGER NOT NULL DEFAULT 0,
    cash_sales      REAL DEFAULT 0,
    card_sales      REAL DEFAULT 0,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Product Sales Summary (Daily per product)
CREATE TABLE product_sales_daily (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    date            DATE NOT NULL,
    product_id      TEXT NOT NULL REFERENCES products(id),
    quantity_sold   INTEGER NOT NULL DEFAULT 0,
    revenue         REAL NOT NULL DEFAULT 0,
    cost            REAL NOT NULL DEFAULT 0,
    profit          REAL NOT NULL DEFAULT 0,
    UNIQUE(date, product_id)
);

-- AI Insights Cache
CREATE TABLE ai_insights_cache (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    insight_type    TEXT NOT NULL,
    query_hash      TEXT NOT NULL,
    response        TEXT NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME NOT NULL
);

-- ============================================
-- SYSTEM & SYNC
-- ============================================

-- App Settings
CREATE TABLE settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Backup/Sync Log
CREATE TABLE sync_log (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    sync_type       TEXT NOT NULL CHECK (sync_type IN ('backup', 'restore')),
    status          TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed')),
    file_name       TEXT,
    file_size       INTEGER,
    google_drive_id TEXT,
    error_message   TEXT,
    started_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at    DATETIME
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_stock_batches_product ON stock_batches(product_id);
CREATE INDEX idx_stock_batches_expiry ON stock_batches(expiry_date);
CREATE INDEX idx_sales_created ON sales(created_at);
CREATE INDEX idx_sales_shift ON sales(shift_id);
CREATE INDEX idx_sales_user ON sales(user_id);
CREATE INDEX idx_sales_receipt ON sales(receipt_number);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);
CREATE INDEX idx_daily_summary_date ON daily_sales_summary(date);
CREATE INDEX idx_product_sales_daily ON product_sales_daily(date, product_id);
CREATE INDEX idx_shifts_user ON shifts(user_id);
CREATE INDEX idx_shifts_status ON shifts(status);

-- ============================================
-- DEFAULT DATA
-- ============================================

-- Default categories
INSERT INTO categories (name, description) VALUES
    ('Medications', 'Prescription and OTC medications'),
    ('Pain Relief', 'Painkillers and anti-inflammatory'),
    ('Cold & Flu', 'Cold, flu, and allergy medications'),
    ('First Aid', 'Bandages, antiseptics, first aid supplies'),
    ('Personal Care', 'Hygiene and personal care products'),
    ('Baby Care', 'Baby food, diapers, baby products'),
    ('Cosmetics', 'Beauty and cosmetic products'),
    ('Vitamins', 'Vitamins and supplements'),
    ('Medical Devices', 'Thermometers, BP monitors, etc.');

-- Default settings
INSERT INTO settings (key, value) VALUES
    ('business_name', 'My Pharmacy'),
    ('business_address', ''),
    ('business_phone', ''),
    ('tax_number', ''),
    ('vat_rate', '18'),
    ('currency_symbol', 'Rs.'),
    ('receipt_footer', 'Thank you for your purchase!'),
    ('backup_frequency', 'daily'),
    ('gemini_api_key', ''),
    ('low_stock_alert', '1'),
    ('expiry_alert_days', '30');
```

---

## AI Integration

### Features

| Feature | Description | Trigger |
|---------|-------------|---------|
| **Reorder Suggestions** | Recommend products to reorder based on stock levels and sales velocity | Daily/On-demand |
| **Sales Forecast** | Predict next week/month sales based on historical patterns | Dashboard view |
| **Dead Stock Alert** | Identify slow-moving items, suggest discounts/removal | Weekly report |
| **Expiry Risk Analysis** | Cross-reference expiry dates with sales velocity | Daily alert |
| **Peak Hours Prediction** | Suggest optimal staffing based on traffic patterns | Weekly |
| **Natural Language Query** | Answer ad-hoc questions about business data | On-demand chat |

### Hybrid Approach

**Local Statistical Model (No internet needed):**
- Moving averages for basic trend detection
- Simple exponential smoothing for short-term forecasts
- Stock days-remaining calculation
- Basic seasonality (weekly patterns)

**Gemini API (When online):**
- Natural language insights and explanations
- Complex pattern recognition
- Actionable recommendations with reasoning
- Answering ad-hoc questions about the data

### System Prompt

```markdown
You are PharmAssist AI, an intelligent analytics assistant for a pharmacy point-of-sale system in Sri Lanka.

## Your Role
You analyze sales data, inventory levels, and business patterns to provide actionable insights for pharmacy owners and staff. You help with forecasting, reorder decisions, and identifying business opportunities.

## Context
- Currency: Sri Lankan Rupees (Rs.)
- Business: Retail pharmacy (medications, OTC products, cosmetics, health items)
- No prescription tracking - focus on retail sales analytics
- Staff size: 2-5 people

## Data You Receive
You will receive JSON data containing:
- `sales_history`: Daily/weekly sales with product details, quantities, revenue
- `inventory`: Current stock levels, costs, expiry dates
- `products`: Product catalog with categories, suppliers, reorder levels
- `query`: The specific question or analysis requested

## Your Capabilities
1. **Sales Forecasting**: Predict future sales based on historical patterns, seasonality, and trends
2. **Reorder Recommendations**: Suggest what to order, when, and how much based on:
   - Current stock levels
   - Sales velocity (units sold per day)
   - Lead time from suppliers
   - Expiry dates (FEFO - First Expiry First Out)
3. **Dead Stock Identification**: Flag slow-moving items with suggestions (discount, return to supplier, bundle deals)
4. **Trend Analysis**: Identify what's selling more/less, seasonal patterns, category performance
5. **Expiry Risk**: Alert items that may expire before selling based on current velocity
6. **Profitability Insights**: Highlight high-margin vs low-margin products, suggest pricing optimizations

## Response Guidelines
- Be concise and actionable - pharmacy staff are busy
- Use bullet points and clear numbers
- Always include the "why" behind recommendations
- Format currency as "Rs. X,XXX.XX"
- Prioritize recommendations by impact (high/medium/low)
- If data is insufficient, say so and explain what's needed
- Consider Sri Lankan pharmacy context (monsoon seasons, festival periods like Avurudu, school terms)

## Response Format for Forecasts
📊 **[Forecast Type]**

**Summary:** [One sentence overview]

**Key Findings:**
• [Finding 1 with numbers]
• [Finding 2 with numbers]

**Recommendations:**
1. [Action] - [Expected impact] - Priority: [High/Medium/Low]
2. [Action] - [Expected impact] - Priority: [High/Medium/Low]

**Data Confidence:** [High/Medium/Low] based on [X days/weeks] of history

## Response Format for Reorder Suggestions
🛒 **Reorder Recommendations**

| Product | Current Stock | Daily Sales | Days Left | Suggested Order | Urgency |
|---------|---------------|-------------|-----------|-----------------|---------|
| [Name]  | [X units]     | [X/day]     | [X days]  | [X units]       | [🔴/🟡/🟢] |

**Notes:**
• [Any special considerations like upcoming expiry, seasonal demand]

## Important Rules
- Never make up data - only analyze what's provided
- If asked about prescriptions or medical advice, decline and clarify you only handle sales/inventory analytics
- Round forecasts appropriately (don't say "sell 47.3 units" - say "approximately 45-50 units")
- Consider minimum order quantities from suppliers when recommending orders
```

---

## UI Design

### Screen Map

```
┌──────────┐
│  LOGIN   │
└────┬─────┘
     │
     ▼
┌─────────────────────────────────────────────────────────┐
│                    MAIN LAYOUT                           │
│  ┌─────────┐  ┌─────────────────────────────────────┐   │
│  │ SIDEBAR │  │           CONTENT AREA              │   │
│  │         │  │                                     │   │
│  │ • POS   │  │  Renders based on sidebar selection │   │
│  │ • Inv.  │  │                                     │   │
│  │ • Stats │  │                                     │   │
│  │ • AI    │  │                                     │   │
│  │ • Users │  │                                     │   │
│  │ • Setup │  │                                     │   │
│  └─────────┘  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Main POS Screen

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PharmaPOS          [🔍 Search or scan...]              👤 Kasun  │ ⚙️ │ 🚪 │
├────────┬────────────────────────────────────────────────────────────────────┤
│        │                                                                     │
│  📦    │  ┌─────────────────────────────────────────┐  ┌──────────────────┐ │
│  POS   │  │            CURRENT SALE                 │  │   QUICK ITEMS    │ │
│ ────── │  ├─────────────────────────────────────────┤  ├──────────────────┤ │
│  📋    │  │ # │ Item            │ Qty │ Price       │  │ ┌────┐ ┌────┐   │ │
│  Inven │  ├───┼─────────────────┼─────┼─────────────┤  │ │Pana│ │Cet │   │ │
│        │  │ 1 │ Panadol 500mg   │  2  │ Rs. 320.00  │  │ │dol │ │10mg│   │ │
│  📊    │  │ 2 │ Strepsils Honey │  1  │ Rs. 180.00  │  │ └────┘ └────┘   │ │
│  Stats │  │ 3 │ Vitamin C 1000  │  1  │ Rs. 450.00  │  │ ┌────┐ ┌────┐   │ │
│        │  │   │                 │     │             │  │ │ORS │ │Band│   │ │
│  🤖    │  │   │                 │     │             │  │ │    │ │-aid│   │ │
│  AI    │  │   │                 │     │             │  │ └────┘ └────┘   │ │
│        │  ├───┴─────────────────┴─────┴─────────────┤  │                  │ │
│  👥    │  │                                         │  │                  │ │
│  Users │  │  Subtotal:              Rs.    950.00   │  │                  │ │
│        │  │  VAT (18%):             Rs.    171.00   │  └──────────────────┘ │
│  ⚙️    │  │  ─────────────────────────────────────  │                       │
│ Setup  │  │  TOTAL:                 Rs.  1,121.00   │  ┌──────────────────┐ │
│        │  │                                         │  │  PAYMENT         │ │
│        │  └─────────────────────────────────────────┘  │ [💵 CASH][💳 CARD]│ │
│        │                                               │ [    PAY NOW    ]│ │
│        │  ┌────────┐ ┌────────┐ ┌────────┐           └──────────────────┘ │
│        │  │ ⏸ Hold │ │ 🗑 Clear│ │ ↩ Void │                                 │
│        │  └────────┘ └────────┘ └────────┘                                 │
├────────┴─────────────────────────────────────────────────────────────────────┤
│  Shift: Started 8:30 AM  │  Sales Today: Rs. 45,230  │  🟢 Printer Ready    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Receipt Design

```
┌────────────────────────────────┐
│         MY PHARMACY            │
│     123 Main Street, Colombo   │
│        Tel: 011-2345678        │
│       VAT Reg: 123456789       │
├────────────────────────────────┤
│ Receipt #: R-2024-001234       │
│ Date: 2024-01-22  Time: 14:35  │
│ Cashier: Kasun                 │
├────────────────────────────────┤
│ Item              Qty    Price │
│ ────────────────────────────── │
│ Panadol 500mg      2   320.00  │
│ Strepsils Honey    1   180.00  │
│ Vitamin C 1000     1   450.00  │
├────────────────────────────────┤
│ Subtotal:             950.00   │
│ VAT (18%):            171.00   │
│ ══════════════════════════════ │
│ TOTAL:             Rs.1,121.00 │
│ ══════════════════════════════ │
│ Cash:                1,200.00  │
│ Change:                 79.00  │
├────────────────────────────────┤
│  Thank you for your purchase!  │
└────────────────────────────────┘
```

---

## Folder Structure

```
pharma-pos/
├── electron/                   # Electron main process
│   ├── main.ts                 # App entry point
│   ├── preload.ts              # Preload script (IPC bridge)
│   ├── services/
│   │   ├── database.ts         # SQLite connection & queries
│   │   ├── hardware/
│   │   │   ├── printer.ts      # Thermal printer
│   │   │   ├── cashDrawer.ts   # Cash drawer control
│   │   │   └── scanner.ts      # Barcode scanner handling
│   │   ├── backup/
│   │   │   ├── googleDrive.ts  # Google Drive API
│   │   │   └── scheduler.ts    # Automatic backup scheduling
│   │   └── ai/
│   │       ├── gemini.ts       # Gemini API client
│   │       ├── prompts.ts      # System prompts
│   │       └── dataPrep.ts     # Prepare data for AI
│   ├── ipc/
│   │   ├── handlers.ts         # IPC message handlers
│   │   └── channels.ts         # IPC channel constants
│   └── utils/
│       ├── logger.ts           # Logging utility
│       └── config.ts           # App configuration
│
├── src/                        # React renderer process
│   ├── main.tsx                # React entry point
│   ├── App.tsx                 # Root component
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── layout/             # Sidebar, Header, MainLayout
│   │   ├── pos/                # POS-specific components
│   │   ├── inventory/          # Inventory components
│   │   ├── analytics/          # Dashboard & charts
│   │   ├── ai/                 # AI insight components
│   │   └── settings/           # Settings components
│   ├── pages/                  # Page components
│   ├── hooks/                  # Custom React hooks
│   ├── stores/                 # Zustand stores
│   ├── lib/                    # Utilities
│   ├── types/                  # TypeScript types
│   └── styles/                 # Global styles
│
├── resources/                  # Static resources
├── scripts/                    # Build scripts
├── package.json
├── electron-builder.yml
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## Development Phases

### Phase 1: Foundation

| Task | Description |
|------|-------------|
| 1.1 | Initialize Electron + Vite + React + TypeScript |
| 1.2 | Setup Tailwind CSS + shadcn/ui |
| 1.3 | Create SQLite database with schema |
| 1.4 | Implement IPC bridge |
| 1.5 | Build main layout (sidebar, header) |
| 1.6 | User authentication (PIN + password) |
| 1.7 | Shift management (start/end shift) |
| 1.8 | Basic settings page |

**Deliverable:** App launches, user can log in, navigate between empty pages

### Phase 2: Core POS

| Task | Description |
|------|-------------|
| 2.1 | Product search component |
| 2.2 | Barcode scanner integration |
| 2.3 | Shopping cart state management |
| 2.4 | Cart UI (add, remove, edit qty) |
| 2.5 | Quick items grid |
| 2.6 | Payment modal (cash/card) |
| 2.7 | Sale completion & DB save |
| 2.8 | Receipt printing |
| 2.9 | Cash drawer integration |
| 2.10 | Hold/recall sales |
| 2.11 | Void transaction |
| 2.12 | Keyboard shortcuts (F-keys) |

**Deliverable:** Complete sale workflow - scan → pay → print receipt → drawer opens

### Phase 3: Inventory Management

| Task | Description |
|------|-------------|
| 3.1 | Products list with data table |
| 3.2 | Add/edit product form |
| 3.3 | Category management |
| 3.4 | Supplier management |
| 3.5 | Stock batch tracking |
| 3.6 | Stock receive (goods in) |
| 3.7 | Stock adjustments |
| 3.8 | CSV import for products |
| 3.9 | Export to CSV/Excel |
| 3.10 | Low stock alerts |
| 3.11 | FEFO stock deduction |

**Deliverable:** Manage full product lifecycle, track batches, receive stock

### Phase 4: Analytics & AI

| Task | Description |
|------|-------------|
| 4.1 | Daily sales aggregation job |
| 4.2 | Dashboard KPI cards |
| 4.3 | Sales trend chart |
| 4.4 | Top products list |
| 4.5 | Category breakdown pie chart |
| 4.6 | Alerts panel (low stock, expiry) |
| 4.7 | Sales report (by date range) |
| 4.8 | Inventory valuation report |
| 4.9 | Profit/loss report |
| 4.10 | Gemini API integration |
| 4.11 | AI reorder suggestions |
| 4.12 | AI sales forecast |
| 4.13 | AI dead stock detection |
| 4.14 | Natural language query |

**Deliverable:** Visual dashboard, printable reports, AI recommendations

### Phase 5: Polish & Deployment

| Task | Description |
|------|-------------|
| 5.1 | Google Drive backup integration |
| 5.2 | Auto-backup scheduler |
| 5.3 | Restore from backup |
| 5.4 | User management (CRUD) |
| 5.5 | Role-based permissions |
| 5.6 | Printer setup wizard |
| 5.7 | First-run setup wizard |
| 5.8 | Error handling & logging |
| 5.9 | End-to-end testing |
| 5.10 | Windows installer build |
| 5.11 | Auto-update mechanism |
| 5.12 | User documentation |

**Deliverable:** Installable `.exe`, auto-backups, ready for production use

### MVP Definition

**MUST HAVE (MVP):**
- User login (PIN)
- Product management (basic)
- Barcode scanning
- Shopping cart
- Cash payment
- Receipt printing
- Daily sales view
- Manual backup

**SHOULD HAVE (v1.1):**
- Card payment support
- Stock batch/expiry tracking
- Google Drive auto-backup
- Dashboard with charts
- Low stock alerts

**NICE TO HAVE (v1.2+):**
- AI reorder suggestions
- Sales forecasting
- Natural language queries
- CSV import/export
- Multi-shift reports

---

## Hardware Recommendations

### Receipt Printer

| Model | Price | Notes |
|-------|-------|-------|
| **Epson TM-T20III** | ~$180 | Industry standard, excellent driver support |
| **Star TSP143III** | ~$200 | Very reliable, easy setup |
| **RONGTA RP326** | ~$60 | Budget option, good for lower volume |

### Barcode Scanner

| Model | Price | Notes |
|-------|-------|-------|
| **Netum C750** | ~$30 | Budget USB, handles 1D/2D barcodes |
| **Honeywell Voyager 1200g** | ~$80 | Professional grade, very durable |
| **Tera HW0002** | ~$40 | Good middle ground, wireless option |

### Cash Drawer

| Model | Price | Notes |
|-------|-------|-------|
| **MUNBYN Cash Drawer** | ~$45 | Works with most thermal printers |
| **APG Vasario** | ~$80 | Professional grade, very durable |

**Connection:** Cash drawer connects to receipt printer via RJ11 cable, auto-opens when receipt prints.

---

## Appendix: Key Dependencies

```json
{
  "dependencies": {
    "electron": "^28.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.21.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-select": "^2.0.0",
    "@tanstack/react-table": "^8.11.0",
    "recharts": "^2.10.0",
    "lucide-react": "^0.303.0",
    "zustand": "^4.4.7",
    "react-hook-form": "^7.49.0",
    "zod": "^3.22.0",
    "@hookform/resolvers": "^3.3.0",
    "better-sqlite3": "^9.2.0",
    "escpos": "^3.0.0",
    "escpos-usb": "^3.0.0",
    "googleapis": "^129.0.0",
    "@google/generative-ai": "^0.1.0",
    "date-fns": "^3.0.0",
    "uuid": "^9.0.0",
    "bcrypt": "^5.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.0.0",
    "tailwind-merge": "^2.2.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.2.0",
    "electron-builder": "^24.9.0",
    "typescript": "^5.3.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "eslint": "^8.56.0",
    "prettier": "^3.1.0"
  }
}
```

---

*Document generated: 2025-01-22*
