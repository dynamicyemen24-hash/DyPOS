import { Router } from 'express';
import { hashPasswordAsync, verifyPasswordAsync, generateToken, revokeToken, authMiddleware, requireRole, isProduction } from '../middleware/auth.js';
import { validate, loginSchema, registerSchema } from '../middleware/validate.js';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';

const router = Router();

const ALLOWED_ROLES = new Set(['ADMIN', 'MANAGER', 'CASHIER', 'AUDITOR']);

// POST /api/auth/login (async bcrypt — never block the event loop)
router.post('/login', validate(loginSchema), async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(String(username).trim());
  if (!user) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  let ok = false;
  try {
    ok = await verifyPasswordAsync(password, user.password_hash);
  } catch {
    ok = false;
  }
  if (!ok) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  const token = generateToken(user);
  req.audit?.('auth.login', { userId: user.id, username: user.username });
  return res.json({
    token,
    user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role },
    mustChangePassword: Number(user.must_change_password) === 1,
  });
});

// POST /api/auth/register — bootstrap-open only when no users exist,
// otherwise ADMIN-only. Prevents privilege escalation at SaaS scale.
router.post('/register', validate(registerSchema), async (req, res) => {
  const { username, password, fullName, role = 'CASHIER' } = req.body;
  const cleanUsername = String(username).trim();
  const cleanFull = String(fullName).trim();

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
  db.prepare('INSERT INTO users (id,username,password_hash,full_name,role) VALUES (?,?,?,?,?)')
    .run(id, cleanUsername, hash, cleanFull, finalRole);
  req.audit?.('auth.register', { newUser: cleanUsername, role: finalRole });
  return res.status(201).json({ id, username: cleanUsername, fullName: cleanFull, role: finalRole });
});

// POST /api/auth/logout — revoke current token
router.post('/logout', authMiddleware, (req, res) => {
  if (req.token) revokeToken(req.token);
  req.audit?.('auth.logout', {});
  return res.json({ revoked: true });
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, async (req, res) => {
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
  if (req.token) revokeToken(req.token);
  return res.json({ changed: true });
});

// GET /api/auth/me (requires a valid Bearer token)
router.get('/me', authMiddleware, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
  const user = db.prepare('SELECT id,username,full_name,role,must_change_password FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  return res.json({ id: user.id, username: user.username, fullName: user.full_name, role: user.role, mustChangePassword: Number(user.must_change_password) === 1 });
});

// GET /api/auth/users — ADMIN only, paginated
router.get('/users', authMiddleware, requireRole('ADMIN'), (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const rows = db.prepare('SELECT id,username,full_name,role,is_active,created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
  return res.json({ users: rows, limit, offset });
});

export default router;
