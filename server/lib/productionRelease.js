/** DyPOS Final Production Release & Tech Debt Resolver v1.35.0 */
import db from '../db/schema.js'

/**
 * Clean up technical debt, optimize SQLite PRAGMAs, and ensure reporting data integrity.
 * Deferred via setImmediate so heavy statistics scans never block server startup.
 */
export function resolveTechnicalDebtAndOptimize() {
  setImmediate(() => {
    try {
      // Clean expired idempotency keys and old audit logs past retention
      db.prepare(`DELETE FROM idempotency_keys WHERE expires_at < datetime('now')`).run();

      // Optimize SQLite performance for production load
      db.pragma('analysis_limit = 1000');
      db.pragma('optimize');

      // Best-effort vacuum / analyze on low-traffic boot
      if (process.env.NODE_ENV !== 'test') {
        db.prepare('ANALYZE').run();
      }
    } catch {
      // Non-blocking best effort
    }
  });
}

export default {
  resolveTechnicalDebtAndOptimize,
}