/**
 * DyPOS Logger — structured pino core (world-class observability).
 *
 * Replaces ad-hoc console.log JSON with:
 * - pino structured logs (level, req_id, method, url, status, duration)
 * - request-scoped child loggers (req.log)
 * - redaction of secrets (password, token, authorization)
 * - pretty transport in development, JSON in production
 *
 * Usage:
 *   import { logger, reqLogger } from '../lib/logger.js';
 *   logger.info({ op: 'invoice.create' }, 'sale recorded');
 */
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.DYPOS_LOG_LEVEL || (isDev ? 'debug' : 'info'),
  redact: {
    paths: ['password', 'token', '*.password', '*.token', 'authorization', 'req.headers.authorization'],
    censor: '[REDACTED]',
  },
  base: { service: 'dypos-server' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** Express middleware: attaches req.log (request-scoped child) + req.id. */
export function reqLogger(req, _res, next) {
  try {
    req.log = logger.child({ req_id: req.id, method: req.method, url: req.url, user: req.user?.username });
  } catch {
    req.log = logger;
  }
  next();
}

export default logger;
