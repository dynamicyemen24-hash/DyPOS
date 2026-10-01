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
CREATE UNIQUE INDEX IF NOT EXISTS uq_shifts_open_terminal ON shifts(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'), terminal_id) WHERE status='OPEN';
CREATE INDEX IF NOT EXISTS idx_shifts_settlement ON shifts(tenant_id, status, closed_at DESC, id);

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_idem ON invoices(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
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
  tenant_id TEXT,
  idempotency_key TEXT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_status ON sync_log(status);
CREATE INDEX IF NOT EXISTS idx_sync_entity ON sync_log(entity_type, status, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_idem ON sync_log(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_sync_tenant ON sync_log(tenant_id, status, id);

-- ── v29: per-branch sync scope (multi-branch / multi-terminal) ──
-- A terminal of branch A pulls only branch A's changes, and each branch
-- owns its cursor region, so N branches never contend for one counter.
-- Rows written before v29 keep branch_id NULL and stay visible to every
-- scope of their tenant (legacy passthrough, same rule as tenant_id).
ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS branch_id TEXT;
CREATE INDEX IF NOT EXISTS idx_sync_tenant_branch ON sync_log(tenant_id, branch_id, status, id);
CREATE INDEX IF NOT EXISTS idx_sync_pull ON sync_log(status, id, entity_type);
INSERT INTO schema_version (version, description) VALUES (29, 'sync_log branch scope (multi-branch pull + cursor)') ON CONFLICT DO NOTHING;

-- v16: minimal device registry (see SQLite migrate() v16)
CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY,
  device_id TEXT UNIQUE NOT NULL,
  tenant_id TEXT,
  platform TEXT NOT NULL DEFAULT 'unknown',
  app_version TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_sync timestamptz,
  registered_by TEXT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_devices_device ON devices(device_id);

-- v17: alert notifications inbox (parity with SQLite)
CREATE TABLE IF NOT EXISTS alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL,
  alertname TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'firing',
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  starts_at timestamptz,
  ends_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alert_notifications(status, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_fingerprint ON alert_notifications(fingerprint);

-- v18: subscription engine (parity with SQLite)
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  price NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  interval_days INTEGER NOT NULL DEFAULT 30,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plans_tenant ON subscription_plans(tenant_id, is_active);

CREATE TABLE IF NOT EXISTS customer_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT '',
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  start_date date NOT NULL,
  next_billing_date date NOT NULL,
  last_billed_at timestamptz,
  auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_customer ON customer_subscriptions(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_sub_next ON customer_subscriptions(status, next_billing_date);
CREATE INDEX IF NOT EXISTS idx_sub_tenant ON customer_subscriptions(tenant_id, status);

CREATE TABLE IF NOT EXISTS subscription_billings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '',
  subscription_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'SAR',
  method TEXT NOT NULL DEFAULT 'due',
  billed_at timestamptz NOT NULL DEFAULT now(),
  period_start date,
  periods_consolidated INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_sbill_sub ON subscription_billings(subscription_id, billed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sbill_customer ON subscription_billings(customer_id, billed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sbill_period ON subscription_billings(subscription_id, period_start) WHERE period_start IS NOT NULL;
INSERT INTO schema_version (version, description) VALUES (18, 'subscription engine') ON CONFLICT DO NOTHING;
INSERT INTO schema_version (version, description) VALUES (19, 'subscription billing periods (replay-safe charges)') ON CONFLICT DO NOTHING;

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
-- Return state is NOT the void state: applyInvoiceReturn rewrites the original
-- invoice and stamps returned_at/returned_by. Lockstep with SQLite (migration 24).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS returned_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS returned_by TEXT;
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
  ('EGP','Egyptian Pound','جنيه مصري','ج.م',2,12.80000,FALSE),
  ('OMR','Omani Rial','ريال عماني','ر.ع.',3,0.10256,FALSE),
  ('JOD','Jordanian Dinar','دينار أردني','د.أ',3,0.18868,FALSE),
  ('TRY','Turkish Lira','ليرة تركية','₺',2,8.69565,FALSE),
  ('YER','Yemeni Rial','ريال يمني','ر.ي',2,66.5,FALSE)
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
CREATE TABLE IF NOT EXISTS passkey_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tenant_id UUID,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  algorithm INTEGER NOT NULL DEFAULT -7,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT NOT NULL DEFAULT '[]',
  device_label TEXT,
  aaguid TEXT,
  backed_up BOOLEAN NOT NULL DEFAULT FALSE,
  last_used_at timestamptz,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_passkeys_user ON passkey_credentials(user_id);
CREATE TABLE IF NOT EXISTS passkey_challenges (
  challenge TEXT PRIMARY KEY,
  user_id UUID,
  tenant_id UUID,
  purpose TEXT NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_exp ON passkey_challenges(expires_at);
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

-- ── v12: dispatcher leader lease (parity with SQLite) ──
CREATE TABLE IF NOT EXISTS dispatcher_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  owner TEXT,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO dispatcher_lock (id, owner, lease_until) VALUES (1, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO schema_version (version, description) VALUES (12, 'webhook dispatcher leader lease') ON CONFLICT DO NOTHING;

-- ── v13: payment methods + business settings (parity with SQLite) ──
CREATE TABLE IF NOT EXISTS payment_methods (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'OTHER',
  requires_reference BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS business_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO payment_methods (code,name,name_ar,kind,requires_reference,is_active,sort_order) VALUES
  ('CASH','Cash','نقدي','CASH',FALSE,TRUE,10),
  ('CARD','Card','بطاقة','CARD',TRUE,TRUE,20),
  ('MADA','Mada','مدى','CARD',TRUE,TRUE,30),
  ('WALLET','Wallet','محفظة','WALLET',FALSE,TRUE,40),
  ('BANK_TRANSFER','Bank transfer','تحويل بنكي','BANK',TRUE,TRUE,50),
  ('OTHER','Other','أخرى','OTHER',FALSE,TRUE,60)
ON CONFLICT DO NOTHING;
INSERT INTO business_settings (key,value) VALUES
  ('business_name',''),('country_code','SA'),('currency','SAR'),
  ('tax_rate_default','15'),('tax_inclusive','0'),('invoice_prefix','INV')
ON CONFLICT DO NOTHING;
INSERT INTO schema_version (version, description) VALUES (13, 'payment methods master + business settings') ON CONFLICT DO NOTHING;

-- ── v14: fiscal years + gapless sequences (parity with SQLite) ──
CREATE TABLE IF NOT EXISTS fiscal_years (
  code TEXT PRIMARY KEY,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  closed_by TEXT,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS invoice_sequences (
  scope TEXT PRIMARY KEY,
  prefix TEXT NOT NULL DEFAULT 'INV',
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO schema_version (version, description) VALUES (14, 'fiscal years + gapless invoice sequences') ON CONFLICT DO NOTHING;

-- ── v15: Arabic invoice items + invoice version (parity with SQLite) ──
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS name_ar TEXT NOT NULL DEFAULT '';
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS free_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS is_free_item INTEGER NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
INSERT INTO schema_version (version, description) VALUES (15, 'invoice_items Arabic name + free-item tracking + version stamp') ON CONFLICT DO NOTHING;

-- ── v20: generic idempotency store (parity with SQLite) ──
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  scope TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 200,
  body JSONB NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + INTERVAL '24 hours'
);
CREATE INDEX IF NOT EXISTS idx_idem_scope ON idempotency_keys(scope, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idem_expires ON idempotency_keys(expires_at);
INSERT INTO schema_version (version, description) VALUES (20, 'generic idempotency store') ON CONFLICT DO NOTHING;

-- ── v21: growth & organic marketing engine + print configs + hardware + advanced (parity with SQLite) ──
CREATE TABLE IF NOT EXISTS store_synergies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  partner_store_name TEXT,
  partner_store_category TEXT,
  offer_text_ar TEXT,
  discount_code TEXT,
  is_active INTEGER DEFAULT 1,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS merchant_insights (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  metric_key TEXT,
  metric_value TEXT,
  insight_text_ar TEXT,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customer_feedback (
  id TEXT PRIMARY KEY,
  invoice_id TEXT,
  rating INTEGER,
  comment TEXT,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS document_print_configs (
  id TEXT PRIMARY KEY,
  document_type TEXT UNIQUE,
  header_text_ar TEXT,
  footer_text_ar TEXT,
  show_logo INTEGER DEFAULT 1,
  show_tax_number INTEGER DEFAULT 1,
  show_qr_code INTEGER DEFAULT 1,
  paper_size TEXT DEFAULT '80mm',
  font_family TEXT DEFAULT 'Cairo',
  primary_color TEXT DEFAULT '#0066CC',
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hardware_devices (
  id TEXT PRIMARY KEY,
  device_name TEXT,
  device_type TEXT,
  connection_type TEXT,
  connection_target TEXT,
  is_default INTEGER DEFAULT 0,
  settings_json TEXT DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS hardware_audit_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT,
  action TEXT,
  status TEXT,
  payload_summary TEXT,
  username TEXT,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS subscriber_campaigns (
  id TEXT PRIMARY KEY,
  campaign_name TEXT,
  discount_percentage REAL DEFAULT 0,
  trial_days INTEGER DEFAULT 14,
  referral_bonus_sar REAL DEFAULT 50,
  is_active INTEGER DEFAULT 1,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS multimodal_search_index (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  search_tokens TEXT,
  image_signature TEXT,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS marketing_events (
  id TEXT PRIMARY KEY,
  username TEXT,
  code TEXT,
  action TEXT,
  referee_id TEXT,
  timestamp timestamptz DEFAULT now(),
  version TEXT
);
CREATE TABLE IF NOT EXISTS marketing_referrals (
  username TEXT PRIMARY KEY,
  code TEXT,
  totalReferrals INTEGER DEFAULT 0,
  earnings REAL DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS integration_configs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'STD',
  adapter TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  auth_type TEXT NOT NULL DEFAULT 'api_key',
  credentials TEXT NOT NULL DEFAULT '{}',
  options TEXT NOT NULL DEFAULT '{}',
  direction TEXT NOT NULL DEFAULT 'both',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, adapter, name)
);
CREATE TABLE IF NOT EXISTS integration_runs (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT DEFAULT 'STD',
  adapter TEXT NOT NULL,
  config_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  dypos_id TEXT NOT NULL DEFAULT '',
  external_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT now(),
  idempotency_key TEXT,
  request_json TEXT DEFAULT '{}',
  response_json TEXT DEFAULT '{}',
  last_error TEXT,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intrun_idem ON integration_runs(idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
CREATE INDEX IF NOT EXISTS idx_intrun_status ON integration_runs(status, next_attempt_at, id);
CREATE INDEX IF NOT EXISTS idx_intrun_tenant ON integration_runs(tenant_id, status, id);
CREATE INDEX IF NOT EXISTS idx_intcfg_tenant ON integration_configs(tenant_id, is_active);
INSERT INTO schema_version (version, description) VALUES (21, 'growth + print configs + hardware + advanced + marketing + integrations') ON CONFLICT DO NOTHING;

-- ── v21+: expenses ledger (parity with SQLite ensureExpensesTable) ──
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  date DATE NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  tenant_id TEXT,
  branch_id TEXT,
  created_by TEXT,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_cat ON expenses(category, date DESC);

-- ── v22: partial returns — cumulative returned qty per invoice line ──
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS returned_qty REAL NOT NULL DEFAULT 0;
INSERT INTO schema_version (version, description) VALUES (22, 'partial returns: returned_qty per invoice line') ON CONFLICT DO NOTHING;

-- ── v23: promotions plane tenant isolation (offers + coupons) ──
ALTER TABLE offers ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_offers_tenant ON offers(tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id, is_active);
INSERT INTO schema_version (version, description) VALUES (23, 'offers + coupons tenant isolation') ON CONFLICT DO NOTHING;

-- ── v25: opening balances (أرصدة افتتاحية) ──
-- The starting position a tenant carries INTO a fiscal year: customer
-- receivables, cash on hand, and stock on hand. Without it a migrated or
-- newly-imported business has no history, so aging, receivable and
-- stock-valuation reports read zero for the period BEFORE the first invoice.
--
-- amount_minor is BIGINT minor units (halalas), never NUMERIC(12,2): opening
-- balances feed receivables and stock valuation, and an auditor summing them
-- against invoices must land on the same halala. NUMERIC(14,2) is still exact
-- in Postgres, but BIGINT keeps the SQLite and Postgres representations of the
-- same quantity literally identical (parity compares storage classes), so a
-- value written on dev reads back byte-for-byte the same in production.
--
-- UNIQUE(fiscal_year, account_type, account_id, tenant_id) is what makes an
-- import idempotent: re-importing the same file corrects the row in place
-- instead of doubling the customer's debt.
CREATE TABLE IF NOT EXISTS opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT '',
  fiscal_year TEXT NOT NULL,
  account_type TEXT NOT NULL,
  account_id TEXT NOT NULL DEFAULT '',
  account_code TEXT NOT NULL DEFAULT '',
  account_name TEXT NOT NULL DEFAULT '',
  amount_minor BIGINT NOT NULL DEFAULT 0,
  quantity NUMERIC(18,4) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_opening_balance
  ON opening_balances(fiscal_year, account_type, account_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_opening_tenant
  ON opening_balances(tenant_id, fiscal_year);
INSERT INTO schema_version (version, description) VALUES (25, 'opening balances per fiscal year') ON CONFLICT DO NOTHING;

-- v26: the ITEM an opening balance belongs to.
--
-- A stock row that names its item only in free text (account_id/account_code)
-- cannot be joined to the catalogue, so the movement it records has no
-- approvable counterpart: one item, many movements is the shape, and this is
-- the FK that carries it. Indexed for the join direction that matters (every
-- movement of one item, e.g. FEFO/expiry or a stock card).
--
-- Nullable by design: customer/cash/supplier positions have no item, and rows
-- written before v26 have none either. A '' default would be WRONG rather than
-- untidy — '' is non-NULL and no products.id equals it, so the FK rejects it.
ALTER TABLE opening_balances ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id);
CREATE INDEX IF NOT EXISTS idx_opening_product ON opening_balances(product_id);
INSERT INTO schema_version (version, description) VALUES (26, 'opening balances item link (product_id)') ON CONFLICT DO NOTHING;
/*
===============================================================================
DyPOS — GLOBAL PRODUCTION DATABASE ENGINE PACK
Companion to:
  dypos_final_global_production_complement_v41_v100.sql

Target:
  PostgreSQL 14+

Scope:
  Views + materialized views + functions + procedures + triggers + audit +
  validation + accounting posting + outbox workers + sync safeguards +
  operational indexes + health views + maintenance helpers.

Design:
  - Additive and idempotent where practical.
  - No destructive changes to legacy application tables.
  - Uses only objects introduced by the v41-v100 complement pack.
  - Application authorization remains mandatory in addition to RLS.
===============================================================================
*/

BEGIN;

CREATE SCHEMA IF NOT EXISTS dypos;

-- ============================================================================
-- 1. COMMON FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION dypos.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION dypos.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION dypos.current_request_id()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.request_id', true), '')
$$;

CREATE OR REPLACE FUNCTION dypos.require_tenant_context()
RETURNS UUID
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v UUID;
BEGIN
  v := dypos.current_tenant_id();
  IF v IS NULL THEN
    RAISE EXCEPTION 'DyPOS tenant context is required';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION dypos.jsonb_sha256(p_payload JSONB)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex')
$$;

-- ============================================================================
-- 2. AUDIT ENGINE
-- ============================================================================

CREATE OR REPLACE FUNCTION dypos.audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = dypos, public
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_entity_id UUID;
  v_tenant UUID;
  v_action TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_action := 'create';
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_action := 'update';
  ELSE
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_action := 'delete';
  END IF;

  v_tenant := COALESCE(
    NULLIF((COALESCE(v_new, v_old)->>'tenant_id'), '')::UUID,
    dypos.current_tenant_id()
  );

  BEGIN
    v_entity_id := NULLIF((COALESCE(v_new, v_old)->>'id'), '')::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    v_entity_id := NULL;
  END;

  INSERT INTO dypos.audit_log
    (tenant_id, actor_user_id, device_id, request_id,
     action, entity_type, entity_id, before_json, after_json, occurred_at)
  VALUES
    (v_tenant,
     NULLIF(current_setting('app.user_id', true), '')::UUID,
     NULLIF(current_setting('app.device_id', true), '')::UUID,
     dypos.current_request_id(),
     v_action, TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME, v_entity_id,
     v_old, v_new, clock_timestamp());

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Audit the mutable business tables introduced by the production pack.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_features',
    'accounting_periods',
    'chart_of_accounts',
    'journal_entries',
    'accounts_receivable',
    'accounts_payable',
    'exchange_rates',
    'unit_conversions',
    'promotions',
    'promotion_coupons',
    'promotion_redemptions',
    'payment_providers',
    'payment_transactions',
    'payment_refunds',
    'payment_reconciliations',
    'orders',
    'order_items',
    'reservations',
    'delivery_zones',
    'deliveries',
    'kitchen_stations',
    'kitchen_tickets',
    'kitchen_ticket_items',
    'devices',
    'sync_batches',
    'sync_operations',
    'sync_tombstones',
    'sync_conflict_resolutions',
    'data_retention_policies',
    'notifications',
    'notification_outbox',
    'integration_endpoints',
    'integration_outbox',
    'integration_inbox'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON dypos.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%I
       AFTER INSERT OR UPDATE OR DELETE ON dypos.%I
       FOR EACH ROW EXECUTE FUNCTION dypos.audit_row_change()',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- 3. RLS HARDENING
-- ============================================================================

ALTER TABLE dypos.journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON dypos.journal_lines;

CREATE POLICY tenant_isolation ON dypos.journal_lines
USING (
  EXISTS (
    SELECT 1
      FROM dypos.journal_entries je
     WHERE je.id = journal_lines.journal_entry_id
       AND je.tenant_id = dypos.current_tenant_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
      FROM dypos.journal_entries je
     WHERE je.id = journal_lines.journal_entry_id
       AND je.tenant_id = dypos.current_tenant_id()
  )
);

-- ============================================================================
-- 4. ACCOUNTING VALIDATION / POSTING
-- ============================================================================

CREATE OR REPLACE FUNCTION dypos.validate_journal_entry(p_entry_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tenant UUID;
  v_debit NUMERIC(30,6);
  v_credit NUMERIC(30,6);
  v_count BIGINT;
  v_status TEXT;
BEGIN
  SELECT tenant_id, status
    INTO v_tenant, v_status
    FROM dypos.journal_entries
   WHERE id = p_entry_id;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Journal entry % does not exist', p_entry_id;
  END IF;

  IF dypos.current_tenant_id() IS NOT NULL
     AND v_tenant <> dypos.current_tenant_id() THEN
    RAISE EXCEPTION 'Cross-tenant journal access denied';
  END IF;

  SELECT COUNT(*), COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
    INTO v_count, v_debit, v_credit
    FROM dypos.journal_lines
   WHERE journal_entry_id = p_entry_id;

  IF v_status = 'posted' AND (v_count < 2 OR v_debit = 0 OR v_debit <> v_credit) THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE PROCEDURE dypos.post_journal_entry(
  p_entry_id UUID,
  p_posted_by UUID DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_period_status TEXT;
  v_entry_date DATE;
BEGIN
  SELECT ap.status, je.entry_date
    INTO v_period_status, v_entry_date
    FROM dypos.journal_entries je
    LEFT JOIN dypos.accounting_periods ap ON ap.id = je.period_id
   WHERE je.id = p_entry_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry % not found', p_entry_id;
  END IF;

  IF v_period_status IS NOT NULL AND v_period_status <> 'open' THEN
    RAISE EXCEPTION 'Accounting period is not open';
  END IF;

  IF NOT dypos.validate_journal_entry(p_entry_id) THEN
    RAISE EXCEPTION 'Journal entry % is not balanced or has insufficient lines', p_entry_id;
  END IF;

  UPDATE dypos.journal_entries
     SET status = 'posted',
         posted_at = clock_timestamp(),
         posted_by = p_posted_by
   WHERE id = p_entry_id;
END;
$$;

CREATE OR REPLACE PROCEDURE dypos.reverse_journal_entry(
  p_entry_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_posted_by UUID DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_new UUID;
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant
    FROM dypos.journal_entries
   WHERE id = p_entry_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry % not found', p_entry_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM dypos.journal_entries
     WHERE reversal_of_id = p_entry_id
  ) THEN
    RAISE EXCEPTION 'Journal entry % already reversed', p_entry_id;
  END IF;

  INSERT INTO dypos.journal_entries
    (tenant_id, branch_id, period_id, entry_date, source_type, source_id,
     description, status, reversal_of_id, currency_code, exchange_rate,
     posted_by, posted_at)
  SELECT tenant_id, branch_id, period_id, CURRENT_DATE,
         'reversal', id,
         COALESCE(p_reason, 'Reversal'),
         'draft', id, currency_code, exchange_rate,
         p_posted_by, NULL
    FROM dypos.journal_entries
   WHERE id = p_entry_id
  RETURNING id INTO v_new;

  INSERT INTO dypos.journal_lines
    (journal_entry_id, account_id, line_no, description,
     debit, credit, currency_code, exchange_rate, dimension_json)
  SELECT v_new, account_id, line_no, description,
         credit, debit, currency_code, exchange_rate, dimension_json
    FROM dypos.journal_lines
   WHERE journal_entry_id = p_entry_id;

  CALL dypos.post_journal_entry(v_new, p_posted_by);

  UPDATE dypos.journal_entries
     SET status = 'reversed'
   WHERE id = p_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION dypos.account_balance(
  p_account_id UUID,
  p_as_of DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC(30,6)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
    FROM dypos.journal_lines jl
    JOIN dypos.journal_entries je ON je.id = jl.journal_entry_id
   WHERE jl.account_id = p_account_id
     AND je.status = 'posted'
     AND je.entry_date <= p_as_of
$$;

-- ============================================================================
-- 5. ACCOUNTING VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW dypos.v_trial_balance AS
SELECT
  je.tenant_id,
  jl.account_id,
  coa.code,
  coa.name,
  coa.account_type,
  COALESCE(SUM(jl.debit),0) AS total_debit,
  COALESCE(SUM(jl.credit),0) AS total_credit,
  COALESCE(SUM(jl.debit - jl.credit),0) AS balance
FROM dypos.journal_entries je
JOIN dypos.journal_lines jl ON jl.journal_entry_id = je.id
JOIN dypos.chart_of_accounts coa ON coa.id = jl.account_id
WHERE je.status = 'posted'
GROUP BY je.tenant_id, jl.account_id, coa.code, coa.name, coa.account_type;

CREATE OR REPLACE VIEW dypos.v_general_ledger AS
SELECT
  je.tenant_id,
  je.id AS journal_entry_id,
  je.entry_no,
  je.entry_date,
  coa.code AS account_code,
  coa.name AS account_name,
  jl.line_no,
  jl.description AS line_description,
  jl.debit,
  jl.credit,
  jl.currency_code,
  je.source_type,
  je.source_id
FROM dypos.journal_entries je
JOIN dypos.journal_lines jl ON jl.journal_entry_id = je.id
JOIN dypos.chart_of_accounts coa ON coa.id = jl.account_id
WHERE je.status = 'posted';

CREATE OR REPLACE VIEW dypos.v_ar_aging AS
SELECT
  ar.tenant_id,
  ar.customer_id,
  ar.currency_code,
  ar.id,
  ar.original_amount,
  ar.outstanding_amount,
  ar.due_date,
  CASE
    WHEN ar.due_date IS NULL THEN 'undated'
    WHEN ar.due_date >= CURRENT_DATE THEN 'current'
    WHEN CURRENT_DATE - ar.due_date <= 30 THEN '1_30'
    WHEN CURRENT_DATE - ar.due_date <= 60 THEN '31_60'
    WHEN CURRENT_DATE - ar.due_date <= 90 THEN '61_90'
    ELSE '90_plus'
  END AS aging_bucket,
  ar.status
FROM dypos.accounts_receivable ar
WHERE ar.status NOT IN ('paid','void');

CREATE OR REPLACE VIEW dypos.v_ap_aging AS
SELECT
  ap.tenant_id,
  ap.supplier_id,
  ap.currency_code,
  ap.id,
  ap.original_amount,
  ap.outstanding_amount,
  ap.due_date,
  CASE
    WHEN ap.due_date IS NULL THEN 'undated'
    WHEN ap.due_date >= CURRENT_DATE THEN 'current'
    WHEN CURRENT_DATE - ap.due_date <= 30 THEN '1_30'
    WHEN CURRENT_DATE - ap.due_date <= 60 THEN '31_60'
    WHEN CURRENT_DATE - ap.due_date <= 90 THEN '61_90'
    ELSE '90_plus'
  END AS aging_bucket,
  ap.status
FROM dypos.accounts_payable ap
WHERE ap.status NOT IN ('paid','void');

-- ============================================================================
-- 6. OPERATIONAL VIEWS
-- ============================================================================

CREATE OR REPLACE VIEW dypos.v_payment_summary AS
SELECT
  tenant_id,
  currency_code,
  method_code,
  status,
  COUNT(*) AS transaction_count,
  SUM(amount) AS amount
FROM dypos.payment_transactions
GROUP BY tenant_id, currency_code, method_code, status;

CREATE OR REPLACE VIEW dypos.v_order_summary AS
SELECT
  tenant_id,
  branch_id,
  status,
  order_type,
  COUNT(*) AS order_count,
  COALESCE(SUM(total_amount),0) AS total_amount
FROM dypos.orders
GROUP BY tenant_id, branch_id, status, order_type;

CREATE OR REPLACE VIEW dypos.v_kitchen_queue AS
SELECT
  kt.tenant_id,
  kt.branch_id,
  kt.id AS ticket_id,
  kt.ticket_no,
  ks.code AS station_code,
  ks.name AS station_name,
  kt.status,
  kt.priority,
  kt.queued_at,
  EXTRACT(EPOCH FROM (clock_timestamp() - kt.queued_at))/60.0 AS queue_minutes
FROM dypos.kitchen_tickets kt
LEFT JOIN dypos.kitchen_stations ks ON ks.id = kt.station_id
WHERE kt.status IN ('queued','accepted','preparing','ready');

CREATE OR REPLACE VIEW dypos.v_sync_health AS
SELECT
  d.tenant_id,
  d.id AS device_id,
  d.device_uid,
  d.status AS device_status,
  d.last_seen_at,
  COUNT(so.id) FILTER (WHERE so.status = 'pending') AS pending_operations,
  COUNT(so.id) FILTER (WHERE so.status = 'conflict') AS conflict_operations,
  COUNT(so.id) FILTER (WHERE so.status = 'quarantined') AS quarantined_operations,
  MAX(so.occurred_at) AS last_operation_at
FROM dypos.devices d
LEFT JOIN dypos.sync_operations so ON so.device_id = d.id
GROUP BY d.tenant_id, d.id, d.device_uid, d.status, d.last_seen_at;

CREATE OR REPLACE VIEW dypos.v_outbox_health AS
SELECT
  tenant_id,
  status,
  COUNT(*) AS item_count,
  MIN(created_at) AS oldest_item,
  MIN(next_attempt_at) FILTER (WHERE status = 'pending') AS next_attempt
FROM dypos.integration_outbox
GROUP BY tenant_id, status;

CREATE OR REPLACE VIEW dypos.v_security_health AS
SELECT
  tenant_id,
  severity,
  COUNT(*) AS event_count,
  MAX(occurred_at) AS last_event
FROM dypos.security_events
WHERE occurred_at >= clock_timestamp() - INTERVAL '24 hours'
GROUP BY tenant_id, severity;

CREATE OR REPLACE VIEW dypos.v_audit_activity AS
SELECT
  tenant_id,
  entity_type,
  action,
  COUNT(*) AS event_count,
  MAX(occurred_at) AS last_event
FROM dypos.audit_log
WHERE occurred_at >= clock_timestamp() - INTERVAL '24 hours'
GROUP BY tenant_id, entity_type, action;

-- ============================================================================
-- 7. SYNC / IDEMPOTENCY FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION dypos.accept_sync_operation(
  p_device_id UUID,
  p_sequence_no BIGINT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_operation TEXT,
  p_payload JSONB,
  p_occurred_at TIMESTAMPTZ DEFAULT clock_timestamp()
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant UUID;
  v_id UUID;
  v_hash TEXT;
BEGIN
  SELECT tenant_id INTO v_tenant
    FROM dypos.devices
   WHERE id = p_device_id
     AND status = 'active';

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Device is not active or does not exist';
  END IF;

  v_hash := dypos.jsonb_sha256(p_payload);

  INSERT INTO dypos.sync_operations
    (tenant_id, device_id, sequence_no, entity_type, entity_id,
     operation, payload, payload_hash, occurred_at)
  VALUES
    (v_tenant, p_device_id, p_sequence_no, p_entity_type, p_entity_id,
     p_operation, p_payload, v_hash, p_occurred_at)
  ON CONFLICT (tenant_id, device_id, sequence_no)
  DO UPDATE SET
    status = CASE
      WHEN dypos.sync_operations.payload_hash = EXCLUDED.payload_hash
      THEN dypos.sync_operations.status
      ELSE 'conflict'
    END,
    error_code = CASE
      WHEN dypos.sync_operations.payload_hash = EXCLUDED.payload_hash
      THEN dypos.sync_operations.error_code
      ELSE 'SEQUENCE_REUSE_DIFFERENT_PAYLOAD'
    END
  RETURNING id INTO v_id;

  UPDATE dypos.devices
     SET last_seen_at = clock_timestamp()
   WHERE id = p_device_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE PROCEDURE dypos.quarantine_device(
  p_device_id UUID,
  p_reason TEXT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM dypos.devices WHERE id = p_device_id FOR UPDATE;

  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Device not found';
  END IF;

  UPDATE dypos.devices
     SET status = 'quarantined'
   WHERE id = p_device_id;

  INSERT INTO dypos.security_events
    (tenant_id, device_id, event_type, severity, details)
  VALUES
    (v_tenant, p_device_id, 'device_quarantined', 'high',
     jsonb_build_object('reason', p_reason));
END;
$$;

-- ============================================================================
-- 8. OUTBOX / RETRY WORKERS
-- ============================================================================

CREATE OR REPLACE FUNCTION dypos.claim_integration_outbox(
  p_limit INTEGER DEFAULT 100
)
RETURNS SETOF dypos.integration_outbox
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
      FROM dypos.integration_outbox
     WHERE status = 'pending'
       AND next_attempt_at <= clock_timestamp()
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(p_limit, 1)
  )
  UPDATE dypos.integration_outbox o
     SET status = 'processing',
         attempts = attempts + 1
    FROM picked
   WHERE o.id = picked.id
  RETURNING o.*;
END;
$$;

CREATE OR REPLACE FUNCTION dypos.complete_integration_outbox(
  p_id UUID,
  p_success BOOLEAN,
  p_error TEXT DEFAULT NULL,
  p_retry_seconds INTEGER DEFAULT 60
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE dypos.integration_outbox
     SET status = CASE WHEN p_success THEN 'sent'
                       WHEN attempts >= 10 THEN 'dead_letter'
                       ELSE 'pending' END,
         last_error = CASE WHEN p_success THEN NULL ELSE p_error END,
         next_attempt_at = CASE
           WHEN p_success THEN next_attempt_at
           ELSE clock_timestamp() + make_interval(secs => GREATEST(p_retry_seconds, 1))
         END,
         sent_at = CASE WHEN p_success THEN clock_timestamp() ELSE sent_at END
   WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION dypos.claim_notification_outbox(
  p_limit INTEGER DEFAULT 100
)
RETURNS SETOF dypos.notification_outbox
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
      FROM dypos.notification_outbox
     WHERE status = 'pending'
       AND next_attempt_at <= clock_timestamp()
     ORDER BY created_at
     FOR UPDATE SKIP LOCKED
     LIMIT GREATEST(p_limit, 1)
  )
  UPDATE dypos.notification_outbox n
     SET status = 'processing',
         attempts = attempts + 1
    FROM picked
   WHERE n.id = picked.id
  RETURNING n.*;
END;
$$;

-- ============================================================================
-- 9. PROMOTION SAFETY
-- ============================================================================

CREATE OR REPLACE FUNCTION dypos.redeem_coupon(
  p_tenant_id UUID,
  p_coupon_code TEXT,
  p_customer_id UUID,
  p_invoice_id UUID,
  p_discount_amount NUMERIC,
  p_idempotency_key TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_coupon dypos.promotion_coupons%ROWTYPE;
  v_redemption UUID;
BEGIN
  SELECT pc.*
    INTO v_coupon
    FROM dypos.promotion_coupons pc
   WHERE pc.tenant_id = p_tenant_id
     AND pc.code = p_coupon_code
     AND pc.is_active = TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coupon is invalid or inactive';
  END IF;

  IF v_coupon.valid_from IS NOT NULL AND clock_timestamp() < v_coupon.valid_from THEN
    RAISE EXCEPTION 'Coupon is not active yet';
  END IF;

  IF v_coupon.valid_to IS NOT NULL AND clock_timestamp() > v_coupon.valid_to THEN
    RAISE EXCEPTION 'Coupon has expired';
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.used_count >= v_coupon.max_uses THEN
    RAISE EXCEPTION 'Coupon usage limit reached';
  END IF;

  INSERT INTO dypos.promotion_redemptions
    (tenant_id, promotion_id, coupon_id, customer_id, invoice_id,
     discount_amount, idempotency_key)
  VALUES
    (p_tenant_id, v_coupon.promotion_id, v_coupon.id, p_customer_id,
     p_invoice_id, p_discount_amount, p_idempotency_key)
  ON CONFLICT (tenant_id, idempotency_key)
  DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
  RETURNING id INTO v_redemption;

  UPDATE dypos.promotion_coupons
     SET used_count = used_count + 1
   WHERE id = v_coupon.id
     AND NOT EXISTS (
       SELECT 1
         FROM dypos.promotion_redemptions r
        WHERE r.id = v_redemption
          AND r.redeemed_at < clock_timestamp() - INTERVAL '1 second'
     );

  RETURN v_redemption;
END;
$$;

-- ============================================================================
-- 10. PAYMENT / REFUND SAFETY
-- ============================================================================

CREATE OR REPLACE FUNCTION dypos.payment_refunded_amount(
  p_payment_id UUID
)
RETURNS NUMERIC(20,6)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(amount),0)
    FROM dypos.payment_refunds
   WHERE payment_transaction_id = p_payment_id
     AND status = 'completed'
$$;

CREATE OR REPLACE FUNCTION dypos.validate_refund_amount()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_payment_amount NUMERIC(20,6);
  v_refunded NUMERIC(20,6);
BEGIN
  SELECT amount INTO v_payment_amount
    FROM dypos.payment_transactions
   WHERE id = NEW.payment_transaction_id
   FOR UPDATE;

  IF v_payment_amount IS NULL THEN
    RAISE EXCEPTION 'Payment transaction not found';
  END IF;

  SELECT COALESCE(SUM(amount),0)
    INTO v_refunded
    FROM dypos.payment_refunds
   WHERE payment_transaction_id = NEW.payment_transaction_id
     AND status IN ('requested','completed')
     AND id <> COALESCE(NEW.id, gen_random_uuid());

  IF v_refunded + NEW.amount > v_payment_amount THEN
    RAISE EXCEPTION 'Refund exceeds captured payment amount';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_refund_amount ON dypos.payment_refunds;
CREATE TRIGGER trg_validate_refund_amount
BEFORE INSERT OR UPDATE OF amount, status ON dypos.payment_refunds
FOR EACH ROW EXECUTE FUNCTION dypos.validate_refund_amount();

-- ============================================================================
-- 11. ORDER TOTAL VALIDATION
-- ============================================================================

CREATE OR REPLACE FUNCTION dypos.recalculate_order_total(p_order_id UUID)
RETURNS NUMERIC(20,6)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(total_amount),0)
    FROM dypos.order_items
   WHERE order_id = p_order_id
$$;

CREATE OR REPLACE FUNCTION dypos.sync_order_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_order_id UUID;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);

  UPDATE dypos.orders
     SET total_amount = dypos.recalculate_order_total(v_order_id)
   WHERE id = v_order_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_total ON dypos.order_items;
CREATE TRIGGER trg_sync_order_total
AFTER INSERT OR UPDATE OF quantity, unit_price, discount_amount, tax_amount, total_amount
OR DELETE ON dypos.order_items
FOR EACH ROW EXECUTE FUNCTION dypos.sync_order_total();

-- ============================================================================
-- 12. STATUS TIMELINE / KDS AUTOMATION
-- ============================================================================

CREATE OR REPLACE FUNCTION dypos.kitchen_status_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'preparing' AND OLD.status NOT IN ('queued','accepted','preparing') THEN
    RAISE EXCEPTION 'Invalid KDS transition % -> %', OLD.status, NEW.status;
  END IF;

  IF NEW.status = 'ready' AND NEW.ready_at IS NULL THEN
    NEW.ready_at := clock_timestamp();
  END IF;

  IF NEW.status = 'served' AND NEW.served_at IS NULL THEN
    NEW.served_at := clock_timestamp();
  END IF;

  IF NEW.status = 'preparing' AND NEW.started_at IS NULL THEN
    NEW.started_at := clock_timestamp();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kitchen_status_guard ON dypos.kitchen_tickets;
CREATE TRIGGER trg_kitchen_status_guard
BEFORE UPDATE OF status ON dypos.kitchen_tickets
FOR EACH ROW EXECUTE FUNCTION dypos.kitchen_status_guard();

-- ============================================================================
-- 13. DATA QUALITY / HEALTH FUNCTIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION dypos.health_check()
RETURNS TABLE (
  check_name TEXT,
  status TEXT,
  metric NUMERIC,
  details TEXT
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    'unbalanced_posted_journals',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'FAIL' END,
    COUNT(*)::NUMERIC,
    'Posted journals with unequal debit/credit totals'
  FROM (
    SELECT je.id
      FROM dypos.journal_entries je
      JOIN dypos.journal_lines jl ON jl.journal_entry_id = je.id
     WHERE je.status = 'posted'
     GROUP BY je.id
    HAVING SUM(jl.debit) <> SUM(jl.credit) OR SUM(jl.debit) = 0
  ) x

  UNION ALL

  SELECT
    'pending_sync_operations',
    CASE WHEN COUNT(*) < 10000 THEN 'OK' ELSE 'WARN' END,
    COUNT(*)::NUMERIC,
    'Pending sync operations'
  FROM dypos.sync_operations
  WHERE status = 'pending'

  UNION ALL

  SELECT
    'dead_letter_integrations',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARN' END,
    COUNT(*)::NUMERIC,
    'Integration messages in dead-letter state'
  FROM dypos.integration_outbox
  WHERE status = 'dead_letter'

  UNION ALL

  SELECT
    'quarantined_devices',
    CASE WHEN COUNT(*) = 0 THEN 'OK' ELSE 'WARN' END,
    COUNT(*)::NUMERIC,
    'Devices requiring security review'
  FROM dypos.devices
  WHERE status = 'quarantined';
$$;

-- ============================================================================
-- 14. MATERIALIZED REPORTING VIEWS
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS dypos.mv_daily_accounting_summary AS
SELECT
  tenant_id,
  entry_date,
  currency_code,
  SUM(debit) AS debit_total,
  SUM(credit) AS credit_total,
  COUNT(DISTINCT journal_entry_id) AS journal_count
FROM dypos.v_general_ledger
GROUP BY tenant_id, entry_date, currency_code
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_daily_accounting_summary
  ON dypos.mv_daily_accounting_summary(tenant_id, entry_date, currency_code);

CREATE MATERIALIZED VIEW IF NOT EXISTS dypos.mv_daily_order_summary AS
SELECT
  tenant_id,
  branch_id,
  (created_at AT TIME ZONE 'UTC')::DATE AS order_date,
  order_type,
  status,
  COUNT(*) AS order_count,
  SUM(total_amount) AS total_amount
FROM dypos.orders
GROUP BY tenant_id, branch_id,
         (created_at AT TIME ZONE 'UTC')::DATE,
         order_type, status
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS ux_mv_daily_order_summary
  ON dypos.mv_daily_order_summary(
    tenant_id, branch_id, order_date, order_type, status
  );

CREATE OR REPLACE PROCEDURE dypos.refresh_reporting_views()
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY dypos.mv_daily_accounting_summary;
  REFRESH MATERIALIZED VIEW CONCURRENTLY dypos.mv_daily_order_summary;
END;
$$;

-- ============================================================================
-- 15. MAINTENANCE PROCEDURES
-- ============================================================================

CREATE OR REPLACE PROCEDURE dypos.close_accounting_period(
  p_period_id UUID,
  p_closed_by UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant UUID;
  v_status TEXT;
  v_unbalanced BIGINT;
BEGIN
  SELECT tenant_id, status
    INTO v_tenant, v_status
    FROM dypos.accounting_periods
   WHERE id = p_period_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Accounting period not found';
  END IF;

  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'Accounting period is already locked';
  END IF;

  SELECT COUNT(*)
    INTO v_unbalanced
    FROM (
      SELECT je.id
        FROM dypos.journal_entries je
        JOIN dypos.journal_lines jl ON jl.journal_entry_id = je.id
       WHERE je.period_id = p_period_id
         AND je.status = 'posted'
       GROUP BY je.id
      HAVING SUM(jl.debit) <> SUM(jl.credit) OR SUM(jl.debit) = 0
    ) x;

  IF v_unbalanced > 0 THEN
    RAISE EXCEPTION 'Cannot close period: % unbalanced journals', v_unbalanced;
  END IF;

  UPDATE dypos.accounting_periods
     SET status = 'closed',
         closed_at = clock_timestamp(),
         closed_by = p_closed_by
   WHERE id = p_period_id;
END;
$$;

CREATE OR REPLACE PROCEDURE dypos.purge_old_sync_operations(
  p_before TIMESTAMPTZ,
  p_batch_size INTEGER DEFAULT 10000
)
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM dypos.sync_operations
   WHERE id IN (
     SELECT id
       FROM dypos.sync_operations
      WHERE status = 'applied'
        AND applied_at < p_before
      ORDER BY applied_at
      LIMIT GREATEST(p_batch_size, 1)
   );
END;
$$;

-- ============================================================================
-- 16. INDEXES — ENGINEERING / QUERY PATHS
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_journal_entries_source
  ON dypos.journal_entries(tenant_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_journal_entries_period_status
  ON dypos.journal_entries(tenant_id, period_id, status, entry_date);

CREATE INDEX IF NOT EXISTS idx_journal_lines_entry_line
  ON dypos.journal_lines(journal_entry_id, line_no);

CREATE INDEX IF NOT EXISTS idx_ar_due
  ON dypos.accounts_receivable(tenant_id, status, due_date)
  WHERE outstanding_amount > 0;

CREATE INDEX IF NOT EXISTS idx_ap_due
  ON dypos.accounts_payable(tenant_id, status, due_date)
  WHERE outstanding_amount > 0;

CREATE INDEX IF NOT EXISTS idx_coupon_active
  ON dypos.promotion_coupons(tenant_id, code)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_promotion_redemption_customer
  ON dypos.promotion_redemptions(tenant_id, customer_id, redeemed_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_status_time
  ON dypos.payment_transactions(tenant_id, status, initiated_at DESC);

CREATE INDEX IF NOT EXISTS idx_refunds_payment
  ON dypos.payment_refunds(tenant_id, payment_transaction_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_customer_time
  ON dypos.orders(tenant_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON dypos.order_items(product_id, order_id);

CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_open
  ON dypos.kitchen_tickets(tenant_id, station_id, queued_at)
  WHERE status IN ('queued','accepted','preparing','ready');

CREATE INDEX IF NOT EXISTS idx_devices_last_seen
  ON dypos.devices(tenant_id, status, last_seen_at);

CREATE INDEX IF NOT EXISTS idx_sync_tombstones_deleted
  ON dypos.sync_tombstones(tenant_id, deleted_at);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON dypos.audit_log(tenant_id, entity_type, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_event_severity
  ON dypos.security_events(tenant_id, severity, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_user_unread
  ON dypos.notifications(tenant_id, user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON dypos.notification_outbox(status, next_attempt_at)
  WHERE status IN ('pending','processing');

CREATE INDEX IF NOT EXISTS idx_integration_inbox_unprocessed
  ON dypos.integration_inbox(tenant_id, received_at)
  WHERE status = 'received';

-- JSONB indexes only where containment queries are expected.
CREATE INDEX IF NOT EXISTS idx_promotion_conditions_gin
  ON dypos.promotions USING GIN (conditions_json);

CREATE INDEX IF NOT EXISTS idx_promotion_rewards_gin
  ON dypos.promotions USING GIN (reward_json);

CREATE INDEX IF NOT EXISTS idx_device_metadata_gin
  ON dypos.devices USING GIN (metadata);

-- ============================================================================
-- 17. COMMENTS / DATABASE DOCUMENTATION
-- ============================================================================

COMMENT ON SCHEMA dypos IS
'DyPOS production database extension: accounting, payments, offline sync, integrations, audit and operational reporting.';

COMMENT ON FUNCTION dypos.current_tenant_id() IS
'Returns tenant context supplied by the trusted application transaction.';

COMMENT ON FUNCTION dypos.require_tenant_context() IS
'Fails closed when no tenant context is available.';

COMMENT ON FUNCTION dypos.validate_journal_entry(UUID) IS
'Validates double-entry balance before posting.';

COMMENT ON VIEW dypos.v_trial_balance IS
'Posted double-entry trial balance by tenant and account.';

COMMENT ON VIEW dypos.v_general_ledger IS
'Posted general ledger lines with source references.';

COMMENT ON VIEW dypos.v_sync_health IS
'Operational health of registered offline devices and sync queues.';

COMMENT ON VIEW dypos.v_outbox_health IS
'Operational health of integration outbox queues.';

-- ============================================================================
-- 18. MIGRATION REGISTRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS dypos.schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  checksum TEXT,
  description TEXT
);

INSERT INTO dypos.schema_migrations(version, checksum, description)
VALUES (
  'database-engine-v101-v130',
  md5('DyPOS database engine v101-v130'),
  'Production views, functions, procedures, triggers, audit engine, RLS hardening, health checks, materialized reporting and operational indexes'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;

/*
===============================================================================
DEPLOYMENT NOTES
===============================================================================
1. Apply v41-v100 first.
2. Apply this pack second.
3. Application must SET LOCAL app.tenant_id = '<tenant UUID>' inside every
   authenticated database transaction before accessing RLS protected tables.
4. Application should also set app.user_id, app.device_id and app.request_id.
5. The application/service layer must remain responsible for:
   - authorization
   - payment provider credentials
   - secret storage
   - tax/fiscal compliance rules by country
   - business-specific promotion calculation
   - physical inventory allocation
6. Refresh materialized views from a scheduler/worker, not from the POS request.
7. Use pg_dump/restore tests and staging verification before production.
8. For very large append-only tables, add partitioning only after measuring real
   production volume and retention requirements.
===============================================================================
*/
/*
  DyPOS — FINAL GLOBAL PRODUCTION COMPLEMENT
  Target: PostgreSQL 14+
  Baseline: DyPOS v1.36.0 + complementary v24-v40
  Purpose: enterprise-grade additive schema hardening.

  IMPORTANT:
  - This pack is intentionally additive and avoids destructive DROP/ALTER TYPE.
  - Run first in staging, then production under a controlled migration window.
  - Existing legacy UUID/TEXT/REAL columns are not silently retyped here.
  - Business application cutover/backfill remains a separate migration concern.
*/

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS dypos;

-- ============================================================
-- 1) GLOBAL / TENANT SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.system_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dypos.tenant_features (
  tenant_id UUID NOT NULL,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, feature_key)
);

-- ============================================================
-- 2) DOUBLE-ENTRY ACCOUNTING
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.accounting_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','soft_closed','closed','locked')),
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start, period_end),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS dypos.chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  parent_id UUID REFERENCES dypos.chart_of_accounts(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL
    CHECK (account_type IN ('asset','liability','equity','revenue','expense','contra_asset','contra_revenue')),
  normal_balance TEXT NOT NULL
    CHECK (normal_balance IN ('debit','credit')),
  currency_code CHAR(3),
  is_control_account BOOLEAN NOT NULL DEFAULT FALSE,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS dypos.journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID,
  period_id UUID REFERENCES dypos.accounting_periods(id),
  entry_no BIGINT,
  entry_date DATE NOT NULL,
  source_type TEXT,
  source_id UUID,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'posted'
    CHECK (status IN ('draft','posted','reversed','void')),
  reversal_of_id UUID REFERENCES dypos.journal_entries(id),
  currency_code CHAR(3),
  exchange_rate NUMERIC(20,10) NOT NULL DEFAULT 1,
  idempotency_key TEXT,
  posted_at TIMESTAMPTZ,
  posted_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS dypos.journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL REFERENCES dypos.journal_entries(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES dypos.chart_of_accounts(id),
  line_no INTEGER NOT NULL,
  description TEXT,
  debit NUMERIC(20,6) NOT NULL DEFAULT 0,
  credit NUMERIC(20,6) NOT NULL DEFAULT 0,
  currency_code CHAR(3),
  exchange_rate NUMERIC(20,10) NOT NULL DEFAULT 1,
  dimension_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (debit >= 0 AND credit >= 0),
  CHECK ((debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0)),
  UNIQUE (journal_entry_id, line_no)
);

CREATE OR REPLACE FUNCTION dypos.assert_balanced_journal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  d NUMERIC(30,6);
  c NUMERIC(30,6);
BEGIN
  IF NEW.status = 'posted' THEN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0)
      INTO d,c
      FROM dypos.journal_lines
     WHERE journal_entry_id = NEW.id;
    IF d <> c OR d = 0 THEN
      RAISE EXCEPTION 'Journal entry % is not balanced', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_balanced_journal ON dypos.journal_entries;
CREATE CONSTRAINT TRIGGER trg_assert_balanced_journal
AFTER INSERT OR UPDATE OF status ON dypos.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION dypos.assert_balanced_journal();

CREATE TABLE IF NOT EXISTS dypos.accounts_receivable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  customer_id UUID,
  invoice_id UUID,
  currency_code CHAR(3) NOT NULL,
  original_amount NUMERIC(20,6) NOT NULL,
  outstanding_amount NUMERIC(20,6) NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','partially_paid','paid','overdue','void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (original_amount >= 0 AND outstanding_amount >= 0 AND outstanding_amount <= original_amount)
);

CREATE TABLE IF NOT EXISTS dypos.accounts_payable (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  supplier_id UUID,
  document_id UUID,
  currency_code CHAR(3) NOT NULL,
  original_amount NUMERIC(20,6) NOT NULL,
  outstanding_amount NUMERIC(20,6) NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','partially_paid','paid','overdue','void')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (original_amount >= 0 AND outstanding_amount >= 0 AND outstanding_amount <= original_amount)
);

-- ============================================================
-- 3) CURRENCY / FX
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.currencies (
  code CHAR(3) PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT,
  minor_units SMALLINT NOT NULL DEFAULT 2 CHECK (minor_units BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dypos.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  base_currency CHAR(3) NOT NULL REFERENCES dypos.currencies(code),
  quote_currency CHAR(3) NOT NULL REFERENCES dypos.currencies(code),
  rate NUMERIC(20,10) NOT NULL CHECK (rate > 0),
  valid_from TIMESTAMPTZ NOT NULL,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, base_currency, quote_currency, valid_from)
);

-- ============================================================
-- 4) UNITS / PACKAGING / CONVERSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.units_of_measure (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dimension TEXT NOT NULL,
  precision_scale SMALLINT NOT NULL DEFAULT 3 CHECK (precision_scale BETWEEN 0 AND 9),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS dypos.unit_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID,
  from_unit TEXT NOT NULL REFERENCES dypos.units_of_measure(code),
  to_unit TEXT NOT NULL REFERENCES dypos.units_of_measure(code),
  factor NUMERIC(30,12) NOT NULL CHECK (factor > 0),
  is_exact BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, product_id, from_unit, to_unit)
);

-- ============================================================
-- 5) PROMOTIONS / COUPONS / DISCOUNT GOVERNANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  promotion_type TEXT NOT NULL
    CHECK (promotion_type IN ('percentage','fixed','buy_x_get_y','bundle','coupon','tiered')),
  priority INTEGER NOT NULL DEFAULT 100,
  stackable BOOLEAN NOT NULL DEFAULT FALSE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reward_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  max_redemptions BIGINT,
  max_redemptions_per_customer BIGINT,
  redemption_count BIGINT NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_at IS NULL OR end_at >= start_at)
);

CREATE TABLE IF NOT EXISTS dypos.promotion_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  promotion_id UUID NOT NULL REFERENCES dypos.promotions(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  max_uses BIGINT,
  used_count BIGINT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS dypos.promotion_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  promotion_id UUID NOT NULL REFERENCES dypos.promotions(id),
  coupon_id UUID REFERENCES dypos.promotion_coupons(id),
  customer_id UUID,
  invoice_id UUID,
  discount_amount NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT,
  UNIQUE (tenant_id, idempotency_key)
);

-- ============================================================
-- 6) PAYMENT ABSTRACTION / RECONCILIATION
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.payment_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider_code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  config_ref TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider_code)
);

CREATE TABLE IF NOT EXISTS dypos.payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID,
  invoice_id UUID,
  provider_id UUID REFERENCES dypos.payment_providers(id),
  method_code TEXT NOT NULL,
  external_transaction_id TEXT,
  idempotency_key TEXT NOT NULL,
  amount NUMERIC(20,6) NOT NULL CHECK (amount >= 0),
  currency_code CHAR(3) NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('initiated','authorized','captured','settled','failed','voided','refunded','partially_refunded')),
  provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (tenant_id, provider_id, external_transaction_id)
);

CREATE TABLE IF NOT EXISTS dypos.payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  payment_transaction_id UUID NOT NULL REFERENCES dypos.payment_transactions(id),
  amount NUMERIC(20,6) NOT NULL CHECK (amount > 0),
  reason TEXT,
  external_refund_id TEXT,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('requested','completed','failed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS dypos.payment_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  provider_id UUID REFERENCES dypos.payment_providers(id),
  statement_ref TEXT,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  expected_amount NUMERIC(20,6) NOT NULL DEFAULT 0,
  settled_amount NUMERIC(20,6) NOT NULL DEFAULT 0,
  difference_amount NUMERIC(20,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','matched','partial','exception','closed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

-- ============================================================
-- 7) ORDER / RESERVATION / DELIVERY
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID,
  customer_id UUID,
  order_no BIGINT,
  order_type TEXT NOT NULL
    CHECK (order_type IN ('sale','pickup','delivery','dine_in','reservation','service')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','confirmed','preparing','ready','dispatched','completed','cancelled','failed')),
  source TEXT,
  scheduled_at TIMESTAMPTZ,
  delivery_address_json JSONB,
  notes TEXT,
  total_amount NUMERIC(20,6) NOT NULL DEFAULT 0,
  currency_code CHAR(3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dypos.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES dypos.orders(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  product_id UUID,
  description TEXT,
  quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(20,6) NOT NULL CHECK (unit_price >= 0),
  discount_amount NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(20,6) NOT NULL CHECK (total_amount >= 0),
  UNIQUE (order_id, line_no)
);

CREATE TABLE IF NOT EXISTS dypos.reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID,
  customer_id UUID,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  party_size INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','seated','completed','cancelled','no_show')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS dypos.delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID,
  name TEXT NOT NULL,
  fee NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  minimum_order_amount NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (minimum_order_amount >= 0),
  estimated_minutes INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, branch_id, name)
);

CREATE TABLE IF NOT EXISTS dypos.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL REFERENCES dypos.orders(id),
  zone_id UUID REFERENCES dypos.delivery_zones(id),
  driver_id UUID,
  address_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','assigned','picked_up','in_transit','delivered','failed','cancelled')),
  fee NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (fee >= 0),
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  proof_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 8) RESTAURANT KDS
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.kitchen_stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  station_type TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, branch_id, code)
);

CREATE TABLE IF NOT EXISTS dypos.kitchen_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID,
  order_id UUID REFERENCES dypos.orders(id),
  station_id UUID REFERENCES dypos.kitchen_stations(id),
  ticket_no BIGINT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','accepted','preparing','ready','served','cancelled')),
  priority INTEGER NOT NULL DEFAULT 100,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  served_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS dypos.kitchen_ticket_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES dypos.kitchen_tickets(id) ON DELETE CASCADE,
  order_item_id UUID,
  product_id UUID,
  quantity NUMERIC(20,6) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','preparing','ready','served','cancelled')),
  modifiers_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- ============================================================
-- 9) DEVICE / OFFLINE-FIRST / SYNC HARDENING
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  branch_id UUID,
  terminal_id UUID,
  device_uid TEXT NOT NULL,
  device_type TEXT NOT NULL,
  public_key TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('pending','active','revoked','quarantined')),
  last_seen_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, device_uid)
);

CREATE TABLE IF NOT EXISTS dypos.sync_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  device_id UUID REFERENCES dypos.devices(id),
  batch_no BIGINT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('upload','download')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'started'
    CHECK (status IN ('started','completed','partial','failed','quarantined')),
  item_count INTEGER NOT NULL DEFAULT 0,
  checksum TEXT,
  UNIQUE (tenant_id, device_id, batch_no, direction)
);

CREATE TABLE IF NOT EXISTS dypos.sync_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  batch_id UUID REFERENCES dypos.sync_batches(id) ON DELETE CASCADE,
  device_id UUID REFERENCES dypos.devices(id),
  sequence_no BIGINT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','delete')),
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  applied_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','applied','rejected','conflict','quarantined')),
  error_code TEXT,
  UNIQUE (tenant_id, device_id, sequence_no)
);

CREATE TABLE IF NOT EXISTS dypos.sync_tombstones (
  tenant_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_id UUID,
  PRIMARY KEY (tenant_id, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS dypos.sync_conflict_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  conflict_id UUID NOT NULL,
  resolution TEXT NOT NULL CHECK (resolution IN ('server_wins','client_wins','merge','reject','manual')),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- ============================================================
-- 10) AUDIT / SECURITY / DATA GOVERNANCE
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.audit_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID,
  branch_id UUID,
  actor_user_id UUID,
  device_id UUID,
  request_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_json JSONB,
  after_json JSONB,
  reason TEXT,
  ip INET,
  user_agent TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dypos.security_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID,
  actor_user_id UUID,
  device_id UUID,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','low','medium','high','critical')),
  request_id TEXT,
  ip INET,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dypos.data_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  retention_days INTEGER NOT NULL CHECK (retention_days >= 0),
  archive_after_days INTEGER,
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, entity_type)
);

-- ============================================================
-- 11) NOTIFICATIONS / OPERATIONAL ALERTS
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','success','warning','error','critical')),
  channel TEXT NOT NULL DEFAULT 'in_app'
    CHECK (channel IN ('in_app','email','sms','push','webhook')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','delivered','failed','read','cancelled')),
  data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dypos.notification_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  notification_id UUID REFERENCES dypos.notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  destination TEXT,
  payload JSONB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','failed','dead_letter')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 12) INTEGRATION / WEBHOOK / OUTBOX
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.integration_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  endpoint_type TEXT NOT NULL,
  base_url TEXT,
  secret_ref TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS dypos.integration_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  endpoint_id UUID REFERENCES dypos.integration_endpoints(id),
  event_type TEXT NOT NULL,
  aggregate_type TEXT,
  aggregate_id UUID,
  payload JSONB NOT NULL,
  idempotency_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','sent','failed','dead_letter')),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  UNIQUE (tenant_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS dypos.integration_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  endpoint_id UUID REFERENCES dypos.integration_endpoints(id),
  external_event_id TEXT NOT NULL,
  event_type TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processed','failed','ignored')),
  error TEXT,
  UNIQUE (tenant_id, endpoint_id, external_event_id)
);

-- ============================================================
-- 13) ROW-LEVEL SECURITY FOUNDATION
-- ============================================================

CREATE OR REPLACE FUNCTION dypos.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

-- Enable RLS on core new tenant-scoped tables.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_features','accounting_periods','chart_of_accounts',
    'journal_entries','accounts_receivable','accounts_payable',
    'exchange_rates','unit_conversions','promotions','promotion_coupons',
    'promotion_redemptions','payment_providers','payment_transactions',
    'payment_refunds','payment_reconciliations','orders','reservations',
    'delivery_zones','deliveries','kitchen_stations','kitchen_tickets',
    'devices','sync_batches','sync_operations','sync_tombstones',
    'sync_conflict_resolutions','audit_log','security_events',
    'data_retention_policies','notifications','notification_outbox',
    'integration_endpoints','integration_outbox','integration_inbox'
  ]
  LOOP
    EXECUTE format('ALTER TABLE dypos.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON dypos.%I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON dypos.%I USING (tenant_id = dypos.current_tenant_id()) WITH CHECK (tenant_id = dypos.current_tenant_id())',
      t
    );
  END LOOP;
END $$;

-- journal_lines inherit tenant isolation through parent entry in application logic;
-- direct RLS is intentionally omitted because tenant_id is not duplicated.

-- ============================================================
-- 14) INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_journal_entries_tenant_date
  ON dypos.journal_entries(tenant_id, entry_date, id);

CREATE INDEX IF NOT EXISTS idx_journal_lines_account
  ON dypos.journal_lines(account_id, journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_ar_customer_status
  ON dypos.accounts_receivable(tenant_id, customer_id, status);

CREATE INDEX IF NOT EXISTS idx_ap_supplier_status
  ON dypos.accounts_payable(tenant_id, supplier_id, status);

CREATE INDEX IF NOT EXISTS idx_fx_lookup
  ON dypos.exchange_rates(tenant_id, base_currency, quote_currency, valid_from DESC);

CREATE INDEX IF NOT EXISTS idx_promotions_active_window
  ON dypos.promotions(tenant_id, is_active, start_at, end_at);

CREATE INDEX IF NOT EXISTS idx_payment_tx_invoice
  ON dypos.payment_transactions(tenant_id, invoice_id, status);

CREATE INDEX IF NOT EXISTS idx_payment_tx_external
  ON dypos.payment_transactions(tenant_id, external_transaction_id);

CREATE INDEX IF NOT EXISTS idx_orders_status
  ON dypos.orders(tenant_id, branch_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reservations_resource_time
  ON dypos.reservations(tenant_id, resource_type, resource_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_deliveries_status
  ON dypos.deliveries(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kitchen_tickets_station_status
  ON dypos.kitchen_tickets(tenant_id, station_id, status, queued_at);

CREATE INDEX IF NOT EXISTS idx_sync_ops_pending
  ON dypos.sync_operations(tenant_id, device_id, status, sequence_no);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time
  ON dypos.audit_log(tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant_time
  ON dypos.security_events(tenant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbox_pending
  ON dypos.integration_outbox(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_inbox_status
  ON dypos.integration_inbox(tenant_id, status, received_at);

-- ============================================================
-- 15) GENERIC UPDATED_AT
-- ============================================================

CREATE OR REPLACE FUNCTION dypos.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'system_settings','tenant_features','chart_of_accounts',
    'promotions','orders'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON dypos.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON dypos.%I FOR EACH ROW EXECUTE FUNCTION dypos.set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ============================================================
-- 16) MIGRATION REGISTRY
-- ============================================================

CREATE TABLE IF NOT EXISTS dypos.schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT,
  description TEXT
);

INSERT INTO dypos.schema_migrations(version, checksum, description)
VALUES
(
  'global-production-complement-v41-v100',
  md5('DyPOS final global production complement v41-v100'),
  'Accounting, FX, units, promotions, payments, orders, KDS, offline hardening, audit, RLS, outbox and governance'
)
ON CONFLICT (version) DO NOTHING;

COMMIT;

/*
  PRODUCTION CUTOVER CHECKLIST
  1. Backup + restore test.
  2. Execute in staging against a production-like copy.
  3. Validate existing application migrations and table names before enabling FK backfills.
  4. Configure app.tenant_id per authenticated request/transaction before querying RLS tables.
  5. Seed currencies/UOM/chart of accounts.
  6. Backfill AR/AP/promotions/payment/order data only after mapping legacy IDs.
  7. Generate journal entries in application service/transaction boundaries; never trust client totals.
  8. Add application-level authorization in addition to PostgreSQL RLS.
  9. Monitor dead-letter/outbox/sync/audit growth and define retention policies.
  10. Partition very large append-only tables after measuring production volume.
*/
-- ============================================================================
-- DyPOS PostgreSQL Complementary Schema
-- Migration Pack: v24 -> v40
-- Purpose: close structural gaps in the POS / Smart Cashier data model
-- Target: PostgreSQL 14+
--
-- Design principles:
--   * additive / backward-compatible where practical
--   * UUID + timestamptz + NUMERIC for transactional data
--   * tenant/branch scoping
--   * immutable inventory and cash ledgers
--   * idempotent DDL (IF NOT EXISTS / guarded constraints)
--   * no destructive DROP/ALTER TYPE operations
--
-- Existing baseline:
--   DyPOS schema through v23 is assumed to exist.
--   Run after the current schema-postgres.sql.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 0. Helper: migration ledger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- v24: tenant business profile + branch/terminal configuration
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name TEXT,
  legal_name_ar TEXT,
  trade_name TEXT,
  trade_name_ar TEXT,
  vat_number TEXT,
  commercial_registration TEXT,
  country_code CHAR(2) NOT NULL DEFAULT 'YE',
  timezone TEXT NOT NULL DEFAULT 'Asia/Aden',
  base_currency TEXT NOT NULL DEFAULT 'YER',
  tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE,
  fiscal_receipt_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  logo_url TEXT,
  address_json JSONB NOT NULL DEFAULT '{}',
  contact_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS branch_settings (
  branch_id UUID PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
  receipt_header TEXT NOT NULL DEFAULT '',
  receipt_footer TEXT NOT NULL DEFAULT '',
  invoice_prefix TEXT NOT NULL DEFAULT 'INV',
  timezone TEXT,
  currency TEXT,
  tax_inclusive BOOLEAN,
  settings_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pos_terminals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  terminal_code TEXT NOT NULL,
  name TEXT NOT NULL,
  terminal_type TEXT NOT NULL DEFAULT 'POS',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  device_id TEXT,
  printer_device_id TEXT,
  cash_drawer_device_id TEXT,
  scanner_device_id TEXT,
  default_warehouse_id TEXT REFERENCES warehouses(id),
  last_seen_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, terminal_code)
);

CREATE INDEX IF NOT EXISTS idx_pos_terminals_branch
  ON pos_terminals(branch_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_terminals_device
  ON pos_terminals(device_id);

-- ----------------------------------------------------------------------------
-- v25: normalized product catalog
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE INDEX IF NOT EXISTS idx_product_categories_parent
  ON product_categories(parent_id);

CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  barcode_type TEXT NOT NULL DEFAULT 'EAN13',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, barcode)
);

CREATE INDEX IF NOT EXISTS idx_product_barcodes_product
  ON product_barcodes(product_id, is_active);

CREATE TABLE IF NOT EXISTS price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'YER',
  priority INTEGER NOT NULL DEFAULT 100,
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  uom_code TEXT NOT NULL DEFAULT 'Unit',
  min_qty NUMERIC(14,3) NOT NULL DEFAULT 1,
  price NUMERIC(14,4) NOT NULL,
  compare_at_price NUMERIC(14,4),
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (min_qty > 0),
  CHECK (price >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_prices_tier
  ON product_prices(price_list_id, product_id, uom_code, min_qty);

CREATE INDEX IF NOT EXISTS idx_product_prices_product
  ON product_prices(product_id, is_active);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id UUID;
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_uom_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_stock NUMERIC(14,3) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_point NUMERIC(14,3) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_qty NUMERIC(14,3) NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_batch BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS track_serial BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'GOODS';

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(tenant_id, sku);

-- ----------------------------------------------------------------------------
-- v26: tax engine
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  rate NUMERIC(7,4) NOT NULL DEFAULT 0,
  tax_type TEXT NOT NULL DEFAULT 'VAT',
  inclusive BOOLEAN NOT NULL DEFAULT FALSE,
  effective_from DATE,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rate >= 0 AND rate <= 100),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS product_tax_rates (
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  tax_rate_id UUID NOT NULL REFERENCES tax_rates(id) ON DELETE RESTRICT,
  priority INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (product_id, tax_rate_id)
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_exempt_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS rounding_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fiscal_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fiscal_uuid TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS fiscal_qr TEXT;

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_inclusive BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tax_code TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_fiscal_status
  ON invoices(tenant_id, fiscal_status, created_at DESC);

-- ----------------------------------------------------------------------------
-- v27: suppliers + purchasing / receiving
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  phone TEXT,
  email TEXT,
  tax_number TEXT,
  address TEXT,
  payment_terms_days INTEGER NOT NULL DEFAULT 0,
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE RESTRICT,
  warehouse_id TEXT REFERENCES warehouses(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  currency TEXT NOT NULL DEFAULT 'YER',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  ordered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  ordered_qty NUMERIC(14,3) NOT NULL,
  received_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  batch_no TEXT,
  expiry_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  CHECK (ordered_qty > 0),
  CHECK (received_qty >= 0)
);

CREATE INDEX IF NOT EXISTS idx_po_supplier
  ON purchase_orders(supplier_id, ordered_at DESC);

CREATE INDEX IF NOT EXISTS idx_po_status
  ON purchase_orders(tenant_id, status, ordered_at DESC);

-- ----------------------------------------------------------------------------
-- v28: inventory ledger / batches / serials / adjustments / transfers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  batch_no TEXT NOT NULL,
  expiry_date DATE,
  received_at TIMESTAMPTZ,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  qty_received NUMERIC(14,3) NOT NULL DEFAULT 0,
  qty_available NUMERIC(14,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id, warehouse_id, batch_no)
);

CREATE INDEX IF NOT EXISTS idx_batches_expiry
  ON inventory_batches(tenant_id, expiry_date)
  WHERE expiry_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_serials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id TEXT REFERENCES warehouses(id),
  batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
  serial_no TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_STOCK',
  sold_invoice_item_id UUID REFERENCES invoice_items(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ,
  sold_at TIMESTAMPTZ,
  UNIQUE (tenant_id, serial_no)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  movement_type TEXT NOT NULL,
  qty NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(14,4),
  reference_type TEXT,
  reference_id TEXT,
  batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
  serial_id UUID REFERENCES inventory_serials(id) ON DELETE SET NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (qty <> 0)
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_product
  ON inventory_movements(tenant_id, product_id, warehouse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_ref
  ON inventory_movements(reference_type, reference_id);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  reason TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, number)
);

CREATE TABLE IF NOT EXISTS stock_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID NOT NULL REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  system_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  counted_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  difference_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  number TEXT NOT NULL,
  from_warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  to_warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'DRAFT',
  requested_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number),
  CHECK (from_warehouse_id <> to_warehouse_id)
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  requested_qty NUMERIC(14,3) NOT NULL,
  shipped_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  received_qty NUMERIC(14,3) NOT NULL DEFAULT 0,
  CHECK (requested_qty > 0)
);

-- ----------------------------------------------------------------------------
-- v29: cash management + safe reconciliation
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  terminal_code TEXT,
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'YER',
  reference_type TEXT,
  reference_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount > 0),
  CHECK (direction IN ('IN','OUT'))
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift
  ON cash_movements(shift_id, created_at);

CREATE TABLE IF NOT EXISTS cash_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  counted_by UUID REFERENCES users(id),
  counted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  denomination_json JSONB NOT NULL DEFAULT '{}',
  counted_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  expected_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  variance NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT ''
);

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'YER';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS terminal_code TEXT;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opening_count_json JSONB NOT NULL DEFAULT '{}';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closing_count_json JSONB NOT NULL DEFAULT '{}';

-- ----------------------------------------------------------------------------
-- v30: customer credit ledger + AR documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_credit_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  transaction_type TEXT NOT NULL,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_after NUMERIC(14,2) NOT NULL DEFAULT 0,
  reference TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (debit <> 0 OR credit <> 0)
);

CREATE INDEX IF NOT EXISTS idx_customer_credit_ledger
  ON customer_credit_transactions(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_credit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(14,2) NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  received_by UUID REFERENCES users(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount > 0)
);

-- ----------------------------------------------------------------------------
-- v31: sales returns as first-class documents
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES customers(id),
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  reason TEXT NOT NULL DEFAULT '',
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  refund_method TEXT,
  created_by UUID REFERENCES users(id),
  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ,
  UNIQUE (tenant_id, number)
);

CREATE TABLE IF NOT EXISTS sales_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES sales_returns(id) ON DELETE CASCADE,
  invoice_item_id UUID NOT NULL REFERENCES invoice_items(id) ON DELETE RESTRICT,
  product_id UUID REFERENCES products(id) ON DELETE RESTRICT,
  qty NUMERIC(14,3) NOT NULL,
  unit_price NUMERIC(14,4) NOT NULL,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_sales_returns_invoice
  ON sales_returns(invoice_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- v32: POS parked carts / quotes / order lifecycle
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sales_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  terminal_code TEXT,
  customer_id UUID REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'PARKED',
  cart_number TEXT,
  expires_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES sales_carts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty NUMERIC(14,3) NOT NULL,
  unit_price NUMERIC(14,4) NOT NULL,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total NUMERIC(14,2) NOT NULL DEFAULT 0,
  CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_sales_carts_active
  ON sales_carts(tenant_id, status, updated_at DESC);

-- ----------------------------------------------------------------------------
-- v33: restaurant / cafe operational plane
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dining_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (branch_id, name)
);

CREATE TABLE IF NOT EXISTS dining_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES dining_areas(id) ON DELETE CASCADE,
  table_code TEXT NOT NULL,
  name TEXT NOT NULL,
  seats INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'AVAILABLE',
  x NUMERIC(8,2),
  y NUMERIC(8,2),
  metadata JSONB NOT NULL DEFAULT '{}',
  UNIQUE (area_id, table_code),
  CHECK (seats > 0)
);

CREATE TABLE IF NOT EXISTS service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  table_id UUID REFERENCES dining_tables(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  order_number TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'DINE_IN',
  status TEXT NOT NULL DEFAULT 'OPEN',
  guest_count INTEGER NOT NULL DEFAULT 1,
  opened_by UUID REFERENCES users(id),
  closed_by UUID REFERENCES users(id),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (tenant_id, order_number),
  CHECK (guest_count > 0)
);

CREATE TABLE IF NOT EXISTS service_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id UUID NOT NULL REFERENCES service_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty NUMERIC(14,3) NOT NULL,
  unit_price NUMERIC(14,4) NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  kitchen_note TEXT NOT NULL DEFAULT '',
  modifiers_json JSONB NOT NULL DEFAULT '[]',
  sent_to_kitchen_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_service_orders_table
  ON service_orders(table_id, status);

CREATE INDEX IF NOT EXISTS idx_service_order_items_status
  ON service_order_items(service_order_id, status);

-- ----------------------------------------------------------------------------
-- v34: recipe / BOM / modifiers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_modifiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  price_delta NUMERIC(14,4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS product_modifier_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modifier_id UUID NOT NULL REFERENCES product_modifiers(id) ON DELETE CASCADE,
  option_code TEXT NOT NULL,
  name TEXT NOT NULL,
  name_ar TEXT NOT NULL DEFAULT '',
  price_delta NUMERIC(14,4) NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  UNIQUE (modifier_id, option_code)
);

CREATE TABLE IF NOT EXISTS product_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  yield_qty NUMERIC(14,3) NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  UNIQUE (product_id, version),
  CHECK (yield_qty > 0)
);

CREATE TABLE IF NOT EXISTS product_recipe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES product_recipes(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  qty NUMERIC(14,4) NOT NULL,
  waste_percent NUMERIC(7,4) NOT NULL DEFAULT 0,
  CHECK (qty > 0),
  CHECK (waste_percent >= 0 AND waste_percent <= 100)
);

-- ----------------------------------------------------------------------------
-- v35: RBAC / permissions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS permissions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  module TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

INSERT INTO permissions(code,name,module) VALUES
  ('sales.create','Create sales','SALES'),
  ('sales.void','Void sales','SALES'),
  ('sales.discount','Apply discount','SALES'),
  ('sales.return','Return sales','SALES'),
  ('payments.refund','Refund payments','PAYMENTS'),
  ('cash.open_shift','Open shift','CASH'),
  ('cash.close_shift','Close shift','CASH'),
  ('cash.adjust','Cash adjustment','CASH'),
  ('inventory.adjust','Adjust inventory','INVENTORY'),
  ('inventory.transfer','Transfer inventory','INVENTORY'),
  ('inventory.receive','Receive purchases','INVENTORY'),
  ('products.manage','Manage products','CATALOG'),
  ('customers.manage','Manage customers','CRM'),
  ('reports.view','View reports','REPORTS'),
  ('settings.manage','Manage settings','ADMIN'),
  ('users.manage','Manage users','ADMIN'),
  ('integrations.manage','Manage integrations','INTEGRATION')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- v36: offline sync cursor / conflicts / dead-letter
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sync_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  last_server_cursor BIGINT NOT NULL DEFAULT 0,
  last_client_cursor BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, device_id, entity_type)
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  device_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  local_payload JSONB NOT NULL DEFAULT '{}',
  server_payload JSONB NOT NULL DEFAULT '{}',
  resolution TEXT NOT NULL DEFAULT 'PENDING',
  resolved_by UUID REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_conflicts_pending
  ON sync_conflicts(tenant_id, resolution, created_at);

CREATE TABLE IF NOT EXISTS integration_dead_letters (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID,
  integration_run_id BIGINT,
  entity_type TEXT,
  entity_id TEXT,
  error_code TEXT,
  error_message TEXT NOT NULL,
  request_json JSONB NOT NULL DEFAULT '{}',
  response_json JSONB NOT NULL DEFAULT '{}',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- v37: immutable business events / event store
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL DEFAULT 1,
  payload JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_user_id UUID REFERENCES users(id),
  correlation_id TEXT,
  causation_id TEXT,
  idempotency_key TEXT,
  UNIQUE(event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_business_events_idem
  ON business_events(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';

CREATE INDEX IF NOT EXISTS idx_business_events_aggregate
  ON business_events(tenant_id, aggregate_type, aggregate_id, id);

CREATE INDEX IF NOT EXISTS idx_business_events_type_time
  ON business_events(tenant_id, event_type, occurred_at DESC);

-- ----------------------------------------------------------------------------
-- v38: reporting / daily POS snapshot
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pos_daily_snapshots (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  business_date DATE NOT NULL,
  invoices_count INTEGER NOT NULL DEFAULT 0,
  gross_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  discounts NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax NUMERIC(14,2) NOT NULL DEFAULT 0,
  returns NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  cash_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  card_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  wallet_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_sales NUMERIC(14,2) NOT NULL DEFAULT 0,
  cogs NUMERIC(14,2) NOT NULL DEFAULT 0,
  gross_profit NUMERIC(14,2) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, business_date)
);

-- ----------------------------------------------------------------------------
-- v39: safe constraints on existing core monetary/quantity columns
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_unit_price_nonnegative'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_unit_price_nonnegative CHECK (unit_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_cost_nonnegative'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_cost_nonnegative CHECK (cost >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_wallet_nonnegative'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_wallet_nonnegative CHECK (wallet_balance >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_credit_limit_nonnegative'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_credit_limit_nonnegative CHECK (credit_limit >= 0);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- v40: operational indexes for large-scale POS workloads
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_branch_date
  ON invoices(tenant_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoices_customer_status
  ON invoices(tenant_id, customer_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_items_product_invoice
  ON invoice_items(product_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_payments_invoice_created
  ON payments(invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_log_pending
  ON sync_log(tenant_id, status, id)
  WHERE status IN ('PENDING','FAILED');

CREATE INDEX IF NOT EXISTS idx_webhook_outbox_ready
  ON webhook_outbox(status, next_attempt_at, id)
  WHERE status IN ('PENDING','FAILED');

CREATE INDEX IF NOT EXISTS idx_integration_runs_ready
  ON integration_runs(tenant_id, status, next_attempt_at, id)
  WHERE status IN ('PENDING','FAILED');

-- ----------------------------------------------------------------------------
-- updated_at trigger: centralized and reusable
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION dypos_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_settings',
    'branch_settings',
    'pos_terminals',
    'product_categories',
    'brands',
    'price_lists',
    'suppliers',
    'purchase_orders',
    'sales_carts'
  ]
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON %I',
      t, t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION dypos_set_updated_at()',
      t, t
    );
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Register migration versions
-- ----------------------------------------------------------------------------
INSERT INTO schema_migrations(version,name) VALUES
  (24,'tenant and POS terminal configuration'),
  (25,'normalized product catalog and pricing'),
  (26,'tax engine and fiscal fields'),
  (27,'suppliers and purchasing'),
  (28,'inventory ledger batches serials adjustments transfers'),
  (29,'cash management and reconciliation'),
  (30,'customer credit ledger'),
  (31,'sales returns'),
  (32,'parked carts and sales lifecycle'),
  (33,'restaurant and cafe operations'),
  (34,'recipes and modifiers'),
  (35,'RBAC permissions'),
  (36,'offline sync conflicts and dead letters'),
  (37,'immutable business events'),
  (38,'reporting snapshots'),
  (39,'core safety constraints'),
  (40,'large-scale operational indexes')
ON CONFLICT (version) DO NOTHING;

-- Keep legacy schema_version in sync with the highest complementary migration.
INSERT INTO schema_version(version,description)
VALUES (40,'DyPOS complementary schema pack v24-v40')
ON CONFLICT (version) DO NOTHING;

COMMIT;

-- ============================================================================
-- OPTIONAL DATA-BACKFILL / CUTOVER NOTES
-- ============================================================================
-- 1) Populate product_categories/category_id and brands/brand_id from legacy
--    products.category / products.brand before switching application reads.
--
-- 2) Populate product_barcodes from products.barcode.
--
-- 3) Create one price_list per branch/tenant and backfill product_prices from
--    products.unit_price.
--
-- 4) Populate inventory_movements from the application's historical stock
--    transactions if historical auditability is required. Do not fabricate
--    movements from current stock quantities.
--
-- 5) Map existing terminal_id TEXT values to pos_terminals. Keep terminal_code
--    stable during the transition so old invoices/shifts remain readable.
--
-- 6) The existing schema contains a mixture of UUID/TEXT tenant identifiers
--    and some legacy REAL/TEXT tables. This pack deliberately avoids destructive
--    type changes. A separate controlled data migration should normalize those
--    columns after application compatibility is verified.
--
-- 7) For high-volume deployments, partitioning can be introduced later for
--    invoices, invoice_items, inventory_movements, business_events and audit
--    tables by tenant/date. Do this only after measuring actual workload and
--    query plans.

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_idem ON invoices(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND idempotency_key <> '';
