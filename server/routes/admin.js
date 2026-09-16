import { Router } from 'express';
import { execFile } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireRole } from '../middleware/auth.js';
import { checkIntegrity, checkDbHealth } from '../db/schema.js';
import { describeDbMode } from '../db/mode.js';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// All admin endpoints are ADMIN-only
router.use(requireRole('ADMIN'));

// GET /api/admin/db — mode, health, integrity (fast parts only)
router.get('/db', (req, res) => {
  const health = checkDbHealth();
  return res.json({ ...describeDbMode(), health });
});

// GET /api/admin/db/integrity — PRAGMA integrity_check (can be slow on GBs)
router.get('/db/integrity', (req, res) => {
  const result = checkIntegrity();
  req.audit?.('admin.integrity', result);
  return res.status(result.ok ? 200 : 500).json(result);
});

// POST /api/admin/backup — online snapshot via VACUUM INTO (non-blocking readers)
router.post('/backup', (req, res) => {
  const script = join(__dirname, '..', 'scripts', 'backup.mjs');
  execFile(process.execPath, [script, '--json'], { timeout: 120000 }, (err, stdout, stderr) => {
    if (err) {
      req.audit?.('admin.backup', { ok: false, error: String(stderr || err.message).slice(0, 300) });
      return res.status(500).json({ ok: false, error: String(stderr || err.message).slice(0, 300) });
    }
    try {
      const payload = JSON.parse(String(stdout).slice(String(stdout).indexOf('{')));
      req.audit?.('admin.backup', { ok: true, file: payload.file });
      return res.json({ ok: true, ...payload });
    } catch {
      return res.json({ ok: true, raw: String(stdout).slice(0, 500) });
    }
  });
});

export default router;
