/** DyPOS stock routes v1.31.0 — single source: server/lib/version.js */
import { Router } from 'express';
import db from '../db/schema.js';
import { cacheDel, sendCached } from '../lib/cache.js';
import { ah, mapErrorStatus } from '../lib/async.js';
import { idempotency } from '../lib/idempotency.js';
import { tenantContext, assertRecordTenant, resolveTenantFilter } from '../lib/tenant.js';
import { recordTrail } from '../lib/trail.js';
import { emit } from '../lib/webhooks.js';
import { emit as emitRealtime } from '../lib/realtime.js';

const router = Router();

// Tenant guard shared by mutating stock ops: the product must exist and belong
// to the caller's scope, and the warehouse tenant must match (cross-tenant IDOR
// fix). Throws { statusCode } — never mutates a foreign tenant's rows.
function guardStockAccess(req, pid, wh) {
  const prod = db.prepare('SELECT id, tenant_id FROM products WHERE id=?').get(pid);
  if (!prod) throw Object.assign(new Error('الصنف غير موجود'), { statusCode: 404 });
  assertRecordTenant(req, prod);
  const { tenantId } = tenantContext(req);
  if (tenantId) {
    const wrow = db.prepare('SELECT tenant_id FROM warehouses WHERE id=?').get(wh);
    if (wrow?.tenant_id && String(wrow.tenant_id) !== tenantId) {
      throw Object.assign(new Error('المستودع غير موجود'), { statusCode: 404 });
    }
  }
}

// GET /api/stock — bulk stock levels (bounded IN list + offset pagination)
router.get('/', ah(async (req, res) => {
  const warehouse = String(req.query.warehouse || 'W-01').slice(0, 32);
  const itemsParam = req.query.items ? String(req.query.items) : '';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  if (offset > 100000) return res.status(400).json({ error: 'Offset يتجاوز الحد — استخدم فلاتر المستودع' });
  const lowOnly = String(req.query.low || '').trim() === '1';
  const threshold = Math.max(Number(req.query.threshold) || 5, 0);
  const tenant = req.query.tenant ? String(req.query.tenant).slice(0, 64) : null;
  if (tenant) {
    const t = db.prepare('SELECT id FROM tenants WHERE id=? AND is_active=1').get(tenant);
    if (!t) return res.status(404).json({ error: 'المستأجر غير موجود أو موقف' });
  }
  let sql = 'SELECT s.*, p.name, p.code, p.barcode FROM stock_levels s JOIN products p ON s.product_id=p.id';
  const params = [];
  if (tenant) {
    // Tenant owns warehouses; stock inherits scope through its warehouse.
    sql += ' JOIN warehouses w ON s.warehouse_id=w.id AND w.tenant_id=?';
    params.push(tenant);
  }
  sql += ' WHERE s.warehouse_id=?';
  params.push(warehouse);
  if (itemsParam) {
    const ids = itemsParam.split(',').map((s) => s.trim().slice(0, 64)).filter(Boolean).slice(0, 500);
    if (!ids.length) return res.json({ stock: [], limit, offset, hasMore: false });
    sql += ` AND s.product_id IN (${ids.map(() => '?').join(',')})`;
    params.push(...ids);
  }
  if (lowOnly) { sql += ' AND s.qty<=?'; params.push(threshold); }
  sql += ' ORDER BY s.updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  const rows = db.prepare(sql).all(...params);
  const payload = { stock: rows, limit, offset, hasMore: rows.length === limit };
  if (sendCached(req, res, payload, { maxAge: 5, swr: 30 })) return;
  return res.json(payload);
}));

// GET /api/stock/:productId
router.get('/:productId', ah(async (req, res) => {
  const warehouse = String(req.query.warehouse || 'W-01').slice(0, 32);
  const pid = String(req.params.productId).slice(0, 64);
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId;
  } catch (e) {
    return res.status(mapErrorStatus(e)).json({ error: String(e.message).slice(0, 200) });
  }
  let row;
  if (scopeTenant) {
    row = db.prepare('SELECT s.*, p.name, p.code FROM stock_levels s JOIN products p ON s.product_id=p.id JOIN warehouses w ON s.warehouse_id=w.id AND w.tenant_id=? WHERE s.product_id=? AND s.warehouse_id=?').get(scopeTenant, pid, warehouse);
  } else {
    row = db.prepare('SELECT s.*, p.name, p.code FROM stock_levels s JOIN products p ON s.product_id=p.id WHERE s.product_id=? AND s.warehouse_id=?').get(pid, warehouse);
  }
  return res.json(row || { qty: 0, reserved_qty: 0, allocated_qty: 0 });
}));

// POST /api/stock/adjust — atomic UPSERT inside a transaction + audit (ADMIN/MANAGER only)
router.post('/adjust', ah(async (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية — تعديل المخزون للإدارة فقط' });
  const { productId, warehouseId = 'W-01', qty, reason = 'Manual adjustment' } = req.body || {};
  const pid = String(productId || '').trim().slice(0, 64);
  if (!pid) return res.status(400).json({ error: 'Product ID مطلوب' });
  const adj = Number(qty);
  if (!Number.isFinite(adj) || Math.abs(adj) > 1_000_000) return res.status(400).json({ error: 'كمية التعديل غير صالحة' });
  const wh = String(warehouseId).trim().slice(0, 32) || 'W-01';
  const cleanReason = String(reason).trim().slice(0, 200);

  const prod = db.prepare('SELECT id, tenant_id FROM products WHERE id=?').get(pid);
  if (!prod) return res.status(404).json({ error: 'الصنف غير موجود' });
  try {
    assertRecordTenant(req, prod);
  } catch {
    return res.status(404).json({ error: 'الصنف غير موجود' });
  }
  // stock_levels.warehouse_id is a real FK — auto-provision custom warehouses
  db.prepare('INSERT OR IGNORE INTO warehouses (id,name) VALUES (?,?)').run(wh, wh);
  try {
    const { tenantId } = tenantContext(req);
    if (tenantId) {
      const wrow = db.prepare('SELECT tenant_id FROM warehouses WHERE id=?').get(wh);
      if (wrow?.tenant_id && String(wrow.tenant_id) !== tenantId) return res.status(404).json({ error: 'المستودع غير موجود' });
    }
  } catch {
    return res.status(404).json({ error: 'المستودع غير موجود' });
  }

  const updated = db.transaction(() => {
    db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=qty+excluded.qty,updated_at=datetime('now')`).run(pid, wh, adj);
    return db.prepare('SELECT qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(pid, wh);
  })();

  req.audit?.('stock.adjust', { productId: pid, warehouseId: wh, adjustment: adj, reason: cleanReason });
  recordTrail(req, { entity: 'STOCK', entityId: `${pid}@${wh}`, action: 'ADJUST', after: { adjustment: adj, newQty: updated.qty } });
  emit('stock.adjusted', 'STOCK', `${pid}@${wh}`, { productId: pid, warehouseId: wh, adjustment: adj, newQty: updated.qty });
  emitRealtime('stock.changed', { tenantId: prod.tenant_id || req.user?.tenantId || null, productId: pid, warehouseId: wh, adjustment: adj, newQty: updated.qty });
  await cacheDel('products');
  return res.json({ productId: pid, warehouseId: wh, adjustment: adj, newQty: updated.qty, reason: cleanReason });
}));

// POST /api/stock/reserve — hold qty for an order/cart (ADMIN/MANAGER/CASHIER)
// Body: { productId, warehouseId?, qty (>0), reference? } — validates available = qty - reserved.
router.post('/reserve', ah(async (req, res) => {
  const pid = String(req.body?.productId || '').trim().slice(0, 64);
  const wh = String(req.body?.warehouseId || 'W-01').trim().slice(0, 32) || 'W-01';
  const qty = Number(req.body?.qty);
  const ref = String(req.body?.reference || '').trim().slice(0, 128);
  if (!pid) return res.status(400).json({ error: 'Product ID مطلوب' });
  if (!Number.isFinite(qty) || !(qty > 0) || qty > 1_000_000) return res.status(400).json({ error: 'الكمية أكبر من صفر' });
  try {
    guardStockAccess(req, pid, wh);
  } catch (e) {
    return res.status(mapErrorStatus(e)).json({ error: String(e.message).slice(0, 300) });
  }
  try {
    const out = db.transaction(() => {
      const row = db.prepare('SELECT qty, reserved_qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(pid, wh);
      const avail = (Number(row?.qty) || 0) - (Number(row?.reserved_qty) || 0);
      if (avail < qty - 1e-9) throw Object.assign(new Error(`المتاح غير كاف (المتاح ${avail})`), { statusCode: 402 });
      db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,reserved_qty,updated_at) VALUES (?,?,0,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET reserved_qty=reserved_qty+?,updated_at=datetime('now')`).run(pid, wh, qty, qty);
      const after = db.prepare('SELECT qty, reserved_qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(pid, wh);
      return { productId: pid, warehouseId: wh, reserved: qty, reservedQty: Number(after.reserved_qty), available: (Number(after.qty) || 0) - (Number(after.reserved_qty) || 0), reference: ref };
    })();
    req.audit?.('stock.reserve', { ...out, by: req.user?.username });
    recordTrail(req, { entity: 'STOCK', entityId: `${pid}@${wh}`, action: 'RESERVE', after: out });
    await cacheDel('products');
    return res.status(201).json(out);
  } catch (e) {
    return res.status(mapErrorStatus(e)).json({ error: String(e.message).slice(0, 300) });
  }
}));

// POST /api/stock/release — free a prior reservation (any authenticated role)
// Idempotent via Idempotency-Key header: concurrent double-release of the
// same key executes once (MAX(0) floor keeps it monotonic anyway).
// Runs inside a transaction so the read (existence) + write (decrement)
// + read (after) are atomic under the single writer.
router.post('/release', ah(async (req, res) => {
  const pid = String(req.body?.productId || '').trim().slice(0, 64);
  const wh = String(req.body?.warehouseId || 'W-01').trim().slice(0, 32) || 'W-01';
  const qty = Number(req.body?.qty);
  if (!pid) return res.status(400).json({ error: 'Product ID مطلوب' });
  if (!Number.isFinite(qty) || !(qty > 0) || qty > 1_000_000) return res.status(400).json({ error: 'الكمية أكبر من صفر' });
  try {
    guardStockAccess(req, pid, wh);
  } catch (e) {
    return res.status(mapErrorStatus(e)).json({ error: String(e.message).slice(0, 300) });
  }
  return idempotency(req, res, 'stock:release', async () => {
    const out = db.transaction(() => {
      const upd = db.prepare(`UPDATE stock_levels SET reserved_qty=MAX(0,reserved_qty-?),updated_at=datetime('now') WHERE product_id=? AND warehouse_id=?`).run(qty, pid, wh);
      if (!upd.changes) throw Object.assign(new Error('لا يوجد مخزون لهذا الصنف'), { statusCode: 404 });
      const after = db.prepare('SELECT qty, reserved_qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(pid, wh);
      return { productId: pid, warehouseId: wh, released: qty, reservedQty: Number(after?.reserved_qty) || 0, available: (Number(after?.qty) || 0) - (Number(after?.reserved_qty) || 0) };
    })();
    req.audit?.('stock.release', { productId: pid, warehouseId: wh, released: qty });
    recordTrail(req, { entity: 'STOCK', entityId: `${pid}@${wh}`, action: 'RELEASE', after: { released: qty } });
    await cacheDel('products');
    return out;
  });
}));

// POST /api/stock/transfer — atomic move between warehouses (ADMIN/MANAGER)
// Body: { productId, fromWarehouse, toWarehouse, qty (>0) } — fails closed on insufficient stock.
router.post('/transfer', ah(async (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const pid = String(req.body?.productId || '').trim().slice(0, 64);
  const fromWh = String(req.body?.fromWarehouse || '').trim().slice(0, 32);
  const toWh = String(req.body?.toWarehouse || '').trim().slice(0, 32);
  const qty = Number(req.body?.qty);
  if (!pid) return res.status(400).json({ error: 'Product ID مطلوب' });
  if (!fromWh || !toWh || fromWh === toWh) return res.status(400).json({ error: 'مستودعا المصدر والوجهة مختلفان ومطلوبان' });
  if (!Number.isFinite(qty) || !(qty > 0) || qty > 1_000_000) return res.status(400).json({ error: 'الكمية أكبر من صفر' });
  const prod = db.prepare('SELECT id, tenant_id FROM products WHERE id=?').get(pid);
  if (!prod) return res.status(404).json({ error: 'الصنف غير موجود' });
  try {
    assertRecordTenant(req, prod);
  } catch {
    return res.status(404).json({ error: 'الصنف غير موجود' });
  }
  const { tenantId } = tenantContext(req);
  if (tenantId) {
    for (const wh of [fromWh, toWh]) {
      const wrow = db.prepare('SELECT tenant_id FROM warehouses WHERE id=?').get(wh);
      if (wrow?.tenant_id && String(wrow.tenant_id) !== tenantId) {
        return res.status(404).json({ error: 'المستودع غير موجود' });
      }
    }
  }
  try {
    const out = db.transaction(() => {
      db.prepare('INSERT OR IGNORE INTO warehouses (id,name) VALUES (?,?)').run(fromWh, fromWh);
      db.prepare('INSERT OR IGNORE INTO warehouses (id,name) VALUES (?,?)').run(toWh, toWh);
      const src = db.prepare('SELECT qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(pid, fromWh);
      if (!src || Number(src.qty) < qty - 1e-9) {
        throw Object.assign(new Error(`مخزون غير كاف في ${fromWh} (المتاح ${Number(src?.qty) || 0})`), { statusCode: 402 });
      }
      db.prepare(`UPDATE stock_levels SET qty=qty-?,updated_at=datetime('now') WHERE product_id=? AND warehouse_id=?`).run(qty, pid, fromWh);
      db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=qty+excluded.qty,updated_at=datetime('now')`).run(pid, toWh, qty);
      const after = db.prepare('SELECT qty FROM stock_levels WHERE product_id=? AND warehouse_id=?').get(pid, toWh);
      return { productId: pid, fromWarehouse: fromWh, toWarehouse: toWh, qty, toQty: Number(after?.qty) || qty };
    })();
    req.audit?.('stock.transfer', out);
    recordTrail(req, { entity: 'STOCK', entityId: `${pid}@${fromWh}->${toWh}`, action: 'TRANSFER', after: out });
    emit('stock.transferred', 'STOCK', `${pid}@${fromWh}->${toWh}`, out);
    await cacheDel('products');
    return res.json(out);
  } catch (e) {
    const status = mapErrorStatus(e);
    if (status === 503) res.set('Retry-After', '2');
    return res.status(status).json({ error: String(e.message).slice(0, 300) });
  }
}));

export default router;
