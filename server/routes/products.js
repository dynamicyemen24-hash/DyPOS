/** DyPOS products routes v1.31.0 — single source: server/lib/version.js */
import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { requireRole } from '../middleware/auth.js';
import { validate, productSchema, productPatchSchema } from '../middleware/validate.js';
import { observeDb, cacheOps } from '../middleware/metrics.js';
import { getOrSet, cacheKey, cacheDel, sendCached } from '../lib/cache.js';
import { ah } from '../lib/async.js';
import { assertTenantScope, resolveTenantFilter, assertRecordTenant } from '../lib/tenant.js';
import { assertUom } from '../lib/fx.js';
import { defaultTaxRate } from '../lib/settings.js';
import { recordTrail } from '../lib/trail.js';
import { emit } from '../lib/webhooks.js';

const router = Router();

function clampInt(v, def, min, max) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

/**
 * Sanitize free text into an FTS5 prefix query (`"tok1"* "tok2"*`).
 * Returns null when nothing searchable remains (caller falls back to LIKE).
 * Quoting neutralizes every FTS5 operator, so user input can never break
 * the MATCH syntax or escape the intended AND-of-prefixes semantics.
 */
export function toFtsQuery(q) {
  const toks = String(q || '')
    .split(/[\s_.,;:!?(){}[\]<>/\\|+=~`'’"“”@#$%^&*-]+/u)
    .map((t) => t.trim().slice(0, 32))
    .filter((t) => /[\p{L}\p{N}]/u.test(t));
  if (!toks.length) return null;
  return toks.slice(0, 8).map((t) => `"${t.replace(/"/g, '""')}"*`).join(' ');
}

// GET /api/products — capped pagination + bounded search (index-friendly) + sort + total/hasMore
// Read-through cache (5s): absorbs catalog browse storms from millions of terminals.
router.get('/', ah(async (req, res) => {
  const q = req.query.q ? String(req.query.q).trim().slice(0, 64) : '';
  const category = req.query.category ? String(req.query.category).slice(0, 64) : '';
  const brand = req.query.brand ? String(req.query.brand).slice(0, 64) : '';
  const barcode = req.query.barcode ? String(req.query.barcode).slice(0, 64) : '';
  const warehouse = String(req.query.warehouse || 'W-01').slice(0, 32);
  const limit = clampInt(req.query.limit, 50, 1, 200);
  const offset = clampInt(req.query.offset, 0, 0, 100000);
  // ?count=false skips the COUNT(*) scan (infinite-scroll clients at scale).
  const wantCount = String(req.query.count ?? 'true').toLowerCase() !== 'false' && req.query.count !== '0';
  // sort: name (default) | price | created — order: asc|desc (allowlist only, no SQL injection)
  const sortKey = String(req.query.sort || 'name').trim();
  const orderDir = String(req.query.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  const sortSql = sortKey === 'price' ? 'p.unit_price' : sortKey === 'created' ? 'p.created_at' : 'p.name';
  const includeInactive = String(req.query.includeInactive || '') === '1' && ['ADMIN', 'MANAGER'].includes(req.user?.role);

  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  let where = includeInactive ? 'WHERE 1=1' : 'WHERE p.is_active=1';
  const params = [];
  let ftsMatch = null;
  if (scopeTenant) { where += ' AND p.tenant_id=?'; params.push(scopeTenant); }
  if (q) {
    // Short terms: prefix LIKE (uses idx_products_name, index-friendly).
    // Long terms: FTS5 MATCH (sub-linear at millions of rows), LIKE fallback.
    if (q.length <= 3) {
      where += ' AND (p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ?)';
      params.push(`${q}%`, `${q}%`, `${q}%`);
    } else {
      ftsMatch = toFtsQuery(q);
      if (ftsMatch) {
        where += ' AND p.rowid IN (SELECT rowid FROM products_fts WHERE products_fts MATCH ?)';
        params.push(ftsMatch);
      } else {
        where += ' AND (p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ? OR p.name_ar LIKE ?)';
        const like = `%${q}%`;
        params.push(like, like, like, like);
      }
    }
  }
  if (category) { where += ' AND p.category=?'; params.push(category); }
  if (brand) { where += ' AND p.brand=?'; params.push(brand); }
  if (barcode) { where += ' AND p.barcode=?'; params.push(barcode); }

  const key = cacheKey('products', warehouse, limit, offset, sortKey, orderDir, includeInactive ? 'all' : 'active', q, category, brand, barcode, scopeTenant || '-');
  // LIKE fallback for exotic builds without FTS5 (same filters, full scan).
  const likeFallback = (() => {
    if (!ftsMatch) return null;
    const idx = params.indexOf(ftsMatch);
    const like = `%${q}%`;
    const w = where.replace(' AND p.rowid IN (SELECT rowid FROM products_fts WHERE products_fts MATCH ?)', '');
    const ps = [...params.slice(0, idx), like, like, like, like, ...params.slice(idx + 1)];
    return {
      where: `${w} AND (p.name LIKE ? OR p.code LIKE ? OR p.barcode LIKE ? OR p.name_ar LIKE ?)`,
      params: ps,
    };
  })();
  const runList = (w, ps) => {
    const countRow = wantCount ? observeDb('products.count', () =>
      db.prepare(`SELECT COUNT(*) as c FROM products p ${w}`).get(...ps)) : null;
    const rows = observeDb('products.list', () =>
      db.prepare(
        `SELECT p.*, COALESCE(s.qty,0) as stock_qty FROM products p LEFT JOIN stock_levels s ON p.id=s.product_id AND s.warehouse_id=? ${w} ORDER BY ${sortSql} ${orderDir} LIMIT ? OFFSET ?`
      ).all(warehouse, ...ps, limit, offset));
    const total = wantCount ? countRow?.c || 0 : null;
    return { products: rows, total, limit, offset, hasMore: rows.length === limit };
  };
  const { value: payload, cached } = await getOrSet(key, 5, async () => {
    try {
      return runList(where, params);
    } catch (e) {
      // FTS5 unavailable or query rejected → LIKE fallback (correct, slower).
      if (likeFallback && /no such table|fts|syntax/i.test(String(e.message))) return runList(likeFallback.where, likeFallback.params);
      throw e;
    }
  });
  try { cacheOps.labels(cached ? 'hit' : 'miss').inc(); } catch { /* ignore */ }
  res.set('X-Cache', cached ? 'HIT' : 'MISS');
  if (sendCached(req, res, payload, { maxAge: 5, swr: 30 })) return;
  return res.json(payload);
}));

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const warehouse = String(req.query.warehouse || 'W-01').slice(0, 32);
  const row = db.prepare('SELECT p.*, COALESCE(s.qty,0) as stock_qty FROM products p LEFT JOIN stock_levels s ON p.id=s.product_id AND s.warehouse_id=? WHERE p.id=?').get(warehouse, id);
  if (!row) return res.status(404).json({ error: 'الصنف غير موجود' });
  try {
    assertRecordTenant(req, row);
  } catch (_e) {
    return res.status(404).json({ error: 'الصنف غير موجود' });
  }
  return res.json(row);
});

// POST /api/products — catalog write (ADMIN/MANAGER only: price tampering is fraud)
router.post('/', requireRole('ADMIN', 'MANAGER'), validate(productSchema), ah(async (req, res) => {
  const b = req.body;
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'اسم الصنف مطلوب' });
  let scope = { tenantId: null };
  try {
    scope = assertTenantScope(req);
    assertUom(b.uom || 'Unit');
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const id = uuid();
  const code = String(b.code || `PRD-${Date.now()}`).trim().slice(0, 64);
  try {
    db.prepare(`INSERT INTO products (id,code,name,name_ar,barcode,unit_price,cost,tax_rate,uom,image,category,brand,tenant_id,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id, code, String(b.name).trim().slice(0, 200), String(b.nameAr || '').trim().slice(0, 200), String(b.barcode || '').trim().slice(0, 64) || null, Number(b.unitPrice) || 0, Number(b.cost) || 0, b.taxRate != null ? Number(b.taxRate) : defaultTaxRate(), String(b.uom || 'Unit').trim().slice(0, 20), String(b.image || '').trim().slice(0, 500), String(b.category || '').trim().slice(0, 64), String(b.brand || '').trim().slice(0, 64), scope.tenantId, req.user?.username || null);
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) return res.status(409).json({ error: 'الكود أو الباركود مستخدم مسبقًا' });
    throw e;
  }
  await cacheDel('products');
  req.audit?.('product.create', { productId: id, code });
  recordTrail(req, { entity: 'PRODUCT', entityId: id, action: 'CREATE', after: { code, name: b.name, tenantId: scope.tenantId } });
  emit('product.created', 'PRODUCT', id, { code, name: String(b.name).trim().slice(0, 200) });
  return res.status(201).json({ id, code });
}));

// PUT /api/products/:id — full replace (ADMIN/MANAGER only)
router.put('/:id', requireRole('ADMIN', 'MANAGER'), validate(productSchema), ah(async (req, res) => {
  const b = req.body;
  const id = String(req.params.id).slice(0, 64);
  const existing = db.prepare('SELECT id FROM products WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'الصنف غير موجود' });
  try {
    if (b.uom) assertUom(b.uom);
    assertTenantScope(req);
    assertRecordTenant(req, db.prepare('SELECT tenant_id FROM products WHERE id=?').get(id));
  } catch (e) {
    const code = e.statusCode || 400;
    return res.status(code).json({ error: code === 404 ? 'الصنف غير موجود' : String(e.message).slice(0, 200) });
  }
  const before = db.prepare('SELECT name,unit_price FROM products WHERE id=?').get(id);
  db.prepare(`UPDATE products SET name=?,name_ar=?,barcode=?,unit_price=?,cost=?,tax_rate=?,uom=?,image=?,category=?,brand=?,is_active=?,updated_by=?,updated_at=datetime('now') WHERE id=?`)
    .run(String(b.name || '').trim().slice(0, 200), String(b.nameAr || '').trim().slice(0, 200), String(b.barcode || '').trim().slice(0, 64) || null, Number(b.unitPrice) || 0, Number(b.cost) || 0, b.taxRate != null ? Number(b.taxRate) : defaultTaxRate(), String(b.uom || 'Unit').trim().slice(0, 20), String(b.image || '').trim().slice(0, 500), String(b.category || '').trim().slice(0, 64), String(b.brand || '').trim().slice(0, 64), b.isActive !== false ? 1 : 0, req.user?.username || null, id);
  await cacheDel('products');
  req.audit?.('product.update', { productId: id });
  recordTrail(req, { entity: 'PRODUCT', entityId: id, action: 'UPDATE', before, after: { name: b.name, unitPrice: b.unitPrice } });
  emit('product.updated', 'PRODUCT', id, {});
  return res.json({ id });
}));

// PATCH /api/products/:id — partial update (ADMIN/MANAGER only)
router.patch('/:id', requireRole('ADMIN', 'MANAGER'), validate(productPatchSchema), ah(async (req, res) => {
  const b = req.body || {};
  const id = String(req.params.id).slice(0, 64);
  const existing = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error: 'الصنف غير موجود' });
  const map = { code: 'code', name: 'name', nameAr: 'name_ar', barcode: 'barcode', unitPrice: 'unit_price', cost: 'cost', taxRate: 'tax_rate', uom: 'uom', image: 'image', category: 'category', brand: 'brand' };
  const sets = [];
  const params = [];
  for (const [api, col] of Object.entries(map)) {
    if (b[api] === undefined) continue;
    let v = b[api];
    if (api === 'code') v = String(v).trim().slice(0, 64);
    if (['name', 'nameAr', 'uom', 'category', 'brand'].includes(api)) v = String(v).trim().slice(0, api === 'name' || api === 'nameAr' ? 200 : api === 'uom' ? 20 : 64);
    if (api === 'barcode' || api === 'image') v = String(v).trim().slice(0, api === 'barcode' ? 64 : 500) || null;
    if (['unitPrice', 'cost', 'taxRate'].includes(api)) v = Number(v) || 0;
    sets.push(`${col}=?`); params.push(v);
  }
  if (b.isActive !== undefined) { sets.push('is_active=?'); params.push(b.isActive !== false ? 1 : 0); }
  if (!sets.length) return res.status(400).json({ error: 'لا توجد حقول للتعديل' });
  try {
    if (b.uom !== undefined) assertUom(b.uom);
    assertTenantScope(req);
    assertRecordTenant(req, existing);
  } catch (e) {
    const code = e.statusCode || 400;
    return res.status(code).json({ error: code === 404 ? 'الصنف غير موجود' : String(e.message).slice(0, 200) });
  }
  sets.push('updated_by=?'); params.push(req.user?.username || null);
  params.push(id);
  try {
    db.prepare(`UPDATE products SET ${sets.join(',')},updated_at=datetime('now') WHERE id=?`).run(...params);
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) return res.status(409).json({ error: 'الباركود مستخدم مسبقًا' });
    throw e;
  }
  await cacheDel('products');
  req.audit?.('product.patch', { productId: id, fields: Object.keys(b) });
  recordTrail(req, { entity: 'PRODUCT', entityId: id, action: 'PATCH', after: b });
  emit('product.updated', 'PRODUCT', id, { partial: true });
  return res.json({ id, updated: Object.keys(b) });
}));

// DELETE /api/products/:id (soft delete — ADMIN/MANAGER only)
router.delete('/:id', ah(async (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT tenant_id FROM products WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'الصنف غير موجود' });
  try {
    assertRecordTenant(req, row);
  } catch {
    return res.status(404).json({ error: 'الصنف غير موجود' });
  }
  db.prepare("UPDATE products SET is_active=0,updated_by=?,updated_at=datetime('now') WHERE id=?").run(req.user?.username || null, id);
  await cacheDel('products');
  req.audit?.('product.delete', { productId: id });
  recordTrail(req, { entity: 'PRODUCT', entityId: id, action: 'DELETE' });
  return res.json({ deleted: true });
}));

// PATCH /api/products/:id/toggle — إيقاف/تفعيل (ADMIN/MANAGER)
router.patch('/:id/toggle', ah(async (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT is_active, tenant_id FROM products WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'الصنف غير موجود' });
  try {
    assertRecordTenant(req, row);
  } catch {
    return res.status(404).json({ error: 'الصنف غير موجود' });
  }
  const next = Number(row.is_active) ? 0 : 1;
  db.prepare('UPDATE products SET is_active=?,updated_by=?,updated_at=datetime(\'now\') WHERE id=?').run(next, req.user?.username || null, id);
  await cacheDel('products');
  req.audit?.('product.toggle', { productId: id, is_active: next });
  recordTrail(req, { entity: 'PRODUCT', entityId: id, action: 'TOGGLE', after: { is_active: next } });
  return res.json({ id, is_active: next });
}));

export default router;
