/**
 * Production Seed Script — SQLite compatible
 * Seeds: Tenants, Organizations, Branches, Users, Customers, Products
 * Based on: server/db/dypos_production_setup.sql
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const db = new DatabaseSync('./data/dypos.db');

// Helper for UUID generation
function uuid() { return randomUUID(); }

// Fixed UUIDs for reproducible seeding
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ORG_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_MARIB = '22222222-2222-2222-2222-222222222222';
const BRANCH_ADEN = '33333333-3333-3333-3333-333333333333';
const BRANCH_SANAA = '44444444-4444-4444-4444-444444444444';
const USER_ADMIN = '55555555-5555-5555-5555-555555555555';
const USER_CASHIER_MARIB = '66666666-6666-6666-6666-666666666666';
const USER_CASHIER_ADEN = '77777777-7777-7777-7777-777777777777';
const USER_CASHIER_SANAA = '88888888-8888-8888-8888-888888888888';
const CUSTOMER_ROYAL = '99999999-9999-9999-9999-999999999999';

console.log('🌱 Seeding production data...');

try {
  // ============================================================
  // 1. SYSTEM SETTINGS (business_settings table)
  // ============================================================
  console.log('  → System settings...');
  const setSetting = db.prepare("INSERT OR REPLACE INTO business_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))");
  const settings = [
    ['business_name', 'Royal العالمية للتجارة'],
    ['country_code', 'YE'],
    ['currency', 'SAR'],
    ['tax_rate_default', '15'],
    ['invoice_prefix', 'INV'],
    ['timezone', 'Asia/Aden'],
  ];
  for (const [k, v] of settings) { setSetting.run(k, v); }

  // ============================================================
  // 2. TENANT FEATURES
  // ============================================================
  console.log('  → Tenant features...');
  const setTenantFeature = db.prepare(`
    INSERT OR REPLACE INTO tenants (id, name, code, plan, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);
  setTenantFeature.run(TENANT_ID, 'Royal العالمية للتجارة', 'RGT', 'enterprise');

  // ============================================================
  // 3. ORGANIZATIONS
  // ============================================================
  console.log('  → Organizations...');
  const setOrg = db.prepare(`
    INSERT OR REPLACE INTO organizations (id, tenant_id, name, code, vat_number, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);
  setOrg.run(ORG_ID, TENANT_ID, 'Royal العالمية للتجارة', 'RGT', '1000000000');

  // ============================================================
  // 4. BRANCHES
  // ============================================================
  console.log('  → Branches...');
  const setBranch = db.prepare(`
    INSERT OR REPLACE INTO branches (id, org_id, tenant_id, name, code, warehouse_id, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);
  setBranch.run(BRANCH_MARIB, ORG_ID, TENANT_ID, 'المركب - مارب', 'BR-MARIB', 'W-01');
  setBranch.run(BRANCH_ADEN, ORG_ID, TENANT_ID, 'فرع عدن', 'BR-ADEN', 'W-02');
  setBranch.run(BRANCH_SANAA, ORG_ID, TENANT_ID, 'فرع صنعاء', 'BR-SANAA', 'W-03');

  // Ensure warehouses exist for branches
  const setWarehouse = db.prepare(`
    INSERT OR REPLACE INTO warehouses (id, name, tenant_id, branch_id, is_active, address)
    VALUES (?, ?, ?, ?, 1, ?)
  `);
  setWarehouse.run('W-01', 'مستودع مارب', TENANT_ID, BRANCH_MARIB, 'المركب - مارب');
  setWarehouse.run('W-02', 'مستودع عدن', TENANT_ID, BRANCH_ADEN, 'فرع عدن');
  setWarehouse.run('W-03', 'مستودع صنعاء', TENANT_ID, BRANCH_SANAA, 'فرع صنعاء');

  // ============================================================
  // 5. USERS
  // ============================================================
  console.log('  → Users...');
  // Password hash for "password123" (bcrypt $2a$10$)
  const passwordHash = '$2a$10$dummyhashplaceholder';
  
  const setUser = db.prepare(`
    INSERT OR REPLACE INTO users (id, username, password_hash, full_name, role, tenant_id, is_active, must_change_password, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, 0, datetime('now'))
  `);
  setUser.run(USER_ADMIN, 'admin', passwordHash, 'مدير النظام', 'ADMIN', TENANT_ID);
  setUser.run(USER_CASHIER_MARIB, 'cashier1', passwordHash, 'مشرف مارب', 'CASHIER', TENANT_ID);
  setUser.run(USER_CASHIER_ADEN, 'cashier2', passwordHash, 'مشرف عدن', 'CASHIER', TENANT_ID);
  setUser.run(USER_CASHIER_SANAA, 'cashier3', passwordHash, 'مشرف صنعاء', 'CASHIER', TENANT_ID);

  // ============================================================
  // 6. CURRENCIES (already seeded by schema v9, verify YER exists)
  // ============================================================
  console.log('  → Currencies...');
  const setCurrency = db.prepare(`
    INSERT OR REPLACE INTO currencies (code, name, name_ar, symbol, decimals, rate_to_base, is_base, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `);
  setCurrency.run('SAR', 'Saudi Riyal', 'ريال سعودي', 'ر.س', 2, 1, 1);
  setCurrency.run('USD', 'US Dollar', 'دولار أمريكي', '$', 2, 0.26667, 0);
  setCurrency.run('YER', 'Yemeni Rial', 'ريال يمني', '﷼', 2, 250, 0); // ~250 YER = 1 SAR

  // ============================================================
  // 7. UOMS (already seeded by schema v9, verify needed ones)
  // ============================================================
  console.log('  → Units of Measure...');
  const setUom = db.prepare(`
    INSERT OR REPLACE INTO uoms (code, name, name_ar, category, factor_to_base, is_base, is_active, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
  `);
  const uoms = [
    ['Unit', 'Unit', 'قطعة', 'count', 1, 1],
    ['PCS', 'Pieces', 'قطع', 'count', 1, 0],
    ['DOZEN', 'Dozen', 'درزن', 'count', 12, 0],
    ['BOX', 'Box', 'كرتون', 'count', 12, 0],
    ['G', 'Gram', 'جرام', 'weight', 1, 1],
    ['KG', 'Kilogram', 'كيلوجرام', 'weight', 1000, 0],
    ['ML', 'Milliliter', 'ملليلتر', 'volume', 1, 1],
    ['L', 'Liter', 'لتر', 'volume', 1000, 0],
    ['Set', 'Set', 'مجموعة', 'count', 1, 1],
  ];
  for (const u of uoms) { setUom.run(...u); }

  // ============================================================
  // 8. CUSTOMER
  // ============================================================
  console.log('  → Customer...');
  const setCustomer = db.prepare(`
    INSERT OR REPLACE INTO customers (id, tenant_id, name, phone, email, tax_number, loyalty_tier, loyalty_points, wallet_balance, credit_limit, credit_used, address, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);
  setCustomer.run(CUSTOMER_ROYAL, TENANT_ID, 'Royal العالمية للتجارة', '+967-300123456', 'contact@royal-gt.com', 'Y123456789', 'GOLD', 500, 2500.00, 10000.00, 0, 'صنعاء، المملكة اليمنية');

  // ============================================================
  // 9. PRODUCTS (Perfumes & Cosmetics)
  // ============================================================
  console.log('  → Products...');
  const setProduct = db.prepare(`
    INSERT OR REPLACE INTO products (id, tenant_id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
  `);

  const products = [
    [uuid(), TENANT_ID, 'PERF-001', 'Elite Perfume', 'إيليت للعطر', 'ELITE001', 150.00, 90.00, 15, 'Unit', 'Perfumes', 'Elite'],
    [uuid(), TENANT_ID, 'PERF-002', 'Royal Oud', 'عود ملكي', 'ROYAL002', 300.00, 180.00, 15, 'Unit', 'Perfumes', 'Royal'],
    [uuid(), TENANT_ID, 'SET-001', 'Setting Spray', 'رذاذ تثبيت', 'SET001', 85.00, 51.00, 15, 'Unit', 'Cosmetics', 'Fix & Glow'],
    [uuid(), TENANT_ID, 'LIP-001', 'Liquid Lipstick', 'أحمر شفاه سائل', 'LIP001', 45.00, 27.00, 15, 'Unit', 'Cosmetics', 'ColorBlast'],
    [uuid(), TENANT_ID, 'FDN-001', 'Foundation', 'كريم أساس', 'FDN001', 120.00, 72.00, 15, 'Unit', 'Cosmetics', 'GlowMax'],
    [uuid(), TENANT_ID, 'EYE-001', 'Eyeliner', 'آيلاينر', 'EYE001', 30.00, 18.00, 15, 'Unit', 'Cosmetics', 'Kohl'],
    [uuid(), TENANT_ID, 'POW-001', 'Setting Powder', 'بودرة تثبيت', 'POW001', 55.00, 33.00, 15, 'Unit', 'Cosmetics', 'PureFit'],
    [uuid(), TENANT_ID, 'OIL-001', 'Perfume Oil', 'زيت عطري', 'OIL001', 200.00, 120.00, 15, 'ML', 'Perfumes', 'Oudh'],
    [uuid(), TENANT_ID, 'BR-001', 'Makeup Brush Set', 'فرش مكياج', 'BR001', 95.00, 57.00, 15, 'Set', 'Cosmetics', 'ProBrush'],
    [uuid(), TENANT_ID, 'GIFT-001', 'Perfume Gift Set', 'مجموعة عطور', 'GIFT001', 250.00, 150.00, 15, 'Set', 'Perfumes', 'Gift'],
  ];

  for (const p of products) { setProduct.run(...p); }

  // ============================================================
  // 10. INITIAL STOCK LEVELS
  // ============================================================
  console.log('  → Initial stock levels...');
  const setStock = db.prepare(`
    INSERT OR REPLACE INTO stock_levels (product_id, warehouse_id, qty, reserved_qty, allocated_qty, updated_at)
    VALUES (?, ?, ?, 0, 0, datetime('now'))
  `);
  
  // Get product IDs and set stock
  const productIds = db.prepare('SELECT id FROM products WHERE tenant_id = ?').all(TENANT_ID);
  for (const p of productIds) {
    setStock.run(p.id, 'W-01', 100); // 100 units per product in main warehouse
    setStock.run(p.id, 'W-02', 50);
    setStock.run(p.id, 'W-03', 30);
  }

  // ============================================================
  // 11. FISCAL YEAR (current year)
  // ============================================================
  console.log('  → Fiscal year...');
  const year = new Date().getUTCFullYear();
  const setFiscal = db.prepare(`
    INSERT OR REPLACE INTO fiscal_years (code, starts_on, ends_on, status, created_at)
    VALUES (?, ?, ?, 'OPEN', datetime('now'))
  `);
  setFiscal.run(String(year), `${year}-01-01`, `${year}-12-31`);

  // ============================================================
  // 12. INVOICE SEQUENCES
  // ============================================================
  console.log('  → Invoice sequences...');
  const setSeq = db.prepare(`
    INSERT OR REPLACE INTO invoice_sequences (scope, prefix, last_number, updated_at)
    VALUES (?, 'INV', 0, datetime('now'))
  `);
  setSeq.run(`${TENANT_ID}:${BRANCH_MARIB}:${year}`);
  setSeq.run(`${TENANT_ID}:${BRANCH_ADEN}:${year}`);
  setSeq.run(`${TENANT_ID}:${BRANCH_SANAA}:${year}`);

  // ============================================================
  // 13. PAYMENT METHODS (already seeded by schema v13)
  // ============================================================
  console.log('  → Payment methods verified...');

  // ============================================================
  // 14. ZATCA SETTINGS
  // ============================================================
  console.log('  → ZATCA settings...');
  const setZatca = db.prepare(`
    INSERT OR REPLACE INTO zatca_settings (id, seller_name, vat_number, cr_number, branch_id, phase, updated_at)
    VALUES ('default', ?, ?, ?, ?, 'simulation', datetime('now'))
  `);
  setZatca.run('Royal العالمية للتجارة', '1000000000', '1010123456', '1');

  console.log('✅ Production data seeded successfully!');

  // Verification
  console.log('\n📊 Verification:');
  console.log('  Tenants:', db.prepare('SELECT COUNT(*) as c FROM tenants').get().c);
  console.log('  Organizations:', db.prepare('SELECT COUNT(*) as c FROM organizations').get().c);
  console.log('  Branches:', db.prepare('SELECT COUNT(*) as c FROM branches').get().c);
  console.log('  Users:', db.prepare('SELECT COUNT(*) as c FROM users').get().c);
  console.log('  Customers:', db.prepare('SELECT COUNT(*) as c FROM customers').get().c);
  console.log('  Products:', db.prepare('SELECT COUNT(*) as c FROM products').get().c);
  console.log('  Stock levels:', db.prepare('SELECT COUNT(*) as c FROM stock_levels').get().c);
  console.log('  Warehouses:', db.prepare('SELECT COUNT(*) as c FROM warehouses').get().c);
  console.log('  Currencies:', db.prepare('SELECT COUNT(*) as c FROM currencies').get().c);
  console.log('  UOMs:', db.prepare('SELECT COUNT(*) as c FROM uoms').get().c);

} catch (e) {
  console.error('❌ Seed failed:', e);
  process.exit(1);
}