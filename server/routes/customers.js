import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';

const router = Router();

router.get('/', (req, res) => {
  const { q, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT * FROM customers WHERE 1=1';
  const params = [];
  if (q) { sql += ' AND (name LIKE ? OR phone LIKE ? OR id LIKE ?)'; const like = `%${q}%`; params.push(like, like, like); }
  sql += ' ORDER BY name LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  return res.json({ customers: db.prepare(sql).all(...params) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM customers WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'العميل غير موجود' });
  return res.json(row);
});

router.post('/', (req, res) => {
  const b = req.body;
  const id = uuid();
  db.prepare(`INSERT INTO customers (id,name,phone,email,tax_number,loyalty_tier,credit_limit,address) VALUES (?,?,?,?,?,?,?,?)`)
    .run(id, String(b.name||'').trim(), String(b.phone||'').trim(), String(b.email||'').trim(), String(b.taxNumber||'').trim(), String(b.loyaltyTier||'BRONZE').trim(), Number(b.creditLimit)||0, String(b.address||'').trim());
  return res.status(201).json({ id, ...b });
});

router.put('/:id', (req, res) => {
  const b = req.body;
  const existing = db.prepare('SELECT id FROM customers WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'العميل غير موجود' });
  db.prepare(`UPDATE customers SET name=?,phone=?,email=?,tax_number=?,loyalty_tier=?,credit_limit=?,address=?,updated_at=datetime('now') WHERE id=?`)
    .run(String(b.name||'').trim(), String(b.phone||'').trim(), String(b.email||'').trim(), String(b.taxNumber||'').trim(), String(b.loyaltyTier||'BRONZE').trim(), Number(b.creditLimit)||0, String(b.address||'').trim(), req.params.id);
  return res.json({ id: req.params.id, ...b });
});

router.get('/:id/balance', (req, res) => {
  const row = db.prepare('SELECT id,name,loyalty_points,wallet_balance,credit_limit,credit_used,loyalty_tier FROM customers WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'العميل غير موجود' });
  return res.json({ ...row, credit_available: row.credit_limit - row.credit_used });
});

export default router;