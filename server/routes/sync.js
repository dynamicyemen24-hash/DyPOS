import { Router } from 'express';
import db from '../db/schema.js';

const router = Router();

// GET /api/sync/pull — pull pending changes for ERP
router.get('/pull', (req, res) => {
  const checkpoint = Number(req.query.checkpoint) || 0;
  const limit = Math.min(Number(req.query.limit) || 500, 2000);
  const rows = db.prepare('SELECT * FROM sync_log WHERE id>? AND status=? ORDER BY id ASC LIMIT ?').all(checkpoint, 'PENDING', limit);
  const newCheckpoint = rows.length ? rows[rows.length - 1].id : checkpoint;
  return res.json({ changes: rows, checkpoint: newCheckpoint, hasMore: rows.length === limit });
});

// POST /api/sync/push — receive changes from ERP
router.post('/push', (req, res) => {
  const { changes = [] } = req.body || {};
  const results = [];
  const upsert = db.transaction(() => {
    for (const ch of changes) {
      try {
        if (ch.entity_type === 'PRODUCT' && ch.action === 'UPSERT') {
          const p = JSON.parse(ch.payload || '{}');
          db.prepare(`INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,category,brand,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_ar=excluded.name_ar,barcode=excluded.barcode,unit_price=excluded.unit_price,cost=excluded.cost,tax_rate=excluded.tax_rate,uom=excluded.uom,category=excluded.category,brand=excluded.brand,is_active=excluded.is_active,updated_at=datetime('now')`)
            .run(p.id, p.code, p.name, p.nameAr||'', p.barcode||'', Number(p.unitPrice)||0, Number(p.cost)||0, Number(p.taxRate)||15, p.uom||'Unit', p.category||'', p.brand||'', p.isActive !== false ? 1 : 0);
        }
        if (ch.entity_type === 'STOCK' && ch.action === 'UPSERT') {
          const s = JSON.parse(ch.payload || '{}');
          db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty) VALUES (?,?,?) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=excluded.qty,updated_at=datetime('now')`)
            .run(s.productId, s.warehouseId, Number(s.qty) || 0);
        }
        db.prepare("UPDATE sync_log SET status='SYNCED',synced_at=datetime('now') WHERE id=?").run(ch.id);
        results.push({ id: ch.id, status: 'SYNCED' });
      } catch (e) {
        db.prepare("UPDATE sync_log SET status='FAILED' WHERE id=?").run(ch.id);
        results.push({ id: ch.id, status: 'FAILED', error: String(e.message).slice(0, 200) });
      }
    }
  });
  upsert();
  return res.json({ results, synced: results.filter(r => r.status === 'SYNCED').length, failed: results.filter(r => r.status === 'FAILED').length });
});

// GET /api/sync/checkpoint
router.get('/checkpoint', (req, res) => {
  const last = db.prepare('SELECT MAX(id) as checkpoint FROM sync_log').get();
  return res.json({ checkpoint: last?.checkpoint || 0 });
});

export default router;