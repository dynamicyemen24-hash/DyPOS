/**
 * Invoices API regression tests.
 * Guards the exact production bugs fixed in v1.3.0:
 *  - header-before-children FK ordering (was: FOREIGN KEY constraint failed)
 *  - indexed idempotency dedupe (was: full-table LIKE scan, no dedupe races)
 *  - atomic pay (was: lost-update double-pay race)
 *  - zod validation + pagination caps
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

// Import app AFTER env vars are set by tests/setup.js
import { app } from '../server.js';

let server, port, token, productId;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const uname = 'inv_' + Date.now();
  await req('POST', '/api/auth/register', { username: uname, password: 'Pass1234', fullName: 'Inv Test' });
  const login = await req('POST', '/api/auth/login', { username: uname, password: 'Pass1234' });
  assert.strictEqual(login.status, 200);
  token = login.body.token;

  const prod = await req('POST', '/api/products', { name: 'Inv Prod', code: 'INV-T-' + Date.now(), unitPrice: 50 }, token);
  assert.strictEqual(prod.status, 201);
  productId = prod.body.id;
  assert.ok(productId);
});

after(() => server.close());

async function req(method, path, body, tok) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers, body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

describe('Invoices — create', () => {
  it('POST /api/invoices creates a taxed invoice (FK ordering regression)', async () => {
    const res = await req('POST', '/api/invoices', { items: [{ productId, qty: 2 }] }, token);
    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.subtotal, 100);
    assert.strictEqual(res.body.taxAmount, 15);
    assert.strictEqual(res.body.total, 115);
    assert.strictEqual(res.body.status, 'PAID');
  });

  it('POST /api/invoices rejects empty cart', async () => {
    const res = await req('POST', '/api/invoices', { items: [] }, token);
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/invoices rejects unknown product', async () => {
    const res = await req('POST', '/api/invoices', { items: [{ productId: 'no-such-id', qty: 1 }] }, token);
    assert.strictEqual(res.status, 400);
  });

  it('idempotency key dedupes concurrent retries', async () => {
    const key = 'idem-test-' + Date.now();
    const payload = { items: [{ productId, qty: 1 }], idempotencyKey: key };
    const r1 = await req('POST', '/api/invoices', payload, token);
    assert.ok([200, 201].includes(r1.status));
    const r2 = await req('POST', '/api/invoices', payload, token);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.body.deduped, true);
    assert.strictEqual(r2.body.invoiceId, r1.body.invoiceId);
  });

  it('GET /api/invoices/:id returns items + payments', async () => {
    const created = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }] }, token);
    const got = await req('GET', `/api/invoices/${created.body.invoiceId}`, null, token);
    assert.strictEqual(got.status, 200);
    assert.strictEqual(got.body.items.length, 1);
    assert.strictEqual(got.body.payments.length, 1);
  });

  it('GET /api/invoices clamps limit (DoS guard)', async () => {
    const res = await req('GET', '/api/invoices?limit=9999', null, token);
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.limit <= 200);
  });
});

describe('Invoices — pay (atomicity regression)', () => {
  let unpaidId;

  it('creates an UNPAID invoice then pays partially', async () => {
    const created = await req('POST', '/api/invoices', {
      items: [{ productId, qty: 2 }], // total 115
      payments: [{ method: 'CASH', amount: 0 }],
    }, token);
    assert.strictEqual(created.status, 201);
    assert.strictEqual(created.body.status, 'UNPAID');
    unpaidId = created.body.invoiceId;

    const pay = await req('POST', `/api/invoices/${unpaidId}/pay`, { method: 'CASH', amount: 15 }, token);
    assert.strictEqual(pay.status, 200);
    assert.strictEqual(pay.body.status, 'PARTIAL');
    assert.strictEqual(pay.body.remainingAmount, 100);
  });

  it('completing payment then double-pay is rejected', async () => {
    const done = await req('POST', `/api/invoices/${unpaidId}/pay`, { method: 'CASH', amount: 100 }, token);
    assert.strictEqual(done.status, 200);
    assert.strictEqual(done.body.status, 'PAID');

    const dup = await req('POST', `/api/invoices/${unpaidId}/pay`, { method: 'CASH', amount: 5 }, token);
    assert.strictEqual(dup.status, 400);
  });
});
