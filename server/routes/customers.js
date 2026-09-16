import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';

const router = Router();

function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

router.get('/', (req, res) => {
  const q = req.query.q ? String(req.query.q).trim().slice(0, 64) : '';
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  let sql = 'SELECT * FROM customers WHERE 1=1';
  const params = [];
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
  const countRow = db.prepare(`SELECT COUNT(*) as c FROM customers WHERE 1=1${q ? (q.length <= 3 ? ' AND (name LIKE ? OR phone LIKE ?)' : ' AND (name LIKE ? OR phone LIKE ? OR id LIKE ?)') : ''}`).get(...params);
  sql += ' ORDER BY name LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return res.json({ customers: db.prepare(sql).all(...params), total: countRow?.c || 0, limit, offset });
});

router.get('/:id/balance', (req, res) => {
  const row = db.prepare('SELECT id,name,loyalty_points,wallet_balance,credit_limit,credit_used,loyalty_tier FROM customers WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!row) return res.status(404).json({ error: 'العميل غير موجود' });
  return res.json({ ...row, credit_available: toNum(row.credit_limit) - toNum(row.credit_used) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!row) return res.status(404).json({ error: 'العميل غير موجود' });
  return res.json(row);
});

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
  const id = uuid();
  db.prepare(`INSERT INTO customers (id,name,phone,email,tax_number,loyalty_tier,credit_limit,address) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, name, phone || null, email || null, String(b.taxNumber || '').trim().slice(0, 64) || null, String(b.loyaltyTier || 'BRONZE').trim().slice(0, 20), Math.max(0, toNum(b.creditLimit)), String(b.address || '').trim().slice(0, 500));
  req.audit?.('customer.create', { customerId: id });
  return res.status(201).json({ id, name });
});

router.put('/:id', (req, res) => {
  const b = req.body || {};
  const id = String(req.params.id).slice(0, 64);
  const existing = db.prepare('SELECT id FROM customers WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'العميل غير موجود' });
  const name = String(b.name || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'اسم العميل مطلوب' });
  db.prepare(`UPDATE customers SET name=?,phone=?,email=?,tax_number=?,loyalty_tier=?,credit_limit=?,address=?,updated_at=datetime('now') WHERE id=?`)
    .run(name, String(b.phone || '').trim().slice(0, 32) || null, String(b.email || '').trim().slice(0, 128) || null, String(b.taxNumber || '').trim().slice(0, 64) || null, String(b.loyaltyTier || 'BRONZE').trim().slice(0, 20), Math.max(0, toNum(b.creditLimit)), String(b.address || '').trim().slice(0, 500), id);
  req.audit?.('customer.update', { customerId: id });
  return res.json({ id });
});

export default router;
