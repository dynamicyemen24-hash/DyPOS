/**
 * DyPOS v1.10.0 regression — machine API keys, forgot/reset cycle,
 * payment idempotency, disk gauge.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { app } from '../server.js';

let server, port, admin, prodId;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const a = 's8admin_' + Date.now();
  await req('POST', '/api/auth/register', { username: a, password: 'Pass1234', fullName: 'S8 Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: a, password: 'Pass1234' })).body.token;
  const p = await req('POST', '/api/products', { name: 'S8 Prod', code: 'S8-' + Date.now(), unitPrice: 50 }, admin);
  prodId = p.body.id;
});

after(() => server.close());

async function req(method, path, body, tok, extra = {}) {
  const h = {};
  if (tok) h.Authorization = `Bearer ${tok}`;
  if (body != null) h['Content-Type'] = 'application/json';
  Object.assign(h, extra);
  const r = await fetch(`http://localhost:${port}${path}`, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, body: j, text, headers: Object.fromEntries(r.headers.entries()) };
}
const keyReq = (method, path, body, key) => req(method, path, body, null, { 'X-API-Key': key });

describe('Machine API keys', () => {
  it('issue once, use, list hides secrets, rotate + revoke', async () => {
    const created = await req('POST', '/api/admin/api-keys', { name: 'S8 ERP', role: 'MANAGER' }, admin);
    assert.strictEqual(created.status, 201);
    assert.ok(created.body.key.startsWith('dypos_'));
    const key = created.body.key;
    const me = await keyReq('GET', '/api/auth/me', null, key);
    assert.strictEqual(me.status, 200);
    assert.strictEqual(me.body.apiKey, true);
    const prod = await keyReq('POST', '/api/products', { name: 'S8 Via Key', code: 'S8K-' + Date.now(), unitPrice: 5 }, key);
    assert.strictEqual(prod.status, 201);
    const list = await req('GET', '/api/admin/api-keys', null, admin);
    assert.ok(list.body.keys.some((k) => k.id === created.body.id));
    assert.ok(!('key_hash' in list.body.keys[0]) && !('key' in list.body.keys[0]));
    const rot = await req('POST', `/api/admin/api-keys/${created.body.id}/rotate`, {}, admin);
    assert.strictEqual(rot.status, 200);
    const stale = await keyReq('GET', '/api/auth/me', null, key);
    assert.strictEqual(stale.status, 401);
    const fresh = await keyReq('GET', '/api/auth/me', null, rot.body.key);
    assert.strictEqual(fresh.status, 200);
    const del = await req('DELETE', `/api/admin/api-keys/${created.body.id}`, null, admin);
    assert.strictEqual(del.status, 200);
    const gone = await keyReq('GET', '/api/auth/me', null, rot.body.key);
    assert.strictEqual(gone.status, 401);
    const fake = await keyReq('GET', '/api/auth/me', null, 'dypos_nonexistent');
    assert.strictEqual(fake.status, 401);
  });
});

describe('Forgot/reset cycle', () => {
  it('issues without enumeration, redeems once, rejects reuse', async () => {
    const u = 's8forgot_' + Date.now();
    await req('POST', '/api/auth/register', { username: u, password: 'Pass1234', fullName: 'Forgot' });
    const ghost = await req('POST', '/api/auth/forgot', { username: 'ghost-nobody' });
    assert.strictEqual(ghost.status, 200);
    assert.ok(!('resetToken' in ghost.body) || ghost.body.sent === true);
    const f = await req('POST', '/api/auth/forgot', { username: u });
    assert.strictEqual(f.status, 200);
    assert.ok(f.body.resetToken);
    const weak = await req('POST', '/api/auth/reset', { token: f.body.resetToken, newPassword: 'short' });
    assert.strictEqual(weak.status, 400);
    const ok = await req('POST', '/api/auth/reset', { token: f.body.resetToken, newPassword: 'NewPass123' });
    assert.strictEqual(ok.status, 200);
    const reuse = await req('POST', '/api/auth/reset', { token: f.body.resetToken, newPassword: 'NewPass123' });
    assert.strictEqual(reuse.status, 400);
    const login = await req('POST', '/api/auth/login', { username: u, password: 'NewPass123' });
    assert.strictEqual(login.status, 200);
    const bad = await req('POST', '/api/auth/reset', { token: '0'.repeat(48), newPassword: 'NewPass123' });
    assert.strictEqual(bad.status, 400);
  });
});

describe('Payment idempotency', () => {
  it('same key twice → one payment, deduped:true', async () => {
    const c = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], payments: [{ method: 'CASH', amount: 0 }] }, admin);
    const id = c.body.invoiceId;
    const key = 's8pay-' + Date.now();
    const p1 = await req('POST', `/api/invoices/${id}/pay`, { method: 'CASH', amount: 10, idempotencyKey: key }, admin);
    assert.strictEqual(p1.status, 200);
    assert.ok(!p1.body.deduped);
    const p2 = await req('POST', `/api/invoices/${id}/pay`, { method: 'CASH', amount: 10, idempotencyKey: key }, admin);
    assert.strictEqual(p2.status, 200);
    assert.strictEqual(p2.body.deduped, true);
    const got = await req('GET', `/api/invoices/${id}`, null, admin);
    assert.strictEqual(got.body.payments.filter((p) => p.method === 'CASH' && Number(p.amount) === 10).length, 1);
  });
});

describe('Disk gauge', () => {
  it('health exposes disk field', async () => {
    const r = await fetch(`http://localhost:${port}/api/health`);
    assert.strictEqual(r.status, 200);
    const h = await r.json();
    assert.ok('disk' in h);
  });
});
