CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` text NOT NULL,
	`user_id` text,
	`user_name` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`details` text,
	`ip_address` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`email` text,
	`address` text,
	`date_of_birth` text,
	`notes` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_phone_unique` ON `customers` (`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_unique` ON `customers` (`email`);--> statement-breakpoint
CREATE TABLE `inventory_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`batch_id` text,
	`adjustment_type` text NOT NULL,
	`quantity_change` real NOT NULL,
	`reason` text,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `product_sales_daily` (
	`date` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity_sold` integer DEFAULT 0 NOT NULL,
	`revenue` real DEFAULT 0 NOT NULL,
	`cost` real DEFAULT 0 NOT NULL,
	`profit` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`date`, `product_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`barcode` text,
	`sku` text,
	`name` text NOT NULL,
	`generic_name` text,
	`category_id` text,
	`supplier_id` text,
	`cost_price` real DEFAULT 0 NOT NULL,
	`unit_price` real NOT NULL,
	`tax_rate` real DEFAULT 0 NOT NULL,
	`is_tax_inclusive` integer DEFAULT 1 NOT NULL,
	`reorder_level` integer DEFAULT 10 NOT NULL,
	`reorder_qty` integer DEFAULT 50 NOT NULL,
	`unit` text DEFAULT 'piece' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`track_expiry` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_barcode_unique` ON `products` (`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `products_sku_unique` ON `products` (`sku`);--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`batch_id` text,
	`quantity` integer NOT NULL,
	`unit_price` real NOT NULL,
	`cost_price` real NOT NULL,
	`tax_rate` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`line_total` real NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`batch_id`) REFERENCES `stock_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sale_refunds` (
	`id` text PRIMARY KEY NOT NULL,
	`sale_id` text NOT NULL,
	`user_id` text NOT NULL,
	`items` text NOT NULL,
	`total_refunded` real NOT NULL,
	`restock` integer DEFAULT 1 NOT NULL,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_number` text NOT NULL,
	`shift_id` text NOT NULL,
	`user_id` text NOT NULL,
	`customer_id` text,
	`subtotal` real DEFAULT 0 NOT NULL,
	`tax_amount` real DEFAULT 0 NOT NULL,
	`discount_amount` real DEFAULT 0 NOT NULL,
	`discount_type` text,
	`discount_value` real DEFAULT 0,
	`total` real DEFAULT 0 NOT NULL,
	`payment_method` text NOT NULL,
	`cash_received` real DEFAULT 0,
	`card_received` real DEFAULT 0,
	`change_given` real DEFAULT 0,
	`status` text DEFAULT 'completed' NOT NULL,
	`void_reason` text,
	`customer_name` text,
	`customer_phone` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_receipt_number_unique` ON `sales` (`receipt_number`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`opening_cash` real DEFAULT 0 NOT NULL,
	`closing_cash` real,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `stock_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`batch_number` text,
	`quantity` real DEFAULT 0 NOT NULL,
	`cost_price` real NOT NULL,
	`expiry_date` text,
	`received_date` text NOT NULL,
	`supplier_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `suppliers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact_person` text,
	`phone` text,
	`email` text,
	`address` text,
	`lead_time_days` integer DEFAULT 3,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text NOT NULL,
	`role` text DEFAULT 'cashier' NOT NULL,
	`pin_code` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);

-- Partial unique index: one active shift per user (cannot be expressed in Drizzle DSL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_active_user
ON shifts(user_id) WHERE status = 'active';

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_sales_shift ON sales(shift_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_shift_status ON sales(shift_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_user_created ON sales(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_batches_product_expiry ON stock_batches(product_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_stock_batches_batch_number ON stock_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_inventory_adj_product ON inventory_adjustments(product_id);

-- Default settings seed data
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('business_name', 'My Pharmacy', datetime('now')),
  ('vat_rate', '18', datetime('now')),
  ('currency_symbol', 'Rs.', datetime('now')),
  ('receipt_footer', 'Thank you for your purchase!', datetime('now')),
  ('display_port', '', datetime('now')),
  ('display_baud_rate', '9600', datetime('now')),
  ('business_address', '', datetime('now')),
  ('business_phone', '', datetime('now'));

-- Default categories seed data
INSERT OR IGNORE INTO categories (id, name, description, created_at) VALUES
  ('cat-medications', 'Medications', 'Prescription and OTC medications', datetime('now')),
  ('cat-pain-relief', 'Pain Relief', 'Painkillers and anti-inflammatory', datetime('now')),
  ('cat-cold-flu', 'Cold & Flu', 'Cold, flu, and allergy medications', datetime('now')),
  ('cat-first-aid', 'First Aid', 'Bandages, antiseptics, first aid supplies', datetime('now')),
  ('cat-personal-care', 'Personal Care', 'Hygiene and personal care products', datetime('now')),
  ('cat-vitamins', 'Vitamins', 'Vitamins and supplements', datetime('now'));