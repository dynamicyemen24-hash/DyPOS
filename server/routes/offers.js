/**
 * DyPOS Offers & Coupons — promotions plane (was: tables without API).
 * - Offers: buy-X-get-Y / percent / fixed, bounded by qty/amount + date window.
 * - Coupons: code-based discount (PCT | FIXED), min purchase, max uses, expiry.
 * - POST /coupons/validate: pure computation (no side effects) for checkout UX.
 * - Invoice integration: optional `couponCode` in POST /api/invoices applies
 *   the discount atomically and increments used_count exactly once.
 */
import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { assertTenantScope, resolveTenantFilter } from '../lib/tenant.js';

const router = Router();

function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}
const isManager = (req) => ['ADMIN', 'MANAGER'].includes(req.user?.role);
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Effective tenant for a read: explicit X-Tenant-Id (validated) else the
 * caller's bound tenant. A tenant-bound user can never scope to another
 * tenant (mirrors the write spoof guard) — mismatch answers 404.
 */
function readTenant(req) {
  const bound = req.user?.tenantId || null;
  let t = null;
    t = resolveTenantFilter(req).tenantId || null;
  if (bound && t && String(t) !== String(bound)) {
    throw Object.assign(new Error('غير موجود'), { statusCode: 404 });
  }
  return t || bound || null;
}

// ── Offers ──
router.get('/offers', (req, res) => {
  const active = req.query.active != null ? String(req.query.active) : null;
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  let scopeTenant = null;
  try {
    scopeTenant = readTenant(req);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  let base = 'FROM offers WHERE 1=1';
  const params = [];
  if (scopeTenant) { base += ' AND (tenant_id=? OR tenant_id IS NULL)'; params.push(scopeTenant); }
  if (active === '1' || active === '0') { base += ' AND is_active=?'; params.push(Number(active)); }
  const total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
  const rows = db.prepare(`SELECT * ${base} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return res.json({ offers: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

router.post('/offers', (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const b = req.body || {};
  let scope = { tenantId: null };
  try {
    scope = assertTenantScope(req);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const stampTenant = scope.tenantId || req.user?.tenantId || null;
  const name = String(b.name || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'اسم العرض مطلوب' });
  const type = String(b.type || 'PERCENT').toUpperCase().slice(0, 20);
  if (!['PERCENT', 'FIXED', 'BXGY'].includes(type)) return res.status(400).json({ error: 'نوع العرض PERCENT|FIXED|BXGY' });
  const value = Number(b.value);
  if (!Number.isFinite(value) || value < 0 || value > 1_000_000) return res.status(400).json({ error: 'قيمة العرض غير صالحة' });
  if (type === 'PERCENT' && value > 100) return res.status(400).json({ error: 'النسبة ≤ 100' });
  const id = uuid();
  db.prepare(`INSERT INTO offers (id,name,type,value,min_qty,max_qty,min_amount,max_amount,applies_to,item_groups,valid_from,valid_to,one_time_per_customer,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, name, type, value, Number(b.minQty) || 0, Number(b.maxQty) || 0, Number(b.minAmount) || 0, Number(b.maxAmount) || 0,
      String(b.appliesTo || 'ALL').slice(0, 20), String(b.itemGroups || '').slice(0, 1000) || null,
      String(b.validFrom || '').slice(0, 10) || null, String(b.validTo || '').slice(0, 10) || null, b.oneTimePerCustomer ? 1 : 0, stampTenant);
  req.audit?.('offer.create', { offerId: id, name });
  return res.status(201).json({ id, name });
});

router.patch('/offers/:id/toggle', (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT is_active, tenant_id FROM offers WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'العرض غير موجود' });
  try {
    const rec = row.tenant_id ? String(row.tenant_id) : null;
    const caller = readTenant(req);
    if (rec && caller && rec !== caller) return res.status(404).json({ error: 'العرض غير موجود' });
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.statusCode === 404 ? 'العرض غير موجود' : String(e.message).slice(0, 200) });
  }
  const next = Number(row.is_active) ? 0 : 1;
  db.prepare('UPDATE offers SET is_active=? WHERE id=?').run(next, id);
  req.audit?.('offer.toggle', { offerId: id, is_active: next });
  return res.json({ id, is_active: next });
});

// ── Coupons ──
router.get('/coupons', (req, res) => {
  const active = req.query.active != null ? String(req.query.active) : null;
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  let scopeTenant = null;
  try {
    scopeTenant = readTenant(req);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  let base = 'FROM coupons WHERE 1=1';
  const params = [];
  if (scopeTenant) { base += ' AND (tenant_id=? OR tenant_id IS NULL)'; params.push(scopeTenant); }
  if (active === '1' || active === '0') { base += ' AND is_active=?'; params.push(Number(active)); }
  const total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
  const rows = db.prepare(`SELECT id,code,discount_type,discount,max_discount,min_purchase,max_uses,used_count,valid_from,valid_to,is_active,created_at ${base} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return res.json({ coupons: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

router.post('/coupons', (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const b = req.body || {};
  let scope = { tenantId: null };
  try {
    scope = assertTenantScope(req);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const stampTenant = scope.tenantId || req.user?.tenantId || null;
  const code = String(b.code || '').trim().toUpperCase().slice(0, 64);
  if (!/^[A-Z0-9-]{3,64}$/.test(code)) return res.status(400).json({ error: 'الكود 3..64 (أحرف/أرقام/-)' });
  const dtype = String(b.discountType || b.discount_type || 'PCT').toUpperCase();
  if (!['PCT', 'FIXED'].includes(dtype)) return res.status(400).json({ error: 'discountType يجب PCT أو FIXED' });
  const discount = Number(b.discount);
  if (!Number.isFinite(discount) || !(discount > 0)) return res.status(400).json({ error: 'الخصم أكبر من صفر' });
  if (dtype === 'PCT' && discount > 100) return res.status(400).json({ error: 'النسبة ≤ 100' });
  const id = uuid();
  try {
    db.prepare(`INSERT INTO coupons (id,code,discount_type,discount,max_discount,min_purchase,max_uses,valid_from,valid_to,tenant_id) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(id, code, dtype, discount, Number(b.maxDiscount ?? b.max_discount) || 0, Number(b.minPurchase ?? b.min_purchase) || 0,
        Math.max(0, Math.floor(Number(b.maxUses ?? b.max_uses) || 0)), String(b.validFrom || b.valid_from || '').slice(0, 10) || null, String(b.validTo || b.valid_to || '').slice(0, 10) || null, stampTenant);
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) return res.status(409).json({ error: 'الكود مستخدم مسبقًا' });
    throw e;
  }
  req.audit?.('coupon.create', { couponId: id, code });
  return res.status(201).json({ id, code });
});

router.patch('/coupons/:id/toggle', (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT is_active, tenant_id FROM coupons WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'الكوبون غير موجود' });
  try {
    const rec = row.tenant_id ? String(row.tenant_id) : null;
    const caller = readTenant(req);
    if (rec && caller && rec !== caller) return res.status(404).json({ error: 'الكوبون غير موجود' });
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: e.statusCode === 404 ? 'الكوبون غير موجود' : String(e.message).slice(0, 200) });
  }
  const next = Number(row.is_active) ? 0 : 1;
  db.prepare('UPDATE coupons SET is_active=? WHERE id=?').run(next, id);
  req.audit?.('coupon.toggle', { couponId: id, is_active: next });
  return res.json({ id, is_active: next });
});

/** Pure coupon math shared by validate endpoint + invoice creation. */
export function computeCouponDiscount(coupon, subtotal) {
  const sub = Number(subtotal) || 0;
  if (!coupon || Number(coupon.is_active) !== 1) return { ok: false, error: 'الكوبون غير نشط' };
  const t = today();
  if (coupon.valid_from && String(coupon.valid_from).slice(0, 10) > t) return { ok: false, error: 'الكوبون لم يبدأ بعد' };
  if (coupon.valid_to && String(coupon.valid_to).slice(0, 10) < t) return { ok: false, error: 'الكوبون منتهي' };
  if (Number(coupon.min_purchase) > 0 && sub < Number(coupon.min_purchase)) return { ok: false, error: `الحد الأدنى ${coupon.min_purchase}` };
  if (Number(coupon.max_uses) > 0 && Number(coupon.used_count) >= Number(coupon.max_uses)) return { ok: false, error: 'تجاوز حد الاستخدام' };
  let off = 0;
  if (String(coupon.discount_type).toUpperCase() === 'PCT') {
    off = (sub * Number(coupon.discount)) / 100;
    if (Number(coupon.max_discount) > 0) off = Math.min(off, Number(coupon.max_discount));
  } else {
    off = Number(coupon.discount);
  }
  off = Math.max(0, Math.min(Math.round(off * 100) / 100, sub));
  return { ok: true, discount: off };
}

// POST /api/offers/coupons/validate { code, subtotal } — no side effects
router.post('/coupons/validate', (req, res) => {
  let scopeTenant = null;
  try {
    scopeTenant = readTenant(req);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const code = String(req.body?.code || '').trim().toUpperCase().slice(0, 64);
  const subtotal = Number(req.body?.subtotal);
  if (!code) return res.status(400).json({ error: 'الكود مطلوب' });
  if (!Number.isFinite(subtotal) || subtotal < 0) return res.status(400).json({ error: 'subtotal غير صالح' });
  const c = scopeTenant
    ? db.prepare('SELECT * FROM coupons WHERE code=? AND (tenant_id=? OR tenant_id IS NULL)').get(code, scopeTenant)
    : db.prepare('SELECT * FROM coupons WHERE code=?').get(code);
  if (!c) return res.status(404).json({ error: 'الكوبون غير موجود' });
  const r = computeCouponDiscount(c, subtotal);
  if (!r.ok) return res.status(400).json({ error: r.error });
  return res.json({ code, subtotal, discount: r.discount });
});

// POST /api/offers/evaluate { items:[{productId,qty,unitPrice?}], customerId? } — no side effects
// Returns every applicable active offer (validity window + thresholds) with computed
// amounts, plus BXGY free lines. The POS applies the chosen ones at submit.
router.post('/evaluate', (req, res) => {
  let scopeTenant = null;
  try {
    scopeTenant = readTenant(req);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const items = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!items?.length || items.length > 500) return res.status(400).json({ error: 'items مصفوفة 1..500' });
  const customerId = String(req.body?.customerId || '').trim().slice(0, 64) || null;
  const today = new Date().toISOString().slice(0, 10);
  // Resolve prices: explicit unitPrice wins, else catalog price.
  const ids = [...new Set(items.map((it) => String(it.productId || '').trim()).filter(Boolean))];
  const byId = new Map();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    if (scopeTenant) {
      for (const r of db.prepare(`SELECT id,unit_price FROM products WHERE id IN (${ph}) AND (tenant_id=? OR tenant_id IS NULL)`).all(...ids, scopeTenant)) byId.set(r.id, Number(r.unit_price) || 0);
    } else {
      for (const r of db.prepare(`SELECT id,unit_price FROM products WHERE id IN (${ph})`).all(...ids)) byId.set(r.id, Number(r.unit_price) || 0);
    }
  }
  let subtotal = 0;
  let totalQty = 0;
  const lines = [];
  for (const it of items) {
    const pid = String(it.productId || '').trim().slice(0, 64);
    const qty = Number(it.qty);
    if (!pid || !Number.isFinite(qty) || !(qty > 0) || qty > 100000) return res.status(400).json({ error: `بند غير صالح: ${pid || '?'}` });
    const price = it.unitPrice != null ? Number(it.unitPrice) : (byId.get(pid) ?? 0);
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: `سعر غير صالح: ${pid}` });
    subtotal = Math.round((subtotal + qty * price) * 100) / 100;
    totalQty += qty;
    lines.push({ productId: pid, qty, unitPrice: price, lineTotal: Math.round(qty * price * 100) / 100 });
  }
  const offers = scopeTenant
    ? db.prepare(`SELECT * FROM offers WHERE is_active=1 AND (tenant_id=? OR tenant_id IS NULL) AND (valid_from IS NULL OR substr(valid_from,1,10)<=?) AND (valid_to IS NULL OR substr(valid_to,1,10)>=?)`).all(scopeTenant, today, today)
    : db.prepare(`SELECT * FROM offers WHERE is_active=1 AND (valid_from IS NULL OR substr(valid_from,1,10)<=?) AND (valid_to IS NULL OR substr(valid_to,1,10)>=?)`).all(today, today);
  // one_time_per_customer: skip when this customer already bought (any live invoice).
  let boughtBefore = false;
  if (customerId) {
    const hit = scopeTenant
      ? db.prepare(`SELECT 1 FROM invoices WHERE customer_id=? AND status IN ('PAID','PARTIAL','UNPAID') AND tenant_id=? LIMIT 1`).get(customerId, scopeTenant)
      : db.prepare(`SELECT 1 FROM invoices WHERE customer_id=? AND status IN ('PAID','PARTIAL','UNPAID') LIMIT 1`).get(customerId);
    boughtBefore = !!hit;
  }
  const applicable = [];
  const freeItems = [];
  for (const o of offers) {
    if (Number(o.one_time_per_customer) === 1 && boughtBefore) continue;
    if (Number(o.min_amount) > 0 && subtotal < Number(o.min_amount)) continue;
    if (Number(o.min_qty) > 0 && totalQty < Number(o.min_qty)) continue;
    if (o.type === 'PERCENT') {
      let off = (subtotal * Number(o.value)) / 100;
      if (Number(o.max_amount) > 0) off = Math.min(off, Number(o.max_amount));
      off = Math.round(Math.min(Math.max(off, 0), subtotal) * 100) / 100;
      if (off > 0) applicable.push({ offerId: o.id, name: o.name, type: o.type, amount: off });
    } else if (o.type === 'FIXED') {
      const off = Math.round(Math.min(Number(o.value), subtotal) * 100) / 100;
      if (off > 0) applicable.push({ offerId: o.id, name: o.name, type: o.type, amount: off });
    } else if (o.type === 'BXGY') {
      // Buy min_qty (or more) of any line → value free units of the same product.
      const buy = Math.max(1, Math.floor(Number(o.min_qty) || 1));
      const free = Math.max(1, Math.floor(Number(o.value) || 1));
      for (const ln of lines) {
        const sets = Math.floor(ln.qty / buy);
        if (sets <= 0) continue;
        let freeQty = sets * free;
        if (Number(o.max_qty) > 0) freeQty = Math.min(freeQty, Number(o.max_qty));
        if (freeQty > 0) freeItems.push({ offerId: o.id, offerName: o.name, productId: ln.productId, qty: freeQty });
      }
      if (freeItems.some((f) => f.offerId === o.id)) applicable.push({ offerId: o.id, name: o.name, type: o.type, amount: 0 });
    }
  }
  const totalDiscount = Math.round(applicable.reduce((a, d) => a + Number(d.amount), 0) * 100) / 100;
  return res.json({ subtotal, totalQty, applicable, freeItems, totalDiscount: Math.min(totalDiscount, subtotal) });
});

export default router;
