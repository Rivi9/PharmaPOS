# Phase 1: Foundation - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the project scaffold with Electron + React + TypeScript, SQLite database, authentication, and basic navigation layout.

**Architecture:** Electron desktop app using electron-vite for build tooling. React 19 renderer with Tailwind CSS v4 and shadcn/ui components. SQLite database via better-sqlite3 in the main process. IPC bridge for renderer-main communication.

**Tech Stack:** Electron 35, React 19, TypeScript 5.7, Vite 6, Tailwind CSS 4.1, shadcn/ui, better-sqlite3, Zustand

---

## Task 1: Initialize Electron-Vite Project

**Files:**

- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`

**Step 1: Create project with electron-vite**

Run:

```bash
npm create @electron-vite/app@latest . -- --template react-ts
```

Select options when prompted:

- Project name: pharma-pos
- Framework: React
- Variant: TypeScript

**Step 2: Verify project structure created**

Run:

```bash
ls -la
```

Expected: See `package.json`, `electron.vite.config.ts`, `src/`, `electron/` directories

**Step 3: Install dependencies**

Run:

```bash
npm install
```

Expected: Dependencies installed successfully

**Step 4: Test dev server starts**

Run:

```bash
npm run dev
```

Expected: Electron window opens with React app

**Step 5: Commit initial scaffold**

```bash
git add .
git commit -m "feat: initialize electron-vite project with React TypeScript"
```

---

## Task 2: Configure Tailwind CSS v4

**Files:**

- Modify: `package.json` (add tailwind dependencies)
- Create: `src/renderer/src/styles/globals.css`
- Modify: `electron.vite.config.ts` (add tailwind plugin)

**Step 1: Install Tailwind CSS v4**

Run:

```bash
npm install tailwindcss @tailwindcss/vite
```

**Step 2: Update electron.vite.config.ts**

```typescript
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      }
    }
  },
  preload: {
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      }
    }
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/renderer/src')
      }
    }
  }
})
```

**Step 3: Create globals.css with Tailwind v4 syntax**

Create `src/renderer/src/styles/globals.css`:

```css
@import 'tailwindcss';

@theme {
  --color-primary: #3b82f6;
  --color-primary-foreground: #ffffff;
  --color-secondary: #6b7280;
  --color-secondary-foreground: #ffffff;
  --color-background: #ffffff;
  --color-foreground: #0f172a;
  --color-muted: #f1f5f9;
  --color-muted-foreground: #64748b;
  --color-accent: #f1f5f9;
  --color-accent-foreground: #0f172a;
  --color-destructive: #ef4444;
  --color-destructive-foreground: #ffffff;
  --color-border: #e2e8f0;
  --color-input: #e2e8f0;
  --color-ring: #3b82f6;
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
}
```

**Step 4: Import globals.css in main.tsx**

Modify `src/renderer/src/main.tsx`:

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

**Step 5: Test Tailwind is working**

Modify `src/renderer/src/App.tsx`:

```typescript
function App(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <h1 className="text-4xl font-bold text-primary">PharmaPOS</h1>
    </div>
  )
}

export default App
```

**Step 6: Run dev and verify styling**

Run:

```bash
npm run dev
```

Expected: Blue "PharmaPOS" text centered on screen

**Step 7: Commit Tailwind setup**

```bash
git add .
git commit -m "feat: configure Tailwind CSS v4 with custom theme"
```

---

## Task 3: Setup shadcn/ui Components

**Files:**

- Create: `src/renderer/src/components/ui/button.tsx`
- Create: `src/renderer/src/components/ui/input.tsx`
- Create: `src/renderer/src/components/ui/card.tsx`
- Create: `src/renderer/src/lib/utils.ts`

**Step 1: Install shadcn/ui dependencies**

Run:

```bash
npm install @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react
```

**Step 2: Create utils.ts**

Create `src/renderer/src/lib/utils.ts`:

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

**Step 3: Create Button component**

Create `src/renderer/src/components/ui/button.tsx`:

```typescript
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
```

**Step 4: Create Input component**

Create `src/renderer/src/components/ui/input.tsx`:

```typescript
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
```

**Step 5: Create Card component**

Create `src/renderer/src/components/ui/card.tsx`:

```typescript
import * as React from 'react'
import { cn } from '@/lib/utils'

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border bg-card text-card-foreground shadow', className)}
      {...props}
    />
  )
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  )
)
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  )
)
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
)
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  )
)
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  )
)
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
```

**Step 6: Create components index**

Create `src/renderer/src/components/ui/index.ts`:

```typescript
export * from './button'
export * from './input'
export * from './card'
```

**Step 7: Commit shadcn/ui setup**

```bash
git add .
git commit -m "feat: add shadcn/ui base components (button, input, card)"
```

---

## Task 4: Setup SQLite Database

**Files:**

- Create: `src/main/services/database.ts`
- Create: `src/main/db/schema.sql`
- Modify: `src/main/index.ts`

**Step 1: Install better-sqlite3**

Run:

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

**Step 2: Create database schema SQL file**

Create `src/main/db/schema.sql`:

```sql
-- Users & Authentication
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'cashier')),
    pin_code TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Shifts
CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    ended_at TEXT,
    opening_cash REAL NOT NULL DEFAULT 0,
    closing_cash REAL,
    expected_cash REAL,
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed'))
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    parent_id TEXT REFERENCES categories(id),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    address TEXT,
    lead_time_days INTEGER DEFAULT 3,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Products
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    barcode TEXT UNIQUE,
    sku TEXT UNIQUE,
    name TEXT NOT NULL,
    generic_name TEXT,
    category_id TEXT REFERENCES categories(id),
    supplier_id TEXT REFERENCES suppliers(id),
    cost_price REAL NOT NULL DEFAULT 0,
    selling_price REAL NOT NULL,
    tax_rate REAL DEFAULT 0,
    is_tax_inclusive INTEGER DEFAULT 1,
    reorder_level INTEGER DEFAULT 10,
    reorder_qty INTEGER DEFAULT 50,
    unit TEXT DEFAULT 'piece',
    is_active INTEGER DEFAULT 1,
    track_expiry INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Stock Batches
CREATE TABLE IF NOT EXISTS stock_batches (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_number TEXT,
    quantity INTEGER NOT NULL DEFAULT 0,
    cost_price REAL NOT NULL,
    expiry_date TEXT,
    received_date TEXT DEFAULT (date('now')),
    supplier_id TEXT REFERENCES suppliers(id),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    receipt_number TEXT UNIQUE NOT NULL,
    shift_id TEXT REFERENCES shifts(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    subtotal REAL NOT NULL DEFAULT 0,
    tax_amount REAL NOT NULL DEFAULT 0,
    discount_amount REAL NOT NULL DEFAULT 0,
    discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value REAL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'mixed')),
    cash_received REAL DEFAULT 0,
    card_received REAL DEFAULT 0,
    change_given REAL DEFAULT 0,
    status TEXT DEFAULT 'completed' CHECK (status IN ('completed', 'voided', 'refunded')),
    void_reason TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Sale Items
CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_id TEXT REFERENCES stock_batches(id),
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    cost_price REAL NOT NULL,
    tax_rate REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    line_total REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_product ON stock_batches(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_expiry ON stock_batches(expiry_date);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_user ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

-- Default data
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('business_name', 'My Pharmacy'),
    ('business_address', ''),
    ('business_phone', ''),
    ('vat_rate', '18'),
    ('currency_symbol', 'Rs.'),
    ('receipt_footer', 'Thank you for your purchase!');

INSERT OR IGNORE INTO categories (id, name, description) VALUES
    ('cat-medications', 'Medications', 'Prescription and OTC medications'),
    ('cat-pain-relief', 'Pain Relief', 'Painkillers and anti-inflammatory'),
    ('cat-cold-flu', 'Cold & Flu', 'Cold, flu, and allergy medications'),
    ('cat-first-aid', 'First Aid', 'Bandages, antiseptics, first aid supplies'),
    ('cat-personal-care', 'Personal Care', 'Hygiene and personal care products'),
    ('cat-vitamins', 'Vitamins', 'Vitamins and supplements');
```

**Step 3: Create database service**

Create `src/main/services/database.ts`:

```typescript
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database.Database | null = null

export function getDatabase(): Database.Database {
  if (db) return db

  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'pharmapos.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  return db
}

export function initializeDatabase(): void {
  const database = getDatabase()

  // Read schema file
  const schemaPath = path.join(__dirname, '../db/schema.sql')

  // For development, schema might be in different location
  let schema: string
  if (fs.existsSync(schemaPath)) {
    schema = fs.readFileSync(schemaPath, 'utf-8')
  } else {
    // Fallback for development
    const devSchemaPath = path.join(__dirname, '../../src/main/db/schema.sql')
    if (fs.existsSync(devSchemaPath)) {
      schema = fs.readFileSync(devSchemaPath, 'utf-8')
    } else {
      console.error('Schema file not found')
      return
    }
  }

  // Run schema
  database.exec(schema)
  console.log('Database initialized at:', app.getPath('userData'))
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

// Helper to generate UUID
export function generateId(): string {
  return crypto.randomUUID()
}
```

**Step 4: Initialize database on app start**

Modify `src/main/index.ts` to add database initialization (add after app.whenReady):

```typescript
import { initializeDatabase, closeDatabase } from './services/database'

// Add after app.whenReady().then(() => { ... })
app.whenReady().then(() => {
  initializeDatabase()
  // ... rest of createWindow logic
})

app.on('before-quit', () => {
  closeDatabase()
})
```

**Step 5: Test database initialization**

Run:

```bash
npm run dev
```

Expected: Console shows "Database initialized at: [path]"

**Step 6: Commit database setup**

```bash
git add .
git commit -m "feat: setup SQLite database with schema and initialization"
```

---

## Task 5: Setup IPC Bridge

**Files:**

- Create: `src/main/ipc/channels.ts`
- Create: `src/main/ipc/handlers.ts`
- Modify: `src/preload/index.ts`
- Create: `src/preload/index.d.ts`
- Modify: `src/main/index.ts`

**Step 1: Create IPC channels constants**

Create `src/main/ipc/channels.ts`:

```typescript
export const IPC_CHANNELS = {
  // Database
  DB_QUERY: 'db:query',

  // Auth
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_GET_USERS: 'auth:getUsers',
  AUTH_CREATE_USER: 'auth:createUser',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_GET_ALL: 'settings:getAll',

  // Shift
  SHIFT_START: 'shift:start',
  SHIFT_END: 'shift:end',
  SHIFT_GET_ACTIVE: 'shift:getActive'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
```

**Step 2: Create IPC handlers**

Create `src/main/ipc/handlers.ts`:

```typescript
import { ipcMain } from 'electron'
import { getDatabase, generateId } from '../services/database'
import { IPC_CHANNELS } from './channels'
import bcrypt from 'bcrypt'

export function registerIpcHandlers(): void {
  // Get all users (for login dropdown)
  ipcMain.handle(IPC_CHANNELS.AUTH_GET_USERS, () => {
    const db = getDatabase()
    const users = db
      .prepare(
        `
      SELECT id, username, full_name, role, is_active
      FROM users
      WHERE is_active = 1
    `
      )
      .all()
    return users
  })

  // Login with PIN or password
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, async (_, { userId, pin, password }) => {
    const db = getDatabase()
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(userId) as any

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    // Check PIN
    if (pin && user.pin_code === pin) {
      const { password_hash, ...safeUser } = user
      return { success: true, user: safeUser }
    }

    // Check password
    if (password) {
      const valid = await bcrypt.compare(password, user.password_hash)
      if (valid) {
        const { password_hash, ...safeUser } = user
        return { success: true, user: safeUser }
      }
    }

    return { success: false, error: 'Invalid credentials' }
  })

  // Create user
  ipcMain.handle(
    IPC_CHANNELS.AUTH_CREATE_USER,
    async (_, { username, password, fullName, role, pin }) => {
      const db = getDatabase()
      const id = generateId()
      const passwordHash = await bcrypt.hash(password, 10)

      try {
        db.prepare(
          `
        INSERT INTO users (id, username, password_hash, full_name, role, pin_code)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        ).run(id, username, passwordHash, fullName, role, pin || null)

        return { success: true, id }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // Get settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, (_, key: string) => {
    const db = getDatabase()
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any
    return row?.value || null
  })

  // Set setting
  ipcMain.handle(IPC_CHANNELS.SETTINGS_SET, (_, { key, value }) => {
    const db = getDatabase()
    db.prepare(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')
    `
    ).run(key, value, value)
    return { success: true }
  })

  // Get all settings
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, () => {
    const db = getDatabase()
    const rows = db.prepare('SELECT key, value FROM settings').all() as any[]
    return Object.fromEntries(rows.map((r) => [r.key, r.value]))
  })

  // Start shift
  ipcMain.handle(IPC_CHANNELS.SHIFT_START, (_, { userId, openingCash }) => {
    const db = getDatabase()
    const id = generateId()

    db.prepare(
      `
      INSERT INTO shifts (id, user_id, opening_cash, status)
      VALUES (?, ?, ?, 'active')
    `
    ).run(id, userId, openingCash)

    return { success: true, shiftId: id }
  })

  // End shift
  ipcMain.handle(IPC_CHANNELS.SHIFT_END, (_, { shiftId, closingCash, notes }) => {
    const db = getDatabase()

    db.prepare(
      `
      UPDATE shifts
      SET ended_at = datetime('now'), closing_cash = ?, notes = ?, status = 'closed'
      WHERE id = ?
    `
    ).run(closingCash, notes || null, shiftId)

    return { success: true }
  })

  // Get active shift for user
  ipcMain.handle(IPC_CHANNELS.SHIFT_GET_ACTIVE, (_, userId: string) => {
    const db = getDatabase()
    const shift = db
      .prepare(
        `
      SELECT * FROM shifts
      WHERE user_id = ? AND status = 'active'
      ORDER BY started_at DESC LIMIT 1
    `
      )
      .get(userId)

    return shift || null
  })
}
```

**Step 3: Install bcrypt**

Run:

```bash
npm install bcrypt
npm install -D @types/bcrypt
```

**Step 4: Update preload script**

Modify `src/preload/index.ts`:

```typescript
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../main/ipc/channels'

const electronAPI = {
  // Auth
  getUsers: () => ipcRenderer.invoke(IPC_CHANNELS.AUTH_GET_USERS),
  login: (data: { userId: string; pin?: string; password?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, data),
  createUser: (data: {
    username: string
    password: string
    fullName: string
    role: string
    pin?: string
  }) => ipcRenderer.invoke(IPC_CHANNELS.AUTH_CREATE_USER, data),

  // Settings
  getSetting: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET, key),
  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SET, { key, value }),
  getAllSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET_ALL),

  // Shift
  startShift: (data: { userId: string; openingCash: number }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_START, data),
  endShift: (data: { shiftId: string; closingCash: number; notes?: string }) =>
    ipcRenderer.invoke(IPC_CHANNELS.SHIFT_END, data),
  getActiveShift: (userId: string) => ipcRenderer.invoke(IPC_CHANNELS.SHIFT_GET_ACTIVE, userId)
}

contextBridge.exposeInMainWorld('electron', electronAPI)

export type ElectronAPI = typeof electronAPI
```

**Step 5: Create type declaration for renderer**

Create `src/preload/index.d.ts`:

```typescript
import type { ElectronAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
  }
}
```

**Step 6: Register handlers in main process**

Modify `src/main/index.ts` to add handler registration:

```typescript
import { registerIpcHandlers } from './ipc/handlers'

// Add after initializeDatabase() in app.whenReady()
app.whenReady().then(() => {
  initializeDatabase()
  registerIpcHandlers()
  // ... createWindow
})
```

**Step 7: Test IPC bridge**

Run:

```bash
npm run dev
```

Open DevTools and run:

```javascript
await window.electron.getAllSettings()
```

Expected: Returns settings object

**Step 8: Commit IPC setup**

```bash
git add .
git commit -m "feat: setup IPC bridge with auth, settings, and shift handlers"
```

---

## Task 6: Create Main Layout with Sidebar

**Files:**

- Create: `src/renderer/src/components/layout/Sidebar.tsx`
- Create: `src/renderer/src/components/layout/Header.tsx`
- Create: `src/renderer/src/components/layout/MainLayout.tsx`
- Modify: `src/renderer/src/App.tsx`

**Step 1: Create Sidebar component**

Create `src/renderer/src/components/layout/Sidebar.tsx`:

```typescript
import { cn } from '@/lib/utils'
import {
  ShoppingCart,
  Package,
  BarChart3,
  Bot,
  Users,
  Settings
} from 'lucide-react'

interface SidebarProps {
  currentPage: string
  onNavigate: (page: string) => void
}

const navItems = [
  { id: 'pos', label: 'POS', icon: ShoppingCart },
  { id: 'inventory', label: 'Inventory', icon: Package },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'ai', label: 'AI Insights', icon: Bot },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ currentPage, onNavigate }: SidebarProps): React.JSX.Element {
  return (
    <aside className="w-16 bg-muted border-r flex flex-col items-center py-4 gap-2">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive = currentPage === item.id

        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={cn(
              'w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-1 transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground hover:text-foreground'
            )}
            title={item.label}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label.slice(0, 3)}</span>
          </button>
        )
      })}
    </aside>
  )
}
```

**Step 2: Create Header component**

Create `src/renderer/src/components/layout/Header.tsx`:

```typescript
import { Button } from '@/components/ui/button'
import { Settings, LogOut } from 'lucide-react'

interface HeaderProps {
  user: { full_name: string; role: string } | null
  onLogout: () => void
}

export function Header({ user, onLogout }: HeaderProps): React.JSX.Element {
  return (
    <header className="h-14 border-b bg-background flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-bold text-primary">PharmaPOS</h1>
      </div>

      <div className="flex items-center gap-4">
        {user && (
          <span className="text-sm text-muted-foreground">
            {user.full_name} ({user.role})
          </span>
        )}
        <Button variant="ghost" size="icon" title="Settings">
          <Settings className="w-5 h-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={onLogout} title="Logout">
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  )
}
```

**Step 3: Create MainLayout component**

Create `src/renderer/src/components/layout/MainLayout.tsx`:

```typescript
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

interface MainLayoutProps {
  user: { full_name: string; role: string } | null
  onLogout: () => void
  children?: React.ReactNode
}

export function MainLayout({ user, onLogout, children }: MainLayoutProps): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState('pos')

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header user={user} onLogout={onLogout} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <main className="flex-1 overflow-auto p-4">
          {children || (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p>Select a page from the sidebar</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
```

**Step 4: Create layout index export**

Create `src/renderer/src/components/layout/index.ts`:

```typescript
export * from './Sidebar'
export * from './Header'
export * from './MainLayout'
```

**Step 5: Update App to use layout**

Modify `src/renderer/src/App.tsx`:

```typescript
import { useState } from 'react'
import { MainLayout } from './components/layout'

function App(): React.JSX.Element {
  const [user, setUser] = useState<{ full_name: string; role: string } | null>({
    full_name: 'Test User',
    role: 'admin'
  })

  const handleLogout = (): void => {
    setUser(null)
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Please login</p>
      </div>
    )
  }

  return <MainLayout user={user} onLogout={handleLogout} />
}

export default App
```

**Step 6: Test layout**

Run:

```bash
npm run dev
```

Expected: App shows header with user info and sidebar navigation

**Step 7: Commit layout**

```bash
git add .
git commit -m "feat: create main layout with sidebar and header navigation"
```

---

## Task 7: Create Login Page with PIN Pad

**Files:**

- Create: `src/renderer/src/pages/LoginPage.tsx`
- Create: `src/renderer/src/components/auth/PinPad.tsx`
- Create: `src/renderer/src/stores/authStore.ts`
- Modify: `src/renderer/src/App.tsx`

**Step 1: Install Zustand**

Run:

```bash
npm install zustand
```

**Step 2: Create auth store**

Create `src/renderer/src/stores/authStore.ts`:

```typescript
import { create } from 'zustand'

interface User {
  id: string
  username: string
  full_name: string
  role: string
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  login: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false })
}))
```

**Step 3: Create PinPad component**

Create `src/renderer/src/components/auth/PinPad.tsx`:

```typescript
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Delete, CornerDownLeft } from 'lucide-react'

interface PinPadProps {
  onSubmit: (pin: string) => void
  maxLength?: number
}

export function PinPad({ onSubmit, maxLength = 4 }: PinPadProps): React.JSX.Element {
  const [pin, setPin] = useState('')

  const handleNumber = (num: string): void => {
    if (pin.length < maxLength) {
      setPin(prev => prev + num)
    }
  }

  const handleDelete = (): void => {
    setPin(prev => prev.slice(0, -1))
  }

  const handleClear = (): void => {
    setPin('')
  }

  const handleSubmit = (): void => {
    if (pin.length > 0) {
      onSubmit(pin)
      setPin('')
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* PIN Display */}
      <div className="flex gap-2 mb-2">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-full border-2 border-primary"
            style={{ backgroundColor: i < pin.length ? 'var(--color-primary)' : 'transparent' }}
          />
        ))}
      </div>

      {/* Number Pad */}
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
          <Button
            key={num}
            variant="outline"
            size="lg"
            className="w-14 h-14 text-xl font-semibold"
            onClick={() => handleNumber(num)}
          >
            {num}
          </Button>
        ))}
        <Button
          variant="outline"
          size="lg"
          className="w-14 h-14"
          onClick={handleClear}
        >
          C
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-14 h-14 text-xl font-semibold"
          onClick={() => handleNumber('0')}
        >
          0
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-14 h-14"
          onClick={handleDelete}
        >
          <Delete className="w-5 h-5" />
        </Button>
      </div>

      {/* Submit */}
      <Button
        className="w-full mt-2"
        size="lg"
        onClick={handleSubmit}
        disabled={pin.length === 0}
      >
        <CornerDownLeft className="w-4 h-4 mr-2" />
        Login
      </Button>
    </div>
  )
}
```

**Step 4: Create LoginPage**

Create `src/renderer/src/pages/LoginPage.tsx`:

```typescript
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PinPad } from '@/components/auth/PinPad'
import { useAuthStore } from '@/stores/authStore'

interface User {
  id: string
  username: string
  full_name: string
  role: string
}

export function LoginPage(): React.JSX.Element {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [usePassword, setUsePassword] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const login = useAuthStore((state) => state.login)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async (): Promise<void> => {
    try {
      const userList = await window.electron.getUsers()
      setUsers(userList)

      // If no users, we need to create admin
      if (userList.length === 0) {
        await createDefaultAdmin()
        loadUsers()
      }
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  const createDefaultAdmin = async (): Promise<void> => {
    await window.electron.createUser({
      username: 'admin',
      password: 'admin123',
      fullName: 'Administrator',
      role: 'admin',
      pin: '0000'
    })
  }

  const handlePinSubmit = async (pin: string): Promise<void> => {
    if (!selectedUser) return
    setError('')

    const result = await window.electron.login({ userId: selectedUser.id, pin })

    if (result.success) {
      login(result.user)
    } else {
      setError(result.error || 'Invalid PIN')
    }
  }

  const handlePasswordSubmit = async (): Promise<void> => {
    if (!selectedUser || !password) return
    setError('')

    const result = await window.electron.login({ userId: selectedUser.id, password })

    if (result.success) {
      login(result.user)
    } else {
      setError(result.error || 'Invalid password')
      setPassword('')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl text-primary">PharmaPOS</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedUser ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground text-center mb-4">
                Select user to login
              </p>
              {users.map((user) => (
                <Button
                  key={user.id}
                  variant="outline"
                  className="w-full justify-start h-12"
                  onClick={() => setSelectedUser(user)}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{user.full_name}</span>
                    <span className="text-xs text-muted-foreground">{user.role}</span>
                  </div>
                </Button>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-center">
                <p className="font-medium">{selectedUser.full_name}</p>
                <p className="text-sm text-muted-foreground">{selectedUser.role}</p>
              </div>

              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              {usePassword ? (
                <div className="space-y-4">
                  <Input
                    type="password"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                  />
                  <Button className="w-full" onClick={handlePasswordSubmit}>
                    Login
                  </Button>
                </div>
              ) : (
                <PinPad onSubmit={handlePinSubmit} />
              )}

              <div className="flex justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedUser(null)}
                >
                  Back
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUsePassword(!usePassword)}
                >
                  {usePassword ? 'Use PIN' : 'Use Password'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 5: Update App to use auth store**

Modify `src/renderer/src/App.tsx`:

```typescript
import { useAuthStore } from './stores/authStore'
import { MainLayout } from './components/layout'
import { LoginPage } from './pages/LoginPage'

function App(): React.JSX.Element {
  const { user, isAuthenticated, logout } = useAuthStore()

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return <MainLayout user={user} onLogout={logout} />
}

export default App
```

**Step 6: Test login flow**

Run:

```bash
npm run dev
```

Expected:

1. Login page shows with user selection
2. Default admin created with PIN 0000
3. Can login with PIN or password
4. After login, see main layout

**Step 7: Commit login page**

```bash
git add .
git commit -m "feat: create login page with PIN pad and auth store"
```

---

## Task 8: Add Basic Settings Page

**Files:**

- Create: `src/renderer/src/pages/SettingsPage.tsx`
- Create: `src/renderer/src/stores/settingsStore.ts`
- Modify: `src/renderer/src/components/layout/MainLayout.tsx`

**Step 1: Create settings store**

Create `src/renderer/src/stores/settingsStore.ts`:

```typescript
import { create } from 'zustand'

interface Settings {
  business_name: string
  business_address: string
  business_phone: string
  vat_rate: string
  currency_symbol: string
  receipt_footer: string
}

interface SettingsState {
  settings: Settings
  isLoading: boolean
  loadSettings: () => Promise<void>
  updateSetting: (key: keyof Settings, value: string) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: {
    business_name: '',
    business_address: '',
    business_phone: '',
    vat_rate: '18',
    currency_symbol: 'Rs.',
    receipt_footer: ''
  },
  isLoading: true,

  loadSettings: async () => {
    set({ isLoading: true })
    const allSettings = await window.electron.getAllSettings()
    set({
      settings: { ...get().settings, ...allSettings },
      isLoading: false
    })
  },

  updateSetting: async (key, value) => {
    await window.electron.setSetting(key, value)
    set({ settings: { ...get().settings, [key]: value } })
  }
}))
```

**Step 2: Create SettingsPage**

Create `src/renderer/src/pages/SettingsPage.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/stores/settingsStore'
import { Save } from 'lucide-react'

export function SettingsPage(): React.JSX.Element {
  const { settings, isLoading, loadSettings, updateSetting } = useSettingsStore()
  const [localSettings, setLocalSettings] = useState(settings)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  useEffect(() => {
    setLocalSettings(settings)
  }, [settings])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    for (const [key, value] of Object.entries(localSettings)) {
      if (value !== settings[key as keyof typeof settings]) {
        await updateSetting(key as keyof typeof settings, value)
      }
    }
    setSaving(false)
  }

  const handleChange = (key: string, value: string): void => {
    setLocalSettings(prev => ({ ...prev, [key]: value }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Loading settings...</p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Settings</h2>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Business Information</CardTitle>
          <CardDescription>Configure your pharmacy details for receipts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Business Name</label>
            <Input
              value={localSettings.business_name}
              onChange={(e) => handleChange('business_name', e.target.value)}
              placeholder="My Pharmacy"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Address</label>
            <Input
              value={localSettings.business_address}
              onChange={(e) => handleChange('business_address', e.target.value)}
              placeholder="123 Main Street, Colombo"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Phone</label>
            <Input
              value={localSettings.business_phone}
              onChange={(e) => handleChange('business_phone', e.target.value)}
              placeholder="011-2345678"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tax & Currency</CardTitle>
          <CardDescription>Configure tax and currency settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">VAT Rate (%)</label>
            <Input
              type="number"
              value={localSettings.vat_rate}
              onChange={(e) => handleChange('vat_rate', e.target.value)}
              placeholder="18"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Currency Symbol</label>
            <Input
              value={localSettings.currency_symbol}
              onChange={(e) => handleChange('currency_symbol', e.target.value)}
              placeholder="Rs."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Receipt</CardTitle>
          <CardDescription>Customize receipt appearance</CardDescription>
        </CardHeader>
        <CardContent>
          <div>
            <label className="text-sm font-medium">Receipt Footer Message</label>
            <Input
              value={localSettings.receipt_footer}
              onChange={(e) => handleChange('receipt_footer', e.target.value)}
              placeholder="Thank you for your purchase!"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Step 3: Create pages index**

Create `src/renderer/src/pages/index.ts`:

```typescript
export * from './LoginPage'
export * from './SettingsPage'
```

**Step 4: Update MainLayout with page routing**

Modify `src/renderer/src/components/layout/MainLayout.tsx`:

```typescript
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { SettingsPage } from '@/pages/SettingsPage'

interface MainLayoutProps {
  user: { full_name: string; role: string } | null
  onLogout: () => void
}

export function MainLayout({ user, onLogout }: MainLayoutProps): React.JSX.Element {
  const [currentPage, setCurrentPage] = useState('pos')

  const renderPage = (): React.JSX.Element => {
    switch (currentPage) {
      case 'settings':
        return <SettingsPage />
      case 'pos':
        return (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>POS Terminal - Coming in Phase 2</p>
          </div>
        )
      case 'inventory':
        return (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>Inventory Management - Coming in Phase 3</p>
          </div>
        )
      case 'analytics':
        return (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>Analytics Dashboard - Coming in Phase 4</p>
          </div>
        )
      case 'ai':
        return (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>AI Insights - Coming in Phase 4</p>
          </div>
        )
      case 'users':
        return (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>User Management - Coming in Phase 5</p>
          </div>
        )
      default:
        return (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>Select a page from the sidebar</p>
          </div>
        )
    }
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      <Header user={user} onLogout={onLogout} />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={setCurrentPage} />
        <main className="flex-1 overflow-auto p-4">
          {renderPage()}
        </main>
      </div>
    </div>
  )
}
```

**Step 5: Test settings page**

Run:

```bash
npm run dev
```

Expected:

1. Login with admin/0000
2. Click Settings in sidebar
3. See settings form
4. Can edit and save settings

**Step 6: Commit settings page**

```bash
git add .
git commit -m "feat: add settings page with business info configuration"
```

---

## Phase 1 Complete

**Summary of what was built:**

- Electron + Vite + React project scaffold
- Tailwind CSS v4 with custom theme
- shadcn/ui base components
- SQLite database with full schema
- IPC bridge for renderer-main communication
- Authentication with PIN pad and password
- Main layout with sidebar navigation
- Settings page with business configuration

**Next Phase:** Phase 2 - Core POS (Product search, cart, payments, receipt printing)

---

**To continue:** Run `npm run dev` to verify everything works, then proceed to Phase 2 implementation plan.
