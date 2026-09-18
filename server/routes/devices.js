import { Router } from 'express';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';
import { assertTenantScope, assertRecordTenant, resolveTenantFilter } from '../lib/tenant.js';

const router = Router();

function clean(v, max) {
  return String(v ?? '').trim().slice(0, max);
}

// POST /api/devices/register — upsert by device_id (any authenticated role:
// a cashier terminal must be able to enroll itself on first boot).
// Re-registration never clears REVOKED — only a manager can re-activate.
router.post('/register', (req, res) => {
  const b = req.body || {};
  const deviceId = clean(b.deviceId, 64);
  if (!deviceId) return res.status(400).json({ error: 'deviceId مطلوب' });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(deviceId)) {
    return res.status(400).json({ error: 'deviceId غير صالح' });
  }
  let scopeTenant = null;
  try {
    scopeTenant = assertTenantScope(req).tenantId;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const platform = clean(b.platform, 32) || 'unknown';
  const appVersion = clean(b.appVersion, 32);
  const existing = db.prepare('SELECT * FROM devices WHERE device_id=?').get(deviceId);
  if (existing) {
    if (String(existing.status) === 'REVOKED') {
      return res.status(423).json({ error: 'الجهاز موقف — تواصل مع الإدارة', device: sanitize(existing) });
    }
    db.prepare(`UPDATE devices SET platform=?,app_version=?,tenant_id=COALESCE(tenant_id,?),
      last_sync=datetime('now'),updated_at=datetime('now') WHERE device_id=?`)
      .run(platform, appVersion, scopeTenant, deviceId);
    req.audit?.('device.reregister', { deviceId });
    return res.json({ device: sanitize(db.prepare('SELECT * FROM devices WHERE device_id=?').get(deviceId)), reactivated: false });
  }
  const id = uuid();
  db.prepare(`INSERT INTO devices (id,device_id,tenant_id,platform,app_version,status,last_sync,registered_by)
    VALUES (?,?,?,?,?,'ACTIVE',datetime('now'),?)`)
    .run(id, deviceId, scopeTenant, platform, appVersion, req.user?.username || null);
  req.audit?.('device.register', { deviceId });
  return res.status(201).json({ device: sanitize(db.prepare('SELECT * FROM devices WHERE id=?').get(id)) });
});

// GET /api/devices — tenant-filtered list (scoped callers see their tenant +
// legacy unscoped rows; unscoped callers see everything — admin tool default).
router.get('/', (req, res) => {
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  let rows;
  if (scopeTenant) {
    rows = db.prepare('SELECT * FROM devices WHERE (tenant_id=? OR tenant_id IS NULL) ORDER BY updated_at DESC LIMIT ?').all(scopeTenant, limit);
  } else {
    rows = db.prepare('SELECT * FROM devices ORDER BY updated_at DESC LIMIT ?').all(limit);
  }
  return res.json({ devices: rows.map(sanitize), total: rows.length });
});

// POST /api/devices/:id/revive — ADMIN/MANAGER re-activates a revoked device.
router.post('/:id/revive', (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const row = db.prepare('SELECT * FROM devices WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!row) return res.status(404).json({ error: 'الجهاز غير موجود' });
  try {
    assertRecordTenant(req, row);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  db.prepare("UPDATE devices SET status='ACTIVE',updated_at=datetime('now') WHERE id=?").run(row.id);
  req.audit?.('device.revive', { deviceId: row.device_id });
  return res.json({ device: sanitize(db.prepare('SELECT * FROM devices WHERE id=?').get(row.id)) });
});

// POST /api/devices/:id/revoke — ADMIN/MANAGER cuts off a lost/stolen device.
// The device is rejected at next register/sync contact (existing tokens die
// with normal session revocation; device row is the enrollment gate).
router.post('/:id/revoke', (req, res) => {
  if (!['ADMIN', 'MANAGER'].includes(req.user?.role)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const row = db.prepare('SELECT * FROM devices WHERE id=?').get(String(req.params.id).slice(0, 64));
  if (!row) return res.status(404).json({ error: 'الجهاز غير موجود' });
  try {
    assertRecordTenant(req, row);
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  db.prepare("UPDATE devices SET status='REVOKED',updated_at=datetime('now') WHERE id=?").run(row.id);
  req.audit?.('device.revoke', { deviceId: row.device_id });
  return res.json({ device: sanitize(db.prepare('SELECT * FROM devices WHERE id=?').get(row.id)) });
});

function sanitize(row) {
  if (!row) return row;
  return {
    id: row.id,
    deviceId: row.device_id,
    tenantId: row.tenant_id,
    platform: row.platform,
    appVersion: row.app_version,
    status: row.status,
    lastSync: row.last_sync,
    registeredBy: row.registered_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export default router;
