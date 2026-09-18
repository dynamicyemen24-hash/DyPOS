import { Router } from 'express';
import { hashPasswordAsync, verifyPasswordAsync, generateToken, revokeToken, revokeAllSessions, authMiddleware, requireRole, isProduction } from '../middleware/auth.js';
import { validate, loginSchema, registerSchema } from '../middleware/validate.js';
import { authAttempts } from '../middleware/metrics.js';
import { ah } from '../lib/async.js';
import { cacheGet, cacheSet, cacheDel } from '../lib/cache.js';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';

const router = Router();

const ALLOWED_ROLES = new Set(['ADMIN', 'MANAGER', 'CASHIER', 'AUDITOR']);

// Brute-force guard (shared via cache: memory single-node, Redis when
// DYPOS_REDIS_URL is set so N cluster workers enforce ONE lockout).
// 8 fails/15min → 429 for 15min. Fail-open to local Map when cache errors.
const MAX_FAILS = 8;
const WINDOW_SECS = 15 * 60;
const localFails = new Map(); // fallback only
const lockKey = (u) => `lockout:${String(u).slice(0, 64)}`;
async function readFails(username) {
  try {
    const hit = await cacheGet(lockKey(username));
    if (hit && typeof hit === 'object') return hit;
  } catch { /* fallback below */ }
  return localFails.get(username) || null;
}
async function writeFails(username, entry) {
  localFails.set(username, entry);
  try { await cacheSet(lockKey(username), entry, WINDOW_SECS); } catch { /* ignore */ }
}
async function clearFails(username) {
  localFails.delete(username);
  try { await cacheDel(lockKey(username)); } catch { /* ignore */ }
}
async function isLocked(username) {
  const e = await readFails(username);
  if (!e) return false;
  if (e.lockUntil && Date.now() < e.lockUntil) return true;
  if (Date.now() - e.firstAt > WINDOW_SECS * 1000) { await clearFails(username); return false; }
  return false;
}
async function recordFail(username) {
  const now = Date.now();
  const prev = (await readFails(username)) || { count: 0, firstAt: now, lockUntil: 0 };
  const e = { ...prev };
  if (now - e.firstAt > WINDOW_SECS * 1000) { e.count = 1; e.firstAt = now; e.lockUntil = 0; }
  else {
    e.count++;
    if (e.count >= MAX_FAILS) e.lockUntil = now + WINDOW_SECS * 1000;
  }
  await writeFails(username, e);
}
async function recordSuccess(username) { await clearFails(username); }

// POST /api/auth/login (async bcrypt — never block the event loop)
router.post('/login', validate(loginSchema), ah(async (req, res) => {
  const { username, password } = req.body;
  const clean = String(username).trim();
  if (await isLocked(clean)) {
    try { authAttempts.labels('locked').inc(); } catch { /* ignore */ }
    return res.status(429).json({ error: 'محاولات كثيرة — حاول بعد 15 دقيقة' });
  }
  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(clean);
  if (!user) {
    await recordFail(clean);
    try { authAttempts.labels('fail').inc(); } catch { /* ignore */ }
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  let ok = false;
  try {
    ok = await verifyPasswordAsync(password, user.password_hash);
  } catch {
    ok = false;
  }
  if (!ok) {
    await recordFail(clean);
    try { authAttempts.labels('fail').inc(); } catch { /* ignore */ }
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  await recordSuccess(clean);
  try { authAttempts.labels('ok').inc(); } catch { /* ignore */ }
  const token = generateToken(user);
  req.audit?.('auth.login', { userId: user.id, username: user.username });
  return res.json({
    token,
    user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, tenantId: user.tenant_id || null },
    mustChangePassword: Number(user.must_change_password) === 1,
  });
}));

// POST /api/auth/refresh — rotate the current token (old dies, new issued)
router.post('/refresh', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id=? AND is_active=1').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  if (req.token) revokeToken(req.token);
  const token = generateToken(user);
  req.audit?.('auth.refresh', { userId: user.id });
  return res.json({
    token,
    user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role, tenantId: user.tenant_id || null },
  });
});

// POST /api/auth/register — bootstrap-open only when no users exist,
// otherwise ADMIN-only. Prevents privilege escalation at SaaS scale.
router.post('/register', validate(registerSchema), ah(async (req, res) => {
  const { username, password, fullName, role = 'CASHIER', tenantId } = req.body;
  const cleanUsername = String(username).trim();
  const cleanFull = String(fullName).trim();
  const cleanTenant = String(tenantId || '').trim().slice(0, 64) || null;
  if (cleanTenant) {
    const t = db.prepare('SELECT id FROM tenants WHERE id=? AND is_active=1').get(cleanTenant);
    if (!t) return res.status(404).json({ error: 'المستأجر غير موجود أو موقف' });
  }

  const existing = db.prepare('SELECT 1 FROM users WHERE username=?').get(cleanUsername);
  if (existing) return res.status(409).json({ error: 'اسم المستخدم موجود مسبقًا' });

  const countRow = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const isBootstrap = Number(countRow?.c || 0) === 0;
  let finalRole = 'CASHIER';
  if (isBootstrap) {
    // First account may be ADMIN to bootstrap the tenant
    finalRole = ALLOWED_ROLES.has(String(role)) ? String(role) : 'ADMIN';
  } else {
    const wantsPrivileged = String(role) === 'ADMIN' || String(role) === 'MANAGER';
    // In production: all post-bootstrap registration is ADMIN-only.
    // In dev/test: open self-registration for non-privileged roles keeps
    // local DX fast, but ADMIN/MANAGER still require an ADMIN bearer.
    if (isProduction || wantsPrivileged) {
      const auth = req.headers.authorization;
      if (!auth) return res.status(401).json({ error: 'التسجيل يتطلب صلاحية مدير' });
      const { verifyToken } = await import('../middleware/auth.js');
      try {
        const decoded = verifyToken(auth.slice(7));
        req.user = decoded;
      } catch {
        return res.status(401).json({ error: 'رمز غير صالح أو منتهي الصلاحية' });
      }
      if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'فقط المدير يمكنه إنشاء حسابات' });
      finalRole = ALLOWED_ROLES.has(String(role)) ? String(role) : 'CASHIER';
    } else {
      finalRole = ALLOWED_ROLES.has(String(role)) ? String(role) : 'CASHIER';
      if (finalRole === 'ADMIN' || finalRole === 'MANAGER') finalRole = 'CASHIER';
    }
  }

  const id = uuid();
  const hash = await hashPasswordAsync(password);
  db.prepare('INSERT INTO users (id,username,password_hash,full_name,role,tenant_id) VALUES (?,?,?,?,?,?)')
    .run(id, cleanUsername, hash, cleanFull, finalRole, cleanTenant);
  req.audit?.('auth.register', { newUser: cleanUsername, role: finalRole });
  return res.status(201).json({ id, username: cleanUsername, fullName: cleanFull, role: finalRole, tenantId: cleanTenant });
}));

// POST /api/auth/logout — revoke current token
router.post('/logout', authMiddleware, (req, res) => {
  if (req.token) revokeToken(req.token);
  req.audit?.('auth.logout', {});
  return res.json({ revoked: true });
});

// POST /api/auth/change-password — revokes ALL other sessions (stolen tokens die)
router.post('/change-password', authMiddleware, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 8) {
    return res.status(400).json({ error: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' });
  }
  if (!/(?=.*[A-Za-z])(?=.*\d).+/.test(String(newPassword))) {
    return res.status(400).json({ error: 'كلمة المرور يجب أن تحتوي حرفًا ورقمًا' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  const ok = await verifyPasswordAsync(currentPassword, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
  const hash = await hashPasswordAsync(newPassword);
  db.prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?').run(hash, user.id);
  // Kill every other session; keep current token alive so the user isn't logged out mid-shift.
  revokeAllSessions(user.id, req.token);
  return res.json({ changed: true });
}));

// POST /api/auth/logout-all — revoke every session (e.g. device lost)
router.post('/logout-all', authMiddleware, (req, res) => {
  revokeAllSessions(req.user.id);
  if (req.token) revokeToken(req.token);
  req.audit?.('auth.logout_all', {});
  return res.json({ revokedAll: true });
});

// GET /api/auth/sessions — my active sessions (paginated, token hashes never leak)
router.get('/sessions', authMiddleware, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const totalRow = db.prepare('SELECT COUNT(*) as c FROM user_sessions WHERE user_id=? AND revoked=0').get(req.user.id);
  const rows = db.prepare(`SELECT id,issued_at,expires_at,ip_address,user_agent,
    CASE WHEN token_hash=(SELECT token_hash FROM user_sessions WHERE id=?) THEN 1 ELSE 0 END as is_current
    FROM user_sessions WHERE user_id=? AND revoked=0 ORDER BY issued_at DESC LIMIT ? OFFSET ?`)
    .all(req.user.jti || '', req.user.id, limit, offset);
  const total = totalRow?.c || 0;
  return res.json({ sessions: rows, total, limit, offset, hasMore: offset + rows.length < total });
});

// DELETE /api/auth/sessions/:id — revoke one of my sessions (jti)
router.delete('/sessions/:id', authMiddleware, (req, res) => {
  const sid = String(req.params.id).slice(0, 64);
  const upd = db.prepare('UPDATE user_sessions SET revoked=1 WHERE id=? AND user_id=? AND revoked=0').run(sid, req.user.id);
  if (!upd.changes) return res.status(404).json({ error: 'الجلسة غير موجودة' });
  req.audit?.('auth.session_revoke', { sessionId: sid });
  return res.json({ revoked: true });
});

// POST /api/auth/forgot { username } — issue a single-use reset token (15min).
// Always 200 (no user enumeration). The raw token is returned ONLY outside
// production (dev/test handoff); in production it is audit-logged for
// out-of-band delivery by IT (email/SMS gateway plugs in here).
router.post('/forgot', validate(loginSchema.pick({ username: true })), ah(async (req, res) => {
  const clean = String(req.body.username).trim();
  try {
    const user = db.prepare('SELECT id, is_active FROM users WHERE username=?').get(clean);
    if (user && Number(user.is_active) === 1) {
      const { randomBytes, createHash } = await import('node:crypto');
      const raw = randomBytes(24).toString('hex');
      db.prepare(`INSERT INTO password_resets (id,user_id,token_hash,expires_at) VALUES (?,?,?,datetime('now','+15 minutes'))`)
        .run(uuid(), user.id, createHash('sha256').update(raw).digest('hex'));
      req.audit?.('auth.forgot', { username: clean });
      if (!isProduction) return res.json({ sent: true, resetToken: raw, note: 'وضع التطوير فقط — في الإنتاج يُسلَّم خارج النطاق' });
    }
  } catch { /* never leak state */ }
  return res.json({ sent: true });
}));

// POST /api/auth/reset { token, newPassword } — redeem a reset token once.
router.post('/reset', ah(async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const pw = String(req.body?.newPassword || '');
  if (!/^[a-f0-9]{48}$/.test(token)) return res.status(400).json({ error: 'رمز غير صالح' });
  if (pw.length < 8 || !/(?=.*[A-Za-z])(?=.*\d).+/.test(pw)) {
    return res.status(400).json({ error: 'كلمة المرور 8+ أحرف (حرف ورقم)' });
  }
  try {
    const { createHash } = await import('node:crypto');
    const row = db.prepare(`SELECT * FROM password_resets WHERE token_hash=? AND used=0 AND expires_at>datetime('now')`).get(createHash('sha256').update(token).digest('hex'));
    if (!row) return res.status(400).json({ error: 'الرمز منتهي أو مستخدم' });
    const hash = await hashPasswordAsync(pw);
    db.transaction(() => {
      db.prepare('UPDATE users SET password_hash=?,must_change_password=0 WHERE id=?').run(hash, row.user_id);
      db.prepare('UPDATE password_resets SET used=1 WHERE id=?').run(row.id);
      db.prepare('UPDATE user_sessions SET revoked=1 WHERE user_id=?').run(row.user_id);
    })();
    req.audit?.('auth.reset', { userId: row.user_id });
    return res.json({ reset: true });
  } catch (e) {
    return res.status(400).json({ error: String(e.message).slice(0, 200) });
  }
}));
router.get('/me', authMiddleware, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
  if (req.user.isApiKey) return res.json({ id: req.user.id, username: req.user.username, role: req.user.role, tenantId: req.user.tenantId || null, apiKey: true });
  const user = db.prepare('SELECT id,username,full_name,role,must_change_password,tenant_id FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  return res.json({ id: user.id, username: user.username, fullName: user.full_name, role: user.role, mustChangePassword: Number(user.must_change_password) === 1, tenantId: user.tenant_id || req.user.tenantId || null });
});

// GET /api/auth/users — ADMIN only, paginated
router.get('/users', authMiddleware, requireRole('ADMIN'), (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const totalRow = db.prepare('SELECT COUNT(*) as c FROM users').get();
  const rows = db.prepare('SELECT id,username,full_name,role,is_active,tenant_id,created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  return res.json({ users: rows, total: totalRow?.c || 0, limit, offset, hasMore: offset + rows.length < (totalRow?.c || 0) });
});

export default router;
