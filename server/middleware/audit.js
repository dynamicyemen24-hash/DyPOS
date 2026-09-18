/**
 * DyPOS Audit — structured JSON audit trail for every mutation.
 * Required for SAMA / ZATCA compliance and forensic traceability.
 * Logs to stdout (JSON) — shipped to ELK / Loki / CloudWatch in production.
 */
import pino from 'pino';

export const auditLogger = pino({
  level: process.env.DYPOS_LOG_LEVEL || 'info',
  base: { service: 'dypos-audit' },
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// In-memory ring buffer (last N audit events) for forensic queries at scale.
// Stdout remains the durable trail (ELK/Loki); this buffer is the fast local
// window for `GET /api/admin/audit` without adding a DB table or dependency.
const RING_MAX = Number(process.env.DYPOS_AUDIT_RING || 500);
const ring = [];
export function auditTail({ limit = 100, event = '', username = '' } = {}) {
  const n = Math.min(Math.max(Number(limit) || 100, 1), 500);
  let rows = ring;
  if (event) rows = rows.filter((r) => String(r.event || '').includes(event));
  if (username) rows = rows.filter((r) => String(r.user?.username || '') === username);
  return rows.slice(-n).reverse();
}

export function audit(event, req, details = {}) {
  const entry = {
    ts: new Date().toISOString(),
    event,
    user: req?.user ? { id: req.user.id, username: req.user.username, role: req.user.role } : null,
    ip: req?.ip,
    ua: req?.get?.('user-agent')?.slice(0, 200),
    ...details,
  };
  auditLogger.info(entry);
  try {
    ring.push(entry);
    if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  } catch { /* buffer never breaks requests */ }
}

export function auditMiddleware(req, res, next) {
  // Attach audit helper to request for routes to use
  req.audit = (event, details) => audit(event, req, details);
  next();
}

export default { auditLogger, audit, auditTail, auditMiddleware };
