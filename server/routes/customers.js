import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { recalcTier, LOYALTY_RATE } from '../lib/loyalty.js';
import { assertTenantScope, resolveTenantFilter, assertRecordTenant } from '../lib/tenant.js';
import { recordTrail } from '../lib/trail.js';
import { emit } from '../lib/webhooks.js';
import { ah, mapErrorStatus } from '../lib/async.js';
import { idempotency } from '../lib/idempotency.js';

const router = Router();

function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

router.get('/', ah(async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim().slice(0, 64) : '';
  const active = req.query.active != null ? String(req.query.active) : null;
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId;
  } catch (e) {
    return res.status(mapErrorStatus(e)).json({ error: String(e.message).slice(0, 200) });
  }
  let sql = 'SELECT * FROM customers WHERE 1=1';
  const params = [];
  if (scopeTenant) { sql += ' AND tenant_id=?'; params.push(scopeTenant); }
  if (q) {
    if (q.length <= 3) {
      sql += ' AND (name LIKE ? OR phone LIKE ?)';
      params.push(`${q}%`, `${q}%`);
    } else {
      sql += ' AND (name LIKE ? OR phone LIKE ? OR id LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like);
    }
  }
  if (active === '1' || active === '0') { sql += ' AND is_active=?'; params.push(Number(active)); }
  // Count with same filters
  const _whereOnly = sql.replace('SELECT *', 'SELECT COUNT(*) as c').replace(' ORDER BY name LIMIT ? OFFSET ?', '');
  // Rebuild count from flags to avoid string-munging fragility
  const countSql = (() => {
    let s = 'SELECT COUNT(*) as c FROM customers WHERE 1=1';
    const p = [];
    if (scopeTenant) { s += ' AND tenant_id=?'; p.push(scopeTenant); }
    if (q) {
      if (q.length <= 3) { s += ' AND (name LIKE ? OR phone LIKE ?)'; p.push(`${q}%`, `${q}%`); }
      else { s += ' AND (name LIKE ? OR phone LIKE ? OR id LIKE ?)'; const like = `%${q}%`; p.push(like, like, like); }
    }
    if (active === '1' || active === '0') { s += ' AND is_active=?'; p.push(Number(active)); }
    return { s, p };
  })();
  const countRow = db.prepare(countSql.s).get(...countSql.p);
  sql += ' ORDER BY name LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = db.prepare(sql).all(...params);
  return res.json({ customers: rows, total: countRow?.c || 0, limit, offset, hasMore: rows.length === limit, nextCursor: rows.length === limit ? rows[rows.length - 1].id : null });
}));

router.get('/:id/balance', ah(async (req, res) => {
  const row = db.prepare('SELECT id,name,loyalty_points,wallet_balance,credit_limit,credit_used,loyalty_tier,tenant_id FROM customers WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!row) return res.status(404).json({ error: 'العميل غير موجود' });
  try {
    assertRecordTenant(req, row);
  } catch {
    return res.status(404).json({ error: 'العميل غير موجود' });
  }
  return res.json({ ...row, credit_available: toNum(row.credit_limit) - toNum(row.credit_used) });
}));

router.get('/:id', ah(async (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!row) return res.status(404).json({ error: 'العميل غير موجود' });
  try {
    assertRecordTenant(req, row);
  } catch {
    return res.status(404).json({ error: 'العميل غير موجود' });
  }
  return res.json(row);
}));

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

router.post('/', (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'اسم العميل مطلوب' });
  const phone = String(b.phone || '').trim().slice(0, 32);
  if (phone && !/^[+\d][\d\s-]{5,30}$/.test(phone)) return res.status(400).json({ error: 'رقم الجوال غير صالح' });
  const email = String(b.email || '').trim().slice(0, 128);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  let scope = { tenantId: null };
  try {
    scope = assertTenantScope(req);
  } catch (e) {
    return res.status(mapErrorStatus(e)).json({ error: String(e.message).slice(0, 200) });
  }
  const id = uuid();
  db.prepare(`INSERT INTO customers (id,name,phone,email,tax_number,loyalty_tier,credit_limit,address,tenant_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, name, phone || null, email || null, String(b.taxNumber || '').trim().slice(0, 64) || null, String(b.loyaltyTier || 'BRONZE').trim().slice(0, 20), Math.max(0, toNum(b.creditLimit)), String(b.address || '').trim().slice(0, 500), scope.tenantId, req.user?.username || null);
  req.audit?.('customer.create', { customerId: id });
  recordTrail(req, { entity: 'CUSTOMER', entityId: id, action: 'CREATE', after: { name, tenantId: scope.tenantId } });
  emit('customer.created', 'CUSTOMER', id, { name });
  return res.status(201).json({ id, name });
});

router.put('/:id', (req, res) => {
  const b = req.body || {};
  const id = String(req.params.id).slice(0, 64);
  const existing = db.prepare('SELECT id, tenant_id FROM customers WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'العميل غير موجود' });
  try {
    assertRecordTenant(req, existing);
  } catch {
    return res.status(404).json({ error: 'العميل غير موجود' });
  }
  const name = String(b.name || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'اسم العميل مطلوب' });
  const phone = String(b.phone || '').trim().slice(0, 32);
  if (phone && !/^[+\d][\d\s-]{5,30}$/.test(phone)) return res.status(400).json({ error: 'رقم الجوال غير صالح' });
  const email = String(b.email || '').trim().slice(0, 128);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح' });
  const tier = String(b.loyaltyTier || 'BRONZE').trim().slice(0, 20);
  if (!['BRONZE', 'SILVER', 'GOLD', 'PLATINUM', 'VIP'].includes(tier.toUpperCase())) return res.status(400).json({ error: 'فئة الولاء غير صالحة' });
  try {
    assertTenantScope(req);
  } catch (e) {
    return res.status(mapErrorStatus(e)).json({ error: String(e.message).slice(0, 200) });
  }
  const before = db.prepare('SELECT name,phone FROM customers WHERE id=?').get(id);
  db.prepare(`UPDATE customers SET name=?,phone=?,email=?,tax_number=?,loyalty_tier=?,credit_limit=?,address=?,updated_by=?,updated_at=datetime('now') WHERE id=?`)
    .run(name, phone || null, email || null, String(b.taxNumber || '').trim().slice(0, 64) || null, tier.toUpperCase(), Math.max(0, toNum(b.creditLimit)), String(b.address || '').trim().slice(0, 500), req.user?.username || null, id);
  req.audit?.('customer.update', { customerId: id });
  recordTrail(req, { entity: 'CUSTOMER', entityId: id, action: 'UPDATE', before, after: { name, phone } });
  return res.json({ id });
});

// PATCH /api/customers/:id/toggle — إيقاف/تفعيل (ADMIN/MANAGER)
router.patch('/:id/toggle', (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT is_active, tenant_id FROM customers WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'العميل غير موجود' });
  try {
    assertRecordTenant(req, row);
  } catch {
    return res.status(404).json({ error: 'العميل غير موجود' });
  }
  const next = Number(row.is_active) ? 0 : 1;
  db.prepare('UPDATE customers SET is_active=?,updated_at=datetime(\'now\') WHERE id=?').run(next, id);
  req.audit?.('customer.toggle', { customerId: id, is_active: next });
  recordTrail(req, { entity: 'CUSTOMER', entityId: id, action: 'TOGGLE', after: { is_active: next } });
  return res.json({ id, is_active: next });
});

// DELETE /api/customers/:id — soft-deactivate (ADMIN/MANAGER, consistent with products)
router.delete('/:id', (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT tenant_id FROM customers WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'العميل غير موجود' });
  try {
    assertRecordTenant(req, row);
  } catch {
    return res.status(404).json({ error: 'العميل غير موجود' });
  }
  const upd = db.prepare("UPDATE customers SET is_active=0,updated_at=datetime('now') WHERE id=?").run(id);
  if (!upd.changes) return res.status(404).json({ error: 'العميل غير موجود' });
  req.audit?.('customer.delete', { customerId: id });
  recordTrail(req, { entity: 'CUSTOMER', entityId: id, action: 'DELETE' });
  return res.json({ deleted: true });
});

// POST /api/customers/:id/wallet — manual wallet adjust (ADMIN/MANAGER, audited)
// Body: { amount (>0), direction: 'credit'|'debit', note? } — prevents negative balance.
router.post('/:id/wallet', ah(async (req, res) => {
  // Idempotent money movement: same key never double-credits/debits.
  return idempotency(req, res, 'customer:wallet', async () => {
    if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) throw Object.assign(new Error('صلاحية غير كافية'), { statusCode: 403 });
    const id = String(req.params.id).slice(0, 64);
    const amount = Number(req.body?.amount);
    const direction = String(req.body?.direction || 'credit').toLowerCase();
    const note = String(req.body?.note || '').trim().slice(0, 200) || 'تعديل محفظة';
    if (!Number.isFinite(amount) || !(amount > 0) || amount > 1_000_000) throw Object.assign(new Error('المبلغ أكبر من صفر وأقل من 1,000,000'), { statusCode: 400 });
    if (!['credit', 'debit'].includes(direction)) throw Object.assign(new Error('direction يجب أن يكون credit أو debit'), { statusCode: 400 });
    const out = db.transaction(() => {
      const c = db.prepare('SELECT wallet_balance, tenant_id FROM customers WHERE id=?').get(id);
      if (!c) throw Object.assign(new Error('العميل غير موجود'), { statusCode: 404 });
      try {
        assertRecordTenant(req, c);
      } catch {
        throw Object.assign(new Error('العميل غير موجود'), { statusCode: 404 });
      }
      const cur = Number(c.wallet_balance) || 0;
      const next = direction === 'credit' ? cur + amount : cur - amount;
      if (next < -0.01) throw Object.assign(new Error(`رصيد غير كاف (الحالي ${cur.toFixed(2)})`), { statusCode: 402 });
      const bal = Math.round(next * 100) / 100;
      db.prepare(`UPDATE customers SET wallet_balance=?,updated_at=datetime('now') WHERE id=?`).run(bal, id);
      db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uuid(), id, 0, direction === 'credit' ? amount : -amount, direction === 'credit' ? 'WALLET_CREDIT' : 'WALLET_DEBIT', 'MANUAL', req.user?.username || 'system', note);
      // Canonical ledger (v7) — bank-statement row with balance_after.
      db.prepare(`INSERT INTO wallet_transactions (id,customer_id,amount,direction,balance_after,reference_type,reference_id,note,created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(uuid(), id, Math.round(amount * 100) / 100, direction, bal, 'MANUAL', req.user?.username || 'system', note, req.user?.username || 'system');
      return { customerId: id, walletBalance: bal };
    })();
    req.audit?.('customer.wallet', { customerId: id, direction, amount });
    recordTrail(req, { entity: 'CUSTOMER', entityId: id, action: 'WALLET', after: { direction, amount, ...out } });
    emit('customer.wallet_adjusted', 'CUSTOMER', id, { direction, amount, ...out });
    return out;
  });
}));

// POST /api/customers/:id/loyalty/redeem — points → wallet (CASHIER+)
// Body: { points (int >0) } — rate DYPOS_LOYALTY_RATE SAR/pt, auto-tier after.
router.post('/:id/loyalty/redeem', ah(async (req, res) => {
  return idempotency(req, res, 'customer:redeem', async () => {
    const id = String(req.params.id).slice(0, 64);
    const points = Math.floor(Number(req.body?.points));
    if (!Number.isFinite(points) || !(points > 0) || points > 1_000_000) throw Object.assign(new Error('النقاط عدد صحيح أكبر من صفر'), { statusCode: 400 });
    const out = db.transaction(() => {
      const c = db.prepare('SELECT loyalty_points, wallet_balance, tenant_id FROM customers WHERE id=?').get(id);
      if (!c) throw Object.assign(new Error('العميل غير موجود'), { statusCode: 404 });
      try {
        assertRecordTenant(req, c);
      } catch {
        throw Object.assign(new Error('العميل غير موجود'), { statusCode: 404 });
      }
      if (Number(c.loyalty_points) < points) throw Object.assign(new Error(`نقاط غير كافية (الحالي ${c.loyalty_points})`), { statusCode: 402 });
      const credit = Math.round(points * LOYALTY_RATE * 100) / 100;
      const bal = Math.round(((Number(c.wallet_balance) || 0) + credit) * 100) / 100;
      db.prepare(`UPDATE customers SET loyalty_points=loyalty_points-?,wallet_balance=?,updated_at=datetime('now') WHERE id=?`).run(points, bal, id);
      db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uuid(), id, -points, credit, 'REDEEM', 'WALLET', id, `استبدال ${points} نقطة → ${credit} رصيد`);
      db.prepare(`INSERT INTO wallet_transactions (id,customer_id,amount,direction,balance_after,reference_type,reference_id,note,created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(uuid(), id, credit, 'credit', bal, 'REDEEM', id, `استبدال ${points} نقطة`, req.user?.username || 'system');
      return { customerId: id, redeemedPoints: points, walletCredit: credit };
    })();
    const tier = recalcTier(id);
    req.audit?.('customer.loyalty_redeem', { customerId: id, ...out, tier });
    recordTrail(req, { entity: 'CUSTOMER', entityId: id, action: 'REDEEM', after: { ...out, tier } });
    return { ...out, tier, rate: LOYALTY_RATE };
  });
}));

// GET /api/customers/:id/loyalty — points ledger (paginated)
router.get('/:id/loyalty', ah(async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const exists = db.prepare('SELECT id, tenant_id FROM customers WHERE id=?').get(id);
  if (!exists) return res.status(404).json({ error: 'العميل غير موجود' });
  try {
    assertRecordTenant(req, exists);
  } catch {
    return res.status(404).json({ error: 'العميل غير موجود' });
  }
  const totalRow = db.prepare('SELECT COUNT(*) as c FROM loyalty_transactions WHERE customer_id=?').get(id);
  const rows = db.prepare('SELECT * FROM loyalty_transactions WHERE customer_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(id, limit, offset);
  const total = totalRow?.c || 0;
  return res.json({ transactions: rows, total, limit, offset, hasMore: offset + rows.length < total, rate: LOYALTY_RATE });
}));

// GET /api/customers/:id/wallet — canonical money ledger (v7, paginated)
router.get('/:id/wallet', ah(async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const exists = db.prepare('SELECT id, wallet_balance, tenant_id FROM customers WHERE id=?').get(id);
  if (!exists) return res.status(404).json({ error: 'العميل غير موجود' });
  try {
    assertRecordTenant(req, exists);
  } catch {
    return res.status(404).json({ error: 'العميل غير موجود' });
  }
  let rows = [];
  let total = 0;
  try {
    total = db.prepare('SELECT COUNT(*) as c FROM wallet_transactions WHERE customer_id=?').get(id)?.c || 0;
    rows = db.prepare('SELECT * FROM wallet_transactions WHERE customer_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?').all(id, limit, offset);
  } catch {
    return res.json({ transactions: [], total: 0, limit, offset, hasMore: false, balance: Number(exists.wallet_balance) || 0, chained: false, note: 'migrate to v7 for ledger' });
  }
  return res.json({ transactions: rows, total, limit, offset, hasMore: offset + rows.length < total, balance: Number(exists.wallet_balance) || 0 });
}));

// POST /api/customers/:id/credit/pay — settle outstanding credit (any cashier role)
// Body: { amount (>0), method?, reference? } — pays down credit_used, floor 0.
router.post('/:id/credit/pay', ah(async (req, res) => {
  return idempotency(req, res, 'customer:credit-pay', async () => {
    const id = String(req.params.id).slice(0, 64);
    const amount = Number(req.body?.amount);
    const method = String(req.body?.method || 'CASH').toUpperCase().slice(0, 20);
    const reference = String(req.body?.reference || '').trim().slice(0, 128);
    if (!Number.isFinite(amount) || !(amount > 0) || amount > 10_000_000) throw Object.assign(new Error('المبلغ أكبر من صفر'), { statusCode: 400 });
    const out = db.transaction(() => {
      const c = db.prepare('SELECT credit_used, tenant_id FROM customers WHERE id=?').get(id);
      if (!c) throw Object.assign(new Error('العميل غير موجود'), { statusCode: 404 });
      try {
        assertRecordTenant(req, c);
      } catch {
        throw Object.assign(new Error('العميل غير موجود'), { statusCode: 404 });
      }
      const owed = Number(c.credit_used) || 0;
      if (owed <= 0.01) throw Object.assign(new Error('لا يوجد رصيد مستحق على العميل'), { statusCode: 400 });
      const pay = Math.round(Math.min(amount, owed) * 100) / 100;
      db.prepare(`UPDATE customers SET credit_used=MAX(0,credit_used-?),updated_at=datetime('now') WHERE id=?`).run(pay, id);
      db.prepare(`INSERT INTO loyalty_transactions (id,customer_id,points,amount,type,reference_type,reference_id,note) VALUES (?,?,?,?,?,?,?,?)`)
        .run(uuid(), id, 0, -pay, 'CREDIT_PAY', method, reference || 'credit-settlement', `سداد ائتمان ${pay} عبر ${method}`);
      return { customerId: id, paid: pay, remainingCredit: Math.round((owed - pay) * 100) / 100, method };
    })();
    req.audit?.('customer.credit_pay', { customerId: id, ...out });
    recordTrail(req, { entity: 'CUSTOMER', entityId: id, action: 'CREDIT_PAY', after: out });
    return out;
  });
}));

export default router;
