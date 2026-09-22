/**
 * DyPOS Rate Store — shared sliding-window counters for express-rate-limit.
 *
 * Closes the "limit × workers" gap at scale:
 *  - Single node / no Redis: in-process Map (correct, zero-dependency).
 *  - Multi-replica / cluster with DYPOS_REDIS_URL (+ ioredis installed):
 *    counters live in Redis with PEXPIRE, so N workers enforce ONE global limit.
 *  - Redis unreachable: fails open to memory (availability over strictness for POS sales).
 *
 * Implements the express-rate-limit v7 Store interface:
 *   { init, get, increment, decrement, resetKey, resetAll }
 * Hits are counted per (windowMs:key). Only `increment` is latency-sensitive.
 */
import { cacheDel } from './cache.js';

function windowKey(ns, key, windowMs) {
  const w = Math.floor(Date.now() / windowMs);
  return `rl:${ns}:${windowMs}:${w}:${key}`;
}

async function redis() {
  if (!process.env.DYPOS_REDIS_URL) return null;
  try {
    const { default: Redis } = await import('ioredis').catch(() => ({ default: null }));
    if (!Redis) return null;
    if (!redis._client) {
      redis._client = new Redis(process.env.DYPOS_REDIS_URL, {
        maxRetriesPerRequest: 1, enableReadyCheck: false, lazyConnect: true,
      });
      redis._client.on('error', () => { redis._ok = false; });
      await redis._client.connect().catch(() => null);
      redis._ok = true;
    }
    return redis._ok === false ? null : redis._client;
  } catch {
    return null;
  }
}

export function createRateStore(windowMs, ns = 'global') {
  // Per-instance map: two limiters (global + auth) must NEVER share counters,
  // otherwise API traffic would eat the login budget (and express-rate-limit
  // raises ERR_ERL_DOUBLE_COUNT for the same request counted twice).
  const mem = new Map(); // key -> { totalHits, resetTime: Date }
  function memEntry(key) {
    const now = Date.now();
    let e = mem.get(key);
    if (!e || e.resetTime.getTime() <= now) {
      e = { totalHits: 0, resetTime: new Date(now + windowMs) };
      mem.set(key, e);
      if (mem.size > 20000) {
        const first = mem.keys().next().value;
        if (first !== undefined) mem.delete(first);
      }
    }
    return e;
  }
  return {
    // Marks this store as instance-local for express-rate-limit's
    // ERR_ERL_DOUBLE_COUNT guard (same contract as the default MemoryStore):
    // the global + auth limiters may both count one request, each in its own
    // namespace, without tripping the double-increment validation.
    localKeys: true,
    async init() { /* no-op */ },
    async get(key) {
      const rc = await redis().catch(() => null);
      if (rc) {
        try {
          const raw = await rc.get(windowKey(ns, key, windowMs));
          if (raw != null) {
            const totalHits = Number(JSON.parse(raw)?.hits || 0);
            return { totalHits, resetTime: new Date(Date.now() + windowMs) };
          }
          return undefined;
        } catch { /* fall through to memory */ }
      }
      const e = mem.get(key);
      if (!e) return undefined;
      if (e.resetTime.getTime() <= Date.now()) { mem.delete(key); return undefined; }
      return { totalHits: e.totalHits, resetTime: e.resetTime };
    },
    async increment(key) {
      const rc = await redis().catch(() => null);
      if (rc) {
        try {
          const k = windowKey(ns, key, windowMs);
          const hits = await rc.incr(k);
          if (hits === 1) await rc.pexpire(k, windowMs);
          const ttl = await rc.pttl(k);
          return { totalHits: hits, resetTime: new Date(Date.now() + (ttl > 0 ? ttl : windowMs)) };
        } catch { /* fall through to memory */ }
      }
      const e = memEntry(key);
      e.totalHits++;
      return { totalHits: e.totalHits, resetTime: e.resetTime };
    },
    async decrement(key) {
      const e = mem.get(key);
      if (e && e.totalHits > 0) e.totalHits--;
    },
    async resetKey(key) {
      mem.delete(key);
      try { await cacheDel(`ratestore:${ns}:${key}`); } catch { /* ignore */ }
      const rc = await redis().catch(() => null);
      if (rc) {
        try { await rc.del(windowKey(ns, key, windowMs)); } catch { /* ignore */ }
      }
    },
    async resetAll() {
      mem.clear();
    },
    stats() {
      return { entries: mem.size, ns, redisConfigured: !!process.env.DYPOS_REDIS_URL };
    },
  };
}
