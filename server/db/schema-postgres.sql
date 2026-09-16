-- ═══════════════════════════════════════════════════════════════════
-- DyPOS Tier-2 PostgreSQL schema (v3 parity with SQLite driver)
-- Target: millions of subscribers, multi-tenant-ready.
-- Usage: psql "$DYPOS_DATABASE_URL" -f server/db/schema-postgres.sql
-- Notes:
--  * SQLite TEXT ids (uuid v4) → UUID with pgcrypto default.
--  * SQLite REAL money → NUMERIC(12,2) (no float drift at scale).
--  * Partial unique index on idempotency_key mirrors SQLite WHERE filter.
--  * created_at/updated_at use timestamptz + now().
--  * Multi-tenancy: add `tenant_id` + RLS when moving beyond single-tenant.
-- ═══════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  description TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT,
  barcode TEXT,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 15,
  uom TEXT NOT NULL DEFAULT 'Unit',
  image TEXT,
  category TEXT,
  brand TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_active_cat ON products(is_active, category);
CREATE INDEX IF NOT EXISTS idx_products_code ON products(code);

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  tax_number TEXT,
  loyalty_tier TEXT NOT NULL DEFAULT 'BRONZE',
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  wallet_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_limit NUMERIC(12,2) NOT NULL DEFAULT 0,
  credit_used NUMERIC(12,2) NOT NULL DEFAULT 0,
  address TEXT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS stock_levels (
  product_id UUID NOT NULL REFERENCES products(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  reserved_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  allocated_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, warehouse_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_warehouse ON stock_levels(warehouse_id, product_id);

CREATE TABLE IF NOT EXISTS shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id TEXT NOT NULL,
  opened_by TEXT NOT NULL,
  opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_cash NUMERIC(12,2),
  expected_cash NUMERIC(12,2),
  variance NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'OPEN',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by TEXT,
  cash_sales NUMERIC(12,2),
  total_sales NUMERIC(12,2),
  orders_count INTEGER,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shifts_terminal ON shifts(terminal_id, status);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT NOT NULL DEFAULT 'Walk-in Customer',
  shift_id UUID,
  terminal_id TEXT,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  remaining_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'UNPAID',
  currency TEXT NOT NULL DEFAULT 'SAR',
  channel_id TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT,
  paid_at timestamptz,
  notes TEXT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_number ON invoices(number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idem ON invoices(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_invoices_shift ON invoices(shift_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_terminal_created ON invoices(terminal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT,
  barcode TEXT,
  qty NUMERIC(12,3) NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL,
  uom TEXT,
  warehouse_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON invoice_items(product_id);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  reference TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_method ON payments(method);

CREATE TABLE IF NOT EXISTS offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'PERCENT',
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  max_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  applies_to TEXT NOT NULL DEFAULT 'ALL',
  item_groups TEXT,
  valid_from timestamptz,
  valid_to timestamptz,
  one_time_per_customer BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  discount_type TEXT NOT NULL DEFAULT 'PCT',
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_purchase NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_uses INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  valid_from timestamptz,
  valid_to timestamptz,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  points INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  type TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  note TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customer_id);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'CASHIER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

CREATE TABLE IF NOT EXISTS sync_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT,
  synced_at timestamptz,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_log(status);
CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_log(entity_type, status, id);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  ip_address TEXT,
  user_agent TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);

INSERT INTO schema_version (version, description) VALUES (3, 'Postgres Tier-2 baseline (v3 parity)') ON CONFLICT DO NOTHING;
