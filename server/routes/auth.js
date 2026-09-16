import { Router } from 'express';
import { hashPassword, verifyPassword, generateToken, authMiddleware } from '../middleware/auth.js';
import db from '../db/schema.js';
import { v4 as uuid } from 'uuid';

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'اسم المستخدم وكلمة المرور مطلوبان' });
  const user = db.prepare('SELECT * FROM users WHERE username=? AND is_active=1').get(String(username).trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  }
  const token = generateToken(user);
  return res.json({ token, user: { id: user.id, username: user.username, fullName: user.full_name, role: user.role } });
});

// POST /api/auth/register (admin only)
router.post('/register', (req, res) => {
  const { username, password, fullName, role = 'CASHIER' } = req.body || {};
  if (!username || !password || !fullName) return res.status(400).json({ error: 'جميع الحقول مطلوبة' });
  const existing = db.prepare('SELECT 1 FROM users WHERE username=?').get(String(username).trim());
  if (existing) return res.status(409).json({ error: 'اسم المستخدم موجود مسبقًا' });
  const id = uuid();
  db.prepare('INSERT INTO users (id,username,password_hash,full_name,role) VALUES (?,?,?,?,?)').run(id, String(username).trim(), hashPassword(password), String(fullName).trim(), String(role).trim());
  return res.status(201).json({ id, username: String(username).trim(), fullName: String(fullName).trim(), role });
});

// GET /api/auth/me (requires a valid Bearer token)
router.get('/me', authMiddleware, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
  const user = db.prepare('SELECT id,username,full_name,role FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
  return res.json({ id: user.id, username: user.username, fullName: user.full_name, role: user.role });
});

export default router;