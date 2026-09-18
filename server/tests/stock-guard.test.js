/**
 * Stock-guard regression tests — legacy mode (C1+C5).
 * Runs in the default suite (DYPOS_STOCK_GUARD unset → legacy):
 *  - tracked oversell → 409 Arabic + stock untouched (never negative)
 *  - partial/exact sale → 201 + stock decremented
 *  - reserved_qty reduces available → 409 when demand exceeds available
 *  - missing stock row (untracked walk-in) → 201 unlimited (backward compat)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

import { app } from '../server.js';

let server, port, admin, trackedId, untrackedId;

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

async function stockOf(pid) {
  const r = await req('GET', `/api/stock/${pid}?warehouse=W-01`, null, admin);
  assert.strictEqual(r.status, 200);
  return Number(r.body?.qty ?? 0);
}

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const uname = 'sg_' + Date.now();
  await req('POST', '/api/auth/register', { username: uname, password: 'Pass1234', fullName: 'Stock Guard', role: 'ADMIN' });
  const login = await req('POST', '/api/auth/login', { username: uname, password: 'Pass1234' });
  assert.strictEqual(login.status, 200);
  admin = login.body.token;

  const a = await req('POST', '/api/products', { name: 'Guarded SKU', code: 'SG-' + Date.now(), unitPrice: 10 }, admin);
  assert.strictEqual(a.status, 201);
  trackedId = a.body.id;

  const b = await req('POST', '/api/products', { name: 'Walkin SKU', code: 'WI-' + Date.now(), unitPrice: 10 }, admin);
  assert.strictEqual(b.status, 201);
  untrackedId = b.body.id;

  const adj = await req('POST', '/api/stock/adjust', { productId: trackedId, warehouseId: 'W-01', qty: 5 }, admin);
  assert.strictEqual(adj.status, 200);
  assert.strictEqual(Number(adj.body.newQty), 5);
});

after(() => server.close());

describe('Stock guard — legacy mode (C1+C5)', () => {
  it('overselling tracked stock → 409 + stock untouched', async () => {
    const r = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: 10 }] }, admin);
    assert.strictEqual(r.status, 409);
    assert.match(String(r.body?.error || ''), /الكمية المتوفرة غير كافية/);
    assert.strictEqual(await stockOf(trackedId), 5);
  });

  it('partial sale → 201 + stock decremented', async () => {
    const r = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: 3 }] }, admin);
    assert.strictEqual(r.status, 201);
    assert.strictEqual(await stockOf(trackedId), 2);
  });

  it('selling the remainder exactly → 201 + stock hits 0, never negative', async () => {
    const r = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: 2 }] }, admin);
    assert.strictEqual(r.status, 201);
    assert.strictEqual(await stockOf(trackedId), 0);
  });

  it('selling at zero stock → 409 + stays 0', async () => {
    const r = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: 1 }] }, admin);
    assert.strictEqual(r.status, 409);
    assert.strictEqual(await stockOf(trackedId), 0);
  });

  it('duplicate lines for the same product in one cart cannot oversell', async () => {
    // stock is 0 here; two lines of 1 each must 409 atomically (no partial write)
    const r = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: 1 }, { productId: trackedId, qty: 1 }] }, admin);
    assert.strictEqual(r.status, 409);
    assert.strictEqual(await stockOf(trackedId), 0);
    // same shape with stock available: 2 + 2 against 12 → 201, stock 8
    const top = await req('POST', '/api/stock/adjust', { productId: trackedId, warehouseId: 'W-01', qty: 12 }, admin);
    assert.strictEqual(top.status, 200);
    const ok = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: 2 }, { productId: trackedId, qty: 2 }] }, admin);
    assert.strictEqual(ok.status, 201);
    assert.strictEqual(await stockOf(trackedId), 8);
  });

  it('reserved_qty reduces available → 409 inside the guard', async () => {
    const before = await stockOf(trackedId);
    const top = await req('POST', '/api/stock/adjust', { productId: trackedId, warehouseId: 'W-01', qty: 12 }, admin);
    assert.strictEqual(top.status, 200);
    const stocked = before + 12;
    assert.strictEqual(await stockOf(trackedId), stocked);
    const res = await req('POST', '/api/stock/reserve', { productId: trackedId, qty: 10, reference: 'sg-test' }, admin);
    assert.ok([200, 201].includes(res.status));
    assert.strictEqual(Number(res.body?.reserved), 10);
    // available = stocked - 10 → demand stocked-9 must 409, stock untouched
    const over = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: stocked - 9 }] }, admin);
    assert.strictEqual(over.status, 409);
    assert.strictEqual(await stockOf(trackedId), stocked);
    // demand exactly available → 201 (reserved stays held)
    const exact = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: stocked - 10 }] }, admin);
    assert.strictEqual(exact.status, 201);
    assert.strictEqual(await stockOf(trackedId), 10);
    const rel = await req('POST', '/api/stock/release', { productId: trackedId, qty: 10 }, admin);
    assert.strictEqual(rel.status, 200);
  });

  it('untracked walk-in (no stock row) → 201 unlimited in legacy mode', async () => {
    const r = await req('POST', '/api/invoices', { items: [{ productId: untrackedId, qty: 2 }] }, admin);
    assert.strictEqual(r.status, 201);
  });
});
