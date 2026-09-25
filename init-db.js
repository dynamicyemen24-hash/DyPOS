const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('D:\\SulationDy\\DyPOS\\data\\dypos.db');

// Use raw datetime string for SQLite - will be handled by the DB engine
// We'll use datetime('now') via prepare calls instead of JS variable

// ==========================================
// 1. Add Tenant (Organization)
// ==========================================
db.prepare(`INSERT OR IGNORE INTO tenants (id, name, code, plan, is_active, created_at, updated_at) VALUES ('T-001', 'Royal Global Trading', 'RGT', 'standard', 1, datetime('now'), datetime('now'))`).run();

// ==========================================
// 2. Add Organization
// ==========================================
db.prepare(`INSERT OR IGNORE INTO organizations (id, tenant_id, name, code, vat_number, is_active, created_at, updated_at) VALUES ('O-001', 'T-001', 'Royal العالمية للتجارة', 'RGT', '1000000000', 1, datetime('now'), datetime('now'))`).run();

// ==========================================
// 3. Add Main Branch (Marib)
// ==========================================
db.prepare(`INSERT OR IGNORE INTO branches (id, org_id, tenant_id, name, code, warehouse_id, is_active, created_at, updated_at) VALUES ('B-01', 'O-001', 'T-001', 'المركب - مارب', 'BR-MARIB', 'W-01', 1, datetime('now'), datetime('now'))`).run();

// ==========================================
// 4. Add Aden Branch
// ==========================================
db.prepare(`INSERT OR IGNORE INTO branches (id, org_id, tenant_id, name, code, warehouse_id, is_active, created_at, updated_at) VALUES ('B-02', 'O-001', 'T-001', 'فرع عدن', 'BR-Aden', 'W-02', 1, datetime('now'), datetime('now'))`).run();

// ==========================================
// 5. Add Sana'a Branch
// ==========================================
db.prepare(`INSERT OR IGNORE INTO branches (id, org_id, tenant_id, name, code, warehouse_id, is_active, created_at, updated_at) VALUES ('B-03', 'O-001', 'T-001', 'فرع صنعاء', 'BR-Sanaa', 'W-03', 1, datetime('now'), datetime('now'))`).run();

// ==========================================
// 6. Add Users with roles
// ==========================================
// Admin user
db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, must_change_password, created_at) VALUES ('U-ADMIN', 'admin', '$2a$10$dummyhash', 'مدير النظام', 'ADMIN', 1, 0, datetime('now'))`).run();

// Cashier user for main branch
db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, must_change_password, created_at) VALUES ('U-CASHIER-MARIB', 'cashier1', '$2a$10$dummyhash', 'مشرف مارب', 'CASHIER', 1, 0, datetime('now'))`).run();

// Cashier user for Aden branch
db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, must_change_password, created_at) VALUES ('U-CASHIER-Aden', 'cashier2', '$2a$10$dummyhash', 'مشرف عدن', 'CASHIER', 1, 0, datetime('now'))`).run();

// Cashier user for Sana'a branch
db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, full_name, role, is_active, must_change_password, created_at) VALUES ('U-CASHIER-SANAA', 'cashier3', '$2a$10$dummyhash', 'مشرف صنعاء', 'CASHIER', 1, 0, datetime('now'))`).run();

// ==========================================
// 7. Add Customers
// ==========================================
db.prepare(`INSERT OR IGNORE INTO customers (id, name, phone, email, tax_number, loyalty_tier, loyalty_points, wallet_balance, credit_limit, credit_used, address, is_active, created_at, updated_at) VALUES ('C-001', 'Royal العالمية للتجارة', '+967-300123456', 'contact@royal-gt.com', 'Y123456789', 'GOLD', 500, 2500.00, 10000.00, 0, 'صنعاء، المملكة اليمنية', 1, datetime('now'), datetime('now'))`).run();

// ==========================================
// 8. Add Products: Perfumes and Cosmetics Tools
// ==========================================
// Perfume 1
db.prepare(`INSERT OR IGNORE INTO products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES ('P-001', 'PERF-001', 'Elite Perfume', 'إيليت للم香水', 'ELITE001', 150.00, 90.00, 15, 'Unit', 'Perfumes', 'Elite', 1, datetime('now'), datetime('now'))`).run();

// Perfume 2
db.prepare(`INSERT OR IGNORE INTO products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES ('P-002', 'PERF-002', 'Royal Oud', 'عود王 royalty', 'ROYAL002', 300.00, 180.00, 15, 'Unit', 'Perfumes', 'Royal', 1, datetime('now'), datetime('now'))`).run();

// Setting spray
db.prepare(`INSERT OR IGNORE INTO products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES ('P-003', 'SET-001', 'Setting Spray', 'رذاذ تثبيت', 'SET001', 85.00, 51.00, 15, 'Can', 'Cosmetics', 'Fix & Glow', 1, datetime('now'), datetime('now'))`).run();

// Lipstick
db.prepare(`INSERT OR IGNORE INTO products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES ('P-004', 'LIP-001', 'Liquid Lipstick', ' rouges السائل', 'LIP001', 45.00, 27.00, 15, 'Piece', 'Cosmetics', 'ColorBlast', 1, datetime('now'), datetime('now'))`).run();

// Foundation
db.prepare(`INSERT OR IGNORE INTO products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES ('P-005', 'FDN-001', 'Foundation', 'أساس', 'FDN001', 120.00, 72.00, 15, 'Unit', 'Cosmetics', 'GlowMax', 1, datetime('now'), datetime('now'))`).run();

// Eyeliner
db.prepare(`INSERT OR IGNORE INTO products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES ('P-006', 'EYE-001', 'Eyeliner', 'آيلاينر', 'EYE001', 30.00, 18.00, 15, 'Piece', 'Cosmetics', 'Kohl', 1, datetime('now'), datetime('now'))`).run();

// Powder
db.prepare(`INSERT OR IGNORE INTO products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES ('P-007', 'POW-001', 'Setting Powder', 'بودرة تثبيت', 'POW001', 55.00, 33.00, 15, 'Unit', 'Cosmetics', 'PureFit', 1, datetime('now'), datetime('now'))`).run();

// Perfume oil
db.prepare(`INSERT OR IGNORE INTO products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES ('P-008', 'OIL-001', 'Perfume Oil', 'زيت 香水', 'OIL001', 200.00, 120.00, 15, 'ml', 'Perfumes', 'Oudh', 1, datetime('now'), datetime('now'))`).run();

// Makeup brush set
db.prepare(`INSERT OR IGNORE INTO products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES ('P-009', 'BR-001', 'Makeup Brush Set', 'فرش المكياج', 'BR001', 95.00, 57.00, 15, 'Set', 'Cosmetics', 'ProBrush', 1, datetime('now'), datetime('now'))`).run();

// Perfume gift set
db.prepare(`INSERT OR IGNORE INTO products (id, code, name, name_ar, barcode, unit_price, cost, tax_rate, uom, category, brand, is_active, created_at, updated_at) VALUES ('P-010', 'GIFT-001', 'Perfume Gift Set', ' مجموعة 香水', 'GIFT001', 250.00, 150.00, 15, 'Set', 'Perfumes', 'Gift', 1, datetime('now'), datetime('now'))`).run();

// ==========================================
// 9. Verify data insertion
// ==========================================
console.log('\n=== DATA INSERTION VERIFICATION ===');
console.log('Tenants:', db.prepare('SELECT COUNT(*) as cnt FROM tenants').get().cnt);
console.log('Organizations:', db.prepare('SELECT COUNT(*) as cnt FROM organizations').get().cnt);
console.log('Branches:', db.prepare('SELECT COUNT(*) as cnt FROM branches').get().cnt);
console.log('Users:', db.prepare('SELECT COUNT(*) as cnt FROM users').get().cnt);
console.log('Customers:', db.prepare('SELECT COUNT(*) as cnt FROM customers').get().cnt);
console.log('Products:', db.prepare('SELECT COUNT(*) as cnt FROM products').get().cnt);

// Show branches names
console.log('\nBranches:');
db.prepare('SELECT id, name, code FROM branches').all().forEach(b => console.log(' -', b.id, ':', b.name));

// Show users
console.log('\nUsers:');
db.prepare('SELECT id, username, role, is_active FROM users').all().forEach(u => console.log(' -', u.id, ':', u.username, '-', u.role, '(active:', u.is_active == 1 ? 'yes' : 'no', ')'));

// Show customers
console.log('\nCustomers:');
db.prepare('SELECT id, name, phone FROM customers').all().forEach(c => console.log(' -', c.id, ':', c.name, '-', c.phone));

// Show products
console.log('\nProducts:');
db.prepare('SELECT code, name, name_ar, category FROM products WHERE is_active=1').all().forEach(p => console.log(' -', p.code, ':', p.name_ar, '(', p.category, ')'));

db.close();
console.log('\n=== All data added successfully ===');