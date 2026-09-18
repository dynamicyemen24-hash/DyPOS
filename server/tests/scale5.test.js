/**
 * DyPOS v1.9.0 regression — sessions, customer soft-delete, shift handover,
 * stock reserve/release, product PATCH, sync filter, export fields, wallet-pay.
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
  const a = 's5admin_' + Date.now();
  await req('POST', '/api/auth/register', { username: a, password: 'Pass1234', fullName: 'S5 Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: a, password: 'Pass1234' })).body.token;
  const c = 's5cash_' + Date.now();
  await req('POST', '/api/auth/register', { username: c, password: 'Pass1234', fullName: 'S5 Cash' });
  cashier = (await req('POST', '/api/auth/login', { username: c, password: 'Pass1234' })).body.token;
  const p = await req('POST', '/api/products', { name: 'S5 Prod', code: 'S5-' + Date.now(), unitPrice: 40 }, admin);
  prodId = p.body.id;
  const cu = await req('POST', '/api/customers', { name: 'S5 Cust' }, admin);
  custId = cu.body.id;
  await req('POST', '/api/stock/adjust', { productId: prodId, warehouseId: 'W-01', qty: 200 }, admin);
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

describe('Auth sessions', () => {
  it('lists my sessions and revokes one without killing the other', async () => {
    const u = 's5sess_' + Date.now();
    await req('POST', '/api/auth/register', { username: u, password: 'Pass1234', fullName: 'Sess' });
    const t1 = (await req('POST', '/api/auth/login', { username: u, password: 'Pass1234' })).body.token;
    const t2 = (await req('POST', '/api/auth/login', { username: u, password: 'Pass1234' })).body.token;
    const list = await req('GET', '/api/auth/sessions', null, t1);
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.total >= 2);
    assert.ok(!('token_hash' in (list.body.sessions[0] || {})));
    const other = list.body.sessions.find((s) => s.is_current !== 1);
    assert.ok(other);
    const del = await req('DELETE', `/api/auth/sessions/${other.id}`, null, t1);
    assert.strictEqual(del.status, 200);
    const dead = await req('GET', '/api/auth/me', null, t2);
    assert.ok([401].includes(dead.status));
    const alive = await req('GET', '/api/auth/me', null, t1);
    assert.strictEqual(alive.status, 200);
    const miss = await req('DELETE', '/api/auth/sessions/no-such', null, t1);
    assert.strictEqual(miss.status, 404);
  });
});

describe('Customers soft-delete', () => {
  it('ADMIN deactivates, CASHIER forbidden, missing 404', async () => {
    const c = await req('POST', '/api/customers', { name: 'S5 Gone' }, admin);
    const denied = await req('DELETE', `/api/customers/${c.body.id}`, null, cashier);
    assert.strictEqual(denied.status, 403);
    const ok = await req('DELETE', `/api/customers/${c.body.id}`, null, admin);
    assert.strictEqual(ok.status, 200);
    const got = await req('GET', `/api/customers/${c.body.id}`, null, admin);
    assert.strictEqual(got.body.is_active, 0);
    const miss = await req('DELETE', '/api/customers/no-such', null, admin);
    assert.strictEqual(miss.status, 404);
  });
});

describe('Shift handover', () => {
  it('atomic close+open carrying counted cash', async () => {
    const open = await req('POST', '/api/shifts/open', { terminalId: 'S5-T1', openingCash: 100 }, admin);
    assert.strictEqual(open.status, 201);
    const ho = await req('POST', `/api/shifts/${open.body.shiftId}/handover`, { closingCash: 120, newTerminalId: 'S5-T2' }, admin);
    assert.strictEqual(ho.status, 201);
    assert.strictEqual(ho.body.openingCash, 120);
    const oldRep = await req('GET', `/api/shifts/${open.body.shiftId}/report`, null, admin);
    assert.strictEqual(oldRep.body.shift.status, 'CLOSED');
    const cur = await req('GET', '/api/shifts/open/S5-T2', null, admin);
    assert.strictEqual(cur.body.shift.id, ho.body.newShiftId);
    const again = await req('POST', `/api/shifts/${open.body.shiftId}/handover`, { closingCash: 0 }, admin);
    assert.strictEqual(again.status, 400);
    await req('POST', `/api/shifts/${ho.body.newShiftId}/close`, { closingCash: 120, varianceApproval: true }, admin);
  });
});

describe('Stock reserve/release', () => {
  it('holds and frees available qty, rejects over-reserve', async () => {
    const r = await req('POST', '/api/stock/reserve', { productId: prodId, qty: 30, reference: 's5-order' }, cashier);
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.reserved, 30);
    const over = await req('POST', '/api/stock/reserve', { productId: prodId, qty: 100000 }, cashier);
    assert.strictEqual(over.status, 402);
    const rel = await req('POST', '/api/stock/release', { productId: prodId, qty: 30 }, cashier);
    assert.strictEqual(rel.status, 200);
    assert.strictEqual(rel.body.reservedQty, 0);
    const miss = await req('POST', '/api/stock/release', { productId: 'no-such', qty: 1 }, cashier);
    assert.strictEqual(miss.status, 404);
  });
});

describe('Products PATCH', () => {
  it('partial price edit, empty 400, barcode clash 409', async () => {
    const p1 = await req('POST', '/api/products', { name: 'S5 A', code: 'S5A-' + Date.now(), barcode: 'S5BAR1', unitPrice: 10 }, admin);
    const p1code = (await req('GET', `/api/products/${p1.body.id}`, null, admin)).body.code;
    const p2 = await req('POST', '/api/products', { name: 'S5 B', code: 'S5B-' + Date.now(), unitPrice: 10 }, admin);
    const ok = await req('PATCH', `/api/products/${p2.body.id}`, { unitPrice: 99 }, admin);
    assert.strictEqual(ok.status, 200);
    const got = await req('GET', `/api/products/${p2.body.id}`, null, admin);
    assert.strictEqual(Number(got.body.unit_price), 99);
    assert.strictEqual(got.body.name, 'S5 B');
    const empty = await req('PATCH', `/api/products/${p2.body.id}`, {}, admin);
    assert.strictEqual(empty.status, 400);
    const clash = await req('PATCH', `/api/products/${p2.body.id}`, { code: p1code }, admin);
    assert.strictEqual(clash.status, 409);
    void p1;
  });
});

describe('Sync filter + export fields', () => {
  it('pull?entity= narrows to one type', async () => {
    await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }] }, admin);
    const all = await req('GET', '/api/sync/pull?limit=100', null, admin);
    const only = await req('GET', '/api/sync/pull?limit=100&entity=INVOICE', null, admin);
    assert.strictEqual(only.status, 200);
    assert.ok(only.body.changes.length >= 1);
    assert.ok(only.body.changes.every((c) => c.entity_type === 'INVOICE'));
    assert.ok(only.body.changes.length <= all.body.changes.length);
    const bad = await req('GET', '/api/sync/pull?entity=!!!', null, admin);
    assert.strictEqual(bad.status, 400);
  });
  it('export ?fields= selects columns, rejects unknown', async () => {
    const r = await req('GET', '/api/export/products?format=json&limit=2&fields=code,name', null, admin);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(Object.keys(r.body.rows[0]).sort(), ['code', 'name']);
    const bad = await req('GET', '/api/export/products?format=json&limit=2&fields=code,nope', null, admin);
    assert.strictEqual(bad.status, 400);
  });
});

describe('Wallet-pay at sale', () => {
  it('full WALLET payment deducts balance; insufficient → 402', async () => {
    await req('POST', `/api/customers/${custId}/wallet`, { amount: 200, direction: 'credit', note: 's5' }, admin);
    const inv = await req('POST', '/api/invoices', {
      items: [{ productId: prodId, qty: 1 }], customerId: custId,
      payments: [{ method: 'WALLET', amount: 46 }],
    }, cashier);
    assert.strictEqual(inv.status, 201);
    assert.strictEqual(inv.body.status, 'PAID');
    const bal = await req('GET', `/api/customers/${custId}/balance`, null, admin);
    assert.strictEqual(Number(bal.body.wallet_balance), 154);
    const poor = await req('POST', '/api/invoices', {
      items: [{ productId: prodId, qty: 10 }], customerId: custId,
      payments: [{ method: 'WALLET', amount: 460 }],
    }, cashier);
    assert.strictEqual(poor.status, 402);
    const anon = await req('POST', '/api/invoices', {
      items: [{ productId: prodId, qty: 1 }], payments: [{ method: 'WALLET', amount: 1 }],
    }, cashier);
    assert.strictEqual(anon.status, 400);
  });
  it('WALLET works for later top-up pays', async () => {
    const c = await req('POST', '/api/invoices', {
      items: [{ productId: prodId, qty: 1 }], customerId: custId,
      payments: [{ method: 'CASH', amount: 0 }],
    }, cashier);
    assert.strictEqual(c.status, 201);
    const pay = await req('POST', `/api/invoices/${c.body.invoiceId}/pay`, { method: 'WALLET', amount: 46 }, cashier);
    assert.strictEqual(pay.status, 200);
  });
});
