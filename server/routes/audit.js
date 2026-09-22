/**
 * DyPOS Audit Ledger routes — ADMIN-only forensic read + verify.
 *
 * Backed by the tamper-evident hash-chained ledger (lib/auditLedger.js). The
 * ledger SELF-HEALS (ensureAuditLedger on first use) because the app's inline
 * migrations (db/schema.js v22) never touch it; the migration file
 * db/migrations/23_audit_ledger.js applies the same DDL on fleet upgrade.
 *
 *   GET /api/audit          — latest N entries (limit<=500), optional filters
 *   GET /api/audit/verify   — replay the chain; 200 valid / 409 tampered
 *
 * Mounted by the orchestrator via `registerAuditRoutes(app)`; the router is
 * also exported directly for explicit wiring (authMiddleware applied here).
 */
import { Router } from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { ah } from '../lib/async.js';
import { auditRecordSAFE, auditVerifyChain, ensureAuditLedger, AUDIT_LEDGER_TABLE } from '../lib/auditLedger.js';
import db from '../db/schema.js';

const router = Router();

router.use(authMiddleware);
router.use(requireRole('ADMIN'));

function intValue(raw, fallback, min, max) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

// GET /api/audit — latest ledger entries, newest first. Optional filters:
// limit (1..500), actor, action, entity. Every response is no-store.
router.get('/', ah(async (req, res) => {
  const limit = intValue(req.query.limit, 50, 1, 500);
  const actor = String(req.query.actor || '').trim().slice(0, 64);
  const action = String(req.query.action || '').trim().slice(0, 48);
  const entity = String(req.query.entity || '').trim().slice(0, 32);

  // Ensure the ledger exists (self-healing DDL) — a pre-migration fleet that
  // has never recorded anything returns an empty list, never a 500.
  ensureAuditLedger(db);

  let where = '1=1';
  const params = [];
  if (actor) { where += ' AND actor_id=?'; params.push(actor); }
  if (action) { where += ' AND action=?'; params.push(action); }
  if (entity) { where += ' AND entity=?'; params.push(entity); }

  let entries = [];
  try {
    entries = db
      .prepare(`SELECT seq, ts, actor_id, actor_role, action, entity, entity_id, meta, prev_hash, hash
                FROM ${AUDIT_LEDGER_TABLE} WHERE ${where} ORDER BY seq DESC LIMIT ?`)
      .all(...params, limit);
  } catch { /* ledger unavailable → empty list */ }

  res.setHeader('Cache-Control', 'no-store');
  return res.json({ entries, count: entries.length, limit });
}));

// GET /api/audit/verify — replay the chain. 200 = intact, 409 = tampered
// (brokenAtSeq = exact sequence of the first tampered row).
router.get('/verify', ah(async (_req, res) => {
  const result = auditVerifyChain(db);
  if (!result.valid) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(409).json({ valid: false, ...result });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.json(result);
}));

// Reserved for the campaign's live-audit hookup: any ADMIN can record a
// signed annotation (config change, manual override) into the chain.
router.post('/', ah(async (req, res) => {
  const { action = 'annotation', entity = '', entity_id = '', meta = {} } = req.body || {};
  const out = auditRecordSAFE({
    actor_id: req.user?.id || req.user?.username || '',
    actor_role: req.user?.role || '',
    action: String(action).slice(0, 48),
    entity: String(entity).slice(0, 32),
    entity_id: String(entity_id).slice(0, 64),
    meta,
  });
  if (!out.ok) return res.status(503).json({ error: 'الدفتر غير متاح', detail: out.error });
  return res.status(201).json({ recorded: true, seq: out.seq, hash: out.hash });
}));

/**
 * Orchestration hook: `registerAuditRoutes(app)` mounts the ledger API at
 * /api/audit (auth + ADMIN gate baked in).
 */
export function registerAuditRoutes(app) {
  app.use('/api/audit', router);
  return app;
}

export default router;