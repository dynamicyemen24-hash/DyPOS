import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { requireRole } from '../middleware/auth.js';
import { parseCsv } from '../lib/csv.js';
import { assertTenantScope } from '../lib/tenant.js';

const router = Router();
router.use(requireRole('ADMIN', 'MANAGER'));

const MAX_ROWS = 2000;

function num(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function str(v, max) {
  return String(v ?? '').trim().slice(0, max);
}

/** Normalize body → row objects (JSON array or CSV text). */
function readRows(req) {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('text/csv') || typeof req.body === 'string') {
    if (!req.body || !String(req.body).trim()) throw Object.assign(new Error('ملف CSV فارغ'), { statusCode: 400 });
    return parseCsv(String(req.body), { maxRows: MAX_ROWS }).rows;
  }
  if (!Array.isArray(req.body)) throw Object.assign(new Error('أرسل مصفوفة JSON أو text/csv'), { statusCode: 400 });
  if (!req.body.length) throw Object.assign(new Error('لا توجد صفوف'), { statusCode: 400 });
  if (req.body.length > MAX_ROWS) throw Object.assign(new Error(`تجاوز الحد (${MAX_ROWS} صف)`), { statusCode: 400 });
  return req.body;
}

function normRow(r) {
  // Accept both API names (unitPrice) and CSV headers (unit_price)
  const o = {};
  for (const [k, v] of Object.entries(r)) o[k] = typeof v === 'string' ? v.trim() : v;
  return {
    code: str(o.code, 64), name: str(o.name, 200), nameAr: str(o.nameAr || o.name_ar, 200),
    barcode: str(o.barcode, 64), unitPrice: o.unitPrice ?? o.unit_price, cost: o.cost ?? 0,
    taxRate: o.taxRate ?? o.tax_rate ?? 15, uom: str(o.uom || 'Unit', 20),
    category: str(o.category, 64), brand: str(o.brand, 64),
    phone: str(o.phone, 32), email: str(o.email, 128), taxNumber: str(o.taxNumber || o.tax_number, 64),
    loyaltyTier: str(o.loyaltyTier || o.loyalty_tier || 'BRONZE', 20), creditLimit: o.creditLimit ?? o.credit_limit ?? 0,
    productCode: str(o.productCode || o.product_code, 64), productId: str(o.productId || o.product_id, 64),
    warehouseId: str(o.warehouseId || o.warehouse_id || 'W-01', 32), qty: o.qty ?? 0, id: str(o.id, 64),
  };
}

const validators = {
  products: (r) => {
    const e = [];
    if (!r.code) e.push('code مطلوب');
    if (!r.name) e.push('name مطلوب');
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) e.push('email غير صالح');
    if (num(r.unitPrice) < 0 || num(r.unitPrice) > 1_000_000) e.push('unitPrice خارج الحد');
    if (num(r.taxRate) < 0 || num(r.taxRate) > 100) e.push('taxRate خارج الحد');
    return e;
  },
  customers: (r) => {
    const e = [];
    if (!r.name) e.push('name مطلوب');
    if (r.phone && !/^[+\d][\d\s-]{5,30}$/.test(r.phone)) e.push('phone غير صالح');
    if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) e.push('email غير صالح');
    return e;
  },
  stock: (r) => {
    const e = [];
    if (!r.productCode && !r.productId) e.push('productCode أو productId مطلوب');
    if (!Number.isFinite(Number(r.qty)) || Math.abs(Number(r.qty)) > 1_000_000) e.push('qty غير صالحة');
    return e;
  },
};

/**
 * Persistent writes are stamped with the caller's tenant (assertTenantScope
 * validates existence + the cross-tenant spoof guard). A scoped import can never
 * overwrite another tenant's records: same-code products / same-phone customers
 * owned by another tenant fail with 403/404 instead of mutating them.
 */
function commit(entity, rows, tenantId) {
  return db.transaction(() => {
    let created = 0, updated = 0;
    if (entity === 'products') {
      const stmt = db.prepare(`INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,category,brand,is_active,tenant_id)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(code) DO UPDATE SET name=excluded.name,name_ar=excluded.name_ar,barcode=excluded.barcode,unit_price=excluded.unit_price,cost=excluded.cost,tax_rate=excluded.tax_rate,uom=excluded.uom,category=excluded.category,brand=excluded.brand,is_active=1,tenant_id=excluded.tenant_id,updated_at=datetime('now')`);
      const existed = db.prepare('SELECT id, tenant_id FROM products WHERE code=?');
      for (const r of rows) {
        const ex = existed.get(r.code);
        if (ex && tenantId && ex.tenant_id && String(ex.tenant_id) !== tenantId) {
          throw Object.assign(new Error(`الكود مملوك لمستأجر آخر: ${r.code}`), { statusCode: 403 });
        }
        const isUpd = !!ex;
        stmt.run(uuid(), r.code, r.name, r.nameAr || '', r.barcode || null, num(r.unitPrice), num(r.cost), num(r.taxRate, 15), r.uom, r.category || '', r.brand || '', tenantId);
        if (isUpd) updated++; else created++;
      }
    } else if (entity === 'customers') {
      const byId = db.prepare('SELECT id, tenant_id FROM customers WHERE id=?');
      const byPhone = db.prepare('SELECT id, tenant_id FROM customers WHERE phone=? AND phone IS NOT NULL AND phone<>""');
      const ins = db.prepare(`INSERT INTO customers (id,name,phone,email,tax_number,loyalty_tier,credit_limit,tenant_id) VALUES (?,?,?,?,?,?,?,?)`);
      const upd = db.prepare(`UPDATE customers SET name=?,phone=?,email=?,tax_number=?,loyalty_tier=?,credit_limit=?,tenant_id=COALESCE(tenant_id,?),updated_at=datetime('now') WHERE id=?`);
      for (const r of rows) {
        const hit = (r.id && byId.get(r.id)) || (r.phone && byPhone.get(r.phone));
        if (hit) {
          if (tenantId && hit.tenant_id && String(hit.tenant_id) !== tenantId) {
            throw Object.assign(new Error('العميل مملوك لمستأجر آخر'), { statusCode: 403 });
          }
          upd.run(r.name, r.phone || null, r.email || null, r.taxNumber || null, r.loyaltyTier, Math.max(0, num(r.creditLimit)), tenantId, hit.id); updated++;
        }
        else { ins.run(uuid(), r.name, r.phone || null, r.email || null, r.taxNumber || null, r.loyaltyTier, Math.max(0, num(r.creditLimit)), tenantId); created++; }
      }
    } else if (entity === 'stock') {
      const byCode = db.prepare('SELECT id, tenant_id FROM products WHERE code=?');
      const byId = db.prepare('SELECT id, tenant_id FROM products WHERE id=?');
      const ensureWh = db.prepare('INSERT OR IGNORE INTO warehouses (id,name,tenant_id) VALUES (?,?,?)');
      const wrow = db.prepare('SELECT tenant_id FROM warehouses WHERE id=?');
      const set = db.prepare(`INSERT INTO stock_levels (product_id,warehouse_id,qty,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(product_id,warehouse_id) DO UPDATE SET qty=excluded.qty,updated_at=datetime('now')`);
      for (const r of rows) {
        const prod = (r.productId && byId.get(r.productId)) || (r.productCode && byCode.get(r.productCode));
        if (!prod) throw new Error(`صنف غير موجود: ${r.productCode || r.productId}`);
        if (tenantId && prod.tenant_id && String(prod.tenant_id) !== tenantId) {
          throw Object.assign(new Error(`صنف غير موجود: ${r.productCode || r.productId}`), { statusCode: 404 });
        }
        const pid = r.productId && byId.get(r.productId) ? r.productId : prod.id;
        const wh = wrow.get(r.warehouseId);
        if (wh && tenantId && wh.tenant_id && String(wh.tenant_id) !== tenantId) {
          throw Object.assign(new Error('المستودع مملوك لمستأجر آخر'), { statusCode: 403 });
        }
        ensureWh.run(r.warehouseId, r.warehouseId, tenantId);
        set.run(pid, r.warehouseId, Number(r.qty));
        updated++;
      }
    }
    return { created, updated };
  })();
}

// POST /api/import/:entity?dryRun=1 — JSON array or text/csv
router.post('/:entity', (req, res) => {
  const entity = req.params.entity;
  if (!validators[entity]) return res.status(404).json({ error: 'كيان غير مدعوم', supported: Object.keys(validators) });
  let raw;
  try {
    raw = readRows(req);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const rows = raw.map(normRow);
  const errors = [];
  rows.forEach((r, i) => {
    const e = validators[entity](r);
    if (e.length) errors.push({ row: i + 1, errors: e });
  });
  if (errors.length) {
    return res.status(400).json({ error: `تحقق فاشل في ${errors.length} صفًا — لم يُكتب شيء`, errors: errors.slice(0, 20) });
  }
  const dryRun = String(req.query.dryRun || '') === '1' || String(req.query.dryRun || '').toLowerCase() === 'true';
  let scopeTenant = null;
  try {
    scopeTenant = assertTenantScope(req)?.tenantId || req.user?.tenantId || null;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  if (dryRun) return res.json({ dryRun: true, entity, rows: rows.length, valid: true });
  try {
    const result = commit(entity, rows, scopeTenant);
    req.audit?.('import.commit', { entity, ...result });
    try {
      db.prepare(`INSERT INTO webhook_outbox (event,entity_type,payload) VALUES (?,?,?)`)
        .run('import.completed', entity.toUpperCase(), JSON.stringify({ entity, ...result }));
    } catch { /* outbox best-effort */ }
    return res.status(201).json({ entity, rows: rows.length, ...result });
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message || '').slice(0, 300) });
  }
});

export default router;
