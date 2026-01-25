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
    unit_price REAL NOT NULL,
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

-- Product Sales Daily (for quick items / best sellers tracking)
CREATE TABLE IF NOT EXISTS product_sales_daily (
    id TEXT PRIMARY KEY,
    date DATE NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity_sold INTEGER NOT NULL DEFAULT 0,
    revenue REAL NOT NULL DEFAULT 0,
    cost REAL NOT NULL DEFAULT 0,
    profit REAL NOT NULL DEFAULT 0,
    UNIQUE(date, product_id)
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
CREATE INDEX IF NOT EXISTS idx_product_sales_daily_date ON product_sales_daily(date);
CREATE INDEX IF NOT EXISTS idx_product_sales_daily_product ON product_sales_daily(product_id);

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
