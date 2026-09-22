/** DyPOS Self-Update API v1.32.0 — Cloudflare deploy hook + device update feed. */
import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { ah } from '../lib/async.js';
import { VERSION } from '../lib/version.js';
import { getReleaseFeed, publishRelease } from '../lib/releaseFeed.js';

const router = Router();

/**
 * GET /api/updates/latest — public feed every device polls.
 * What changed + the merchant benefit, so the update dialog can
 * explain itself instead of showing a bare "new version" notice.
 */
router.get('/latest', ah(async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  return res.json({ success: true, release: getReleaseFeed(), runningOn: VERSION });
}));

/**
 * POST /api/updates/publish — ADMIN hook for CI/Cloudflare after deploy.
 * Body: { version?, title?, highlights: [{title, benefit}] }
 * Stamps release.json + version.json so all mobiles/desktops pick it up.
 */
router.post('/publish', authMiddleware, requireRole('ADMIN'), ah(async (req, res) => {
  const { version, title, highlights, severity, minVersion } = req.body || {};
  if (highlights !== undefined && !Array.isArray(highlights)) {
    return res.status(400).json({ error: 'highlights يجب أن تكون قائمة' });
  }
  if (severity !== undefined && !['optional', 'recommended', 'critical'].includes(String(severity).toLowerCase())) {
    return res.status(400).json({ error: 'severity يجب أن تكون optional أو recommended أو critical' });
  }
  const feed = publishRelease({ version, title, highlights, severity, minVersion });
  req.audit?.('updates.publish', { version: feed.version, highlights: feed.highlights.length });
  return res.status(201).json({ success: true, release: feed, version: VERSION });
}));

export default router;
