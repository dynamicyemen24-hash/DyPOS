import { Router } from 'express';
import db from '../db/schema.js';
import { syncCounter } from '../middleware/metrics.js';

const router = Router();

// GET /api/sync/pull — checkpoint-based pull for ERP
router.get('/pull', (req, res) => {
  const checkpoint = Math.max(parseInt(req.query.checkpoint, 10) || 0, 0);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 2000);
  const rows = db.prepare('SELECT * FROM sync_log WHERE id>? AND status=? ORDER BY id ASC LIMIT ?').all(checkpoint, 'PENDING', limit);
  const newCheckpoint = rows.length ? rows[rows.length - 1].id : checkpoint;
  return res.json({ changes: rows, checkpoint: newCheckpoint, hasMore: rows.length === limit });
});

// POST /api/sync/push — bounded batch, per-item isolation (one bad row ≠ failed batch)
router.post('/push', (req, res) => {
  const { changes = [] } = req.body || {};
  if (!Array.isArray(changes)) return res.status(400).json({ error: 'changes يجب أن تكون مصفوفة' });
  if (changes.length > 1000) return res.status(400).json({ error: 'الدفعة تتجاوز 1000 عنصر' });
  const results = [];
  const upsert = db.transaction(() => {
    for (const ch of changes) {
      const savepoint = `sp_${String(ch.id || Math.random()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
      try {
        if (ch.entity_type === 'PRODUCT' && ch.action === 'UPSERT') {
          const p = JSON.parse(ch.payload || '{}');
          if (!p.id || !p.code || !p.name) throw new Error('بيانات صنف ناقصة');
          db.prepare(`INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,category,brand,is_active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,name_ar=excluded.name_ar,barcode=excluded.barcode,unit_price=excluded.unit_price,cost=excluded.cost,tax_rate=excluded.tax_rate,uom=excluded.uom,category=excluded.category,brand=excluded.brand,is_active=excluded.is_active,updated_at=datetime('now')`)
            .run(String(p.id).slice(0, 64), String(p.code).slice(0, 64), String(p.name).slice(0, 200), String(p.nameAr || '').slice(0, 200), String(p.barcode || '').slice(0, 64) || null, Number(p.unitPrice) || 0, Number(p.cost) || 0, Number(p.taxRate) || 15, String(p.uom || 'Unit').slice(0, 20), String(p.category || '').slice(0, 64), String(p.brand || '').slice(0, 64), p.isActive !== false ? 1 : 0);
        } else if (ch.entity_type === 'STOCK' && ch.action === 'UPSERT') {
          const s = JSON.parse(ch.payload || '{}');
          if (!s.productId || !s.warehouseId) throw new Error('بيانات مخزون ناقصة');
          db.prepare('INSERT OR IGNORE INTO warehouses (id,name) VALUES (?,?)').run(String(s.warehouseId).slice(0, 32), String(s.warehouseId).slice(0, 32));
          db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty) VALUES (?,?,?) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=excluded.qty,updated_at=datetime('now')`)
            .run(String(s.productId).slice(0, 64), String(s.warehouseId).slice(0, 32), Number(s.qty) || 0);
        } else if (ch.id == null) {
          throw new Error('معرف المزامنة مفقود');
        }
        if (ch.id != null) {
          db.prepare("UPDATE sync_log SET status='SYNCED',synced_at=datetime('now') WHERE id=?").run(ch.id);
        }
        results.push({ id: ch.id, status: 'SYNCED' });
        try { syncCounter.labels('in', 'ok').inc(); } catch { /* ignore */ }
      } catch (e) {
        try {
          if (ch.id != null) db.prepare("UPDATE sync_log SET status='FAILED' WHERE id=?").run(ch.id);
        } catch { /* ignore */ }
        results.push({ id: ch.id, status: 'FAILED', error: String(e.message).slice(0, 200) });
        try { syncCounter.labels('in', 'failed').inc(); } catch { /* ignore */ }
      }
    }
  });
  upsert();
  req.audit?.('sync.push', { total: changes.length });
  return res.json({ results, synced: results.filter(r => r.status === 'SYNCED').length, failed: results.filter(r => r.status === 'FAILED').length });
});

// GET /api/sync/checkpoint
router.get('/checkpoint', (req, res) => {
  const last = db.prepare('SELECT MAX(id) as checkpoint FROM sync_log').get();
  return res.json({ checkpoint: last?.checkpoint || 0 });
});

export default router;
