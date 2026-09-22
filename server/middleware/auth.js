/**
 * DyPOS Auth — JWT middleware v1.31.0 (production-hardened for scale)
 * - Non-blocking bcrypt (async) so login storms don't stall the event loop
 * - jti-based sessions with revocation check (logout / forced rotation)
 * - No insecure fallback in production
 * - Version: 1.31.0 — single source: server/lib/version.js
 */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { v4 as uuid } from 'uuid';
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
  return bcrypt.hashSync(String(password), 12);
}

export function hashPasswordAsync(password) {
  return new Promise((resolve, reject) => {
    bcrypt.hash(String(password), 12, (err, hash) => (err ? reject(err) : resolve(hash)));
  });
}

export function verifyPassword(password, hash) {
  return bcrypt.compareSync(String(password), String(hash));
}

export function verifyPasswordAsync(password, hash) {
  return new Promise((resolve, reject) => {
    bcrypt.compare(String(password), String(hash), (err, ok) => (err ? reject(err) : resolve(ok)));
  });
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export { tokenHash };

export function revokeAllSessions(userId, exceptToken = null) {
  try {
    if (exceptToken) {
      db.prepare(`UPDATE user_sessions SET revoked=1 WHERE user_id=? AND token_hash!=?`).run(userId, tokenHash(exceptToken));
    } else {
      db.prepare(`UPDATE user_sessions SET revoked=1 WHERE user_id=?`).run(userId);
    }
  } catch { /* ignore */ }
}

export function generateToken(user) {
  const jti = uuid();
  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, fullName: user.full_name, tenantId: user.tenant_id || null, jti },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES },
  );
  // Best-effort session record for revocation (logout). Failures must not break login.
  try {
    const decoded = jwt.decode(token);
    const exp = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    db.prepare(`INSERT OR IGNORE INTO user_sessions (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)`)
      .run(jti, user.id, tokenHash(token), exp);
  } catch { /* sessions table may not exist yet during bootstrap */ }
  return token;
}

export function revokeToken(token) {
  try {
    db.prepare(`UPDATE user_sessions SET revoked=1 WHERE token_hash=?`).run(tokenHash(token));
  } catch { /* ignore */ }
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Extract Bearer token from header, cookie, or legacy Frappe session header. */
function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  // Legacy Frappe cookie — allows the published static pos.html (which
  // boots from window.boot) to reuse its server-issued sid without CORS.
  const cookie = String(req.headers.cookie || '');
  const m = cookie.match(/(?:^|;\s*)dypos_token=([^;]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
  // Frappe compatibility header from some ERP bridges
  const legacy = req.headers['x-frappe-site-name'] ? req.headers['x-auth-token'] : null;
  if (legacy) return String(legacy);
  return null;
}

/** Machine credential: X-API-Key (ERP/WMS/BI integrations, see GET /api/admin/api-keys). */
export function hashApiKey(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

function resolveApiKey(req) {
  const raw = String(req.headers['x-api-key'] || '').trim();
  if (!raw || raw.length > 128) return null;
  let row = null;
  try {
    row = db.prepare('SELECT * FROM api_keys WHERE key_hash=?').get(hashApiKey(raw));
  } catch {
    return null; // pre-v10 DBs: no api_keys table yet
  }
  if (!row || Number(row.revoked) === 1) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) return null;
  // Throttled last-used stamp (hourly) — avoids a write per read at scale.
  try {
    db.prepare(`UPDATE api_keys SET last_used_at=datetime('now') WHERE id=? AND (last_used_at IS NULL OR last_used_at < datetime('now','-1 hour'))`).run(row.id);
  } catch { /* ignore */ }
  return row;
}

/** Express middleware — attaches req.user + enforces revocation */
export function authMiddleware(req, res, next) {
  // Machine keys first (no JWT parsing cost for ERP traffic).
  const apiRow = resolveApiKey(req);
  if (apiRow) {
    req.user = {
      id: `key:${apiRow.id}`, username: `apikey:${apiRow.name}`, role: apiRow.role,
      tenantId: apiRow.tenant_id || null, apiKeyId: apiRow.id, isApiKey: true,
    };
    req.token = null;
    req.apiKey = apiRow;
    return next();
  }
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'غير مصرح — تسجيل الدخول مطلوب' });
  }
  try {
    const decoded = verifyToken(token);
    // Revocation check (single indexed lookup on token_hash)
    try {
      const sess = db.prepare('SELECT revoked FROM user_sessions WHERE id=? OR token_hash=? LIMIT 1')
        .get(decoded.jti || '', tokenHash(token));
      if (sess && Number(sess.revoked) === 1) {
        return res.status(401).json({ error: 'تم تسجيل الخروج — سجل الدخول مجددًا' });
      }
    } catch { /* if sessions table missing, allow token through */ }
    req.user = decoded;
    req.token = token;
    next();
  } catch (_e) {
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

export { extractToken };

export default { hashPassword, hashPasswordAsync, verifyPassword, verifyPasswordAsync, generateToken, revokeToken, revokeAllSessions, tokenHash, hashApiKey, verifyToken, authMiddleware, requireRole };
