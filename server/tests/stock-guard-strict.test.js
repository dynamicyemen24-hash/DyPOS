/**
 * Stock-guard regression tests — strict mode (C1+C5).
 * ONLY runs when DYPOS_STOCK_GUARD=strict is set in the environment BEFORE
 * the server module loads (stockGuardMode is a module-scope const):
 *
 *   DYPOS_STOCK_GUARD=strict npm run test:stock-strict
 *
 * In strict mode every sellable SKU must carry a stock_levels row:
 *  - missing row → 409, no negative row is ever created
 *  - oversell → 409, stock untouched
 *  - exact sale → 201, stock hits 0 and stays there (next sale 409)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

const STRICT = String(process.env.DYPOS_STOCK_GUARD || '').trim().toLowerCase() === 'strict';

let app, server, port, admin, trackedId, untrackedId;

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
  if (!STRICT) return;
  ({ app } = await import('../server.js'));
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const uname = 'sgs_' + Date.now();
  await req('POST', '/api/auth/register', { username: uname, password: 'Pass1234', fullName: 'Strict Guard', role: 'ADMIN' });
  const login = await req('POST', '/api/auth/login', { username: uname, password: 'Pass1234' });
  assert.strictEqual(login.status, 200);
  admin = login.body.token;

  const a = await req('POST', '/api/products', { name: 'Strict SKU', code: 'SS-' + Date.now(), unitPrice: 10 }, admin);
  assert.strictEqual(a.status, 201);
  trackedId = a.body.id;

  const b = await req('POST', '/api/products', { name: 'Strict Walkin', code: 'SW-' + Date.now(), unitPrice: 10 }, admin);
  assert.strictEqual(b.status, 201);
  untrackedId = b.body.id;

  const adj = await req('POST', '/api/stock/adjust', { productId: trackedId, warehouseId: 'W-01', qty: 2 }, admin);
  assert.strictEqual(adj.status, 200);
});

after(() => { if (server) server.close(); });

describe('Stock guard — strict mode (C1+C5)', { skip: !STRICT }, () => {
  it('missing stock row → 409, no row created', async () => {
    const r = await req('POST', '/api/invoices', { items: [{ productId: untrackedId, qty: 1 }] }, admin);
    assert.strictEqual(r.status, 409);
    assert.match(String(r.body?.error || ''), /الكمية المتوفرة غير كافية/);
    assert.strictEqual(await stockOf(untrackedId), 0);
  });

  it('oversell → 409, stock untouched', async () => {
    const r = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: 5 }] }, admin);
    assert.strictEqual(r.status, 409);
    assert.strictEqual(await stockOf(trackedId), 2);
  });

  it('exact sale → 201, then sold-out → 409 (never negative)', async () => {
    const ok = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: 2 }] }, admin);
    assert.strictEqual(ok.status, 201);
    assert.strictEqual(await stockOf(trackedId), 0);
    const over = await req('POST', '/api/invoices', { items: [{ productId: trackedId, qty: 1 }] }, admin);
    assert.strictEqual(over.status, 409);
    assert.strictEqual(await stockOf(trackedId), 0);
  });
});
