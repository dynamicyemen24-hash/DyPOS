import { Router } from 'express';
import db from '../db/schema.js';

const router = Router();

// GET /api/stock — bulk stock levels
router.get('/', (req, res) => {
  const { warehouse = 'W-01', items } = req.query;
  let sql = 'SELECT s.*, p.name, p.code, p.barcode FROM stock_levels s JOIN products p ON s.product_id=p.id WHERE s.warehouse_id=?';
  const params = [warehouse];
  if (items) {
    const ids = String(items).split(',').filter(Boolean);
    if (ids.length) { sql += ` AND s.product_id IN (${ids.map(() => '?').join(',')})`; params.push(...ids); }
  }
  return res.json({ stock: db.prepare(sql).all(...params) });
});

// GET /api/stock/:productId
router.get('/:productId', (req, res) => {
  const { warehouse = 'W-01' } = req.query;
  const row = db.prepare('SELECT s.*, p.name, p.code FROM stock_levels s JOIN products p ON s.product_id=p.id WHERE s.product_id=? AND s.warehouse_id=?').get(req.params.productId, warehouse);
  return res.json(row || { qty: 0, reserved_qty: 0, allocated_qty: 0 });
});

// POST /api/stock/adjust
router.post('/adjust', (req, res) => {
  const { productId, warehouseId = 'W-01', qty, reason = 'Manual adjustment' } = req.body || {};
  if (!productId) return res.status(400).json({ error: 'Product ID مطلوب' });
  const adj = Number(qty) || 0;
  const existing = db.prepare('SELECT qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(productId, warehouseId);
  if (existing) {
    db.prepare('UPDATE stock_levels SET qty=qty+?,updated_at=datetime(\'now\') WHERE product_id=? AND warehouse_id=?').run(adj, productId, warehouseId);
  } else {
    db.prepare('INSERT INTO stock_levels (product_id,warehouse_id,qty) VALUES (?,?,?)').run(productId, warehouseId, adj);
  }
  const updated = db.prepare('SELECT qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(productId, warehouseId);
  return res.json({ productId, warehouseId, adjustment: adj, newQty: updated.qty, reason });
});

export default router;