/**
 * Idempotency core — unit tests (no DB server needed, uses :memory: via setup).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractKey, storedResponse, idempotency, resetIdempotencyForTests, newKey } from '../lib/idempotency.js';

function mockReq(key) {
  return { headers: key ? { 'x-idempotency-key': key } : {}, body: {} };
}
function mockRes() {
  const calls = [];
  const res = {
    statusCode: 200,
    headers: {},
    set(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(body) { calls.push({ status: this.statusCode, body }); this.sent = body; return this; },
    _calls: calls,
  };
  return res;
}

describe('idempotency lib', () => {
  it('executes once, replays stored response on same key', async () => {
    resetIdempotencyForTests();
    let calls = 0;
    const fn = async () => { calls++; return { ok: true, n: calls }; };
    const key = newKey();
    const r1 = mockRes();
    await idempotency(mockReq(key), r1, 'test:scope', fn);
    assert.equal(calls, 1);
    assert.equal(r1.sent.ok, true);
    const r2 = mockRes();
    await idempotency(mockReq(key), r2, 'test:scope', fn);
    assert.equal(calls, 1, 'second call must not re-execute');
    assert.equal(r2.sent.deduped, true);
    assert.equal(r2.headers['X-Idempotent-Replayed'], 'true');
  });

  it('different scopes do not collide', async () => {
    resetIdempotencyForTests();
    let calls = 0;
    const fn = async () => (++calls);
    const key = newKey();
    await idempotency(mockReq(key), mockRes(), 'scope:a', fn);
    await idempotency(mockReq(key), mockRes(), 'scope:b', fn);
    assert.equal(calls, 2);
  });

  it('no key executes directly every time', async () => {
    resetIdempotencyForTests();
    let calls = 0;
    const fn = async () => (++calls);
    await idempotency(mockReq(null), mockRes(), 's', fn);
    await idempotency(mockReq(null), mockRes(), 's', fn);
    assert.equal(calls, 2);
  });

  it('concurrent identical keys single-flight to one execution', async () => {
    resetIdempotencyForTests();
    let calls = 0;
    const fn = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return { calls }; };
    const key = newKey();
    const [a, b, c] = await Promise.all([
      idempotency(mockReq(key), mockRes(), 'race', fn),
      idempotency(mockReq(key), mockRes(), 'race', fn),
      idempotency(mockReq(key), mockRes(), 'race', fn),
    ]);
    assert.equal(calls, 1);
    assert.ok(a && b && c);
  });

  it('extractKey reads header or body', () => {
    assert.equal(extractKey({ headers: { 'x-idempotency-key': 'K1' }, body: {} }), 'K1');
    assert.equal(extractKey({ headers: {}, body: { idempotencyKey: 'K2' } }), 'K2');
    assert.equal(extractKey({ headers: {}, body: {} }), null);
  });

  it('errors are never cached', async () => {
    resetIdempotencyForTests();
    let calls = 0;
    const key = newKey();
    const boom = async () => { calls++; throw Object.assign(new Error('bad'), { statusCode: 400 }); };
    await assert.rejects(() => idempotency(mockReq(key), mockRes(), 'err', boom), /bad/);
    const ok = async () => ({ recovered: true });
    const r = mockRes();
    await idempotency(mockReq(key), r, 'err', ok);
    assert.equal(r.sent.recovered, true);
    assert.equal(storedResponse('err', key)?.body?.recovered, true);
  });
});
