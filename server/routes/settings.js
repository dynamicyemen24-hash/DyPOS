/** DyPOS settings routes v1.31.0 — single source: server/lib/version.js */
/**
 * GET /api/settings — business profile (any authenticated role).
 * PUT /api/settings — update allowlisted keys (ADMIN only).
 * Body: { key: value, ... } — unknown keys and invalid values → 400 each
 * reported with the offending key; nothing is written unless ALL pass.
 */
import { Router } from 'express';
import { SETTING_DEFS, allSettings, setSetting } from '../lib/settings.js';

const router = Router();
const isAdmin = (req) => req.user?.role === 'ADMIN';

router.get('/', (_req, res) => {
  return res.json({ settings: allSettings() });
});

router.put('/', (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: 'صلاحية غير كافية' });
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const keys = Object.keys(body);
  if (!keys.length) return res.status(400).json({ error: 'لا إعدادات للإرسال' });
  // Validate everything first — all-or-nothing, no partial profile writes.
  const clean = {};
  for (const k of keys) {
    if (!SETTING_DEFS[k]) return res.status(400).json({ error: `إعداد غير معروف: ${String(k).slice(0, 64)}` });
    try {
      clean[k] = SETTING_DEFS[k].validate(body[k]);
    } catch (e) {
      return res.status(e.statusCode || 400).json({ error: `${k}: ${String(e.message || '').slice(0, 200)}` });
    }
  }
  const saved = {};
  for (const k of Object.keys(clean)) saved[k] = setSetting(k, clean[k]);
  req.audit?.('settings.update', { keys: Object.keys(saved) });
  return res.json({ settings: saved });
});

export default router;
