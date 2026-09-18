/**
 * DyPOS Scale & Hardening regression — upgrade campaign v1.5.0.
 * Guards every functional + non-functional gap closed for millions-scale:
 *  RBAC, credit limits, pagination contracts, sync fail-closed, shifts list,
 *  return flow, HTTP caching (ETag/304), OpenAPI, expanded health, ZATCA QR kind.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { app } from '../server.js';

let server, port, admin, cashier, prodId, custId;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const a = 'scale_admin_' + Date.now();
  await req('POST', '/api/auth/register', { username: a, password: 'Pass1234', fullName: 'Scale Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: a, password: 'Pass1234' })).body.token;
  const c = 'scale_cash_' + Date.now();
  await req('POST', '/api/auth/register', { username: c, password: 'Pass1234', fullName: 'Scale Cash' });
  cashier = (await req('POST', '/api/auth/login', { username: c, password: 'Pass1234' })).body.token;
  const p = await req('POST', '/api/products', { name: 'Scale Prod', code: 'SCALE-' + Date.now(), unitPrice: 100 }, admin);
  prodId = p.body.id;
  const cu = await req('POST', '/api/customers', { name: 'Scale Cust', creditLimit: 50 }, admin);
  custId = cu.body.id;
});

after(() => server.close());

async function req(method, path, body, tok, extra = {}) {
  const h = {};
  if (tok) h.Authorization = `Bearer ${tok}`;
  if (body != null) h['Content-Type'] = 'application/json';
  Object.assign(h, extra);
  const r = await fetch(`http://localhost:${port}${path}`, {
    method, headers: h, body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, body: j, text, headers: Object.fromEntries(r.headers.entries()) };
}

describe('RBAC hardening', () => {
  it('CASHIER cannot adjust stock (403)', async () => {
    const r = await req('POST', '/api/stock/adjust', { productId: prodId, qty: 5 }, cashier);
    assert.strictEqual(r.status, 403);
  });
  it('CASHIER cannot delete product (403)', async () => {
    const r = await req('DELETE', `/api/products/${prodId}`, null, cashier);
    assert.strictEqual(r.status, 403);
  });
  it('ADMIN can adjust stock (200)', async () => {
    const r = await req('POST', '/api/stock/adjust', { productId: prodId, qty: 50, reason: 'scale-test' }, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(Number(r.body.newQty) >= 50);
  });
});

describe('Credit limit enforcement', () => {
  it('rejects credit sale beyond limit (402)', async () => {
    // cust limit 50, invoice total 115 unpaid → must fail
    const r = await req('POST', '/api/invoices', {
      items: [{ productId: prodId, qty: 1 }],
      customerId: custId,
      payments: [{ method: 'CASH', amount: 0 }],
    }, admin);
    assert.strictEqual(r.status, 402);
  });
  it('allows sale within limit', async () => {
    await req('PUT', `/api/customers/${custId}`, { name: 'Scale Cust', creditLimit: 10000 }, admin);
    const r = await req('POST', '/api/invoices', {
      items: [{ productId: prodId, qty: 1 }],
      customerId: custId,
      payments: [{ method: 'CASH', amount: 0 }],
    }, admin);
    assert.strictEqual(r.status, 201);
  });
});

describe('Pagination contracts (total/hasMore)', () => {
  it('invoices list returns total + hasMore', async () => {
    const r = await req('GET', '/api/invoices?limit=5', null, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(typeof r.body.total === 'number');
    assert.ok(typeof r.body.hasMore === 'boolean');
  });
  it('products list supports sort/order + X-Cache + ETag 304', async () => {
    const r1 = await req('GET', '/api/products?limit=5&sort=price&order=desc', null, admin);
    assert.strictEqual(r1.status, 200);
    assert.ok(r1.headers['x-cache'] === 'HIT' || r1.headers['x-cache'] === 'MISS');
    assert.ok(r1.headers.etag);
    const r2 = await req('GET', '/api/products?limit=5&sort=price&order=desc', null, admin, { 'If-None-Match': r1.headers.etag });
    assert.strictEqual(r2.status, 304);
  });
  it('stock list supports offset + low filter', async () => {
    const r = await req('GET', '/api/stock?limit=2&offset=0', null, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(typeof r.body.hasMore === 'boolean');
  });
  it('shifts list endpoint works', async () => {
    const r = await req('GET', '/api/shifts?limit=5', null, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.shifts));
  });
  it('export supports offset pagination', async () => {
    const r = await req('GET', '/api/export/products?format=json&limit=2&offset=0', null, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(typeof r.body.hasMore === 'boolean');
  });
});

describe('Sync fail-closed + RBAC', () => {
  it('CASHIER cannot push (403)', async () => {
    const r = await req('POST', '/api/sync/push', { changes: [] }, cashier);
    assert.strictEqual(r.status, 403);
  });
  it('unknown entity fails closed (not SYNCED)', async () => {
    const r = await req('POST', '/api/sync/push', { changes: [{ id: 999999, entity_type: 'NOPE', action: 'UPSERT', payload: '{}' }] }, admin);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.failed, 1);
    assert.strictEqual(r.body.synced, 0);
  });
});

describe('Return flow (fixes dead RETURNED)', () => {
  it('paid invoice can be returned → status RETURNED', async () => {
    const created = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }] }, admin);
    const id = created.body.invoiceId;
    const ret = await req('POST', `/api/invoices/${id}/return`, { reason: 'scale-test' }, admin);
    assert.strictEqual(ret.status, 200);
    assert.strictEqual(ret.body.status, 'RETURNED');
    const got = await req('GET', `/api/invoices/${id}`, null, admin);
    assert.strictEqual(got.body.status, 'RETURNED');
  });
  it('double return rejected (400)', async () => {
    const created = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }] }, admin);
    const id = created.body.invoiceId;
    await req('POST', `/api/invoices/${id}/return`, { reason: 'x' }, admin);
    const dup = await req('POST', `/api/invoices/${id}/return`, { reason: 'x' }, admin);
    assert.strictEqual(dup.status, 400);
  });
});

describe('Customers validation parity', () => {
  it('PUT rejects bad phone/email (400)', async () => {
    const r1 = await req('PUT', `/api/customers/${custId}`, { name: 'X', phone: 'bad!!' }, admin);
    assert.strictEqual(r1.status, 400);
    const r2 = await req('PUT', `/api/customers/${custId}`, { name: 'X', email: 'not-an-email' }, admin);
    assert.strictEqual(r2.status, 400);
  });
});

describe('Observability contract', () => {
  it('GET /api/openapi.json serves OpenAPI 3.0', async () => {
    const r = await fetch(`http://localhost:${port}/api/openapi.json`);
    assert.strictEqual(r.status, 200);
    const spec = await r.json();
    assert.strictEqual(spec.openapi, '3.0.3');
    assert.ok(spec.paths['/invoices']);
    assert.ok(spec.paths['/invoices/{id}/return']);
  });
  it('GET /api/health includes cache + outbox + memory', async () => {
    const r = await fetch(`http://localhost:${port}/api/health`);
    assert.strictEqual(r.status, 200);
    const h = await r.json();
    assert.ok(h.cache);
    assert.ok(h.memory);
    assert.ok('pending' in (h.outbox || {}));
  });
  it('print invoice sets X-QR-Kind', async () => {
    const created = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }] }, admin);
    const r = await req('GET', `/api/print/invoice/${created.body.invoiceId}`, null, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(r.headers['x-qr-kind'] === 'json' || r.headers['x-qr-kind'] === 'zatca-tlv');
  });
});
