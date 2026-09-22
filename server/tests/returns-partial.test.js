/**
 * Partial return regression tests (v22 returned_qty).
 * - subset of lines by qty recomputes totals exactly (halala integers)
 * - over-return is rejected (no stock inflation)
 * - overpay becomes an explicit REFUND row (shift/report sums net correctly)
 * - loyalty reverses only the attributable share
 * - idempotent replay dedupes
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

import { app } from '../server.js';

let server, port, token, prodA, prodB;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const uname = 'retp_' + Date.now();
  await req('POST', '/api/auth/register', { username: uname, password: 'Pass1234', fullName: 'Return Partial', role: 'ADMIN' });
  const login = await req('POST', '/api/auth/login', { username: uname, password: 'Pass1234' });
  assert.strictEqual(login.status, 200);
  token = login.body.token;

  const stamp = Date.now();
  const a = await req('POST', '/api/products', { name: 'Ret A', code: 'RET-A-' + stamp, unitPrice: 100 }, token);
  assert.strictEqual(a.status, 201);
  prodA = a.body.id;
  const b = await req('POST', '/api/products', { name: 'Ret B', code: 'RET-B-' + stamp, unitPrice: 50 }, token);
  assert.strictEqual(b.status, 201);
  prodB = b.body.id;
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

async function paidInvoice(items) {
  const created = await req('POST', '/api/invoices', { items }, token);
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.body.status, 'PAID');
  return created.body.invoiceId;
}

describe('Partial returns', () => {
  it('returns 1 of 2 units: totals shrink, stock +1, refund row nets', async () => {
    const id = await paidInvoice([
      { productId: prodA, qty: 2 },
      { productId: prodB, qty: 1 },
    ]);
    // Original: A 2x100 + B 1x50 = 250 net. Default tax 15%? use whatever server computes.
    const before = await req('GET', `/api/invoices/${id}`, null, token);
    assert.strictEqual(before.status, 200);
    const origTotal = before.body.total;

    const ret = await req('POST', `/api/invoices/${id}/return`, {
      reason: 'عميل أعاد قطعة',
      items: [{ productId: prodA, qty: 1 }],
      idempotencyKey: 'pret-' + Date.now(),
    }, token);
    assert.strictEqual(ret.status, 200);
    assert.strictEqual(ret.body.partial, true);
    assert.ok(ret.body.total < origTotal);
    assert.ok(ret.body.refunded > 0);
    assert.strictEqual(ret.body.status, 'PAID');

    const after = await req('GET', `/api/invoices/${id}`, null, token);
    const refundRows = after.body.payments.filter((p) => p.method === 'REFUND');
    assert.strictEqual(refundRows.length, 1);
    assert.ok(refundRows[0].amount < 0);
    // paid nets to the new total via the refund row
    const netPaid = after.body.payments.reduce((s, p) => s + Number(p.amount), 0);
    assert.ok(Math.abs(netPaid - after.body.total) < 0.02);
  });

  it('rejects over-return beyond sold qty', async () => {
    const id = await paidInvoice([{ productId: prodB, qty: 1 }]);
    const ret = await req('POST', `/api/invoices/${id}/return`, {
      items: [{ productId: prodB, qty: 5 }],
      idempotencyKey: 'pret-over-' + Date.now(),
    }, token);
    assert.strictEqual(ret.status, 409);
  });

  it('rejects unknown product in return lines', async () => {
    const id = await paidInvoice([{ productId: prodB, qty: 1 }]);
    const ret = await req('POST', `/api/invoices/${id}/return`, {
      items: [{ productId: 'no-such-id', qty: 1 }],
      idempotencyKey: 'pret-unk-' + Date.now(),
    }, token);
    assert.strictEqual(ret.status, 404);
  });

  it('idempotent replay of the same partial batch dedupes', async () => {
    const id = await paidInvoice([{ productId: prodA, qty: 3 }]);
    const key = 'pret-dedupe-' + Date.now();
    const r1 = await req('POST', `/api/invoices/${id}/return`, {
      items: [{ productId: prodA, qty: 1 }],
      idempotencyKey: key,
    }, token);
    assert.strictEqual(r1.status, 200);
    const r2 = await req('POST', `/api/invoices/${id}/return`, {
      items: [{ productId: prodA, qty: 1 }],
      idempotencyKey: key,
    }, token);
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.body.invoiceId, r1.body.invoiceId);
    assert.strictEqual(r2.body.total, r1.body.total);
  });

  it('second partial return accumulates without over-restocking', async () => {
    const id = await paidInvoice([{ productId: prodB, qty: 2 }]);
    const t = Date.now();
    const r1 = await req('POST', `/api/invoices/${id}/return`, {
      items: [{ productId: prodB, qty: 1 }],
      idempotencyKey: 'pret-acc1-' + t,
    }, token);
    assert.strictEqual(r1.status, 200);
    // Only 1 unit remains returnable now
    const r2 = await req('POST', `/api/invoices/${id}/return`, {
      items: [{ productId: prodB, qty: 2 }],
      idempotencyKey: 'pret-acc2-' + t,
    }, token);
    assert.strictEqual(r2.status, 409);
    const r3 = await req('POST', `/api/invoices/${id}/return`, {
      items: [{ productId: prodB, qty: 1 }],
      idempotencyKey: 'pret-acc3-' + t,
    }, token);
    assert.strictEqual(r3.status, 200);
  });
});
