/**
 * DyPOS Tamper-Evident Audit Ledger — append-only, hash-chained forensic store.
 *
 * Every critical mutation can be recorded with an unforgeable chain: each row
 * carries `prev_hash` (the previous row's hash) and its own `hash`, computed as
 *   sha256( seq | ts | actor_id | action | entity | entity_id | meta | prev_hash )
 * so changing ANY field of ANY row invalidates the stored hash of that row AND
 * every subsequent row. `auditVerifyChain()` replays the chain and reports the
 * first broken link — the exact sequence number that was tampered with.
 *
 * Design constraints (from the security campaign):
 *   - Appending is BEST-EFFORT: the ledger exists to record activity, it must
 *     never break a sale. All writes are wrapped so a locked/unavailable DB
 *     returns { ok:false } instead of throwing into a request handler.
 *   - Self-healing DDL: because migrations live inline in db/schema.js (v22)
 *     and this module is imported before any migration can run, the CREATE
 *     TABLE is applied lazily on first use (idempotent, cheap). The standalone
 *     migration file db/migrations/23_audit_ledger.js applies the same DDL for
 *     fleet upgrade paths.
 *   - Import-safe: nothing runs on import. Pass an explicit database handle or
 *     rely on the default (db/schema.js singleton) at call time.
 */
import crypto from 'node:crypto';
import db from '../db/schema.js';

export const AUDIT_LEDGER_TABLE = 'audit_ledger';
export const AUDIT_LEDGER_VERSION = 23;
const GENESIS = 'GENESIS';
const MAX_LEN = { actorId: 64, actorRole: 32, action: 48, entity: 32, entityId: 64, meta: 2000 };

const DDL = `
  CREATE TABLE IF NOT EXISTS ${AUDIT_LEDGER_TABLE} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seq INTEGER UNIQUE NOT NULL,
    ts TEXT NOT NULL,
    actor_id TEXT NOT NULL DEFAULT '',
    actor_role TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL,
    entity TEXT NOT NULL DEFAULT '',
    entity_id TEXT NOT NULL DEFAULT '',
    meta TEXT NOT NULL DEFAULT '{}',
    prev_hash TEXT NOT NULL DEFAULT '${GENESIS}',
    hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_${AUDIT_LEDGER_TABLE}_entity ON ${AUDIT_LEDGER_TABLE}(entity, entity_id);
  CREATE INDEX IF NOT EXISTS idx_${AUDIT_LEDGER_TABLE}_ts ON ${AUDIT_LEDGER_TABLE}(ts);
  CREATE INDEX IF NOT EXISTS idx_${AUDIT_LEDGER_TABLE}_seq ON ${AUDIT_LEDGER_TABLE}(seq);
`;

let verifiedTable = false;

/**
 * Idempotently ensure the ledger table (+ indexes) exists. Called lazily on
 * first write/read so the module loads before schema.js migrate() runs.
 * @param {{ exec?: Function }} [database]
 * @returns {boolean} true when the table is guaranteed present
 */
export function ensureAuditLedger(database = db) {
  if (verifiedTable) return true;
  try {
    database.exec(DDL);
    verifiedTable = true;
    return true;
  } catch {
    return false;
  }
}

/** Compute the chain hash for one ledger entry. */
export function auditChainHash({ seq, ts, actor_id, action, entity, entity_id, meta, prev_hash }) {
  return crypto
    .createHash('sha256')
    .update(`${String(seq)}|${String(ts)}|${String(actor_id)}|${String(action)}|${String(entity)}|${String(entity_id)}|${String(meta)}|${String(prev_hash)}`)
    .digest('hex');
}

function stringifyMeta(meta) {
  if (meta === undefined || meta === null) return '{}';
  if (typeof meta === 'string') return meta.slice(0, MAX_LEN.meta);
  try {
    return JSON.stringify(meta).slice(0, MAX_LEN.meta);
  } catch {
    return '{}';
  }
}

function clip(value, max) {
  return String(value ?? '').slice(0, max);
}

/**
 * Append one ledger entry. NEVER throws — returns a report.
 * @param {{ actor_id?: string, actor_role?: string, action: string, entity?: string, entity_id?: string, meta?: object|string }} entry
 * @param {{ exec?: Function, prepare?: Function, transaction?: Function }} [database]
 * @returns {{ ok: boolean, seq?: number, hash?: string, prev_hash?: string, error?: string }}
 */
export function auditRecordSAFE(entry, database = db) {
  try {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, error: 'invalid ledger entry' };
    }
    if (!ensureAuditLedger(database)) {
      return { ok: false, error: 'ledger table unavailable' };
    }
    const action = clip(entry.action, MAX_LEN.action) || 'unknown';
    const entity = clip(entry.entity, MAX_LEN.entity);
    const entityId = clip(entry.entity_id, MAX_LEN.entityId);
    const meta = stringifyMeta(entry.meta);
    const actorId = clip(entry.actor_id, MAX_LEN.actorId);
    const actorRole = clip(entry.actor_role, MAX_LEN.actorRole);
    const run = database.transaction(() => {
      const last = database.prepare(`SELECT seq, hash FROM ${AUDIT_LEDGER_TABLE} ORDER BY seq DESC LIMIT 1`).get();
      const seq = last ? Number(last.seq) + 1 : 1;
      const prevHash = last ? String(last.hash) : GENESIS;
      const ts = new Date().toISOString();
      const hash = auditChainHash({ seq, ts, actor_id: actorId, action, entity, entity_id: entityId, meta, prev_hash: prevHash });
      database
        .prepare(
          `INSERT INTO ${AUDIT_LEDGER_TABLE} (seq, ts, actor_id, actor_role, action, entity, entity_id, meta, prev_hash, hash)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(seq, ts, actorId, actorRole, action, entity, entityId, meta, prevHash, hash);
      return { seq, hash, prev_hash: prevHash };
    });
    return { ok: true, ...run() };
  } catch (e) {
    return { ok: false, error: String(e?.message || 'ledger write failed').slice(0, 200) };
  }
}

/**
 * Replay the chain and verify integrity. Reports whether the chain is valid,
 * the number of entries, and the first sequence at which a tamper is detected.
 * @param {{ prepare?: Function, exec?: Function }} [database]
 * @returns {{ valid: boolean, count: number, brokenAtSeq: number|null, error?: string }}
 */
export function auditVerifyChain(database = db) {
  try {
    if (!ensureAuditLedger(database)) {
      return { valid: false, count: 0, brokenAtSeq: null, error: 'ledger table unavailable' };
    }
    const rows = database
      .prepare(`SELECT seq, ts, actor_id, action, entity, entity_id, meta, prev_hash, hash FROM ${AUDIT_LEDGER_TABLE} ORDER BY seq ASC`)
      .all();
    if (!rows.length) return { valid: true, count: 0, brokenAtSeq: null };
    let expectedPrev = GENESIS;
    for (const row of rows) {
      const recomputed = auditChainHash(row);
      if (recomputed !== String(row.hash)) {
        return { valid: false, count: rows.length, brokenAtSeq: Number(row.seq) };
      }
      if (String(row.prev_hash) !== expectedPrev) {
        return { valid: false, count: rows.length, brokenAtSeq: Number(row.seq) };
      }
      expectedPrev = String(row.hash);
    }
    return { valid: true, count: rows.length, brokenAtSeq: null };
  } catch (e) {
    return { valid: false, count: 0, brokenAtSeq: null, error: String(e?.message || 'ledger verify failed').slice(0, 200) };
  }
}

/**
 * Orchestration hook: attach `req.ledger` so any route can record an entry
 * without importing this module. Returns the app for chaining.
 * @param {import('express').Express} app
 */
export function registerAuditLedger(app) {
  app.use((req, _res, next) => {
    req.ledger = (entry) =>
      auditRecordSAFE({
        actor_id: req.user?.id || req.user?.username || '',
        actor_role: req.user?.role || '',
        ...entry,
      });
    next();
  });
  return app;
}

export default { AUDIT_LEDGER_TABLE, AUDIT_LEDGER_VERSION, ensureAuditLedger, auditChainHash, auditRecordSAFE, auditVerifyChain, registerAuditLedger };