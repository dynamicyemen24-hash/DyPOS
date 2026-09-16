import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { validate, productSchema } from '../middleware/validate.js';
import { emit } from '../lib/webhooks.js';

const router = Router();

function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

// GET /api/products — capped pagination + bounded search (index-friendly)
router.get('/', (req, res) => {
  const q = req.query.q ? String(req.query.q).trim().slice(0, 64) : '';
  const category = req.query.category ? String(req.query.category).slice(0, 64) : '';
  const brand = req.query.brand ? String(req.query.brand).slice(0, 64) : '';
  const barcode = req.query.barcode ? String(req.query.barcode).slice(0, 64) : '';
  const warehouse = String(req.query.warehouse || 'W-01').slice(0, 32);
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 100000);

  let where = 'WHERE p.is_active=1';
  const params = [];
  if (q) {
    // Prefix search first (uses idx_products_name), fallback contains only for short terms
    if (q.length <= 3) {
      where += ' AND (p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ?)';
      params.push(`${q}%`, `${q}%`, `${q}%`);
    } else {
      where += ' AND (p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ? OR p.name_ar LIKE ?)';
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
  }
  if (category) { where += ' AND p.category=?'; params.push(category); }
  if (brand) { where += ' AND p.brand=?'; params.push(brand); }
  if (barcode) { where += ' AND p.barcode=?'; params.push(barcode); }

  const countRow = db.prepare(`SELECT COUNT(*) as c FROM products p ${where}`).get(...params);
  const rows = db.prepare(
    `SELECT p.*, COALESCE(s.qty,0) as stock_qty FROM products p LEFT JOIN stock_levels s ON p.id=s.product_id AND s.warehouse_id=? ${where} ORDER BY p.name LIMIT ? OFFSET ?`
  ).all(warehouse, ...params, limit, offset);
  return res.json({ products: rows, total: countRow?.c || 0, limit, offset });
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const warehouse = String(req.query.warehouse || 'W-01').slice(0, 32);
  const row = db.prepare('SELECT p.*, COALESCE(s.qty,0) as stock_qty FROM products p LEFT JOIN stock_levels s ON p.id=s.product_id AND s.warehouse_id=? WHERE p.id=?').get(warehouse, id);
  if (!row) return res.status(404).json({ error: 'الصنف غير موجود' });
  return res.json(row);
});

// POST /api/products
router.post('/', validate(productSchema), (req, res) => {
  const b = req.body;
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'اسم الصنف مطلوب' });
  const id = uuid();
  const code = String(b.code || `PRD-${Date.now()}`).trim().slice(0, 64);
  try {
    db.prepare(`INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,image,category,brand) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, code, String(b.name).trim().slice(0, 200), String(b.nameAr || '').trim().slice(0, 200), String(b.barcode || '').trim().slice(0, 64) || null, Number(b.unitPrice) || 0, Number(b.cost) || 0, Number(b.taxRate ?? 15), String(b.uom || 'Unit').trim().slice(0, 20), String(b.image || '').trim().slice(0, 500), String(b.category || '').trim().slice(0, 64), String(b.brand || '').trim().slice(0, 64));
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) return res.status(409).json({ error: 'الكود أو الباركود مستخدم مسبقًا' });
    throw e;
  }
  req.audit?.('product.create', { productId: id, code });
  emit('product.created', 'PRODUCT', id, { code, name: String(b.name).trim().slice(0, 200) });
  return res.status(201).json({ id, code });
});

// PUT /api/products/:id
router.put('/:id', validate(productSchema), (req, res) => {
  const b = req.body;
  const id = String(req.params.id).slice(0, 64);
  const existing = db.prepare('SELECT id FROM products WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'الصنف غير موجود' });
  db.prepare(`UPDATE products SET name=?,name_ar=?,barcode=?,unit_price=?,cost=?,tax_rate=?,uom=?,image=?,category=?,brand=?,is_active=?,updated_at=datetime('now') WHERE id=?`)
    .run(String(b.name || '').trim().slice(0, 200), String(b.nameAr || '').trim().slice(0, 200), String(b.barcode || '').trim().slice(0, 64) || null, Number(b.unitPrice) || 0, Number(b.cost) || 0, Number(b.taxRate ?? 15), String(b.uom || 'Unit').trim().slice(0, 20), String(b.image || '').trim().slice(0, 500), String(b.category || '').trim().slice(0, 64), String(b.brand || '').trim().slice(0, 64), b.isActive !== false ? 1 : 0, id);
  req.audit?.('product.update', { productId: id });
  emit('product.updated', 'PRODUCT', id, {});
  return res.json({ id });
});

// DELETE /api/products/:id (soft delete — إيقاف)
router.delete('/:id', (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  db.prepare("UPDATE products SET is_active=0,updated_at=datetime('now') WHERE id=?").run(id);
  req.audit?.('product.delete', { productId: id });
  return res.json({ deleted: true });
});

// PATCH /api/products/:id/toggle — إيقاف/تفعيل (ADMIN/MANAGER)
router.patch('/:id/toggle', (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT is_active FROM products WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'الصنف غير موجود' });
  const next = Number(row.is_active) ? 0 : 1;
  db.prepare('UPDATE products SET is_active=?,updated_at=datetime(\'now\') WHERE id=?').run(next, id);
  req.audit?.('product.toggle', { productId: id, is_active: next });
  return res.json({ id, is_active: next });
});

export default router;
