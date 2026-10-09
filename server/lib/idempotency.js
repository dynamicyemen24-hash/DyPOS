/**
 * DyPOS Idempotency — safe retry core.
 *
 * Mutating requests can be retried after network failures without executing
 * the mutation twice. Keys are scoped by route + tenant/org/branch context.
 */
import crypto from 'node:crypto';
import db from '../db/schema.js';

const TTL_HOURS = Number(process.env.DYPOS_IDEMPOTENCY_TTL_H || 24);
const memFallback = new Map();
const inflight = new Map();

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
	const raw = String(h || b || '')
		.trim()
		.slice(0, 128);
	return raw || null;
}

function requestScope(req, scope) {
	const h = req.headers || {};
	const b = req.body && typeof req.body === 'object' ? req.body : {};
	const tenant = String(req.user?.tenantId || h['x-tenant-id'] || b.tenantId || '').trim();
	const org = String(h['x-org-id'] || b.orgId || '').trim();
	const branch = String(h['x-branch-id'] || b.branchId || '').trim();
	return [scope, tenant || 'legacy', org || '-', branch || '-'].join(':');
}

function namespaced(req, scope, key) {
	return [requestScope(req, scope), key].join(':');
}

export function storedResponse(req, scope, key) {
	const nk = namespaced(req, scope, key);
	if (memFallback.has(nk)) return memFallback.get(nk);
	if (!tableAvailable()) return null;
	try {
		const row = db
			.prepare("SELECT status, body FROM idempotency_keys WHERE key=? AND expires_at > datetime('now')")
			.get(nk);
		if (!row) return null;
		return { status: Number(row.status) || 200, body: JSON.parse(row.body) };
	} catch {
		return null;
	}
}

function storeResponse(req, scope, key, status, body) {
	const nk = namespaced(req, scope, key);
	const entry = { status, body };
	memFallback.set(nk, entry);
	if (memFallback.size > 5000) memFallback.delete(memFallback.keys().next().value);
	if (!tableAvailable()) return;
	try {
		db.prepare(
			`INSERT INTO idempotency_keys (key, scope, status, body, created_at, expires_at)
       VALUES (?,?,?,?,datetime('now'),datetime('now', ?))
       ON CONFLICT(key) DO UPDATE SET
         scope=excluded.scope,
         status=excluded.status,
         body=excluded.body,
         created_at=excluded.created_at,
         expires_at=excluded.expires_at
       WHERE idempotency_keys.expires_at <= datetime('now')`,
		).run(nk, requestScope(req, scope), status, JSON.stringify(body), `+${Math.max(1, TTL_HOURS)} hours`);
	} catch {
		/* memory fallback remains authoritative */
	}
}

export function idempotencyKeyMiddleware(scope) {
	return (req, _res, next) => {
		req.idempotencyScope = scope;
		req.idempotencyKey = extractKey(req);
		next();
	};
}

export async function idempotency(req, res, scope, fn) {
	const key = req.idempotencyKey || extractKey(req);
	if (!key) return res.json(await fn());

	const nk = namespaced(req, scope, key);
	const hit = storedResponse(req, scope, key);
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
		storeResponse(req, scope, key, entry.status, body);
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

export function newKey() {
	return crypto.randomUUID();
}

export function resetIdempotencyForTests() {
	memFallback.clear();
	inflight.clear();
}

export default {
	extractKey,
	storedResponse,
	idempotency,
	idempotencyKeyMiddleware,
	newKey,
	resetIdempotencyForTests,
};
