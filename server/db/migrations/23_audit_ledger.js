/**
 * DyPOS migration v23 — tamper-evident audit ledger.
 *
 * The repo keeps migrations inline in db/schema.js (MIGRATION_VERSION = 22).
 * This file is the standalone migration contract for the security campaign: it
 * exports version/up/down/description for any future orchestrator, AND runs
 * directly (`node server/db/migrations/23_audit_ledger.js`) so operators can
 * apply it without touching the main runner. It is idempotent — safe to run on
 * an up-to-date fleet and to re-run on a partial apply.
 *
 * Note: db/schema.js MIGRATION_VERSION stays at 22 (immutable in this
 * campaign). The ledger is fully self-healing at runtime via
 * lib/auditLedger.js` ensureAuditLedger()`; this migration exists for
 * explicit/standalone upgrade paths and for handwriting the chain table into
 * production schemas before deploy.
 */
import { basename } from 'node:path';

export const version = 23;
export const description = 'tamper-evident hash-chained audit ledger (security hardening)';

const TABLE = 'audit_ledger';

export const DDL = `
  CREATE TABLE IF NOT EXISTS ${TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seq INTEGER UNIQUE NOT NULL,
    ts TEXT NOT NULL,
    actor_id TEXT NOT NULL DEFAULT '',
    actor_role TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    entity TEXT NOT NULL DEFAULT '',
    entity_id TEXT NOT NULL DEFAULT '',
    meta TEXT NOT NULL DEFAULT '{}',
    prev_hash TEXT NOT NULL DEFAULT 'GENESIS',
    hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_${TABLE}_entity ON ${TABLE}(entity, entity_id);
  CREATE INDEX IF NOT EXISTS idx_${TABLE}_ts ON ${TABLE}(ts);
  CREATE INDEX IF NOT EXISTS idx_${TABLE}_seq ON ${TABLE}(seq);
`;

/**
 * Apply the migration on the given database handle.
 * @param {{ exec?: Function }} database
 * @returns {boolean} true on success
 */
export function up(database) {
  try {
    database.exec(DDL);
    try {
      database.exec(`CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')), description TEXT)`);
      database.prepare('INSERT OR REPLACE INTO schema_version (version, description) VALUES (?, ?)').run(version, description);
    } catch { /* schema_version bookkeeping is best-effort */ }
    return true;
  } catch (e) {
    throw new Error(`migration v${version} failed: ${e.message}`);
  }
}

/**
 * Roll the migration back on the given database handle.
 * @param {{ exec?: Function, prepare?: Function }} database
 * @returns {boolean} true on success
 */
export function down(database) {
  try {
    database.exec(`DROP TABLE IF EXISTS ${TABLE}`);
    try {
      database.prepare('DELETE FROM schema_version WHERE version=?').run(version);
    } catch { /* schema_version may not exist; ignore */ }
    return true;
  } catch (e) {
    throw new Error(`migration v${version} rollback failed: ${e.message}`);
  }
}

// ── Standalone runner ─────────────────────────────────────────────────────
// `node server/db/migrations/23_audit_ledger.js` applies v23 to the default DB.
const isDirect = process.argv[1] && import.meta.url.endsWith(basename(String(process.argv[1])));
if (isDirect) {
  const { default: db } = await import('../schema.js');
  try {
    up(db);
    console.error(`[DyPOS] Migration v${version} applied (${description}).`);
  } catch (e) {
    console.error(`[DyPOS] ${e.message}`);
    process.exit(1);
  }
}

export default { version, description, up, down, DDL };