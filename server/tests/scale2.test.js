/**
 * DyPOS v1.6.0 regression — wallet/loyalty, offers/coupons, stock transfer,
 * admin ops, webhook management. All must stay green alongside scale.test.js.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { app } from '../server.js';

let server, port, admin, cashier, prodId, custId, couponCode;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const a = 's2admin_' + Date.now();
  await req('POST', '/api/auth/register', { username: a, password: 'Pass1234', fullName: 'S2 Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: a, password: 'Pass1234' })).body.token;
  const c = 's2cash_' + Date.now();
  await req('POST', '/api/auth/register', { username: c, password: 'Pass1234', fullName: 'S2 Cash' });
  cashier = (await req('POST', '/api/auth/login', { username: c, password: 'Pass1234' })).body.token;
  const p = await req('POST', '/api/products', { name: 'S2 Prod', code: 'S2-' + Date.now(), unitPrice: 100 }, admin);
  prodId = p.body.id;
  const cu = await req('POST', '/api/customers', { name: 'S2 Cust' }, admin);
  custId = cu.body.id;
  await req('POST', '/api/stock/adjust', { productId: prodId, warehouseId: 'W-01', qty: 100 }, admin);
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

describe('Wallet & loyalty', () => {
  it('ADMIN can credit wallet, CASHIER cannot', async () => {
    const ok = await req('POST', `/api/customers/${custId}/wallet`, { amount: 50, direction: 'credit', note: 'test' }, admin);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.body.walletBalance, 50);
    const denied = await req('POST', `/api/customers/${custId}/wallet`, { amount: 5, direction: 'credit' }, cashier);
    assert.strictEqual(denied.status, 403);
  });
  it('debit beyond balance rejected (402)', async () => {
    const r = await req('POST', `/api/customers/${custId}/wallet`, { amount: 100000, direction: 'debit' }, admin);
    assert.strictEqual(r.status, 402);
  });
  it('earn → redeem → ledger works with auto-tier', async () => {
    // Paid invoice with customer earns floor(115/10)=11 pts
    const inv = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], customerId: custId }, admin);
    assert.strictEqual(inv.status, 201);
    const bal = await req('GET', `/api/customers/${custId}/balance`, null, admin);
    assert.ok(Number(bal.body.loyalty_points) >= 11);
    const red = await req('POST', `/api/customers/${custId}/loyalty/redeem`, { points: 10 }, cashier);
    assert.strictEqual(red.status, 200);
    assert.ok(Number(red.body.walletCredit) > 0);
    const led = await req('GET', `/api/customers/${custId}/loyalty?limit=5`, null, admin);
    assert.ok(led.body.transactions.length >= 2);
  });
  it('redeem beyond balance rejected (402)', async () => {
    const r = await req('POST', `/api/customers/${custId}/loyalty/redeem`, { points: 999999 }, admin);
    assert.strictEqual(r.status, 402);
  });
});

describe('Offers & coupons', () => {
  it('CRUD + validate + invoice apply (atomic use-count)', async () => {
    couponCode = 'S2-' + String(Date.now()).slice(-6);
    const c = await req('POST', '/api/offers/coupons', { code: couponCode, discountType: 'PCT', discount: 10, minPurchase: 50, maxUses: 2 }, admin);
    assert.strictEqual(c.status, 201);
    const denied = await req('POST', '/api/offers/coupons', { code: 'X-' + Date.now(), discountType: 'PCT', discount: 5 }, cashier);
    assert.strictEqual(denied.status, 403);
    const v = await req('POST', '/api/offers/coupons/validate', { code: couponCode, subtotal: 100 }, cashier);
    assert.strictEqual(v.status, 200);
    assert.strictEqual(v.body.discount, 10);
    const inv1 = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], couponCode }, admin);
    assert.strictEqual(inv1.status, 201);
    assert.ok(Number(inv1.body.discountAmount) >= 10);
    const inv2 = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], couponCode }, admin);
    assert.strictEqual(inv2.status, 201);
    const inv3 = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], couponCode }, admin);
    assert.strictEqual(inv3.status, 400); // maxUses=2 exhausted
  });
  it('offers list + toggle', async () => {
    const o = await req('POST', '/api/offers/offers', { name: 'S2 Offer', type: 'PERCENT', value: 15 }, admin);
    assert.strictEqual(o.status, 201);
    const l = await req('GET', '/api/offers/offers?limit=5', null, admin);
    assert.ok(l.body.total >= 1);
    const t = await req('PATCH', `/api/offers/offers/${o.body.id}/toggle`, {}, admin);
    assert.strictEqual(t.status, 200);
  });
});

describe('Stock transfer', () => {
  it('moves qty W-01 → W-02 atomically', async () => {
    const r = await req('POST', '/api/stock/transfer', { productId: prodId, fromWarehouse: 'W-01', toWarehouse: 'W-02', qty: 10 }, admin);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.qty, 10);
    const dst = await req('GET', `/api/stock/${prodId}?warehouse=W-02`, null, admin);
    assert.ok(Number(dst.body.qty) >= 10);
  });
  it('insufficient stock fails closed (402), CASHIER forbidden (403)', async () => {
    const r1 = await req('POST', '/api/stock/transfer', { productId: prodId, fromWarehouse: 'W-01', toWarehouse: 'W-02', qty: 999999 }, admin);
    assert.strictEqual(r1.status, 402);
    const r2 = await req('POST', '/api/stock/transfer', { productId: prodId, fromWarehouse: 'W-01', toWarehouse: 'W-02', qty: 1 }, cashier);
    assert.strictEqual(r2.status, 403);
  });
});

describe('Admin ops', () => {
  it('audit tail queryable', async () => {
    const r = await req('GET', '/api/admin/audit?limit=5', null, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.audit));
    const denied = await req('GET', '/api/admin/audit?limit=5', null, cashier);
    assert.strictEqual(denied.status, 403);
  });
  it('disable user revokes sessions + cannot self-disable', async () => {
    const u = 's2victim_' + Date.now();
    await req('POST', '/api/auth/register', { username: u, password: 'Pass1234', fullName: 'Victim' });
    const users = await req('GET', '/api/auth/users?limit=200', null, admin);
    const victim = users.body.users.find((x) => x.username === u);
    assert.ok(victim);
    const login = await req('POST', '/api/auth/login', { username: u, password: 'Pass1234' });
    const vt = login.body.token;
    const dis = await req('PATCH', `/api/admin/users/${victim.id}`, { isActive: false }, admin);
    assert.strictEqual(dis.status, 200);
    const me = await req('GET', '/api/auth/me', null, vt);
    assert.strictEqual(me.status, 401); // disabled
    const meAdmin = await req('GET', '/api/auth/me', null, admin);
    const selfDis = await req('PATCH', `/api/admin/users/${meAdmin.body.id}`, { isActive: false }, admin);
    assert.strictEqual(selfDis.status, 400);
  });
  it('reset-password forces mustChangePassword', async () => {
    const u = 's2reset_' + Date.now();
    const reg = await req('POST', '/api/auth/register', { username: u, password: 'Pass1234', fullName: 'Reset' });
    const rst = await req('POST', `/api/admin/users/${reg.body.id}/reset-password`, { newPassword: 'NewPass123' }, admin);
    assert.strictEqual(rst.status, 200);
    const login = await req('POST', '/api/auth/login', { username: u, password: 'NewPass123' });
    assert.strictEqual(login.status, 200);
    assert.strictEqual(login.body.mustChangePassword, true);
  });
});

describe('Webhooks management', () => {
  it('PUT + rotate + retry FAILED + 404 on missing', async () => {
    const s = await req('POST', '/api/webhooks', { url: 'https://erp.example.test/hook', events: ['invoice.*'] }, admin);
    assert.strictEqual(s.status, 201);
    const put = await req('PUT', `/api/webhooks/${s.body.id}`, { events: ['invoice.paid'] }, admin);
    assert.strictEqual(put.status, 200);
    const rot = await req('POST', `/api/webhooks/${s.body.id}/rotate-secret`, {}, admin);
    assert.strictEqual(rot.status, 200);
    assert.ok(rot.body.secret_preview);
    const miss = await req('PUT', '/api/webhooks/no-such-id', { events: ['*'] }, admin);
    assert.strictEqual(miss.status, 404);
    const del = await req('DELETE', `/api/webhooks/${s.body.id}`, null, admin);
    assert.strictEqual(del.status, 200);
    const del2 = await req('DELETE', `/api/webhooks/${s.body.id}`, null, admin);
    assert.strictEqual(del2.status, 404);
  });
  it('MANAGER can read, CASHIER cannot', async () => {
    const m = 's2mgr_' + Date.now();
    await req('POST', '/api/auth/register', { username: m, password: 'Pass1234', fullName: 'Mgr', role: 'CASHIER' });
    // promote via admin
    const users = await req('GET', '/api/auth/users?limit=200', null, admin);
    const mgr = users.body.users.find((x) => x.username === m);
    await req('PATCH', `/api/admin/users/${mgr.id}`, { role: 'MANAGER' }, admin);
    const mt = (await req('POST', '/api/auth/login', { username: m, password: 'Pass1234' })).body.token;
    const r1 = await req('GET', '/api/webhooks/events', null, mt);
    assert.strictEqual(r1.status, 200);
    const r2 = await req('GET', '/api/webhooks/events', null, cashier);
    assert.strictEqual(r2.status, 403);
  });
});
