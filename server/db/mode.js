/**
 * DyPOS DB Mode — explicit single-writer decision (no silent misconfig).
 *
 * Tier 1 (current): SQLite single-writer primary.
 *   - 1 store / tens of terminals, <1M invoices/year per node.
 *   - Scale reads via OS page-cache + optional read-only replicas
 *     (DYPOS_READ_ONLY=1) behind nginx; ALL writes go to the primary.
 * Tier 2 (millions of subscribers): PostgreSQL — DDL ready at
 *   db/schema-postgres.sql; app driver migration is tracked work, NOT silent.
 *
 * Fail-fast rules:
 * - If DYPOS_DATABASE_URL looks like postgres:// → refuse to boot on the
 *   SQLite driver (prevents "thought we were on Postgres" incidents).
 * - If DYPOS_READ_ONLY=1 → mutation guard (see middleware/requirePrimary.js).
 */
const RAW_URL = process.env.DYPOS_DATABASE_URL || process.env.DYPOS_DB_PATH || '';

export const DB_MODE = (() => {
  if (/^postgres(ql)?:\/\//i.test(RAW_URL.trim())) return 'postgres-pending';
  return 'sqlite';
})();

export const IS_READ_ONLY_REPLICA = process.env.DYPOS_READ_ONLY === '1';

export function assertDbModeSupported() {
  if (DB_MODE === 'postgres-pending') {
    throw new Error(
      '[DyPOS FATAL] DYPOS_DATABASE_URL points to PostgreSQL, but this build ships the SQLite driver only.\n' +
        '  Options: (a) unset DYPOS_DATABASE_URL to run Tier-1 SQLite primary, or\n' +
        '  (b) follow docs/DB_DECISION.md Tier-2 path (schema-postgres.sql) once the pg driver lands.\n' +
        '  Refusing to boot rather than silently writing to the wrong database.'
    );
  }
}

export function describeDbMode() {
  return {
    mode: DB_MODE,
    read_only: IS_READ_ONLY_REPLICA,
    tier: DB_MODE === 'sqlite' ? (IS_READ_ONLY_REPLICA ? 'tier1-replica' : 'tier1-primary') : 'tier2-pending',
  };
}

export default { DB_MODE, IS_READ_ONLY_REPLICA, assertDbModeSupported, describeDbMode };
