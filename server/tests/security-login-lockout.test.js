/**
 * Security: login brute-force defense (username lockout + per-IP spray limiter).
 *
 * Regression contract (goes with scale4 Shared-lockout test):
 *   - 5 failed logins/15min on ANY username → 429 + Retry-After, Arabic message.
 *   - A locked account rejects even the CORRECT password (fail-closed).
 *   - Other usernames are unaffected (per-username isolation, no global DOS lock).
 *   - A successful login resets that user's counter.
 *   - A second, per-IP limiter caps credential-spraying across usernames.
 *
 * Env is set BEFORE any server code loads (static imports would otherwise fix
 * the limiter defaults at import time); setup.js runs first via --import, then
 * this file flips the dedicated knobs and only then dynamically imports the
 * app + the login store so the test can reset the shared IP counter mid-run.
 */
process.env.DYPOS_LOGIN_IP_LIMIT = '15';
process.env.DYPOS_AUTH_LIMIT_MAX = '100'; // isolate the IP-limit proof from the legacy 30/h auth limiter

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';

const { app } = await import('../server.js');
const { loginRateStore } = await import('../routes/auth.js');

let server, port;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
});

after(() => server.close());

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const payload = body === undefined || body === null ? undefined : JSON.stringify(body);
  const res = await fetch(`http://localhost:${port}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return {
    status: res.status,
    body: parsed,
    retryAfter: res.headers.get('retry-after'),
  };
}

const pw = 'StrongP@55!';
let seq = 0;
const uniq = (p) => `${p}_${Date.now()}_${seq++}`;

async function register(username) {
  const r = await req('POST', '/api/auth/register', { username, password: pw, fullName: 'Lock Test', role: 'CASHIER' });
  assert.strictEqual(r.status, 201, `register ${username}`);
  return r.body.id;
}

describe('Login brute-force — username lockout', () => {
  // Every test shares the same source IP (127.0.0.1 in tests), so the shared
  // per-IP spray counter would mask a username-lockout proof. Resetting it
  // before each username test isolates the two mechanisms.
  beforeEach(() => loginRateStore.resetAll());

  it('5 fails → 6th attempt is 429 + Retry-After + Arabic message', async () => {
    const username = uniq('lock');
    await register(username);
    for (let i = 0; i < 5; i++) {
      const r = await req('POST', '/api/auth/login', { username, password: 'Wrong12345' });
      assert.strictEqual(r.status, 401, `attempt ${i + 1} must be a clean 401`);
      assert.strictEqual(r.retryAfter, null, 'pre-lock attempts carry no Retry-After');
    }
    const blocked = await req('POST', '/api/auth/login', { username, password: 'Wrong12345' });
    assert.strictEqual(blocked.status, 429, '6th wrong attempt → 429');
    assert.ok(Number(blocked.retryAfter) > 0, 'Retry-After must be present and positive');
    assert.strictEqual(blocked.body.retryAfterSeconds, Number(blocked.retryAfter));
    assert.strictEqual(blocked.body.error, 'محاولات كثيرة — حاول بعد 15 دقيقة');
  });

  it('a locked account rejects even the CORRECT password (fail-closed)', async () => {
    const username = uniq('lockclosed');
    await register(username);
    for (let i = 0; i < 5; i++) {
      await req('POST', '/api/auth/login', { username, password: 'Wrong12345' });
    }
    const blocked = await req('POST', '/api/auth/login', { username, password: pw });
    assert.strictEqual(blocked.status, 429, 'correct password while locked → still 429');
    assert.ok(Number(blocked.retryAfter) > 0);
  });

  it('other usernames are NOT affected (per-username isolation)', async () => {
    const locked = uniq('lockone');
    const other = uniq('lockother');
    await register(locked);
    await register(other);
    for (let i = 0; i < 5; i++) {
      await req('POST', '/api/auth/login', { username: locked, password: 'Wrong12345' });
    }
    const lockResp = await req('POST', '/api/auth/login', { username: locked, password: 'Wrong12345' });
    assert.strictEqual(lockResp.status, 429);
    const ok = await req('POST', '/api/auth/login', { username: other, password: pw });
    assert.strictEqual(ok.status, 200, 'a different username still logs in normally');
    assert.ok(ok.body.token);
  });

  it('a successful login resets the counter for that username', async () => {
    const username = uniq('lockreset');
    await register(username);
    for (let i = 0; i < 3; i++) {
      const r = await req('POST', '/api/auth/login', { username, password: 'Wrong12345' });
      assert.strictEqual(r.status, 401);
    }
    const good = await req('POST', '/api/auth/login', { username, password: pw });
    assert.strictEqual(good.status, 200, 'correct password before the 5-fail threshold is accepted');
    for (let i = 0; i < 3; i++) {
      const r = await req('POST', '/api/auth/login', { username, password: 'Wrong12345' });
      // Without a reset, the counter would have been 3+1, 3+2, 3+3 → locked by
      // the 2nd attempt here. All 401s prove the success cleared it.
      assert.strictEqual(r.status, 401, `attempt ${i + 1} after reset must be 401`);
    }
  });
});

describe('Login brute-force — per-IP spray limiter', () => {
  it('DYPOS_LOGIN_IP_LIMIT (15) attempts from one IP → 16th is 429 with Retry-After', async () => {
    await loginRateStore.resetAll();
    for (let i = 0; i < 15; i++) {
      // 15 DISTINCT usernames, so no single username trips the 5-fail lockout —
      // only the shared IP budget is being consumed.
      const username = uniq(`spray`);
      const r = await req('POST', '/api/auth/login', { username, password: 'Wrong12345' });
      assert.strictEqual(r.status, 401, `spray attempt ${i + 1} must be 401`);
    }
    const blocked = await req('POST', '/api/auth/login', { username: uniq('spray_extra'), password: pw });
    assert.strictEqual(blocked.status, 429, '16th attempt from the same IP → 429');
    assert.ok(Number(blocked.retryAfter) > 0, 'Retry-After must be present');

    // sanity: a request outside the budget after resetAll is accepted again.
    await loginRateStore.resetAll();
    const username = uniq('spray_release');
    await register(username);
    const released = await req('POST', '/api/auth/login', { username, password: pw });
    assert.strictEqual(released.status, 200, 'after IP-store reset, legit login succeeds');
  });
});

describe('Lockout bookkeeping sanity', () => {
  it('failed logins increment the auth_attempts metric (no crash)', async () => {
    const username = uniq('metricdoor');
    await register(username);
    await req('POST', '/api/auth/login', { username, password: 'Wrong12345' });
    const res = await req('GET', '/api/metrics');
    assert.strictEqual(res.status, 200);
    assert.ok(String(res.body).includes('dypos_auth_attempts_total'), 'metrics counter present');
  });
});