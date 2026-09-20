/**
 * DyPOS Idempotency — generic Stripe-style safe-retry core (world-class).
 *
 * Problem solved: retried POSTs (double-tap, flaky network, webhook
 * at-least-once) must NEVER execute twice. Every mutating route accepts
 * `Idempotency-Key` header (or body.idempotencyKey) and returns the STORED
 * response on replay instead of re-executing.
 *
 * Design (single-writer SQLite friendly):
 * - Tier-1: `idempotency_keys` table (UNIQUE key) — survives restarts, shared
 *   across processes on the same DB file. Response cached 24h, then GC'd.
 * - Tier-0: in-process Map for keys created before migrate() runs (boot edge).
 * - Singleflight: concurrent identical keys share ONE promise (no thundering
 *   herd inside the 29-parallel-retries window noted in review).
 * - Scope: key is namespaced per route (`scope:key`) so a checkout key can
 *   never collide with a wallet key.
 *
 * Usage in a route:
 *   import { idempotency } from '../lib/idempotency.js';
 *   router.post('/:id/void', ah(async (req, res) => {
 *     return idempotency(req, res, 'invoice:void', async () => {
 *       ... actual mutation, must RETURN the JSON body ...
 *     });
 *   }));
 */
import crypto from 'crypto';
import db from '../db/schema.js';

const TTL_HOURS = Number(process.env.DYPOS_IDEMPOTENCY_TTL_H || 24);
const memFallback = new Map(); // key -> { status, body }
const inflight = new Map(); // namespaced key -> Promise

function tableAvailable() {
  try {
    db.prepare('SELECT 1 FROM idempotency_keys LIMIT 1').get();
    return true;
  } catch {
    return false;
  }
}

export function extractKey(req) {
  const h = req.headers?.['x-idempotency-key'] || req.headers?.['idempotency-key'];
  const b = req.body?.idempotencyKey || req.body?.idempotency_key;
  const raw = String(h || b || '').trim().slice(0, 128);
  return raw || null;
}

function namespaced(scope, key) {
  return `${scope}:${key}`;
}

export function storedResponse(scope, key) {
  const nk = namespaced(scope, key);
  if (memFallback.has(nk)) return memFallback.get(nk);
  if (!tableAvailable()) return null;
  try {
    const row = db.prepare('SELECT status, body FROM idempotency_keys WHERE key=?').get(nk);
    if (!row) return null;
    return { status: Number(row.status) || 200, body: JSON.parse(row.body) };
  } catch {
    return null;
  }
}

function storeResponse(scope, key, status, body) {
  const nk = namespaced(scope, key);
  const entry = { status, body };
  memFallback.set(nk, entry);
  if (memFallback.size > 5000) {
    const first = memFallback.keys().next().value;
    memFallback.delete(first);
  }
  if (!tableAvailable()) return;
  try {
    db.prepare(
      `INSERT INTO idempotency_keys (key, scope, status, body, created_at, expires_at)
       VALUES (?,?,?,?,datetime('now'),datetime('now', ?))
       ON CONFLICT(key) DO NOTHING`
    ).run(nk, scope, status, JSON.stringify(body), `+${Math.max(1, TTL_HOURS)} hours`);
  } catch { /* memory remains authoritative */ }
}

export function idempotencyKeyMiddleware(scope) {
  return (req, _res, next) => {
    req.idempotencyScope = scope;
    req.idempotencyKey = extractKey(req);
    next();
  };
}

/**
 * Execute `fn` once per (scope,key). Replays return the stored response
 * WITHOUT re-executing. When no key is supplied, executes directly.
 * `fn` must RETURN the JSON body (not res.json) — this wrapper sends it.
 */
export async function idempotency(req, res, scope, fn) {
  const key = req.idempotencyKey || extractKey(req);
  if (!key) {
    const body = await fn();
    return res.json(body);
  }
  const nk = namespaced(scope, key);
  const hit = storedResponse(scope, key);
  if (hit) {
    res.set('X-Idempotent-Replayed', 'true');
    return res.status(hit.status).json({ ...hit.body, deduped: true });
  }
  if (inflight.has(nk)) {
    const shared = await inflight.get(nk);
    res.set('X-Idempotent-Replayed', 'true');
    return res.status(shared.status).json({ ...shared.body, deduped: true });
  }
  const p = (async () => {
    const body = await fn();
    const entry = { status: res.statusCode && res.statusCode !== 200 ? res.statusCode : 200, body };
    storeResponse(scope, key, entry.status, body);
    return entry;
  })();
  inflight.set(nk, p);
  try {
    const out = await p;
    return res.status(out.status).json(out.body);
  } finally {
    inflight.delete(nk);
  }
}

/** Generate a server-side key (for internal retries / tests). */
export function newKey() {
  return crypto.randomUUID();
}

export function resetIdempotencyForTests() {
  memFallback.clear();
  inflight.clear();
}

export default { extractKey, storedResponse, idempotency, idempotencyKeyMiddleware, newKey, resetIdempotencyForTests };
