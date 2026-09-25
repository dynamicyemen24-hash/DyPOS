/**
 * DyPOS v1.9.0 regression — tenancy hierarchy, scope enforcement,
 * currencies, UoMs, invoice master validation, durable trail.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { app } from '../server.js';

let server, port, admin, cashier, tenantId, orgId, branchId, prodId;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const a = 's6admin_' + Date.now();
  await req('POST', '/api/auth/register', { username: a, password: 'Pass1234', fullName: 'S6 Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: a, password: 'Pass1234' })).body.token;
  const c = 's6cash_' + Date.now();
  await req('POST', '/api/auth/register', { username: c, password: 'Pass1234', fullName: 'S6 Cash' });
  cashier = (await req('POST', '/api/auth/login', { username: c, password: 'Pass1234' })).body.token;
  const p = await req('POST', '/api/products', { name: 'S6 Prod', code: 'S6-' + Date.now(), unitPrice: 50 }, admin);
  prodId = p.body.id;
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

describe('Tenancy hierarchy', () => {
  it('tenant → org → branch with enforced links', async () => {
    const t = await req('POST', '/api/tenants', { name: 'S6 Tenant', code: 'S6T' }, admin);
    assert.strictEqual(t.status, 201);
    tenantId = t.body.id;
    const denied = await req('POST', '/api/tenants', { name: 'Nope' }, cashier);
    assert.strictEqual(denied.status, 403);
    const badOrg = await req('POST', '/api/orgs', { tenantId: 'no-such', name: 'X' }, admin);
    assert.strictEqual(badOrg.status, 404);
    const o = await req('POST', '/api/orgs', { tenantId, name: 'S6 Org' }, admin);
    assert.strictEqual(o.status, 201);
    orgId = o.body.id;
    const badBr = await req('POST', '/api/branches', { orgId: 'no-such', name: 'X' }, admin);
    assert.strictEqual(badBr.status, 404);
    const br = await req('POST', '/api/branches', { orgId, name: 'S6 Branch', warehouseId: 'S6-WH' }, admin);
    assert.strictEqual(br.status, 201);
    branchId = br.body.id;
    assert.strictEqual(br.body.tenantId, tenantId);
    const filtered = await req('GET', `/api/branches?org=${orgId}`, null, admin);
    assert.ok(filtered.body.branches.some((b) => b.id === branchId));
    const got = await req('GET', `/api/tenants/${tenantId}`, null, admin);
    assert.strictEqual(got.body.organizations, 1);
  });
});

describe('Tenant scope enforcement', () => {
  it('filters reads; enforces writes only when required', async () => {
    const p = await req('POST', '/api/products', { name: 'S6 Scoped', code: 'S6S-' + Date.now(), unitPrice: 5 }, admin, { 'X-Tenant-Id': tenantId });
    assert.strictEqual(p.status, 201);
    const scoped = await req('GET', `/api/products?tenant=${tenantId}&q=S6%20Scoped`, null, admin);
    assert.ok(scoped.body.products.some((x) => x.id === p.body.id));
    const unknown = await req('GET', '/api/products?tenant=no-such', null, admin);
    assert.strictEqual(unknown.status, 404);
    // Permissive by default (backward compatible)
    const free = await req('POST', '/api/products', { name: 'S6 Free', code: 'S6F-' + Date.now(), unitPrice: 5 }, admin);
    assert.strictEqual(free.status, 201);
    const prev = process.env.DYPOS_REQUIRE_TENANT;
    try {
      process.env.DYPOS_REQUIRE_TENANT = '1';
      const blocked = await req('POST', '/api/products', { name: 'S6 Blocked', code: 'S6B-' + Date.now(), unitPrice: 5 }, admin);
      assert.strictEqual(blocked.status, 400);
      const allowed = await req('POST', '/api/products', { name: 'S6 Allowed', code: 'S6A-' + Date.now(), unitPrice: 5, tenantId }, admin);
      assert.strictEqual(allowed.status, 201);
      const badLink = await req('POST', '/api/products', { name: 'S6 Bad', code: 'S6X-' + Date.now(), unitPrice: 5, tenantId: 'no-such' }, admin);
      assert.strictEqual(badLink.status, 404);
    } finally {
      if (prev === undefined) delete process.env.DYPOS_REQUIRE_TENANT;
      else process.env.DYPOS_REQUIRE_TENANT = prev;
    }
  });
});

describe('Currencies & UoMs', () => {
  it('seeded masters + conversion math', async () => {
    const cur = await req('GET', '/api/currencies?limit=20', null, cashier);
    assert.ok(cur.body.currencies.some((c) => c.code === 'SAR' && Number(c.is_base) === 1));
    const conv = await req('POST', '/api/currencies/convert', { amount: 100, from: 'USD', to: 'SAR' }, cashier);
    assert.strictEqual(conv.status, 200);
    assert.ok(Math.abs(conv.body.converted - 375) < 0.05);
    const badCur = await req('POST', '/api/currencies/convert', { amount: 1, from: 'XXX', to: 'SAR' }, cashier);
    assert.strictEqual(badCur.status, 400);
    const protect = await req('PATCH', '/api/currencies/SAR/toggle', { isActive: false }, admin);
    assert.strictEqual(protect.status, 400);
    const uoms = await req('GET', '/api/uoms?category=weight', null, cashier);
    assert.ok(uoms.body.uoms.some((u) => u.code === 'KG'));
    const qc = await req('POST', '/api/uoms/convert', { qty: 2, from: 'KG', to: 'G' }, cashier);
    assert.strictEqual(qc.body.converted, 2000);
    const cross = await req('POST', '/api/uoms/convert', { qty: 1, from: 'KG', to: 'L' }, cashier);
    assert.strictEqual(cross.status, 400);
  });
  it('invoices reject unknown currency/uom', async () => {
    const c1 = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], currency: 'INVALID' }, admin);
    assert.strictEqual(c1.status, 400);
    const c2 = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1, uom: 'INVALID' }] }, admin);
    assert.strictEqual(c2.status, 400);
    const ok = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1, uom: 'PCS' }], currency: 'USD' }, admin);
    assert.strictEqual(ok.status, 201);
  });
});

describe('Durable trail', () => {
  it('product lifecycle leaves before/after links; cashier cannot read', async () => {
    const p = await req('POST', '/api/products', { name: 'S6 Trail', code: 'S6T-' + Date.now(), unitPrice: 7 }, admin);
    await req('PATCH', `/api/products/${p.body.id}`, { unitPrice: 9 }, admin);
    const t = await req('GET', `/api/admin/trail?entity=PRODUCT&entityId=${p.body.id}`, null, admin);
    assert.strictEqual(t.status, 200);
    assert.ok(t.body.total >= 2);
    assert.ok(t.body.trail.some((r) => r.action === 'CREATE'));
    assert.ok(t.body.trail.some((r) => r.action === 'PATCH'));
    const denied = await req('GET', '/api/admin/trail?entity=PRODUCT', null, cashier);
    assert.strictEqual(denied.status, 403);
  });
});
