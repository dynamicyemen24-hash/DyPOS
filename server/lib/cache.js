/**
 * DyPOS Cache — multi-tier read accelerator for millions of sessions.
 *
 * Tier-1: in-process LRU + TTL (zero-dependency, per-worker).
 * Tier-2 (optional): Redis via DYPOS_REDIS_URL — when set, the same
 *   get/set API delegates to Redis (shared across replicas/cluster workers).
 *   If `ioredis` is not installed or Redis unreachable, falls back to memory
 *   automatically (fail-open for reads, never breaks sales).
 *
 * Standard HTTP semantics included:
 *  - `Cache-Control: private, max-age=N, stale-while-revalidate=M`
 *  - Weak ETag from content hash + `If-None-Match` → 304 (saves DB + bandwidth)
 *
 * Usage:
 *   import { getOrSet, cacheStats, sendCached } from '../lib/cache.js';
 *   const data = await getOrSet('products:list:...', 5, async () => db.query(...));
 */
import crypto from 'crypto';

const MAX_ENTRIES = Number(process.env.DYPOS_CACHE_MAX || 2000);
const DEFAULT_TTL = Number(process.env.DYPOS_CACHE_TTL || 5);

const mem = new Map(); // key -> { value, expiresAt, hits }
let stats = { hits: 0, misses: 0, sets: 0, evictions: 0, redis: false };

// ── Optional Redis (lazy, no hard dependency) ──
let redis = null;
async function redisClient() {
  const url = process.env.DYPOS_REDIS_URL;
  if (!url) return null;
  if (redis) return redis;
  try {
    const { default: Redis } = await import('ioredis').catch(() => ({ default: null }));
    if (!Redis) return null;
    redis = new Redis(url, { maxRetriesPerRequest: 1, enableReadyCheck: false, lazyConnect: true });
    redis.on('error', () => { stats.redis = false; });
    await redis.connect().catch(() => null);
    stats.redis = !!redis;
    return redis;
  } catch {
    return null;
  }
}
if (process.env.DYPOS_REDIS_URL) redisClient().catch(() => null);

function evictIfNeeded() {
  if (mem.size < MAX_ENTRIES) return;
  // Evict oldest-expired first, else oldest-inserted (Map preserves insertion order).
  const now = Date.now();
  for (const [k, v] of mem) {
    if (v.expiresAt <= now) { mem.delete(k); stats.evictions++; return; }
  }
  const first = mem.keys().next().value;
  if (first !== undefined) { mem.delete(first); stats.evictions++; }
}

export function cacheKey(...parts) {
  return parts.map((p) => String(p ?? '').slice(0, 200)).join('|');
}

export async function cacheGet(key) {
  // Redis first (shared), then memory.
  const rc = process.env.DYPOS_REDIS_URL ? await redisClient().catch(() => null) : null;
  if (rc) {
    try {
      const raw = await rc.get(`dypos:${key}`);
      if (raw != null) { stats.hits++; return JSON.parse(raw); }
    } catch { /* fall through to memory */ }
  }
  const e = mem.get(key);
  if (!e) { stats.misses++; return null; }
  if (e.expiresAt <= Date.now()) { mem.delete(key); stats.misses++; return null; }
  e.hits++;
  stats.hits++;
  return e.value;
}

export async function cacheSet(key, value, ttlSecs = DEFAULT_TTL) {
  stats.sets++;
  evictIfNeeded();
  mem.set(key, { value, expiresAt: Date.now() + ttlSecs * 1000, hits: 0 });
  const rc = process.env.DYPOS_REDIS_URL ? await redisClient().catch(() => null) : null;
  if (rc) {
    try { await rc.set(`dypos:${key}`, JSON.stringify(value), 'EX', Math.max(1, Math.round(ttlSecs))); }
    catch { /* memory remains authoritative */ }
  }
}

export async function cacheDel(prefix) {
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k);
  const rc = process.env.DYPOS_REDIS_URL ? await redisClient().catch(() => null) : null;
  if (rc) {
    try {
      const keys = await rc.keys(`dypos:${prefix}*`);
      if (keys.length) await rc.del(keys);
    } catch { /* ignore */ }
  }
}

/** Read-through helper: cache stampede-safe enough for POS read workloads. */
export async function getOrSet(key, ttlSecs, loader) {
  const hit = await cacheGet(key);
  if (hit !== null && hit !== undefined) return { value: hit, cached: true };
  const value = await loader();
  await cacheSet(key, value, ttlSecs);
  return { value, cached: false };
}

export function etagFor(obj) {
  const h = crypto.createHash('sha1').update(JSON.stringify(obj)).digest('hex').slice(0, 27);
  return `W/"${h}"`;
}

/**
 * Send JSON with HTTP caching semantics (ETag + 304 + Cache-Control).
 * Returns true when a 304 was sent (caller must not send again).
 */
export function sendCached(req, res, obj, { maxAge = 5, swr = 30 } = {}) {
  const etag = etagFor(obj);
  res.set('ETag', etag);
  res.set('Cache-Control', `private, max-age=${maxAge}, stale-while-revalidate=${swr}`);
  res.set('Vary', 'Authorization, Accept-Encoding');
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return true;
  }
  return false;
}

export function cacheStats() {
  return {
    ...stats,
    entries: mem.size,
    maxEntries: MAX_ENTRIES,
    defaultTtlSecs: DEFAULT_TTL,
    redisConfigured: !!process.env.DYPOS_REDIS_URL,
  };
}

export function resetCacheStats() {
  stats = { hits: 0, misses: 0, sets: 0, evictions: 0, redis: stats.redis };
  mem.clear();
}

export default { getOrSet, cacheGet, cacheSet, cacheDel, cacheKey, sendCached, etagFor, cacheStats, resetCacheStats };
