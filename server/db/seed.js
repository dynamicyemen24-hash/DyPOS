/**
 * DyPOS Seed — Initial data for development
 * Run: npm run seed
 *
 * Production hardening:
 * - Generates strong random passwords for default accounts
 * - Only seeds when explicitly run (not auto-run on server start)
 * - Admin password is printed to console once
 */
import { migrate } from './schema.js';
import db from './schema.js';
import { v4 as uuid } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

migrate();

console.log('[DyPOS] Seeding...');

// Generate strong random passwords
const adminPassword = process.env.DYPOS_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url').slice(0, 16) + 'Aa1!';
const cashierPassword = process.env.DYPOS_CASHIER_PASSWORD || crypto.randomBytes(12).toString('base64url').slice(0, 16) + 'Aa1!';

// Default admin
const adminId = uuid();
const adminHash = bcrypt.hashSync(adminPassword, 12);
db.prepare('INSERT OR IGNORE INTO users (id,username,password_hash,full_name,role,must_change_password) VALUES (?,?,?,?,?,?)').run(adminId, 'admin', adminHash, 'مدير النظام', 'ADMIN', 1);

// Default cashier
db.prepare('INSERT OR IGNORE INTO users (id,username,password_hash,full_name,role,must_change_password) VALUES (?,?,?,?,?,?)').run(uuid(), 'cashier', bcrypt.hashSync(cashierPassword, 12), 'كاشير', 'CASHIER', 1);

console.log('[DyPOS] ┌─────────────────────────────────────────────────┐');
console.log('[DyPOS] │  Default credentials (change immediately!):     │');
console.log(`[DyPOS] │  Admin:    admin / ${adminPassword}             `);
console.log(`[DyPOS] │  Cashier:  cashier / ${cashierPassword}         `);
console.log('[DyPOS] │  Both accounts require password change on login │');
console.log('[DyPOS] └─────────────────────────────────────────────────┘');

// Default warehouse
db.prepare('INSERT OR IGNORE INTO warehouses (id,name) VALUES (?,?)').run('W-01', 'المستودع الرئيسي');

// Sample products
const products = [
  { code: 'PRD-001', name: 'latte', nameAr: 'لاتيه', barcode: '1001', unitPrice: 18, cost: 6, taxRate: 15, category: 'مشروبات' },
  { code: 'PRD-002', name: 'cappuccino', nameAr: 'كابتشينو', barcode: '1002', unitPrice: 20, cost: 7, taxRate: 15, category: 'مشروبات' },
  { code: 'PRD-003', name: 'espresso', nameAr: 'إسبريسو', barcode: '1003', unitPrice: 12, cost: 3, taxRate: 15, category: 'مشروبات' },
  { code: 'PRD-004', name: 'croissant', nameAr: 'كرواسون', barcode: '1004', unitPrice: 8, cost: 2.5, taxRate: 15, category: 'مخبوزات' },
  { code: 'PRD-005', name: 'sandwich', nameAr: 'ساندويتش', barcode: '1005', unitPrice: 25, cost: 10, taxRate: 15, category: 'طعام' },
  { code: 'PRD-006', name: 'water', nameAr: 'ماء', barcode: '1006', unitPrice: 2, cost: 0.5, taxRate: 15, category: 'مشروبات' },
  { code: 'PRD-007', name: 'juice', nameAr: 'عصير برتقال', barcode: '1007', unitPrice: 10, cost: 4, taxRate: 15, category: 'مشروبات' },
  { code: 'PRD-008', name: 'cake', nameAr: 'كيكة', barcode: '1008', unitPrice: 15, cost: 5, taxRate: 15, category: 'حلويات' },
];

const insertProduct = db.prepare('INSERT OR IGNORE INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,category) VALUES (?,?,?,?,?,?,?,?,?)');
const insertStock = db.prepare('INSERT OR IGNORE INTO stock_levels (product_id,warehouse_id,qty) VALUES (?,?,?)');

for (const p of products) {
  const id = uuid();
  insertProduct.run(id, p.code, p.name, p.nameAr, p.barcode, p.unitPrice, p.cost, p.taxRate, p.category);
  insertStock.run(id, 'W-01', 100);
}

// Sample customers
const customers = [
  { name: 'عميل نقدي', phone: '0500000000', loyaltyTier: 'BRONZE' },
  { name: 'أحمد محمد', phone: '0501234567', loyaltyTier: 'GOLD', loyaltyPoints: 500, creditLimit: 5000 },
  { name: 'فهد العلي', phone: '0509876543', loyaltyTier: 'SILVER', loyaltyPoints: 200, creditLimit: 2000 },
];

const insertCustomer = db.prepare('INSERT OR IGNORE INTO customers (id,name,phone,loyalty_tier,loyalty_points,credit_limit) VALUES (?,?,?,?,?,?)');
for (const c of customers) {
  insertCustomer.run(uuid(), c.name, c.phone, c.loyaltyTier, c.loyaltyPoints || 0, c.creditLimit || 0);
}

// Sample coupons
db.prepare('INSERT OR IGNORE INTO coupons (id,code,discount_type,discount,min_purchase,max_uses) VALUES (?,?,?,?,?,?)').run(uuid(), 'WELCOME10', 'PCT', 10, 0, 100);
db.prepare('INSERT OR IGNORE INTO coupons (id,code,discount_type,discount,min_purchase,max_uses) VALUES (?,?,?,?,?,?)').run(uuid(), 'FLAT5', 'AMOUNT', 5, 20, 50);

console.log('[DyPOS] ✓ Seed complete: admin, cashier, 8 products, 3 customers, 2 coupons');
console.log('[DyPOS] ⚠ Remember to change default passwords immediately after first login!');
process.exit(0);
