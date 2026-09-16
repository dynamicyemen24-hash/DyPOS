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

export function audit(event, req, details = {}) {
  auditLogger.info({
    event,
    user: req?.user ? { id: req.user.id, username: req.user.username, role: req.user.role } : null,
    ip: req?.ip,
    ua: req?.get?.('user-agent')?.slice(0, 200),
    ...details,
  });
}

export function auditMiddleware(req, res, next) {
  // Attach audit helper to request for routes to use
  req.audit = (event, details) => audit(event, req, details);
  next();
}

export default { auditLogger, audit, auditMiddleware };
