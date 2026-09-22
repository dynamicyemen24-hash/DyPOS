/** DyPOS External Integrations API v1.31.0 — dedicated unit for any external system. */
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db/schema.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { ah } from '../lib/async.js';
import { VERSION } from '../lib/version.js';
import { listAdapters, getAdapter, redactConfig, initIntegrationTables } from '../lib/integrations/index.js';
import { assertTenantScope, resolveTenantFilter } from '../lib/tenant.js';

const router = Router();

initIntegrationTables();

/** GET /api/integrations/adapters — list supported external adapters. */
router.get('/adapters', authMiddleware, ah(async (_req, res) => {
  return res.json({ success: true, adapters: listAdapters(), version: VERSION });
}));

/** GET /api/integrations — list configs (tenant-filtered, secrets redacted). */
router.get('/', authMiddleware, ah(async (req, res) => {
  let scopeTenant = null;
  try {
    scopeTenant = resolveTenantFilter(req).tenantId || null;
    if (scopeTenant && req.user?.tenantId && String(scopeTenant) !== String(req.user.tenantId)) {
      throw Object.assign(new Error('غير موجود'), { statusCode: 404 });
    }
    scopeTenant = scopeTenant || req.user?.tenantId || null;
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }
  let rows = [];
  try {
    rows = scopeTenant
      ? db.prepare('SELECT * FROM integration_configs WHERE tenant_id=? OR tenant_id=? ORDER BY created_at DESC LIMIT 200').all(scopeTenant, 'STD')
      : db.prepare('SELECT * FROM integration_configs ORDER BY created_at DESC LIMIT 200').all();
  } catch {
    rows = [];
  }
  return res.json({ success: true, configs: rows.map(redactConfig), version: VERSION });
}));

/** POST /api/integrations — register a new external connection (ADMIN/MANAGER). */
router.post('/', authMiddleware, requireRole('ADMIN', 'MANAGER'), ah(async (req, res) => {
  const { adapter, name, base_url, auth_type, credentials, options, direction } = req.body || {};
  const ad = getAdapter(adapter);
  if (!ad) return res.status(400).json({ error: 'معرف التكامل غير مدعوم' });
  if (!name || !base_url) return res.status(400).json({ error: 'الاسم ورابط النظام الخارجي مطلوبان' });

  let scopeTenant = 'STD';
  try {
    const scope = assertTenantScope(req);
    scopeTenant = scope.tenantId || req.user?.tenantId || 'STD';
  } catch (e) {
    return res.status(e.statusCode || 400).json({ error: String(e.message).slice(0, 200) });
  }

  const id = uuid();
  try {
    db.prepare(`
      INSERT INTO integration_configs (id, tenant_id, adapter, name, base_url, auth_type, credentials, options, direction, is_active, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      scopeTenant,
      ad.key,
      String(name).slice(0, 100),
      String(base_url).slice(0, 500),
      String(auth_type || 'api_key').slice(0, 32),
      JSON.stringify(credentials || {}).slice(0, 4000),
      JSON.stringify(options || {}).slice(0, 4000),
      String(direction || 'both').slice(0, 16),
      req.user?.username || null,
    );
  } catch (e) {
    return res.status(400).json({ error: 'تعذر حفظ التكامل (قد يكون الاسم مكرراً)' });
  }
  return res.status(201).json({ success: true, id, adapter: ad.key, version: VERSION });
}));

/** POST /api/integrations/:id/test — validate connection without mutation. */
router.post('/:id/test', authMiddleware, requireRole('ADMIN', 'MANAGER'), ah(async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT * FROM integration_configs WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'التكامل غير موجود' });
  // Global 'STD' integrations are testable by anyone; tenant-scoped ones only by owner.
  if (row.tenant_id && String(row.tenant_id) !== 'STD') {
    const bound = req.user?.tenantId || null;
    let ctx = null;
    try { ctx = resolveTenantFilter(req).tenantId || null; } catch (e) { return res.status(404).json({ error: 'التكامل غير موجود' }); }
    const eff = ctx || bound || null;
    if (String(row.tenant_id) !== eff) return res.status(404).json({ error: 'التكامل غير موجود' });
  }
  const ad = getAdapter(row.adapter);
  if (!ad) return res.status(400).json({ error: 'المحول غير مدعوم' });
  let creds = {};
  try {
    creds = JSON.parse(row.credentials || '{}');
  } catch {
    creds = {};
  }
  const started = Date.now();
  const result = await ad.connect({ ...creds, base_url: row.base_url });
  return res.json({ success: true, ok: result.ok, detail: result.detail, latency_ms: Date.now() - started, version: VERSION });
}));

export default router;
