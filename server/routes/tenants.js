/**
 * DyPOS Tenancy — subscribers (tenants) → organizations → branches.
 * Hierarchy enforced on write; reads filterable (?tenant= / ?org=).
 * Roles: tenants/orgs ADMIN-only; branches ADMIN/MANAGER (reads wider).
 */
import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';

const router = Router();
const isAdmin = (req) => req.user?.role === 'ADMIN';
const isManager = (req) => ['ADMIN', 'MANAGER'].includes(req.user?.role);
const canRead = (req) => ['ADMIN', 'MANAGER', 'AUDITOR'].includes(req.user?.role);

function page(q, def = 50) {
  return {
    limit: Math.min(Math.max(parseInt(q.limit, 10) || def, 1), 200),
    offset: Math.max(parseInt(q.offset, 10) || 0, 0),
  };
}
function paged(base, params, limit, offset) {
  const total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
  const rows = db.prepare(`SELECT * ${base} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { total, rows, limit, offset, hasMore: offset + rows.length < total };
}

// ── Tenants ──
router.get('/tenants', (req, res) => {
  if (!canRead(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const { limit, offset } = page(req.query);
  const active = req.query.active != null ? String(req.query.active) : null;
  let base = 'FROM tenants WHERE 1=1';
  const params = [];
  if (active === '1' || active === '0') { base += ' AND is_active=?'; params.push(Number(active)); }
  const { total, rows, hasMore } = paged(base, params, limit, offset);
  return res.json({ tenants: rows, total, limit, offset, hasMore });
});

router.post('/tenants', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const name = String(req.body?.name || '').trim().slice(0, 200);
  if (!name) return res.status(400).json({ error: 'اسم المشترك مطلوب' });
  const code = String(req.body?.code || '').trim().toUpperCase().slice(0, 32) || null;
  if (code && !/^[A-Z0-9-]{2,32}$/.test(code)) return res.status(400).json({ error: 'الكود 2..32 (أحرف/أرقام/-)' });
  const plan = String(req.body?.plan || 'standard').trim().slice(0, 32);
  const id = uuid();
  try {
    db.prepare('INSERT INTO tenants (id,name,code,plan) VALUES (?,?,?,?)').run(id, name, code, plan);
  } catch (e) {
    if (/UNIQUE/i.test(String(e.message))) return res.status(409).json({ error: 'الكود مستخدم مسبقًا' });
    throw e;
  }
  req.audit?.('tenant.create', { tenantId: id, name });
  return res.status(201).json({ id, name, code, plan });
});

router.get('/tenants/:id', (req, res) => {
  if (!canRead(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const row = db.prepare('SELECT * FROM tenants WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!row) return res.status(404).json({ error: 'المشترك غير موجود' });
  const orgs = db.prepare('SELECT COUNT(*) as c FROM organizations WHERE tenant_id=?').get(row.id)?.c || 0;
  return res.json({ ...row, organizations: orgs });
});

router.patch('/tenants/:id/toggle', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT is_active FROM tenants WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'المشترك غير موجود' });
  const next = Number(row.is_active) ? 0 : 1;
  db.prepare("UPDATE tenants SET is_active=?,updated_at=datetime('now') WHERE id=?").run(next, id);
  req.audit?.('tenant.toggle', { tenantId: id, is_active: next });
  return res.json({ id, is_active: next });
});

// ── Organizations ──
router.get('/orgs', (req, res) => {
  if (!canRead(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const { limit, offset } = page(req.query);
  let base = 'FROM organizations WHERE 1=1';
  const params = [];
  if (req.query.tenant) { base += ' AND tenant_id=?'; params.push(String(req.query.tenant).slice(0, 64)); }
  const { total, rows, hasMore } = paged(base, params, limit, offset);
  return res.json({ organizations: rows, total, limit, offset, hasMore });
});

router.post('/orgs', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const tenantId = String(req.body?.tenantId || '').trim().slice(0, 64);
  const name = String(req.body?.name || '').trim().slice(0, 200);
  if (!tenantId) return res.status(400).json({ error: 'tenantId مطلوب' });
  if (!name) return res.status(400).json({ error: 'اسم المؤسسة مطلوب' });
  const t = db.prepare('SELECT id FROM tenants WHERE id=? AND is_active=1').get(tenantId);
  if (!t) return res.status(404).json({ error: 'المستأجر غير موجود أو موقف' });
  const id = uuid();
  db.prepare('INSERT INTO organizations (id,tenant_id,name,code,vat_number) VALUES (?,?,?,?,?)')
    .run(id, tenantId, name, String(req.body?.code || '').trim().slice(0, 32) || null, String(req.body?.vatNumber || '').trim().slice(0, 32) || null);
  req.audit?.('org.create', { orgId: id, tenantId, name });
  return res.status(201).json({ id, tenantId, name });
});

router.get('/orgs/:id', (req, res) => {
  if (!canRead(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const row = db.prepare('SELECT * FROM organizations WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!row) return res.status(404).json({ error: 'المؤسسة غير موجودة' });
  const branches = db.prepare('SELECT COUNT(*) as c FROM branches WHERE org_id=?').get(row.id)?.c || 0;
  return res.json({ ...row, branches });
});

// ── Branches ──
router.get('/branches', (req, res) => {
  if (!canRead(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const { limit, offset } = page(req.query);
  let base = 'FROM branches WHERE 1=1';
  const params = [];
  if (req.query.org) { base += ' AND org_id=?'; params.push(String(req.query.org).slice(0, 64)); }
  if (req.query.tenant) { base += ' AND tenant_id=?'; params.push(String(req.query.tenant).slice(0, 64)); }
  const { total, rows, hasMore } = paged(base, params, limit, offset);
  return res.json({ branches: rows, total, limit, offset, hasMore });
});

router.post('/branches', (req, res) => {
  if (!isManager(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const orgId = String(req.body?.orgId || '').trim().slice(0, 64);
  const name = String(req.body?.name || '').trim().slice(0, 200);
  if (!orgId) return res.status(400).json({ error: 'orgId مطلوب' });
  if (!name) return res.status(400).json({ error: 'اسم الفرع مطلوب' });
  const o = db.prepare('SELECT id, tenant_id FROM organizations WHERE id=? AND is_active=1').get(orgId);
  if (!o) return res.status(404).json({ error: 'المؤسسة غير موجودة أو موقفة' });
  const warehouseId = String(req.body?.warehouseId || '').trim().slice(0, 32) || null;
  if (warehouseId) {
    db.prepare('INSERT OR IGNORE INTO warehouses (id,name,tenant_id,branch_id) VALUES (?,?,?,?)').run(warehouseId, warehouseId, o.tenant_id, 'pending');
  }
  const id = uuid();
  db.prepare('INSERT INTO branches (id,org_id,tenant_id,name,code,warehouse_id) VALUES (?,?,?,?,?,?)')
    .run(id, orgId, o.tenant_id, name, String(req.body?.code || '').trim().slice(0, 32) || null, warehouseId);
  if (warehouseId) {
    try { db.prepare('UPDATE warehouses SET branch_id=? WHERE id=?').run(id, warehouseId); } catch { /* ignore */ }
  }
  req.audit?.('branch.create', { branchId: id, orgId, name });
  return res.status(201).json({ id, orgId, tenantId: o.tenant_id, name });
});

router.get('/branches/:id', (req, res) => {
  if (!canRead(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const row = db.prepare('SELECT * FROM branches WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!row) return res.status(404).json({ error: 'الفرع غير موجود' });
  return res.json(row);
});

router.patch('/branches/:id/toggle', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT is_active FROM branches WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'الفرع غير موجود' });
  const next = Number(row.is_active) ? 0 : 1;
  db.prepare("UPDATE branches SET is_active=?,updated_at=datetime('now') WHERE id=?").run(next, id);
  req.audit?.('branch.toggle', { branchId: id, is_active: next });
  return res.json({ id, is_active: next });
});

export default router;
