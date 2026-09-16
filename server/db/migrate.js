/**
 * DyPOS Migration Runner
 * Run: npm run migrate
 *
 * Applies all pending schema migrations and exits with a non-zero code on
 * failure so container entrypoints and CI pipelines fail loudly instead of
 * booting an application against an unusable database.
 *
 * Safe to run repeatedly: migrations are versioned through the
 * `schema_version` table and every DDL statement is idempotent.
 */
import { migrate, checkDbHealth, db } from './schema.js';

let exitCode = 0;

try {
  migrate();

  const health = checkDbHealth();
  if (!health.healthy) {
    throw new Error(health.error || 'Database health check failed after migration');
  }

  console.log('[DyPOS] ┌─────────────────────────────────────────────┐');
  console.log('[DyPOS] │  Migration complete                          │');
  console.log(`[DyPOS] │  Driver:   ${health.type}`);
  console.log(`[DyPOS] │  Target:   ${health.path}`);
  console.log(`[DyPOS] │  Version:  v${health.migration_version}`);
  console.log('[DyPOS] └─────────────────────────────────────────────┘');
} catch (error) {
  exitCode = 1;
  console.error('[DyPOS] ✗ Migration failed:', error?.message || error);
} finally {
  // Release the SQLite handle so the process can exit cleanly on Windows,
  // where an open handle keeps the event loop (and the file lock) alive.
  try {
    db.close();
  } catch {
    // Already closed, or never opened — nothing left to release.
  }
}

process.exit(exitCode);