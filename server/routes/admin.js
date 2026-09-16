import { Router } from 'express';
import { execFile } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, statSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
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

// GET /api/admin/backups — list available snapshots
router.get('/backups', (req, res) => {
  const dir = process.env.DYPOS_BACKUP_DIR || join(__dirname, '..', 'data', 'backups');
  let files = [];
  try {
    files = readdirSync(dir)
      .filter((f) => f.startsWith('dypos-') && f.endsWith('.db'))
      .map((f) => ({ file: f, size_bytes: statSync(join(dir, f)).size, mtime: statSync(join(dir, f)).mtime.toISOString() }))
      .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  } catch { /* no backups yet */ }
  let pending = null;
  const marker = join(dir, '..', 'restore.pending');
  try {
    if (existsSync(marker)) pending = JSON.parse(readFileSync(marker, 'utf8'));
  } catch { /* ignore */ }
  return res.json({ backups: files, pending_restore: pending });
});

// POST /api/admin/restore {file} — verify + STAGE a snapshot; applied on next boot.
// The live DB is never touched by this endpoint (safe on Windows file locks);
// entrypoint.js swaps it before any handle opens. Restart required.
router.post('/restore', (req, res) => {
  const dir = process.env.DYPOS_BACKUP_DIR || join(__dirname, '..', 'data', 'backups');
  const dataDir = join(dir, '..');
  const name = basename(String(req.body?.file || ''));
  if (!/^dypos-.*\.db$/.test(name)) return res.status(400).json({ error: 'اسم نسخة غير صالح' });
  const full = join(dir, name);
  if (!existsSync(full)) return res.status(404).json({ error: 'النسخة غير موجودة' });
  // Verify the snapshot with a throwaway read-only handle
  try {
    const probe = new DatabaseSync(full, { readOnly: true });
    try {
      const integ = Object.values(probe.prepare('PRAGMA integrity_check').get())[0];
      if (integ !== 'ok') return res.status(422).json({ error: `سلامة النسخة فاشلة: ${integ}` });
      const ver = probe.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get();
      if (!ver) return res.status(422).json({ error: 'النسخة بلا مخطط معروف' });
    } finally {
      probe.close();
    }
  } catch (e) {
    return res.status(422).json({ error: String(e.message).slice(0, 200) });
  }
  writeFileSync(join(dataDir, 'restore.pending'), JSON.stringify({ file: name, staged_at: new Date().toISOString(), staged_by: req.user?.username }));
  req.audit?.('admin.restore.staged', { file: name });
  return res.json({ staged: true, file: name, restartRequired: true, note: 'أعد تشغيل الخادم (entrypoint) لتطبيق الاستعادة' });
});

// DELETE /api/admin/restore — cancel a staged restore
router.delete('/restore', (req, res) => {
  const dir = process.env.DYPOS_BACKUP_DIR || join(__dirname, '..', 'data', 'backups');
  const marker = join(dir, '..', 'restore.pending');
  try { unlinkSync(marker); } catch { /* nothing staged */ }
  req.audit?.('admin.restore.cancelled', {});
  return res.json({ cancelled: true });
});

export default router;
