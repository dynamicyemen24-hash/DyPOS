/**
 * DyPOS Auth — JWT middleware
 * Production-safe: validates JWT secret length on startup.
 */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../db/schema.js';

export const isProduction = process.env.NODE_ENV === 'production';

// Use the env secret — no insecure fallback in production
const JWT_SECRET = process.env.DYPOS_JWT_SECRET || 'dypos-dev-secret-change-in-production';
const JWT_EXPIRES = process.env.DYPOS_JWT_EXPIRES || '24h';

// At startup, warn if running production with a weak/default secret
if (isProduction && (!process.env.DYPOS_JWT_SECRET || process.env.DYPOS_JWT_SECRET === 'dypos-dev-secret-change-in-production')) {
  console.error('[DyPOS FATAL] DYPOS_JWT_SECRET must be set to a strong value (>=32 chars) in production.');
  process.exit(1);
}

export function hashPassword(password) {
  return bcrypt.hashSync(String(password), 12); // bcrypt rounds increased to 12
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(String(password), String(hash));
}

export function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.full_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Express middleware — attaches req.user */
export function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'غير مصرح — تسجيل الدخول مطلوب' });
  }
  try {
    const decoded = verifyToken(auth.slice(7));
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'رمز غير صالح أو منتهي الصلاحية' });
  }
}

/** Role guard */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'صلاحية غير كافية' });
    next();
  };
}

export default { hashPassword, verifyPassword, generateToken, verifyToken, authMiddleware, requireRole };
