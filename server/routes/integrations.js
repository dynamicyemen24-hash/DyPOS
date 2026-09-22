/** DyPOS External Integrations API v1.31.0 — dedicated unit for any external system. */
import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import db from '../db/schema.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { ah } from '../lib/async.js';
import { VERSION } from '../lib/version.js';
import { listAdapters, getAdapter, redactConfig, initIntegrationTables } from '../lib/integrations/index.js';

const router = Router();

initIntegrationTables();

/** GET /api/integrations/adapters — list supported external adapters. */
router.get('/adapters', authMiddleware, ah(async (_req, res) => {
  return res.json({ success: true, adapters: listAdapters(), version: VERSION });
}));

/** GET /api/integrations — list configs (tenant-filtered, secrets redacted). */
router.get('/', authMiddleware, ah(async (req, res) => {
  let rows = [];
  try {
    rows = db.prepare('SELECT * FROM integration_configs ORDER BY created_at DESC LIMIT 200').all();
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

  const id = uuid();
  try {
    db.prepare(`
      INSERT INTO integration_configs (id, tenant_id, adapter, name, base_url, auth_type, credentials, options, direction, is_active, created_by)
      VALUES (?, 'STD', ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
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
