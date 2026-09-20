/**
 * Cache singleflight + indexed invalidation.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getOrSet, cacheDel, cacheSet, cacheGet, resetCacheStats, cacheStats } from '../lib/cache.js';

describe('cache singleflight', () => {
  it('concurrent misses share one loader execution', async () => {
    resetCacheStats();
    let calls = 0;
    const loader = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return { v: 1 }; };
    const results = await Promise.all([
      getOrSet('test|single|1', 60, loader),
      getOrSet('test|single|1', 60, loader),
      getOrSet('test|single|1', 60, loader),
    ]);
    assert.equal(calls, 1);
    assert.ok(results.every((r) => r.value.v === 1));
    assert.ok(cacheStats().singleflightHits >= 1);
  });

  it('cacheDel invalidates by prefix', async () => {
    resetCacheStats();
    await cacheSet('products|list|a', { x: 1 }, 60);
    await cacheSet('products|list|b', { x: 2 }, 60);
    await cacheSet('stock|list|a', { x: 3 }, 60);
    await cacheDel('products|list');
    assert.equal(await cacheGet('products|list|a'), null);
    assert.equal(await cacheGet('products|list|b'), null);
    assert.notEqual(await cacheGet('stock|list|a'), null);
  });
});
