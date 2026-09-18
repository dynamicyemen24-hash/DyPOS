import { Router } from 'express';
import { execFile } from 'node:child_process';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, statSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { requireRole } from '../middleware/auth.js';
import { ah } from '../lib/async.js';
import { hashPasswordAsync } from '../middleware/auth.js';
import { auditTail } from '../middleware/audit.js';
import db from '../db/schema.js';
import { checkIntegrity, checkDbHealth } from '../db/schema.js';
import { describeDbMode } from '../db/mode.js';

const router = Router();
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Alertmanager ingress (shared-secret, NOT JWT) ──
// Alertmanager cannot perform JWT login; it authenticates with a static
// token (DYPOS_ALERT_TOKEN) compared in constant time. Mounted BEFORE the
// ADMIN gate on purpose — everything below the gate stays ADMIN-only.
// Fail-closed: with no token configured the hook answers 503 (an open
// alert inbox would let anyone forge "all clear" resolved messages).
function alertTokenOk(req) {
  const expected = String(process.env.DYPOS_ALERT_TOKEN || '');
  if (!expected) return false;
  const got = String(req.headers['x-alert-token'] || '');
  const a = Buffer.from(got, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// POST /api/admin/alerts/hook — Alertmanager webhook receiver.
router.post('/alerts/hook', (req, res) => {
  if (!String(process.env.DYPOS_ALERT_TOKEN || '')) {
    return res.status(503).json({ error: 'تنبيهات غير مهيأة — اضبط DYPOS_ALERT_TOKEN' });
  }
  if (!alertTokenOk(req)) return res.status(401).json({ error: 'رمز التنبيهات غير صالح' });
  const alerts = req.body && Array.isArray(req.body.alerts) ? req.body.alerts : null;
  if (!alerts) return res.status(400).json({ error: 'حمولة Alertmanager غير صالحة' });
  if (alerts.length > 100) return res.status(400).json({ error: 'الدفعة تتجاوز 100 تنبيه' });
  let stored = 0;
  const ingest = db.transaction(() => {
    for (const a of alerts) {
      const labels = (a && typeof a.labels === 'object' && a.labels) || {};
      const ann = (a && typeof a.annotations === 'object' && a.annotations) || {};
      const name = String(labels.alertname || 'unknown').slice(0, 64);
      const severity = String(labels.severity || 'warning').slice(0, 16);
      const status = String(a.status || 'firing').slice(0, 16) === 'resolved' ? 'resolved' : 'firing';
      const fp = createHash('sha256').update(name + '|' + JSON.stringify(labels)).digest('hex').slice(0, 32);
      const summary = String(ann.summary || '').slice(0, 500);
      const description = String(ann.description || '').slice(0, 2000);
      const startsAt = String(a.startsAt || '').slice(0, 32) || null;
      const endsAt = String(a.endsAt || '').slice(0, 32) || null;
      const open = db.prepare('SELECT id FROM alert_notifications WHERE fingerprint=? AND status=? LIMIT 1').get(fp, 'firing');
      if (open && status === 'resolved') {
        db.prepare(`UPDATE alert_notifications SET status='resolved',ends_at=COALESCE(?,ends_at),
          resolved_at=datetime('now'),updated_at=datetime('now') WHERE id=?`).run(endsAt, open.id);
        stored++;
      } else if (!open && status === 'firing') {
        db.prepare(`INSERT INTO alert_notifications (id,fingerprint,alertname,severity,status,summary,description,starts_at,ends_at)
          VALUES (?,?,?,?,?,?,?,?,?)`)
          .run(randomBytes(16).toString('hex'), fp, name, severity, 'firing', summary, description, startsAt, endsAt);
        stored++;
      }
      // else: duplicate firing (already open) or stray resolved (nothing open) — ignore silently
    }
  });
  ingest();
  return res.json({ stored, received: alerts.length });
});

// All admin endpoints below are ADMIN-only
router.use(requireRole('ADMIN'));

// Backup concurrency guard: VACUUM INTO twice concurrently corrupts I/O on Windows locks.
let backupRunning = false;

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
  if (backupRunning) return res.status(409).json({ error: 'نسخة جارية بالفعل — انتظر انتهاءها' });
  backupRunning = true;
  const script = join(__dirname, '..', 'scripts', 'backup.mjs');
  execFile(process.execPath, [script, '--json'], { timeout: 120000 }, (err, stdout, stderr) => {
    backupRunning = false;
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

// GET /api/admin/audit?limit=&event=&username= — fast local forensic window (ring buffer)
router.get('/audit', (req, res) => {
  const rows = auditTail({
    limit: req.query.limit,
    event: req.query.event ? String(req.query.event).slice(0, 64) : '',
    username: req.query.username ? String(req.query.username).slice(0, 64) : '',
  });
  return res.json({ audit: rows, count: rows.length });
});

// GET /api/admin/trail?entity=&entityId=&username=&tenant=&limit=&offset= — durable before/after trail
router.get('/trail', (req, res) => {
  const entity = req.query.entity ? String(req.query.entity).toUpperCase().slice(0, 32) : '';
  const entityId = req.query.entityId ? String(req.query.entityId).slice(0, 64) : '';
  const username = req.query.username ? String(req.query.username).slice(0, 64) : '';
  const tenant = req.query.tenant ? String(req.query.tenant).slice(0, 64) : '';
  if (entity && !/^[A-Z_]{2,32}$/.test(entity)) return res.status(400).json({ error: 'كيان غير صالح' });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  let base = 'FROM audit_trail WHERE 1=1';
  const params = [];
  if (entity) { base += ' AND entity_type=?'; params.push(entity); }
  if (entityId) { base += ' AND entity_id=?'; params.push(entityId); }
  if (username) { base += ' AND username=?'; params.push(username); }
  if (tenant) { base += ' AND tenant_id=?'; params.push(tenant); }
  let rows = [];
  let total = 0;
  try {
    total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
    rows = db.prepare(`SELECT * ${base} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  } catch {
    return res.json({ trail: [], total: 0, limit, offset, hasMore: false, note: 'migrate to v8 for trail' });
  }
  return res.json({ trail: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

// GET /api/admin/alerts?status=&severity=&limit=&offset= — alert inbox
// (Alertmanager deliveries). Resolved rows are kept for forensics.
router.get('/alerts', (req, res) => {
  const status = req.query.status ? String(req.query.status).toLowerCase().slice(0, 16) : '';
  const severity = req.query.severity ? String(req.query.severity).toLowerCase().slice(0, 16) : '';
  if (status && !['firing', 'resolved'].includes(status)) return res.status(400).json({ error: 'حالة غير صالحة' });
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  let base = 'FROM alert_notifications WHERE 1=1';
  const params = [];
  if (status) { base += ' AND status=?'; params.push(status); }
  if (severity) { base += ' AND severity=?'; params.push(severity); }
  let rows = [];
  let total = 0;
  try {
    total = db.prepare(`SELECT COUNT(*) as c ${base}`).get(...params)?.c || 0;
    rows = db.prepare(`SELECT * ${base} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  } catch {
    return res.json({ alerts: [], total: 0, limit, offset, hasMore: false, note: 'migrate to v17 for alerts' });
  }
  return res.json({ alerts: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

// GET /api/admin/chain/verify?limit= — replay the invoice hash chain (tamper-evident)
router.get('/chain/verify', ah(async (req, res) => {
  try {
    const { verifyChain } = await import('../lib/chain.js');
    const r = verifyChain(Number(req.query.limit) || 100000);
    req.audit?.('admin.chain_verify', r);
    return res.status(r.ok ? 200 : 500).json(r);
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message).slice(0, 200) });
  }
}));

// GET /api/admin/zatca/settings — e-invoicing identity (feeds print QR TLV)
router.get('/zatca/settings', (req, res) => {
  const row = db.prepare('SELECT * FROM zatca_settings WHERE id=?').get('default') || { id: 'default' };
  return res.json({ settings: row });
});

// PUT /api/admin/zatca/settings — update seller identity (ADMIN)
router.put('/zatca/settings', (req, res) => {
  const b = req.body || {};
  const seller = String(b.sellerName ?? b.seller_name ?? '').trim().slice(0, 200);
  const vat = String(b.vatNumber ?? b.vat_number ?? '').trim().slice(0, 32);
  if (vat && !/^\d{15}$/.test(vat)) return res.status(400).json({ error: 'الرقم الضريبي 15 رقمًا' });
  const cr = String(b.crNumber ?? b.cr_number ?? '').trim().slice(0, 32);
  const branch = String(b.branchId ?? b.branch_id ?? '1').trim().slice(0, 16) || '1';
  const phase = String(b.phase || 'simulation').toLowerCase();
  if (!['simulation', 'production'].includes(phase)) return res.status(400).json({ error: 'phase يجب simulation أو production' });
  db.prepare(`UPDATE zatca_settings SET seller_name=?,vat_number=?,cr_number=?,branch_id=?,phase=?,updated_at=datetime('now') WHERE id='default'`)
    .run(seller, vat, cr, branch, phase);
  const after = db.prepare('SELECT * FROM zatca_settings WHERE id=?').get('default');
  req.audit?.('admin.zatca_update', { phase, vat: vat ? vat.slice(0, 4) + '…' : '' });
  return res.json({ settings: after });
});

// PATCH /api/admin/users/:id — disable/enable or change role (ADMIN ops for millions of subscribers)
router.patch('/users/:id', (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT id, username, role FROM users WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (row.id === req.user?.id && req.body?.isActive === false) {
    return res.status(400).json({ error: 'لا يمكنك تعطيل حسابك' });
  }
  const updates = [];
  const params = [];
  if (req.body?.isActive !== undefined) {
    const v = req.body.isActive !== false ? 1 : 0;
    updates.push('is_active=?'); params.push(v);
  }
  if (req.body?.role !== undefined) {
    const r = String(req.body.role).toUpperCase();
    if (!['ADMIN', 'MANAGER', 'CASHIER', 'AUDITOR'].includes(r)) return res.status(400).json({ error: 'دور غير صالح' });
    if (row.id === req.user?.id && r !== 'ADMIN') return res.status(400).json({ error: 'لا يمكنك تخفيض دورك' });
    updates.push('role=?'); params.push(r);
  }
  if (req.body?.mustChangePassword !== undefined) {
    updates.push('must_change_password=?'); params.push(req.body.mustChangePassword ? 1 : 0);
  }
  if (!updates.length) return res.status(400).json({ error: 'لا توجد حقول (isActive|role|mustChangePassword)' });
  params.push(id);
  db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...params);
  if (req.body?.isActive === false) {
    try { db.prepare('UPDATE user_sessions SET revoked=1 WHERE user_id=?').run(id); } catch { /* ignore */ }
  }
  const after = db.prepare('SELECT id,username,full_name,role,is_active FROM users WHERE id=?').get(id);
  req.audit?.('admin.user_update', { userId: id, ...req.body });
  return res.json({ user: after });
});

// POST /api/admin/users/:id/reset-password { newPassword } — ops reset (revokes all sessions)
router.post('/users/:id/reset-password', ah(async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT id, username FROM users WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const pw = String(req.body?.newPassword || '');
  if (pw.length < 8 || !/(?=.*[A-Za-z])(?=.*\d).+/.test(pw)) {
    return res.status(400).json({ error: 'كلمة المرور 8+ أحرف (حرف ورقم)' });
  }
  const hash = await hashPasswordAsync(pw);
  db.prepare('UPDATE users SET password_hash=?,must_change_password=1 WHERE id=?').run(hash, id);
  try { db.prepare('UPDATE user_sessions SET revoked=1 WHERE user_id=?').run(id); } catch { /* ignore */ }
  req.audit?.('admin.password_reset', { userId: id, username: row.username });
  return res.json({ reset: true, mustChangePassword: true });
}));

// DELETE /api/admin/backups/:file — prune a snapshot (safe basename + retention-friendly)
router.delete('/backups/:file', (req, res) => {
  const dir = process.env.DYPOS_BACKUP_DIR || join(__dirname, '..', 'data', 'backups');
  const name = basename(String(req.params.file || ''));
  if (!/^(dypos-.*\.db|pre-restore-.*\.db)$/.test(name)) return res.status(400).json({ error: 'اسم نسخة غير صالح' });
  const full = join(dir, name);
  const dataDir = join(dir, '..');
  const alt = join(dataDir, name);
  const target = existsSync(full) ? full : (existsSync(alt) ? alt : null);
  if (!target) return res.status(404).json({ error: 'النسخة غير موجودة' });
  try { unlinkSync(target); } catch (e) {
    return res.status(500).json({ error: String(e.message).slice(0, 200) });
  }
  req.audit?.('admin.backup_delete', { file: name });
  return res.json({ deleted: true, file: name });
});

// ── API keys (machine credentials for ERP/WMS/BI) ──
const KEY_ROLES = new Set(['ADMIN', 'MANAGER', 'AUDITOR', 'CASHIER']);

// GET /api/admin/api-keys — list (hashes never leave the server)
router.get('/api-keys', (req, res) => {
  let rows = [];
  try {
    rows = db.prepare('SELECT id,name,key_prefix,role,scopes,tenant_id,expires_at,last_used_at,revoked,created_by,created_at FROM api_keys ORDER BY created_at DESC LIMIT 200').all();
  } catch {
    return res.json({ keys: [], note: 'migrate to v10 for api keys' });
  }
  return res.json({ keys: rows.map((r) => ({ ...r, scopes: JSON.parse(r.scopes || '[]') })) });
});

// POST /api/admin/api-keys { name, role?, scopes?[], tenantId?, expiresInDays? } — secret shown ONCE
router.post('/api-keys', (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: 'اسم المفتاح مطلوب' });
  const role = String(req.body?.role || 'AUDITOR').toUpperCase();
  if (!KEY_ROLES.has(role)) return res.status(400).json({ error: 'دور غير صالح' });
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.map(String).slice(0, 20) : [];
  const tenantId = String(req.body?.tenantId || '').trim().slice(0, 64) || null;
  if (tenantId) {
    const t = db.prepare('SELECT id FROM tenants WHERE id=? AND is_active=1').get(tenantId);
    if (!t) return res.status(404).json({ error: 'المستأجر غير موجود أو موقف' });
  }
  const days = Number(req.body?.expiresInDays);
  const expiresAt = Number.isFinite(days) && days > 0
    ? new Date(Date.now() + Math.min(days, 3650) * 86400000).toISOString()
    : null;
  const raw = `dypos_${randomBytes(24).toString('hex')}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  const id = randomBytes(16).toString('hex');
  try {
    db.prepare(`INSERT INTO api_keys (id,name,key_prefix,key_hash,role,scopes,tenant_id,expires_at,created_by) VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(id, name, raw.slice(0, 12), hash, role, JSON.stringify(scopes), tenantId, expiresAt, req.user?.username || null);
  } catch (e) {
    return res.status(500).json({ error: String(e.message).slice(0, 200) });
  }
  req.audit?.('admin.apikey_create', { keyId: id, name, role });
  return res.status(201).json({ id, name, role, key_prefix: raw.slice(0, 12), key: raw, note: 'احفظ السر الآن — لن يُعرض مجددًا' });
});

// POST /api/admin/api-keys/:id/rotate — new secret, same identity
router.post('/api-keys/:id/rotate', (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  const row = db.prepare('SELECT id FROM api_keys WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'المفتاح غير موجود' });
  const raw = `dypos_${randomBytes(24).toString('hex')}`;
  db.prepare('UPDATE api_keys SET key_hash=?,key_prefix=?,revoked=0 WHERE id=?').run(createHash('sha256').update(raw).digest('hex'), raw.slice(0, 12), id);
  req.audit?.('admin.apikey_rotate', { keyId: id });
  return res.json({ id, key_prefix: raw.slice(0, 12), key: raw, note: 'احفظ السر الآن — لن يُعرض مجددًا' });
});

// DELETE /api/admin/api-keys/:id — revoke (no hard delete: preserves forensic trail)
router.delete('/api-keys/:id', (req, res) => {
  const upd = db.prepare('UPDATE api_keys SET revoked=1 WHERE id=? AND revoked=0').run(String(req.params.id).slice(0, 64));
  if (!upd.changes) return res.status(404).json({ error: 'المفتاح غير موجود أو مبطل' });
  req.audit?.('admin.apikey_revoke', { keyId: req.params.id });
  return res.json({ revoked: true });
});

export default router;
