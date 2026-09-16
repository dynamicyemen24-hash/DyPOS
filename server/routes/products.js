import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';

const router = Router();

// GET /api/products — list with search
router.get('/', (req, res) => {
  const { q, category, brand, barcode, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT p.*, COALESCE(s.qty,0) as stock_qty FROM products p LEFT JOIN stock_levels s ON p.id=s.product_id AND s.warehouse_id=? WHERE p.is_active=1';
  const params = [String(req.query.warehouse || 'W-01')];
  if (q) { sql += ' AND (p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ? OR p.name_ar LIKE ?)'; const like = `%${q}%`; params.push(like, like, like, like); }
  if (category) { sql += ' AND p.category=?'; params.push(category); }
  if (brand) { sql += ' AND p.brand=?'; params.push(brand); }
  if (barcode) { sql += ' AND p.barcode=?'; params.push(barcode); }
  sql += ' ORDER BY p.name LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));
  const rows = db.prepare(sql).all(...params);
  return res.json({ products: rows, total: rows.length });
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT p.*, COALESCE(s.qty,0) as stock_qty FROM products p LEFT JOIN stock_levels s ON p.id=s.product_id AND s.warehouse_id=? WHERE p.id=?').get(String(req.query.warehouse || 'W-01'), req.params.id);
  if (!row) return res.status(404).json({ error: 'الصنف غير موجود' });
  return res.json(row);
});

// POST /api/products
router.post('/', (req, res) => {
  const b = req.body;
  const id = uuid();
  const code = String(b.code || `PRD-${Date.now()}`).trim();
  db.prepare(`INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,image,category,brand) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, code, String(b.name||'').trim(), String(b.nameAr||'').trim(), String(b.barcode||'').trim(), Number(b.unitPrice)||0, Number(b.cost)||0, Number(b.taxRate)||15, String(b.uom||'Unit').trim(), String(b.image||'').trim(), String(b.category||'').trim(), String(b.brand||'').trim());
  return res.status(201).json({ id, code, ...b });
});

// PUT /api/products/:id
router.put('/:id', (req, res) => {
  const b = req.body;
  const existing = db.prepare('SELECT id FROM products WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'الصنف غير موجود' });
  db.prepare(`UPDATE products SET name=?,name_ar=?,barcode=?,unit_price=?,cost=?,tax_rate=?,uom=?,image=?,category=?,brand=?,is_active=?,updated_at=datetime('now') WHERE id=?`)
    .run(String(b.name||'').trim(), String(b.nameAr||'').trim(), String(b.barcode||'').trim(), Number(b.unitPrice)||0, Number(b.cost)||0, Number(b.taxRate)||15, String(b.uom||'Unit').trim(), String(b.image||'').trim(), String(b.category||'').trim(), String(b.brand||'').trim(), b.isActive !== false ? 1 : 0, req.params.id);
  return res.json({ id: req.params.id, ...b });
});

// DELETE /api/products/:id (soft delete)
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE products SET is_active=0,updated_at=datetime(\'now\') WHERE id=?').run(req.params.id);
  return res.json({ deleted: true });
});

export default router;