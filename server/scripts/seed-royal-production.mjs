/**
 * Royal Global — Production Seed (Subscriber #1)
 * ============================================================
 * رويال العالمية لتجارة أدوات التجميل والعطور — المشترك رقم واحد
 *
 * Seeds REAL, production-grade master data:
 * - Tenant RGT (enterprise) + organization + 3 branches + warehouses
 * - 6 users with REAL bcrypt hashes (cost 12, repo standard)
 * - 64-SKU Arabic-first cosmetics & perfumes catalog
 * - Opening stock per warehouse, customers, fiscal year, sequences, ZATCA
 *
 * Safety (world-class seed discipline):
 * - ATOMIC: everything runs inside one SQLite transaction (all-or-nothing).
 * - FK-SAFE: upserts use INSERT ... ON CONFLICT DO UPDATE (never DELETE),
 *   so rows referenced by stock_levels / invoice_items are updated in place
 *   and their stable ids survive (INSERT OR REPLACE would violate RESTRICT).
 * - IDEMPOTENT: fixed UUIDs/codes → safe to re-run.
 *
 * Run AFTER migrations:  npm run migrate && npm run seed:royal
 *
 * NOTE: credentials are printed to the console ONCE at the end.
 * Rotate the admin password after first login (must_change_password=1).
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';

const db = new DatabaseSync('./data/dypos.db');
const uuid = () => randomUUID();

/**
 * FK-safe upsert: INSERT, or UPDATE non-key columns on conflict.
 * Never deletes → never trips ON DELETE RESTRICT from stock/invoices.
 */
function upsert(table, key, row) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(',');
  const updates = cols
    .filter((c) => c !== key)
    .map((c) => `${c}=excluded.${c}`)
    .join(',');
  db.prepare(
    `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON CONFLICT(${key}) DO UPDATE SET ${updates}`,
  ).run(...cols.map((c) => row[c]));
}

const now = () => new Date().toISOString();

// ── Fixed IDs (subscriber #1: reproducible + idempotent) ──
const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const ORG_ID = '11111111-1111-1111-1111-111111111111';
const BRANCH_SANAA = '44444444-4444-4444-4444-444444444444'; // HQ
const BRANCH_ADEN = '33333333-3333-3333-3333-333333333333';
const BRANCH_MARIB = '22222222-2222-2222-2222-222222222222';
const WH_SANAA = 'W-03';
const WH_ADEN = 'W-02';
const WH_MARIB = 'W-01';

const BUSINESS_NAME = 'رويال العالمية لتجارة أدوات التجميل والعطور';
const BUSINESS_NAME_EN = 'Royal Global Cosmetics & Perfumes Trading';

// username → [password, fullName, role, mustChange]
const USERS = [
  ['admin', 'Royal#2026#Adm1n', 'مدير النظام العام', 'ADMIN', 1],
  ['sanaa.manager', 'Royal#2026#Mgr1', 'مدير فرع صنعاء', 'MANAGER', 0],
  ['sanaa.cashier', 'Royal#2026#Pos1', 'كاشير صنعاء الأول', 'CASHIER', 0],
  ['sanaa.cashier2', 'Royal#2026#Pos2', 'كاشير صنعاء الثاني', 'CASHIER', 0],
  ['aden.cashier', 'Royal#2026#Pos3', 'كاشير عدن', 'CASHIER', 0],
  ['marib.cashier', 'Royal#2026#Pos4', 'كاشير مأرب', 'CASHIER', 0],
];

// [code, name_en, name_ar, price(SAR), uom, category, brand]
const CATALOG = [
  // ── عطور نسائية (12) ──
  ['PF-W001', 'Chanel N°5 EDP 100ml', 'شانيل رقم 5 - 100 مل', 890, 'PCS', 'عطور نسائية', 'Chanel'],
  ['PF-W002', 'Dior J\u2019adore EDP 100ml', 'ديور جادور - 100 مل', 760, 'PCS', 'عطور نسائية', 'Dior'],
  ['PF-W003', 'Chanel Chance EDT 100ml', 'شانيل تشانس - 100 مل', 720, 'PCS', 'عطور نسائية', 'Chanel'],
  ['PF-W004', 'Miss Dior EDP 100ml', 'مس ديور - 100 مل', 690, 'PCS', 'عطور نسائية', 'Dior'],
  ['PF-W005', 'Giorgio Armani Si EDP 100ml', 'أرماني سي - 100 مل', 640, 'PCS', 'عطور نسائية', 'Armani'],
  ['PF-W006', 'Lancome La Vie Est Belle 75ml', 'لانكوم لافي إيست بيل - 75 مل', 620, 'PCS', 'عطور نسائية', 'Lancome'],
  ['PF-W007', 'Lancome Tresor EDP 100ml', 'لانكوم تريزور - 100 مل', 540, 'PCS', 'عطور نسائية', 'Lancome'],
  ['PF-W008', 'Versace Crystal Noir 90ml', 'فيرساتشي كريستال نوار - 90 مل', 480, 'PCS', 'عطور نسائية', 'Versace'],
  ['PF-W009', 'Lattafa Khamrah 100ml', 'لطافة خمرة - 100 مل', 280, 'PCS', 'عطور نسائية', 'Lattafa'],
  ['PF-W010', "Victoria's Secret Bombshell 250ml", 'فيكتوريا سيكريت بومبشيل - 250 مل', 220, 'PCS', 'عطور نسائية', 'Victorias Secret'],
  ['PF-W011', 'Lattafa Yara 100ml', 'لطافة يارا - 100 مل', 180, 'PCS', 'عطور نسائية', 'Lattafa'],
  ['PF-W012', 'French Musk Tahara 12ml', 'مسك الطهارة الفرنسي - 12 مل', 60, 'PCS', 'عطور نسائية', 'Royal Musk'],
  // ── عطور رجالية (10) ──
  ['PF-M001', 'Creed Aventus 120ml', 'كريد أفنتوس - 120 مل', 1450, 'PCS', 'عطور رجالية', 'Creed'],
  ['PF-M002', 'Tom Ford Tobacco Oud 50ml', 'توم فورد توباكو عود - 50 مل', 980, 'PCS', 'عطور رجالية', 'Tom Ford'],
  ['PF-M003', 'Chanel Bleu EDT 100ml', 'شانيل بلو - 100 مل', 750, 'PCS', 'عطور رجالية', 'Chanel'],
  ['PF-M004', 'Dior Sauvage EDT 100ml', 'ديور سوفاج - 100 مل', 680, 'PCS', 'عطور رجالية', 'Dior'],
  ['PF-M005', 'Armani Code EDT 125ml', 'أرماني كود - 125 مل', 520, 'PCS', 'عطور رجالية', 'Armani'],
  ['PF-M006', 'Paco Rabanne Invictus 100ml', 'باكو رابان إنفيكتوس - 100 مل', 460, 'PCS', 'عطور رجالية', 'Paco Rabanne'],
  ['PF-M007', 'Lattafa Oud for Greatness 100ml', 'لطافة عود للعظمة - 100 مل', 220, 'PCS', 'عطور رجالية', 'Lattafa'],
  ['PF-M008', 'Rasasi La Yuqawam 75ml', 'الرصاصي لا يقاوم - 75 مل', 340, 'PCS', 'عطور رجالية', 'Rasasi'],
  ['PF-M009', 'Arabian Oud Mukhallat 90ml', 'مخلط العربية للعود - 90 مل', 410, 'PCS', 'عطور رجالية', 'Arabian Oud'],
  ['PF-M010', 'Al Haramain Amber Oud 120ml', 'الحرمين عنبر عود - 120 مل', 260, 'PCS', 'عطور رجالية', 'Al Haramain'],
  // ── عود وبخور ومسك (10) ──
  ['OUD-001', 'Cambodi Oud Tola', 'عود كمبودي - تولة', 1200, 'PCS', 'عود وبخور ومسك', 'Royal Oud'],
  ['OUD-002', 'Hindi Oud Suyufi Tola', 'عود هندي سيوفي - تولة', 850, 'PCS', 'عود وبخور ومسك', 'Royal Oud'],
  ['OUD-003', 'Aged Dehn Oud 12ml', 'دهن عود معتق - 12 مل', 650, 'ML', 'عود وبخور ومسك', 'Royal Oud'],
  ['OUD-004', 'Moroccan Oud Mohassan 50g', 'عود مروكي محسن - 50 جرام', 380, 'G', 'عود وبخور ومسك', 'Royal Oud'],
  ['OUD-005', 'Royal Maamoul Bakhoor 100g', 'معمول ملكي فاخر - 100 جرام', 220, 'G', 'عود وبخور ومسك', 'Royal Bakhoor'],
  ['OUD-006', 'Dusari Maamoul 100g', 'معمول دوسري - 100 جرام', 180, 'G', 'عود وبخور ومسك', 'Dusari'],
  ['OUD-007', 'Bridal Bakhoor Mix 100g', 'بخور عرائسي مشكل - 100 جرام', 150, 'G', 'عود وبخور ومسك', 'Royal Bakhoor'],
  ['OUD-008', 'Dusari Bakhoor 100g', 'بخور دوسري - 100 جرام', 120, 'G', 'عود وبخور ومسك', 'Dusari'],
  ['OUD-009', 'Deer Musk Black 12ml', 'مسك الغزال الأسود - 12 مل', 90, 'ML', 'عود وبخور ومسك', 'Royal Musk'],
  ['OUD-010', 'White Musk Tahara 12ml', 'المسك الأبيض - 12 مل', 55, 'ML', 'عود وبخور ومسك', 'Royal Musk'],
  // ── مكياج: شفاه (6) ──
  ['LIP-001', 'Matte Liquid Lipstick', 'أحمر شفاه سائل مات', 45, 'PCS', 'مكياج شفاه', 'ColorBlast'],
  ['LIP-002', 'Cream Lipstick', 'أحمر شفاه كريمي', 40, 'PCS', 'مكياج شفاه', 'ColorBlast'],
  ['LIP-003', 'Lip Gloss Shine', 'ملمع شفاه لامع', 32, 'PCS', 'مكياج شفاه', 'GlowMax'],
  ['LIP-004', 'Tinted Lip Balm', 'مرطب شفاه ملون', 25, 'PCS', 'مكياج شفاه', 'PureFit'],
  ['LIP-005', 'Lip Liner Pencil', 'قلم تحديد شفاه', 18, 'PCS', 'مكياج شفاه', 'Kohl'],
  ['LIP-006', 'Lip Trio Set', 'طقم شفاه 3 قطع', 85, 'SET', 'مكياج شفاه', 'ColorBlast'],
  // ── مكياج: عيون (6) ──
  ['EYE-001', 'Eyeshadow Palette 12 Colors', 'باليت ظلال 12 لون', 120, 'PCS', 'مكياج عيون', 'ProBrush'],
  ['EYE-002', 'Volume Mascara', 'ماسكارا تكثيف', 48, 'PCS', 'مكياج عيون', 'Kohl'],
  ['EYE-003', 'False Lashes 5 Pairs', 'رموش صناعية 5 أزواج', 55, 'PCS', 'مكياج عيون', 'GlamLash'],
  ['EYE-004', 'Brow Gel', 'جل حواجب', 35, 'PCS', 'مكياج عيون', 'Kohl'],
  ['EYE-005', 'Liquid Eyeliner', 'آيلاينر سائل', 30, 'PCS', 'مكياج عيون', 'Kohl'],
  ['EYE-006', 'Authentic Arab Kohl', 'كحل عربي أصلي', 22, 'PCS', 'مكياج عيون', 'Kohl'],
  // ── مكياج: وجه (6) ──
  ['FACE-001', 'Foundation Full Coverage', 'كريم أساس تغطية كاملة', 120, 'PCS', 'مكياج وجه', 'GlowMax'],
  ['FACE-002', 'Face Primer', 'برايمر وجه', 58, 'PCS', 'مكياج وجه', 'PureFit'],
  ['FACE-003', 'Setting Powder', 'بودرة تثبيت', 55, 'PCS', 'مكياج وجه', 'PureFit'],
  ['FACE-004', 'Highlighter Glow', 'هايلايتر إضاءة', 46, 'PCS', 'مكياج وجه', 'GlowMax'],
  ['FACE-005', 'Concealer', 'كونسيلر', 42, 'PCS', 'مكياج وجه', 'GlowMax'],
  ['FACE-006', 'Blusher', 'أحمر خدود (بلاشر)', 38, 'PCS', 'مكياج وجه', 'ColorBlast'],
  // ── عناية بالبشرة (6) ──
  ['SKIN-001', 'Vitamin C Serum 30ml', 'سيروم فيتامين C - 30 مل', 95, 'PCS', 'عناية بالبشرة', 'DermaCare'],
  ['SKIN-002', 'Night Repair Cream 50ml', 'كريم ليلي مرمم - 50 مل', 78, 'PCS', 'عناية بالبشرة', 'DermaCare'],
  ['SKIN-003', 'Sunscreen SPF50 100ml', 'واقي شمس SPF50 - 100 مل', 70, 'PCS', 'عناية بالبشرة', 'DermaCare'],
  ['SKIN-004', 'Day Moisturizer SPF 50ml', 'مرطب نهاري - 50 مل', 65, 'PCS', 'عناية بالبشرة', 'DermaCare'],
  ['SKIN-005', 'Face Scrub 100ml', 'مقشر وجه - 100 مل', 52, 'PCS', 'عناية بالبشرة', 'DermaCare'],
  ['SKIN-006', 'Face Wash 150ml', 'غسول وجه - 150 مل', 48, 'PCS', 'عناية بالبشرة', 'DermaCare'],
  // ── عناية بالشعر (4) ──
  ['HAIR-001', 'Argan Oil 100ml', 'زيت أرغان - 100 مل', 85, 'PCS', 'عناية بالشعر', 'ArganGold'],
  ['HAIR-002', 'Hair Mask 250ml', 'ماسك شعر - 250 مل', 62, 'PCS', 'عناية بالشعر', 'ArganGold'],
  ['HAIR-003', 'Argan Shampoo 400ml', 'شامبو أرغان - 400 مل', 55, 'PCS', 'عناية بالشعر', 'ArganGold'],
  ['HAIR-004', 'Argan Conditioner 400ml', 'بلسم أرغان - 400 مل', 55, 'PCS', 'عناية بالشعر', 'ArganGold'],
  // ── إكسسوارات وأدوات (4) ──
  ['ACC-001', 'LED Makeup Mirror', 'مرآة مكياج LED', 140, 'PCS', 'إكسسوارات', 'GlamTools'],
  ['ACC-002', 'Pro Makeup Bag', 'حقيبة مكياج احترافية', 110, 'PCS', 'إكسسوارات', 'GlamTools'],
  ['ACC-003', 'Brush Set 12pcs', 'طقم فرش مكياج 12 قطعة', 95, 'SET', 'إكسسوارات', 'ProBrush'],
  ['ACC-004', 'Beauty Sponge', 'إسفنجة بيوتي بلندر', 25, 'PCS', 'إكسسوارات', 'GlamTools'],
];

// Opening stock tiers by price: [sanaa(HQ), aden, marib]
function stockTier(price) {
  if (price < 50) return [140, 80, 60];
  if (price < 200) return [70, 42, 30];
  if (price < 600) return [36, 22, 16];
  return [14, 9, 7];
}

console.log('🌱 Royal Global production seed (subscriber #1)...');

db.exec('BEGIN');
try {
  // 1. Business profile
  console.log('  → Business profile...');
  for (const [k, v] of [
    ['business_name', BUSINESS_NAME],
    ['business_name_en', BUSINESS_NAME_EN],
    ['country_code', 'YE'],
    ['currency', 'SAR'],
    ['tax_rate_default', '15'],
    ['invoice_prefix', 'RGT'],
    ['timezone', 'Asia/Aden'],
  ]) {
    upsert('business_settings', 'key', { key: k, value: v, updated_at: now() });
  }

  // 2. Tenant #1
  console.log('  → Tenant #1 (Royal Global)...');
  upsert('tenants', 'id', { id: TENANT_ID, name: BUSINESS_NAME, code: 'RGT', plan: 'enterprise', is_active: 1, created_at: now(), updated_at: now() });

  // 3. Organization + branches + warehouses
  console.log('  → Branches + warehouses...');
  const ORG_ID = '11111111-1111-1111-1111-111111111111';
  upsert('organizations', 'id', { id: ORG_ID, tenant_id: TENANT_ID, name: BUSINESS_NAME, code: 'RGT', vat_number: '1000000000', is_active: 1, created_at: now(), updated_at: now() });
  const BR = {
    [BRANCH_SANAA]: ['فرع صنعاء الرئيسي', 'BR-SANAA', WH_SANAA, 'مستودع صنعاء المركزي', 'صنعاء - شارع حدة'],
    [BRANCH_ADEN]: ['فرع عدن', 'BR-ADEN', WH_ADEN, 'مستودع عدن', 'عدن - المنصورة'],
    [BRANCH_MARIB]: ['فرع مأرب', 'BR-MARIB', WH_MARIB, 'مستودع مأرب', 'مأرب - المجمع'],
  };
  for (const [id, [name, code, wh, whName, addr]] of Object.entries(BR)) {
    upsert('branches', 'id', { id, org_id: ORG_ID, tenant_id: TENANT_ID, name, code, warehouse_id: wh, is_active: 1, created_at: now(), updated_at: now() });
    upsert('warehouses', 'id', { id: wh, name: whName, tenant_id: TENANT_ID, branch_id: id, is_active: 1, address: addr });
  }

  // 4. Users (REAL bcrypt hashes, cost 12 = repo standard)
  console.log('  → Users (bcrypt)...');
  for (const [username, password, fullName, role, mustChange] of USERS) {
    const existing = db.prepare('SELECT id FROM users WHERE username=?').get(username);
    upsert('users', 'username', {
      id: existing?.id || uuid(),
      username,
      password_hash: bcrypt.hashSync(password, 12),
      full_name: fullName,
      role,
      tenant_id: TENANT_ID,
      is_active: 1,
      must_change_password: mustChange,
      created_at: now(),
    });
  }

  // 4b. Purge dead demo accounts (dummy hashes from the legacy seed —
  // they can never authenticate; transactional tables are empty).
  console.log('  → Purging dead demo accounts...');
  const dead = db.prepare("SELECT username FROM users WHERE password_hash='$2a$10$dummyhashplaceholder'").all();
  for (const u of dead) db.prepare('DELETE FROM users WHERE username=?').run(u.username);
  console.log(`    purged ${dead.length} dead account(s)`);

  // 5. Currencies + UOMs
  console.log('  → Currencies + UOMs...');
  for (const [code, name, nameAr, symbol, decimals, rate, base] of [
    ['SAR', 'Saudi Riyal', 'ريال سعودي', 'ر.س', 2, 1, 1],
    ['USD', 'US Dollar', 'دولار أمريكي', '$', 2, 0.26667, 0],
    ['YER', 'Yemeni Rial', 'ريال يمني', '﷼', 2, 250, 0],
  ]) {
    upsert('currencies', 'code', { code, name, name_ar: nameAr, symbol, decimals, rate_to_base: rate, is_base: base, is_active: 1, updated_at: now() });
  }
  for (const [code, name, nameAr, category, factor, base] of [
    ['PCS', 'Pieces', 'قطعة', 'count', 1, 1],
    ['BOX', 'Box', 'كرتون', 'count', 12, 0],
    ['DOZEN', 'Dozen', 'درزن', 'count', 12, 0],
    ['SET', 'Set', 'مجموعة', 'count', 1, 0],
    ['ML', 'Milliliter', 'ملليلتر', 'volume', 1, 1],
    ['L', 'Liter', 'لتر', 'volume', 1000, 0],
    ['G', 'Gram', 'جرام', 'weight', 1, 1],
    ['KG', 'Kilogram', 'كيلوجرام', 'weight', 1000, 0],
  ]) {
    upsert('uoms', 'code', { code, name, name_ar: nameAr, category, factor_to_base: factor, is_base: base, is_active: 1, updated_at: now() });
  }

  // 6. Customers
  console.log('  → Customers...');
  const CUSTOMERS = [
    ['aaaaaaaa-0000-4000-8000-000000000001', 'عميل نقدي', '000000000', null, null, 'BRONZE', 0, 0, 0, 0, 'نقطة البيع'],
    ['aaaaaaaa-0000-4000-8000-000000000002', 'أم محمد', '+967770111222', null, null, 'SILVER', 120, 0, 5000, 0, 'صنعاء'],
    ['aaaaaaaa-0000-4000-8000-000000000003', 'أبو أحمد', '+967773333444', null, null, 'SILVER', 80, 0, 5000, 0, 'صنعاء'],
    ['aaaaaaaa-0000-4000-8000-000000000004', 'سارة الحداد', '+967715555666', 'sara@example.com', null, 'GOLD', 500, 2500, 10000, 0, 'عدن'],
    ['aaaaaaaa-0000-4000-8000-000000000005', 'صالون لمسة للتجميل', '+967777777888', 'lamsa@example.com', 'Y987654321', 'GOLD', 1500, 0, 20000, 0, 'صنعاء - حدة'],
    ['aaaaaaaa-0000-4000-8000-000000000006', 'عطارة العروس', '+967739999000', null, null, 'SILVER', 300, 0, 15000, 0, 'مأرب'],
  ];
  for (const [id, name, phone, email, tax, tier, points, wallet, limit, used, addr] of CUSTOMERS) {
    upsert('customers', 'id', { id, tenant_id: TENANT_ID, name, phone, email, tax_number: tax, loyalty_tier: tier, loyalty_points: points, wallet_balance: wallet, credit_limit: limit, credit_used: used, address: addr, is_active: 1, created_at: now(), updated_at: now() });
  }

  // 7. Catalog (64 SKUs) — upsert by code (stable ids survive)
  console.log('  → Catalog (64 SKUs)...');
  const productIds = [];
  CATALOG.forEach(([code, nameEn, nameAr, price, uom, category, brand], i) => {
    const existing = db.prepare('SELECT id FROM products WHERE code=?').get(code);
    const id = existing?.id || uuid();
    const cost = Math.round(price * 0.6 * 100) / 100;
    upsert('products', 'code', {
      id, tenant_id: TENANT_ID, code, name: nameEn, name_ar: nameAr,
      barcode: `6281000${String(10000 + i)}`, unit_price: price, cost,
      tax_rate: 15, uom, category, brand, is_active: 1,
      created_at: now(), updated_at: now(),
    });
    productIds.push({ id, price });
  });

  // 7b. Purge legacy demo SKUs superseded by the real catalog.
  // (Only codes outside CATALOG, and only when no invoice references them.)
  console.log('  → Purging legacy demo SKUs...');
  const catalogCodes = new Set(CATALOG.map(([code]) => code));
  const legacy = db.prepare('SELECT id, code FROM products').all()
    .filter((p) => !catalogCodes.has(p.code));
  let purged = 0;
  for (const p of legacy) {
    const refs = db.prepare('SELECT COUNT(*) c FROM invoice_items WHERE product_id=?').get(p.id).c;
    if (refs > 0) continue; // sold history — never delete
    db.prepare('DELETE FROM stock_levels WHERE product_id=?').run(p.id);
    db.prepare('DELETE FROM products WHERE id=?').run(p.id);
    purged += 1;
  }
  console.log(`    purged ${purged} legacy demo SKU(s)`);

  // 8. Opening stock
  console.log('  → Opening stock...');
  for (const { id, price } of productIds) {
    const [sanaa, aden, marib] = stockTier(price);
    for (const [wh, qty] of [[WH_SANAA, sanaa], [WH_ADEN, aden], [WH_MARIB, marib]]) {
      // NOTE: stock_levels PK is (product_id, warehouse_id) — conflict on both:
      db.prepare(`INSERT INTO stock_levels (product_id, warehouse_id, qty, reserved_qty, allocated_qty, updated_at)
        VALUES (?, ?, ?, 0, 0, datetime('now'))
        ON CONFLICT(product_id, warehouse_id) DO UPDATE SET qty=excluded.qty, reserved_qty=0, allocated_qty=0, updated_at=datetime('now')`)
        .run(id, wh, qty);
    }
  }

  // 9. Fiscal year + sequences + ZATCA
  console.log('  → Fiscal year + sequences + ZATCA...');
  const year = new Date().getUTCFullYear();
  upsert('fiscal_years', 'code', { code: String(year), starts_on: `${year}-01-01`, ends_on: `${year}-12-31`, status: 'OPEN', created_at: now() });
  for (const br of [BRANCH_SANAA, BRANCH_ADEN, BRANCH_MARIB]) {
    upsert('invoice_sequences', 'scope', { scope: `${TENANT_ID}:${br}:${year}`, prefix: 'RGT', last_number: 0, updated_at: now() });
  }
  upsert('zatca_settings', 'id', { id: 'default', seller_name: BUSINESS_NAME, vat_number: '1000000000', cr_number: '1010123456', branch_id: '1', phase: 'simulation', updated_at: now() });

  db.exec('COMMIT');
  console.log('✅ Royal Global production data seeded (atomic)!');

  console.log('\n📊 Verification:');
  for (const t of ['tenants', 'branches', 'warehouses', 'users', 'customers', 'products', 'stock_levels', 'currencies', 'uoms']) {
    console.log(`  ${t}:`, db.prepare(`SELECT COUNT(*) as c FROM ${t}`).get().c);
  }
  console.log(`  products(tenant RGT):`, db.prepare(`SELECT COUNT(*) as c FROM products WHERE tenant_id=?`).get(TENANT_ID).c);

  console.log('\n🔑 Credentials (rotate admin after first login):');
  for (const [u, p, name, role] of USERS) console.log(`  ${role.padEnd(7)} ${u.padEnd(15)} ${p}  (${name})`);

} catch (e) {
  try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
  console.error('❌ Seed failed (rolled back):', e);
  process.exit(1);
}
