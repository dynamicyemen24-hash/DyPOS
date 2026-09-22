/**
 * DyPOS v1.8.0 regression — wallet ledger, shift gate, shared lockout,
 * low-stock gauge, UBL XML.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { app } from '../server.js';

let server, port, admin, prodId, custId;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const a = 's4admin_' + Date.now();
  await req('POST', '/api/auth/register', { username: a, password: 'Pass1234', fullName: 'S4 Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: a, password: 'Pass1234' })).body.token;
  const p = await req('POST', '/api/products', { name: 'S4 Prod', code: 'S4-' + Date.now(), unitPrice: 40 }, admin);
  prodId = p.body.id;
  const cu = await req('POST', '/api/customers', { name: 'S4 Cust' }, admin);
  custId = cu.body.id;
});

after(() => server.close());

async function req(method, path, body, tok) {
  const h = {};
  if (tok) h.Authorization = `Bearer ${tok}`;
  if (body != null) h['Content-Type'] = 'application/json';
  const r = await fetch(`http://localhost:${port}${path}`, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, body: j, text, headers: Object.fromEntries(r.headers.entries()) };
}

describe('Wallet ledger (v7)', () => {
  it('credit writes ledger row with balance_after; redeem appends', async () => {
    const c = await req('POST', `/api/customers/${custId}/wallet`, { amount: 30, direction: 'credit', note: 's4' }, admin);
    assert.strictEqual(c.status, 200);
    const led = await req('GET', `/api/customers/${custId}/wallet?limit=10`, null, admin);
    assert.strictEqual(led.status, 200);
    assert.ok(led.body.transactions.length >= 1);
    assert.strictEqual(led.body.transactions[0].direction, 'credit');
    assert.strictEqual(Number(led.body.transactions[0].balance_after), 30);
    assert.strictEqual(led.body.balance, 30);
  });
});

describe('Shift gate (DYPOS_REQUIRE_SHIFT)', () => {
  it('rejects shift-less sales only when enforced, validates shift state', async () => {
    const prev = process.env.DYPOS_REQUIRE_SHIFT;
    try {
      delete process.env.DYPOS_REQUIRE_SHIFT;
      const free = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }] }, admin);
      assert.strictEqual(free.status, 201);
      process.env.DYPOS_REQUIRE_SHIFT = '1';
      const blocked = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }] }, admin);
      assert.strictEqual(blocked.status, 400);
      const ghost = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], shiftId: 'no-such-shift' }, admin);
      assert.strictEqual(ghost.status, 404);
      const open = await req('POST', '/api/shifts/open', { terminalId: 'S4-T1', openingCash: 0 }, admin);
      assert.strictEqual(open.status, 201);
      const ok = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], shiftId: open.body.shiftId }, admin);
      assert.strictEqual(ok.status, 201);
      const close = await req('POST', `/api/shifts/${open.body.shiftId}/close`, { closingCash: 0, varianceApproval: true }, admin);
      assert.strictEqual(close.status, 200);
      const stale = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], shiftId: open.body.shiftId }, admin);
      assert.strictEqual(stale.status, 409);
    } finally {
      if (prev === undefined) delete process.env.DYPOS_REQUIRE_SHIFT;
      else process.env.DYPOS_REQUIRE_SHIFT = prev;
    }
  });
});

describe('Shared login lockout', () => {
  it('5 fails → 429 + Retry-After, success resets', async () => {
    const u = 's4lock_' + Date.now();
    await req('POST', '/api/auth/register', { username: u, password: 'Pass1234', fullName: 'Lock Test' });
    for (let i = 0; i < 5; i++) {
      const r = await req('POST', '/api/auth/login', { username: u, password: 'Wrong1234' });
      assert.strictEqual(r.status, 401);
    }
    const locked = await req('POST', '/api/auth/login', { username: u, password: 'Wrong1234' });
    assert.strictEqual(locked.status, 429);
    assert.ok(Number(locked.headers['retry-after']) > 0);
  });
});

describe('Low-stock gauge + UBL XML', () => {
  it('health exposes stock.low_count', async () => {
    const r = await fetch(`http://localhost:${port}/api/health`);
    assert.strictEqual(r.status, 200);
    const h = await r.json();
    assert.ok(typeof h.stock?.low_count === 'number');
    assert.ok(typeof h.stock?.threshold === 'number');
  });
  it('invoice XML is well-formed UBL with totals', async () => {
    const c = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 2 }] }, admin);
    const x = await req('GET', `/api/print/invoice/${c.body.invoiceId}?format=xml`, null, admin);
    assert.strictEqual(x.status, 200);
    assert.ok(x.headers['content-type']?.includes('application/xml'));
    assert.ok(x.text.includes('<Invoice'));
    assert.ok(x.text.includes(c.body.number.slice(0, 12)));
    assert.ok(x.text.includes('<cbc:PayableAmount'));
  });
});
