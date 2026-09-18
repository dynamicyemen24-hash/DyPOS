/**
 * DyPOS Masters — currencies + units of measure + payment methods (reference data at scale).
 * Reads: any authenticated role. Writes: ADMIN (currencies, payment methods), ADMIN/MANAGER (UoMs).
 * Invoices validate currency + line UoMs + payment methods against these tables (400 otherwise).
 */
import { Router } from 'express';
import db from '../db/schema.js';
import { convert, convertQty } from '../lib/fx.js';

const router = Router();
const isAdmin = (req) => req.user?.role === 'ADMIN';
const isManager = (req) => ['ADMIN', 'MANAGER'].includes(req.user?.role);

function page(q, def = 50) {
  return {
    limit: Math.min(Math.max(parseInt(q.limit, 10) || def, 1), 200),
    offset: Math.max(parseInt(q.offset, 10) || 0, 0),
  };
}

// ── Currencies ──
router.get('/currencies', (req, res) => {
  const { limit, offset } = page(req.query, 100);
  const active = req.query.active != null ? String(req.query.active) : null;
  let base = 'FROM currencies WHERE 1=1';
  const params = [];
  if (active === '1' || active === '0') { base += ' AND is_active=?'; params.push(Number(active)); }
  const total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
  const rows = db.prepare(`SELECT * ${base} ORDER BY is_base DESC, code LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return res.json({ currencies: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

router.post('/currencies', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const code = String(req.body?.code || '').trim().toUpperCase().slice(0, 10);
  const name = String(req.body?.name || '').trim().slice(0, 100);
  if (!/^[A-Z]{3}$/.test(code)) return res.status(400).json({ error: 'كود العملة 3 أحرف (ISO 4217)' });
  if (!name) return res.status(400).json({ error: 'اسم العملة مطلوب' });
  const rate = Number(req.body?.rateToBase ?? req.body?.rate_to_base);
  if (!Number.isFinite(rate) || !(rate > 0)) return res.status(400).json({ error: 'السعر أكبر من صفر' });
  try {
    db.prepare(`INSERT INTO currencies (code,name,name_ar,symbol,decimals,rate_to_base,is_base) VALUES (?,?,?,?,?,?,0)`)
      .run(code, name, String(req.body?.nameAr || '').slice(0, 100), String(req.body?.symbol || '').slice(0, 8), Math.max(0, Math.min(Math.floor(Number(req.body?.decimals ?? 2)), 6)), rate);
  } catch (e) {
    if (/UNIQUE|PRIMARY/i.test(String(e.message))) return res.status(409).json({ error: 'العملة موجودة مسبقًا' });
    throw e;
  }
  req.audit?.('currency.create', { code });
  return res.status(201).json({ code, name });
});

router.patch('/currencies/:code/toggle', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const code = String(req.params.code).toUpperCase().slice(0, 10);
  const row = db.prepare('SELECT is_base, is_active FROM currencies WHERE code=?').get(code);
  if (!row) return res.status(404).json({ error: 'العملة غير موجودة' });
  if (Number(row.is_base) === 1 && req.body?.isActive === false) return res.status(400).json({ error: 'لا يمكن إيقاف العملة الأساسية' });
  const next = req.body?.isActive !== false ? 1 : 0;
  db.prepare('UPDATE currencies SET is_active=? WHERE code=?').run(next, code);
  return res.json({ code, is_active: next });
});

router.post('/currencies/convert', (req, res) => {
  const amount = Number(req.body?.amount);
  const from = String(req.body?.from || '').toUpperCase().slice(0, 10);
  const to = String(req.body?.to || '').toUpperCase().slice(0, 10);
  if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ error: 'المبلغ غير صالح' });
  try {
    return res.json({ amount, from, to, converted: convert(amount, from, to) });
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
});

// ── UoMs ──
router.get('/uoms', (req, res) => {
  const { limit, offset } = page(req.query, 100);
  const active = req.query.active != null ? String(req.query.active) : null;
  const category = req.query.category ? String(req.query.category).slice(0, 20) : '';
  let base = 'FROM uoms WHERE 1=1';
  const params = [];
  if (active === '1' || active === '0') { base += ' AND is_active=?'; params.push(Number(active)); }
  if (category) { base += ' AND category=?'; params.push(category); }
  const total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
  const rows = db.prepare(`SELECT * ${base} ORDER BY category, code LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return res.json({ uoms: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

router.post('/uoms', (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const code = String(req.body?.code || '').trim().toUpperCase().slice(0, 20);
  const name = String(req.body?.name || '').trim().slice(0, 100);
  const category = String(req.body?.category || 'count').trim().slice(0, 20);
  if (!/^[A-Z0-9_]{1,20}$/.test(code)) return res.status(400).json({ error: 'كود الوحدة أحرف/أرقام/_' });
  if (!name) return res.status(400).json({ error: 'اسم الوحدة مطلوب' });
  if (!['count', 'weight', 'volume', 'length'].includes(category)) return res.status(400).json({ error: 'الفئة count|weight|volume|length' });
  const factor = Number(req.body?.factorToBase ?? req.body?.factor_to_base);
  if (!Number.isFinite(factor) || !(factor > 0)) return res.status(400).json({ error: 'المعامل أكبر من صفر' });
  try {
    db.prepare(`INSERT INTO uoms (code,name,name_ar,category,factor_to_base) VALUES (?,?,?,?,?)`)
      .run(code, name, String(req.body?.nameAr || '').slice(0, 100), category, factor);
  } catch (e) {
    if (/UNIQUE|PRIMARY/i.test(String(e.message))) return res.status(409).json({ error: 'الوحدة موجودة مسبقًا' });
    throw e;
  }
  req.audit?.('uom.create', { code });
  return res.status(201).json({ code, name });
});

router.post('/uoms/convert', (req, res) => {
  const qty = Number(req.body?.qty);
  const from = String(req.body?.from || '').slice(0, 20);
  const to = String(req.body?.to || '').slice(0, 20);
  if (!Number.isFinite(qty) || qty < 0) return res.status(400).json({ error: 'الكمية غير صالحة' });
  try {
    return res.json({ qty, from, to, converted: convertQty(qty, from, to) });
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
});

// ── Payment methods (user-managed; POST /api/invoices + /:id/pay validate) ──
const PM_KINDS = ['CASH', 'CARD', 'BANK', 'WALLET', 'OTHER'];

router.get('/payment-methods', (req, res) => {
  const { limit, offset } = page(req.query, 100);
  const active = req.query.active != null ? String(req.query.active) : null;
  let base = 'FROM payment_methods WHERE 1=1';
  const params = [];
  if (active === '1' || active === '0') { base += ' AND is_active=?'; params.push(Number(active)); }
  const total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
  const rows = db.prepare(`SELECT * ${base} ORDER BY sort_order, code LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return res.json({ methods: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

router.post('/payment-methods', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const code = String(req.body?.code || '').trim().toUpperCase().slice(0, 20);
  const name = String(req.body?.name || '').trim().slice(0, 100);
  const kind = String(req.body?.kind || 'OTHER').trim().toUpperCase().slice(0, 10);
  if (!/^[A-Z0-9_]{1,20}$/.test(code)) return res.status(400).json({ error: 'كود الطريقة أحرف/أرقام/_' });
  if (!name) return res.status(400).json({ error: 'اسم الطريقة مطلوب' });
  if (!PM_KINDS.includes(kind)) return res.status(400).json({ error: 'النوع CASH|CARD|BANK|WALLET|OTHER' });
  try {
    db.prepare(`INSERT INTO payment_methods (code,name,name_ar,kind,requires_reference,is_active,sort_order) VALUES (?,?,?,?,?,?,?)`)
      .run(code, name, String(req.body?.nameAr || '').slice(0, 100), kind, req.body?.requiresReference ? 1 : 0, 1, Math.trunc(Number(req.body?.sortOrder)) || 100);
  } catch (e) {
    if (/UNIQUE|PRIMARY/i.test(String(e.message))) return res.status(409).json({ error: 'الطريقة موجودة مسبقًا' });
    throw e;
  }
  req.audit?.('payment-method.create', { code });
  return res.status(201).json({ code, name });
});

router.patch('/payment-methods/:code/toggle', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const code = String(req.params.code).toUpperCase().slice(0, 20);
  const row = db.prepare('SELECT is_active FROM payment_methods WHERE code=?').get(code);
  if (!row) return res.status(404).json({ error: 'الطريقة غير موجودة' });
  // CASH is the system fallback (default payment + change) — it can never be
  // disabled, otherwise every default sale would 400.
  if (code === 'CASH' && req.body?.isActive === false) return res.status(400).json({ error: 'لا يمكن إيقاف النقدي (طريقة النظام الاحتياطية)' });
  const next = req.body?.isActive !== false ? 1 : 0;
  db.prepare('UPDATE payment_methods SET is_active=?,updated_at=datetime(\'now\') WHERE code=?').run(next, code);
  req.audit?.('payment-method.toggle', { code, is_active: next });
  return res.json({ code, is_active: next });
});

export default router;
