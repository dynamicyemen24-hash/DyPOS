import { Router } from 'express';
import db from '../db/schema.js';
import { syncCounter } from '../middleware/metrics.js';
import { assertTenantScope, resolveTenantFilter } from '../lib/tenant.js';

const router = Router();

// GET /api/sync/pull — checkpoint-based pull for ERP (?entity=PRODUCT|STOCK|INVOICE…)
// Tenant-scoped (v16): a scoped caller sees its own rows + legacy NULL rows;
// cross-tenant rows are never returned (same rule as assertRecordTenant).
router.get('/pull', (req, res) => {
  const checkpoint = Math.max(parseInt(req.query.checkpoint, 10) || 0, 0);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 2000);
  const entity = req.query.entity ? String(req.query.entity).toUpperCase().slice(0, 32) : '';
  if (entity && !/^[A-Z_]{2,32}$/.test(entity)) return res.status(400).json({ error: 'نوع كيان غير صالح' });
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const params = [checkpoint, 'PENDING'];
  let sql = 'SELECT * FROM sync_log WHERE id>? AND status=?';
  if (scopeTenant) { sql += ' AND (tenant_id=? OR tenant_id IS NULL)'; params.push(scopeTenant); }
  if (entity) { sql += ' AND entity_type=?'; params.push(entity); }
  sql += ' ORDER BY id ASC LIMIT ?';
  params.push(limit);
  const rows = db.prepare(sql).all(...params);
  const newCheckpoint = rows.length ? rows[rows.length - 1].id : checkpoint;
  return res.json({ changes: rows, checkpoint: newCheckpoint, hasMore: rows.length === limit, entity: entity || null });
});

// POST /api/sync/push — bounded batch, per-item isolation (one bad row ≠ failed batch)
// ADMIN/MANAGER only — cashiers pull, never push authoritative catalog/stock.
//
// Envelope compatibility: offline clients send EITHER the server batch shape
//   { changes: [{ id, entity_type, action, payload, idempotencyKey }] }
// OR the per-operation shape
//   { operations: [{ entity_id, entity_type, operation, payload, idempotency_key }] }.
// Both are normalized to one pipeline below. INVOICE operations stay
// fail-closed (never silently SYNCED) until the sale-creation core is
// factored for reuse — see the partial-return work in invoices.js.
router.post('/push', (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية — الدفع للإدارة فقط' });
  const { changes = [], operations = [] } = req.body || {};
  if (!Array.isArray(changes)) return res.status(400).json({ error: 'changes يجب أن تكون مصفوفة' });
  if (!Array.isArray(operations)) return res.status(400).json({ error: 'operations يجب أن تكون مصفوفة' });
  const normalized = operations.map((o, i) => ({
    id: o?.id ?? o?.entity_id ?? `op-${i}`,
    entity_type: o?.entity_type,
    action: o?.action ?? o?.operation,
    payload: typeof o?.payload === 'string' ? o.payload : JSON.stringify(o?.payload ?? {}),
    idempotencyKey: o?.idempotencyKey ?? o?.idempotency_key,
  }));
  const all = [...changes, ...normalized];
  if (all.length > 1000) return res.status(400).json({ error: 'الدفعة تتجاوز 1000 عنصر' });
  let pushTenant = null;
  try {
    pushTenant = assertTenantScope(req).tenantId;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const results = [];
  const upsert = db.transaction(() => {
    for (const ch of all) {
      const _savepoint = `sp_${String(ch.id || Math.random()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)}`;
      // Declared outside try: the catch handler below (UNIQUE-race dedupe)
      // must see the same key. Declaring it inside try would scope it away.
      let idemKey = '';
      try {
        // Push idempotency (v16): a retried batch replays safely — an
        // already-SYNCED key returns deduped without re-applying.
        idemKey = ch.idempotencyKey != null ? String(ch.idempotencyKey).trim().slice(0, 128) : '';
        if (idemKey) {
          const prior = db.prepare("SELECT id FROM sync_log WHERE idempotency_key=? AND status='SYNCED' LIMIT 1").get(idemKey);
          if (prior) {
            results.push({ id: ch.id, status: 'SYNCED', deduped: true });
            try { syncCounter.labels('in', 'ok').inc(); } catch { /* ignore */ }
            continue;
          }
        }
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
        } else if (String(ch.entity_type || '').toUpperCase() === 'INVOICE') {
          // Offline sales stay fail-closed (never silently SYNCED): applying
          // them requires the sale-creation core factored for reuse, so the
          // money/stock/loyalty math cannot drift between online and sync.
          throw new Error('مزامنة الفواتير غير مدعومة بعد — أعد إرسال البيع عبر POST /api/invoices');
        } else {
          // Unknown entity/action: fail closed — never silently mark SYNCED (prevents data loss).
          throw new Error(`نوع مزامنة غير مدعوم: ${String(ch.entity_type || '?').slice(0, 32)}/${String(ch.action || '?').slice(0, 32)}`);
        }
        if (ch.id != null) {
          db.prepare(`UPDATE sync_log SET status='SYNCED',synced_at=datetime('now'),
            tenant_id=COALESCE(tenant_id, ?),
            idempotency_key=CASE WHEN ?<>'' THEN ? ELSE idempotency_key END
            WHERE id=?`).run(pushTenant, idemKey, idemKey || null, ch.id);
        }
        results.push({ id: ch.id, status: 'SYNCED' });
        try { syncCounter.labels('in', 'ok').inc(); } catch { /* ignore */ }
      } catch (e) {
        const msg = String(e.message || '');
        // A lost ACK racing a retry can hit the UNIQUE key on UPDATE even
        // though the pre-check passed — that is a successful dedupe, not a
        // failure. Never report FAILED for an idempotent replay.
        if (idemKey && /idempotency_key|idx_sync_idem/i.test(msg)) {
          results.push({ id: ch.id, status: 'SYNCED', deduped: true });
          try { syncCounter.labels('in', 'ok').inc(); } catch { /* ignore */ }
          continue;
        }
        try {
          if (ch.id != null) db.prepare("UPDATE sync_log SET status='FAILED' WHERE id=?").run(ch.id);
        } catch { /* ignore */ }
        results.push({ id: ch.id, status: 'FAILED', error: msg.slice(0, 200) });
        try { syncCounter.labels('in', 'failed').inc(); } catch { /* ignore */ }
      }
    }
  });
  upsert();
  req.audit?.('sync.push', { total: all.length });
  return res.json({ results, synced: results.filter(r => r.status === 'SYNCED').length, failed: results.filter(r => r.status === 'FAILED').length });
});

// GET /api/sync/checkpoint
router.get('/checkpoint', (_req, res) => {
  const last = db.prepare('SELECT MAX(id) as checkpoint FROM sync_log').get();
  return res.json({ checkpoint: last?.checkpoint || 0 });
});

export default router;
