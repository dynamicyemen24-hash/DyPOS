import { Router } from 'express';
import db from '../db/schema.js';
import { emit } from '../lib/webhooks.js';

const router = Router();

// GET /api/stock — bulk stock levels (bounded IN list)
router.get('/', (req, res) => {
  const warehouse = String(req.query.warehouse || 'W-01').slice(0, 32);
  const itemsParam = req.query.items ? String(req.query.items) : '';
  let sql = 'SELECT s.*, p.name, p.code, p.barcode FROM stock_levels s JOIN products p ON s.product_id=p.id WHERE s.warehouse_id=?';
  const params = [warehouse];
  if (itemsParam) {
    const ids = itemsParam.split(',').map((s) => s.trim().slice(0, 64)).filter(Boolean).slice(0, 500);
    if (!ids.length) return res.json({ stock: [] });
    sql += ` AND s.product_id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  } else {
    sql += ' LIMIT 500';
  }
  return res.json({ stock: db.prepare(sql).all(...params) });
});

// GET /api/stock/:productId
router.get('/:productId', (req, res) => {
  const warehouse = String(req.query.warehouse || 'W-01').slice(0, 32);
  const row = db.prepare('SELECT s.*, p.name, p.code FROM stock_levels s JOIN products p ON s.product_id=p.id WHERE s.product_id=? AND s.warehouse_id=?').get(String(req.params.productId).slice(0, 64), warehouse);
  return res.json(row || { qty: 0, reserved_qty: 0, allocated_qty: 0 });
});

// POST /api/stock/adjust — atomic UPSERT inside a transaction + audit
router.post('/adjust', (req, res) => {
  const { productId, warehouseId = 'W-01', qty, reason = 'Manual adjustment' } = req.body || {};
  const pid = String(productId || '').trim().slice(0, 64);
  if (!pid) return res.status(400).json({ error: 'Product ID مطلوب' });
  const adj = Number(qty);
  if (!Number.isFinite(adj) || Math.abs(adj) > 1_000_000) return res.status(400).json({ error: 'كمية التعديل غير صالحة' });
  const wh = String(warehouseId).trim().slice(0, 32) || 'W-01';
  const cleanReason = String(reason).trim().slice(0, 200);

  const prod = db.prepare('SELECT id FROM products WHERE id=?').get(pid);
  if (!prod) return res.status(404).json({ error: 'الصنف غير موجود' });
  // stock_levels.warehouse_id is a real FK — auto-provision custom warehouses
  db.prepare('INSERT OR IGNORE INTO warehouses (id,name) VALUES (?,?)').run(wh, wh);

  const updated = db.transaction(() => {
    db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=qty+excluded.qty,updated_at=datetime('now')`).run(pid, wh, adj);
    return db.prepare('SELECT qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(pid, wh);
  })();

  req.audit?.('stock.adjust', { productId: pid, warehouseId: wh, adjustment: adj, reason: cleanReason });
  emit('stock.adjusted', 'STOCK', `${pid}@${wh}`, { productId: pid, warehouseId: wh, adjustment: adj, newQty: updated.qty });
  return res.json({ productId: pid, warehouseId: wh, adjustment: adj, newQty: updated.qty, reason: cleanReason });
});

export default router;
