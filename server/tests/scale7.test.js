/**
 * DyPOS v1.10.0 regression — token refresh, tenant-bound accounts, offer
 * evaluation, X-report, range summary, credit settlement, stock tenant filter.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { app } from '../server.js';

let server, port, admin, cashier, prodId, tenantId;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const a = 's7admin_' + Date.now();
  await req('POST', '/api/auth/register', { username: a, password: 'Pass1234', fullName: 'S7 Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: a, password: 'Pass1234' })).body.token;
  const c = 's7cash_' + Date.now();
  await req('POST', '/api/auth/register', { username: c, password: 'Pass1234', fullName: 'S7 Cash' });
  cashier = (await req('POST', '/api/auth/login', { username: c, password: 'Pass1234' })).body.token;
  const p = await req('POST', '/api/products', { name: 'S7 Prod', code: 'S7-' + Date.now(), unitPrice: 100 }, admin);
  prodId = p.body.id;
  tenantId = (await req('POST', '/api/tenants', { name: 'S7 Tenant' }, admin)).body.id;
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

describe('Token refresh + tenant-bound accounts', () => {
  it('rotates: new works, old dies', async () => {
    const u = 's7ref_' + Date.now();
    await req('POST', '/api/auth/register', { username: u, password: 'Pass1234', fullName: 'Ref' });
    const t1 = (await req('POST', '/api/auth/login', { username: u, password: 'Pass1234' })).body.token;
    const rf = await req('POST', '/api/auth/refresh', null, t1);
    assert.strictEqual(rf.status, 200);
    assert.ok(rf.body.token && rf.body.token !== t1);
    const dead = await req('GET', '/api/auth/me', null, t1);
    assert.strictEqual(dead.status, 401);
    const alive = await req('GET', '/api/auth/me', null, rf.body.token);
    assert.strictEqual(alive.status, 200);
  });
  it('register binds tenantId; unknown tenant 404; /me exposes it', async () => {
    const u = 's7ten_' + Date.now();
    const bad = await req('POST', '/api/auth/register', { username: u, password: 'Pass1234', fullName: 'Ten', tenantId: 'no-such' });
    assert.strictEqual(bad.status, 404);
    const ok = await req('POST', '/api/auth/register', { username: u, password: 'Pass1234', fullName: 'Ten', tenantId }, admin);
    assert.strictEqual(ok.status, 201);
    assert.strictEqual(ok.body.tenantId, tenantId);
    const t = (await req('POST', '/api/auth/login', { username: u, password: 'Pass1234' })).body.token;
    const me = await req('GET', '/api/auth/me', null, t);
    assert.strictEqual(me.body.tenantId, tenantId);
  });
});

describe('Offer evaluation', () => {
  it('PERCENT with thresholds + BXGY free lines, no side effects', async () => {
    const pct = await req('POST', '/api/offers/offers', { name: 'S7 Pct', type: 'PERCENT', value: 10, minAmount: 50 }, admin);
    assert.strictEqual(pct.status, 201);
    const bx = await req('POST', '/api/offers/offers', { name: 'S7 BxGy', type: 'BXGY', value: 1, minQty: 2 }, admin);
    assert.strictEqual(bx.status, 201);
    const ev = await req('POST', '/api/offers/evaluate', { items: [{ productId: prodId, qty: 3, unitPrice: 100 }] }, cashier);
    assert.strictEqual(ev.status, 200);
    assert.strictEqual(ev.body.subtotal, 300);
    const found = ev.body.applicable.find((o) => o.offerId === pct.body.id);
    assert.ok(found && found.amount === 30);
    const free = ev.body.freeItems.find((f) => f.offerId === bx.body.id);
    assert.ok(free && free.qty === 1 && free.productId === prodId);
    const small = await req('POST', '/api/offers/evaluate', { items: [{ productId: prodId, qty: 1, unitPrice: 10 }] }, cashier);
    assert.ok(!small.body.applicable.some((o) => o.offerId === pct.body.id));
    const bad = await req('POST', '/api/offers/evaluate', { items: [] }, cashier);
    assert.strictEqual(bad.status, 400);
  });
});

describe('X-report + range summary', () => {
  it('mid-shift snapshot without closing; summary aggregates a range', async () => {
    const open = await req('POST', '/api/shifts/open', { terminalId: 'S7-T1', openingCash: 50 }, cashier);
    assert.strictEqual(open.status, 201);
    await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], shiftId: open.body.shiftId, payments: [{ method: 'CASH', amount: 115 }] }, cashier);
    const x = await req('GET', `/api/shifts/${open.body.shiftId}/xreport?counted=200`, null, cashier);
    assert.strictEqual(x.status, 200);
    assert.strictEqual(x.body.status, 'OPEN');
    assert.strictEqual(x.body.expected, 165);
    assert.strictEqual(x.body.variance, 35);
    assert.ok(x.body.payments.some((p) => p.method === 'CASH'));
    const still = await req('GET', '/api/shifts/open/S7-T1', null, cashier);
    assert.ok(still.body.shift); // X-report did not close it
    const today = new Date().toISOString().slice(0, 10);
    const sum = await req('GET', `/api/reports/summary?from=${today}&to=${today}`, null, admin);
    assert.strictEqual(sum.status, 200);
    assert.ok(sum.body.orders >= 1);
    assert.ok(sum.body.avgTicket > 0);
    assert.ok(Array.isArray(sum.body.topProducts));
    const denied = await req('GET', `/api/reports/summary?from=${today}`, null, cashier);
    assert.strictEqual(denied.status, 403);
    const badDates = await req('GET', '/api/reports/summary?from=2026-02-01&to=2026-01-01', null, admin);
    assert.strictEqual(badDates.status, 400);
    await req('POST', `/api/shifts/${open.body.shiftId}/close`, { closingCash: 165, varianceApproval: true }, cashier);
  });
});

describe('Credit settlement + stock tenant filter', () => {
  it('pays down credit_used to zero floor; empty credit 400', async () => {
    const cu = await req('POST', '/api/customers', { name: 'S7 Debtor', creditLimit: 10000 }, admin);
    await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], customerId: cu.body.id, payments: [{ method: 'CASH', amount: 0 }] }, admin);
    const pay = await req('POST', `/api/customers/${cu.body.id}/credit/pay`, { amount: 50, method: 'CASH' }, cashier);
    assert.strictEqual(pay.status, 200);
    assert.strictEqual(pay.body.paid, 50);
    const full = await req('POST', `/api/customers/${cu.body.id}/credit/pay`, { amount: 99999 }, cashier);
    assert.strictEqual(full.body.remainingCredit, 0);
    const empty = await req('POST', `/api/customers/${cu.body.id}/credit/pay`, { amount: 10 }, cashier);
    assert.strictEqual(empty.status, 400);
  });
  it('stock ?tenant= scopes through warehouses; unknown 404', async () => {
    const o = await req('POST', '/api/orgs', { tenantId, name: 'S7 Org' }, admin);
    const br = await req('POST', '/api/branches', { orgId: o.body.id, name: 'S7 Br', warehouseId: 'S7-WH' }, admin);
    assert.strictEqual(br.status, 201);
    await req('POST', '/api/stock/adjust', { productId: prodId, warehouseId: 'S7-WH', qty: 40 }, admin);
    const scoped = await req('GET', `/api/stock?warehouse=S7-WH&tenant=${tenantId}`, null, admin);
    assert.strictEqual(scoped.status, 200);
    assert.ok(scoped.body.stock.some((s) => s.product_id === prodId));
    const other = await req('GET', `/api/stock?warehouse=W-01&tenant=${tenantId}`, null, admin);
    assert.ok(!other.body.stock.some((s) => s.warehouse_id === 'W-01'));
    const bad = await req('GET', '/api/stock?tenant=no-such', null, admin);
    assert.strictEqual(bad.status, 404);
  });
});
