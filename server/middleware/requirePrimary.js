/**
 * requirePrimary — write guard for read-only replicas.
 * When DYPOS_READ_ONLY=1, reject all mutations with 409 (not 500) so the
 * edge can retry against the primary. Safe + explicit at SaaS scale.
 */
import { IS_READ_ONLY_REPLICA } from '../db/mode.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function requirePrimary(req, res, next) {
  if (IS_READ_ONLY_REPLICA && MUTATING.has(req.method) && req.path.startsWith('/api/')) {
    // Health/ready/metrics are GET — never blocked.
    return res.status(409).json({
      error: 'Read-only replica — retry against the primary writer',
      code: 'READ_ONLY_REPLICA',
      primary: process.env.DYPOS_PRIMARY_URL || undefined,
    });
  }
  next();
}

export default requirePrimary;
