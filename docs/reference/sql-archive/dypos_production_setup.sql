-- ============================================================
-- DYPOS FINAL GLOBAL PRODUCTION DATABASE SETUP
-- Version: 1.36.0 + Global Production Complement v41-v100
-- Target: PostgreSQL 14+
-- ============================================================

-- ============================================================
-- 1. EXTENSIONS AND BASE SCHEMA
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  description TEXT
);

-- Insert base version
INSERT INTO schema_version (version, description) VALUES (1, 'Base DyPOS v1.36.0 schema') ON CONFLICT (version) DO NOTHING;

-- ============================================================
-- 2. CORE TENANT & ORGANIZATION (from complement v41-v100)
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

-- Insert tenant and organization
DO $$
DECLARE
  tenant_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  org_id UUID := '11111111-1111-1111-1111-111111111111'::uuid;
BEGIN
  -- System settings for Royal Global Trading
  INSERT INTO dypos.system_settings (key, value_json, updated_at) VALUES 
    ('business_name', 'Royal العالمية للتجارة'::jsonb, now()),
    ('country_code', 'YE'::jsonb, now()), -- Yemen country code
    ('currency', 'SAR'::jsonb, now()), -- Saudi Riyal
    ('tax_rate_default', '15'::jsonb, now()),
    ('invoice_prefix', 'INV'::jsonb, now()),
    ('timezone', 'Asia/Aden'::jsonb, now());

  -- Tenant
  INSERT INTO dypos.tenant_features (tenant_id, feature_key, enabled, config_json, updated_at) VALUES
    (tenant_id, 'accounting', TRUE, '{"enabled": true}'::jsonb, now()),
    (tenant_id, 'fx', TRUE, '{"enabled": true}'::jsonb, now()),
    (tenant_id, 'promotions', TRUE, '{"enabled": true}'::jsonb, now()),
    (tenant_id, 'payment_providers', TRUE, '{}'::jsonb, now()),
    (tenant_id, 'loyalty', TRUE, '{}'::jsonb, now());

  -- Organization: Royal العالمية للتجارة
  -- We'll use a organizations table reference approach
END $$;

-- ============================================================
-- 3. CURRENCIES (from complement)
-- ============================================================
CREATE TABLE IF NOT EXISTS dypos.currencies (
  code CHAR(3) PRIMARY KEY,
  name TEXT NOT NULL,
  symbol TEXT,
  minor_units SMALLINT NOT NULL DEFAULT 2 CHECK (minor_units BETWEEN 0 AND 6),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Insert currencies
INSERT INTO dypos.currencies (code, name, symbol, minor_units, is_active) VALUES 
  ('SAR', 'Saudi Riyal', 'ر.س', 2, TRUE),
  ('USD', 'US Dollar', '$', 2, TRUE),
  ('YER', 'Yemeni Rial', '﷼', 2, TRUE);

-- ============================================================
-- 4. UNITS OF MEASURE (from complement)
-- ============================================================
CREATE TABLE IF NOT EXISTS dypos.units_of_measure (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dimension TEXT NOT NULL,
  precision_scale SMALLINT NOT NULL DEFAULT 3 CHECK (precision_scale BETWEEN 0 AND 9),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Insert UOMs
INSERT INTO dypos.units_of_measure (code, name, dimension, precision_scale, is_active) VALUES 
  ('Unit', 'قطعة', 'count', 1, TRUE),
  ('PCS', 'Pieces', 'count', 1, TRUE),
  ('DOZEN', 'درزن', 'count', 2, TRUE),
  ('BOX', 'كرتون', 'count', 2, TRUE),
  ('G', 'جرام', 'weight', 3, TRUE),
  ('KG', 'كيلوجرام', 'weight', 3, TRUE),
  ('ML', 'ملليلتر', 'volume', 3, TRUE),
  ('L', 'لتر', 'volume', 3, TRUE),
  ('Set', 'مجموعة', 'count', 1, TRUE),
  ('ml', 'ملليلتر', 'volume', 3, TRUE);

-- ============================================================
-- 5. BUSINESS DATA INSERTION
-- ============================================================

-- 5.1 Tenants and Organizations
DO $$
DECLARE
  royal_tenant_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
  royal_org_id UUID := '11111111-1111-1111-1111-111111111111'::uuid;
  marib_branch_id UUID := '22222222-2222-2222-2222-222222222222'::uuid;
  aden_branch_id UUID := '33333333-3333-3333-3333-333333333333'::uuid;
  sanaa_branch_id UUID := '44444444-4444-4444-4444-444444444444'::uuid;
BEGIN
  -- Insert tenant features already done above
  
  -- Insert organizations (simplified - using UUIDs)
  INSERT INTO dypos.organizations (id, tenant_id, name, code, vat_number, is_active, created_at, updated_at) VALUES
    (royal_org_id, royal_tenant_id, 'Royal العالمية للتجارة', 'RGT', '1000000000', TRUE, now(), now());
  
  -- Insert branches linked to organization
  INSERT INTO dypos.branches (id, org_id, tenant_id, name, code, warehouse_id, is_active, created_at, updated_at) VALUES
    (marib_branch_id, royal_org_id, royal_tenant_id, 'المركب - مارب', 'BR-MARIB', 'W-01', TRUE, now(), now()),
    (aden_branch_id, royal_org_id, royal_tenant_id, 'فرع عدن', 'BR-Aden', 'W-02', TRUE, now(), now()),
    (sanaa_branch_id, royal_org_id, royal_tenant_id, 'فرع صنعاء', 'BR-Sanaa', 'W-03', TRUE, now(), now());
END $$;

-- 5.2 Users (with roles and tenant scoping)
DO $$
DECLARE
  admin_id UUID := '55555555-5555-5555-5555-555555555555'::uuid;
  cashier_marib_id UUID := '66666666-6666-6666-6666-666666666666'::uuid;
  cashier_aden_id UUID := '77777777-7777-7777-7777-777777777777'::uuid;
  cashier_sanaa_id UUID := '88888888-8888-8888-8888-888888888888'::uuid;
BEGIN
  -- Admin user
  INSERT INTO dypos.users (id, username, password_hash, full_name, role, is_active, must_change_password, created_at) VALUES
    (admin_id, 'admin', '$2a$10$dummyhash', 'مدير النظام', 'ADMIN', TRUE, 0, now());
  
  -- Cashier for Marib branch
  INSERT INTO dypos.users (id, username, password_hash, full_name, role, is_active, must_change_password, created_at) VALUES
    (cashier_marib_id, 'cashier1', '$2a$10$dummyhash', 'مشرف مارب', 'CASHIER', TRUE, 0, now());
  
  -- Cashier for Aden branch
  INSERT INTO dypos.users (id, username, password_hash, full_name, role, is_active, must_change_password, created_at) VALUES
    (cashier_aden_id, 'cashier2', '$2a$10$dummyhash', 'مشرف عدن', 'CASHIER', TRUE, 0, now());
  
  -- Cashier for Sana'a branch
  INSERT INTO dypos.users (id, username, password_hash, full_name, role, is_active, must_change_password, created_at) VALUES
    (cashier_sanaa_id, 'cashier3', '$2a$10$dummyhash', 'مشرف صنعاء', 'CASHIER', TRUE, 0, now());
END $$;

-- 5.3 Customers
DO $$
DECLARE
  royal_customer_id UUID := '99999999-9999-9999-9999-999999999999'::uuid;
BEGIN
  INSERT INTO dypos.customers (id, name, phone, email, tax_number, loyalty_tier, loyalty_points, wallet_balance, credit_limit, credit_used, address, is_active, created_at, updated_at) VALUES
    (royal_customer_id, 'Royal العالمية للتجارة', '+967-300123456', 'contact@royal-gt.com', 'Y123456789', 'GOLD', 500, 2500.00, 10000.00, 0, 'صنعاء، المملكة اليمنية', TRUE, now(), now());
END $$;

-- 5.4 Products (perfumes and cosmetics with Arabic names)
DO $$
DECLARE
  p1 UUID := gen_random_uuid();
  p2 UUID := gen_random_uuid();
  p3 UUID := gen_random_uuid();
  p4 UUID := gen_random_uuid();
  p5 UUID := gen_random_uuid();
  p6 UUID := gen_random_uuid();
  p7 UUID := gen_random_uuid();
  p8 UUID := gen_random_uuid();
  p9 UUID := gen_random_uuid();
  p10 UUID := gen_random_uuid();
BEGIN
  -- Perfume 1: Elite Perfume
  INSERT INTO dypos.products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES
    (p1, 'PERF-001', 'Elite Perfume', 'إيليت للم香水', 'ELITE001', 150.00, 90.00, 15, 'Unit', 'Perfumes', 'Elite', TRUE, now(), now());
  
  -- Perfume 2: Royal Oud
  INSERT INTO dypos.products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES
    (p2, 'PERF-002', 'Royal Oud', 'عود王 royalty', 'ROYAL002', 300.00, 180.00, 15, 'Unit', 'Perfumes', 'Royal', TRUE, now(), now());
  
  -- Setting Spray
  INSERT INTO dypos.products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES
    (p3, 'SET-001', 'Setting Spray', 'رذاذ تثبيت', 'SET001', 85.00, 51.00, 15, 'Can', 'Cosmetics', 'Fix & Glow', TRUE, now(), now());
  
  -- Liquid Lipstick
  INSERT INTO dypos.products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES
    (p4, 'LIP-001', 'Liquid Lipstick', ' rouges السائل', 'LIP001', 45.00, 27.00, 15, 'Piece', 'Cosmetics', 'ColorBlast', TRUE, now(), now());
  
  -- Foundation
  INSERT INTO dypos.products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES
    (p5, 'FDN-001', 'Foundation', 'أساس', 'FDN001', 120.00, 72.00, 15, 'Unit', 'Cosmetics', 'GlowMax', TRUE, now(), now());
  
  -- Eyeliner
  INSERT INTO dypos.products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES
    (p6, 'EYE-001', 'Eyeliner', 'آيلاينر', 'EYE001', 30.00, 18.00, 15, 'Piece', 'Cosmetics', 'Kohl', TRUE, now(), now());
  
  -- Powder
  INSERT INTO dypos.products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES
    (p7, 'POW-001', 'Setting Powder', 'بودرة تثبيت', 'POW001', 55.00, 33.00, 15, 'Unit', 'Cosmetics', 'PureFit', TRUE, now(), now());
  
  -- Perfume Oil
  INSERT INTO dypos.products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES
    (p8, 'OIL-001', 'Perfume Oil', 'زيت 香水', 'OIL001', 200.00, 120.00, 15, 'ml', 'Perfumes', 'Oudh', TRUE, now(), now());
  
  -- Makeup Brush Set
  INSERT INTO dypos.products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES
    (p9, 'BR-001', 'Makeup Brush Set', 'فرش المكياج', 'BR001', 95.00, 57.00, 15, 'Set', 'Cosmetics', 'ProBrush', TRUE, now(), now());
  
  -- Perfume Gift Set
  INSERT INTO dypos.products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES
    (p10, 'GIFT-001', 'Perfume Gift Set', ' مجموعة 香水', 'GIFT001', 250.00, 150.00, 15, 'Set', 'Perfumes', 'Gift', TRUE, now(), now());
END $$;

-- ============================================================
-- 6. FINAL VERIFICATION
-- ============================================================
SELECT '=== DATABASE SETUP VERIFICATION ===' AS status;

SELECT 'Tenants: ' || COUNT(*) AS tenant_count FROM dypos.tenant_features WHERE tenant_id = '00000000-0000-0000-0000-000000000001'::uuid;
SELECT 'Organizations: ' || COUNT(*) AS org_count FROM dypos.organizations;
SELECT 'Branches: ' || COUNT(*) AS branch_count FROM dypos.branches;
SELECT 'Users: ' || COUNT(*) AS user_count FROM dypos.users;
SELECT 'Customers: ' || COUNT(*) AS customer_count FROM dypos.customers;
SELECT 'Products: ' || COUNT(*) AS product_count FROM dypos.products;
SELECT 'Currencies: ' || COUNT(*) AS currency_count FROM dypos.currencies;
SELECT 'UOMs: ' || COUNT(*) AS uom_count FROM dypos.units_of_measure;

SELECT '=== ALL DATA INSERTED SUCCESSFULLY ===' AS final_status;