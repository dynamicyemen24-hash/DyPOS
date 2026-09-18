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
CREATE INDEX IF NOT EXISTS idx_products_name_active ON products(is_active, name);

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

-- ── v4: integration plane (webhooks + outbox) ──
CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  events TEXT NOT NULL DEFAULT '["*"]',
  secret TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS webhook_outbox (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'PENDING',
  last_error TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_outbox_status ON webhook_outbox(status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS idx_subs_active ON webhook_subscriptions(is_active);
INSERT INTO schema_version (version, description) VALUES (4, 'Webhooks + outbox') ON CONFLICT DO NOTHING;

-- ── v5: customers is_active + invoice void fields ──
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS voided_by TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);
INSERT INTO schema_version (version, description) VALUES (5, 'Customers is_active + void') ON CONFLICT DO NOTHING;

-- ── v6: tamper-evident invoice chain + audit + zatca_settings (parity with SQLite) ──
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS chain_hash TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS chain_prev TEXT;
CREATE TABLE IF NOT EXISTS invoice_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  prev_hash TEXT NOT NULL DEFAULT 'GENESIS',
  hash TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'CREATE',
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_invoice ON invoice_audit(invoice_id, id);
CREATE TABLE IF NOT EXISTS zatca_settings (
  id TEXT PRIMARY KEY,
  seller_name TEXT NOT NULL DEFAULT '',
  vat_number TEXT NOT NULL DEFAULT '',
  cr_number TEXT NOT NULL DEFAULT '',
  branch_id TEXT NOT NULL DEFAULT '1',
  phase TEXT NOT NULL DEFAULT 'simulation',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO zatca_settings (id) VALUES ('default') ON CONFLICT DO NOTHING;
CREATE INDEX IF NOT EXISTS idx_invoices_chain ON invoices(chain_hash);
INSERT INTO schema_version (version, description) VALUES (6, 'Invoice hash chain + audit + zatca_settings') ON CONFLICT DO NOTHING;

-- ── v7: wallet ledger (parity with SQLite) ──
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  direction TEXT NOT NULL DEFAULT 'credit',
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  reference_type TEXT NOT NULL DEFAULT 'MANUAL',
  reference_id TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_customer ON wallet_transactions(customer_id, created_at DESC);
INSERT INTO schema_version (version, description) VALUES (7, 'Wallet ledger + backfill') ON CONFLICT DO NOTHING;

-- ── v8: multi-tenancy + control fields + audit_trail (parity with SQLite) ──
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'standard',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  vat_number TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orgs_tenant ON organizations(tenant_id);
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  warehouse_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_branches_org ON branches(org_id);
CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id);
CREATE TABLE IF NOT EXISTS audit_trail (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT NOT NULL DEFAULT '{}',
  after_json TEXT NOT NULL DEFAULT '{}',
  user_id UUID,
  username TEXT,
  ip TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trail_entity ON audit_trail(entity_type, entity_id, id);
CREATE INDEX IF NOT EXISTS idx_trail_tenant ON audit_trail(tenant_id, created_at DESC);
ALTER TABLE products ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS tenant_id UUID;
ALTER TABLE warehouses ADD COLUMN IF NOT EXISTS branch_id UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant ON shifts(tenant_id, status);
INSERT INTO schema_version (version, description) VALUES (8, 'Tenancy hierarchy + scoping + control fields + audit_trail') ON CONFLICT DO NOTHING;

-- ── v9: master data — currencies + UoMs + seeds (parity with SQLite) ──
CREATE TABLE IF NOT EXISTS currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  symbol TEXT NOT NULL DEFAULT '',
  decimals INTEGER NOT NULL DEFAULT 2,
  rate_to_base NUMERIC(14,5) NOT NULL DEFAULT 1,
  is_base BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS uoms (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'count',
  factor_to_base NUMERIC(14,5) NOT NULL DEFAULT 1,
  is_base BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO currencies (code,name,name_ar,symbol,decimals,rate_to_base,is_base) VALUES
  ('SAR','Saudi Riyal','ريال سعودي','ر.س',2,1,TRUE),
  ('USD','US Dollar','دولار أمريكي','$',2,0.26667,FALSE),
  ('EUR','Euro','يورو','€',2,0.24510,FALSE),
  ('AED','UAE Dirham','درهم إماراتي','د.إ',2,0.97933,FALSE),
  ('KWD','Kuwaiti Dinar','دينار كويتي','د.ك',3,0.08170,FALSE),
  ('BHD','Bahraini Dinar','دينار بحريني','د.ب',3,0.10040,FALSE),
  ('QAR','Qatari Riyal','ريال قطري','ر.ق',2,0.97087,FALSE),
  ('EGP','Egyptian Pound','جنيه مصري','ج.م',2,12.80000,FALSE)
ON CONFLICT DO NOTHING;
INSERT INTO uoms (code,name,name_ar,category,factor_to_base,is_base) VALUES
  ('Unit','Unit','قطعة','count',1,TRUE),
  ('PCS','Pieces','قطع','count',1,FALSE),
  ('DOZEN','Dozen','درزن','count',12,FALSE),
  ('BOX','Box','كرتون','count',12,FALSE),
  ('G','Gram','جرام','weight',1,TRUE),
  ('KG','Kilogram','كيلوجرام','weight',1000,FALSE),
  ('TON','Ton','طن','weight',1000000,FALSE),
  ('ML','Milliliter','ملليلتر','volume',1,TRUE),
  ('L','Liter','لتر','volume',1000,FALSE),
  ('M','Meter','متر','length',1000,FALSE),
  ('CM','Centimeter','سنتيمتر','length',10,FALSE),
  ('MM','Millimeter','ملليمتر','length',1,TRUE)
ON CONFLICT DO NOTHING;
INSERT INTO schema_version (version, description) VALUES (9, 'Currencies + UoMs + seeds') ON CONFLICT DO NOTHING;

-- ── v10: machine integration + auth recovery + pay idempotency (parity with SQLite) ──
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'AUDITOR',
  scopes TEXT NOT NULL DEFAULT '[]',
  tenant_id UUID,
  expires_at timestamptz,
  last_used_at timestamptz,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_by TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apikeys_hash ON api_keys(key_hash);
CREATE TABLE IF NOT EXISTS password_resets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resets_token ON password_resets(token_hash);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idem ON payments(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
INSERT INTO schema_version (version, description) VALUES (10, 'API keys + password resets + payment idempotency') ON CONFLICT DO NOTHING;

-- ── v11: billions-scale reads (parity with SQLite) ──
-- Postgres FTS path (SQLite uses the products_fts FTS5 table instead):
--   ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector;
--   CREATE INDEX IF NOT EXISTS idx_products_fts ON products USING GIN (search_vector);
-- (Left as a documented snippet: backfilling tsvector needs a data migration
--  window on large tables, tracked work — not run blindly here.)
CREATE INDEX IF NOT EXISTS idx_stock_qty ON stock_levels(qty);
INSERT INTO schema_version (version, description) VALUES (11, 'FTS5 catalog + low-stock index') ON CONFLICT DO NOTHING;
