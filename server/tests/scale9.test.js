/**
 * DyPOS v1.11.0 regression — billions bar: halala-exact money, FTS catalog,
 * cross-tenant IDOR, keyset cursors, sargable date equivalence.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { app } from '../server.js';

let server, port, admin, prodId, tenantA, tenantB;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const a = 's9admin_' + Date.now();
  await req('POST', '/api/auth/register', { username: a, password: 'Pass1234', fullName: 'S9 Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: a, password: 'Pass1234' })).body.token;
  const p = await req('POST', '/api/products', { name: 'S9 Prod', code: 'S9-' + Date.now(), unitPrice: 50 }, admin);
  prodId = p.body.id;
  tenantA = (await req('POST', '/api/tenants', { name: 'S9 A' }, admin)).body.id;
  tenantB = (await req('POST', '/api/tenants', { name: 'S9 B' }, admin)).body.id;
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

describe('Halala-exact money', () => {
  it('0.1×3 and 19.99×3+15% are exact to the halala', async () => {
    const p1 = await req('POST', '/api/products', { name: 'S9 Dime', code: 'S9D-' + Date.now(), unitPrice: 0.1 }, admin);
    const r1 = await req('POST', '/api/invoices', { items: [{ productId: p1.body.id, qty: 3 }] }, admin);
    assert.strictEqual(r1.status, 201);
    assert.strictEqual(r1.body.subtotal, 0.3);
    assert.strictEqual(r1.body.taxAmount, 0.05); // 0.30 × 15% = 0.045 → 0.05 half-up
    assert.strictEqual(r1.body.total, 0.35);
    const p2 = await req('POST', '/api/products', { name: 'S9 Big', code: 'S9G-' + Date.now(), unitPrice: 19.99 }, admin);
    const r2 = await req('POST', '/api/invoices', { items: [{ productId: p2.body.id, qty: 3 }] }, admin);
    assert.strictEqual(r2.body.subtotal, 59.97);
    assert.strictEqual(r2.body.taxAmount, 9.0); // 59.97 × 15% = 8.9955 → 9.00
    assert.strictEqual(r2.body.total, 68.97);
    const got = await req('GET', `/api/invoices/${r2.body.invoiceId}`, null, admin);
    assert.strictEqual(got.body.subtotal, 59.97);
    assert.strictEqual(got.body.total, 68.97);
  });
});

describe('FTS catalog search', () => {
  it('finds by prefix token, survives hostile input', async () => {
    const uniq = 'Zxqwv' + Date.now().toString(36);
    await req('POST', '/api/products', { name: `${uniq} Widget Pro`, code: 'S9F-' + Date.now(), unitPrice: 5 }, admin);
    const hit = await req('GET', `/api/products?q=${uniq.slice(0, 8)}&limit=10`, null, admin);
    assert.strictEqual(hit.status, 200);
    assert.ok(hit.body.products.some((p) => String(p.name).includes(uniq)));
    const hostile = await req('GET', `/api/products?q=${encodeURIComponent('" OR "1"="1')}&limit=10`, null, admin);
    assert.strictEqual(hostile.status, 200);
    const empty = await req('GET', '/api/products?q=!!!&limit=10', null, admin);
    assert.strictEqual(empty.status, 200);
  });
});

describe('Cross-tenant IDOR', () => {
  it('tenant-B context cannot see tenant-A rows (404, no leak)', async () => {
    const p = await req('POST', '/api/products', { name: 'S9 Secret', code: 'S9X-' + Date.now(), unitPrice: 5 }, admin, { 'X-Tenant-Id': tenantA });
    assert.strictEqual(p.status, 201);
    const open = await req('GET', `/api/products/${p.body.id}`, null, admin);
    assert.strictEqual(open.status, 200); // no context: passthrough
    const cross = await req('GET', `/api/products/${p.body.id}`, null, admin, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(cross.status, 404);
    const upd = await req('PATCH', `/api/products/${p.body.id}`, { unitPrice: 6 }, admin, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(upd.status, 404);
    const cu = await req('POST', '/api/customers', { name: 'S9 Secret Cust' }, admin, { 'X-Tenant-Id': tenantA });
    const ccross = await req('GET', `/api/customers/${cu.body.id}`, null, admin, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(ccross.status, 404);
  });
});

describe('Keyset cursors + count=false', () => {
  it('pages without overlap and skips COUNT on demand', async () => {
    const ids = [];
    for (let i = 0; i < 3; i++) {
      const c = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }] }, admin);
      ids.push(c.body.invoiceId);
    }
    const p1 = await req('GET', '/api/invoices?limit=2', null, admin);
    assert.strictEqual(p1.body.invoices.length, 2);
    assert.ok(p1.body.nextCursor);
    const p2 = await req('GET', `/api/invoices?limit=2&after=${p1.body.nextCursor}`, null, admin);
    assert.strictEqual(p2.status, 200);
    const seen = new Set(p1.body.invoices.map((x) => x.id));
    assert.ok(p2.body.invoices.every((x) => !seen.has(x.id)));
    const nc = await req('GET', '/api/invoices?limit=2&count=false', null, admin);
    assert.strictEqual(nc.status, 200);
    assert.strictEqual(nc.body.total, null);
    const badCursor = await req('GET', '/api/invoices?limit=2&after=no-such-id', null, admin);
    assert.strictEqual(badCursor.status, 404);
  });
});

describe('Sargable date equivalence', () => {
  it('daily Z and range summary agree on today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const d = await req('GET', `/api/invoices/reports/daily?date=${today}`, null, admin);
    const s = await req('GET', `/api/reports/summary?from=${today}&to=${today}`, null, admin);
    assert.strictEqual(d.status, 200);
    assert.strictEqual(s.status, 200);
    assert.strictEqual(Number(d.body.orders_count), Number(s.body.orders));
    assert.strictEqual(Number(d.body.gross_sales), Number(s.body.gross));
  });
});
