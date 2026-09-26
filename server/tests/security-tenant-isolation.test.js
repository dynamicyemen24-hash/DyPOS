/**
 * Security: multi-tenant isolation (read + write plane).
 *
 * Pass group proves the by-id guards that DO work: a user from tenant B
 * cannot read tenant A's product/customer/invoice by id (assertRecordTenant
 * → 404).
 *
 * Fix group pins down the NOW-FIXED behavior: the multi-tenant isolation
 * campaign closed the historical gaps, so each test asserts the SECURE
 * outcome (cross-tenant reads/writes are scoped or blocked):
 *   - stock GET /api/stock/:productId        → scoped to caller tenant; foreign row hidden, 200 zero-fallback without product_id (routes/stock.js:69-85)
 *   - stock POST /api/stock/reserve          → foreign product → 404 (routes/stock.js:17-28,131-143)
 *   - shifts GET /api/shifts/open/:terminalId → scoped; foreign open shift → shift:null (routes/shifts.js:32-44)
 *   - sync pull with tenant filter           → sync_log carries tenant attribution; scoped pull excludes foreign rows (routes/invoices.js:388, routes/sync.js:23-24)
 *   - X-Tenant-Id write spoof                → bound user can never act as another tenant → 403 (lib/tenant.js:62-68)
 *
 * One case is BY DESIGN, not a leak: webhooks GET / lists the deployment-GLOBAL
 * integration plane (webhook_subscriptions has no tenant column; the list is
 * role-gated to ADMIN/MANAGER/AUDITOR — routes/webhooks.js:8-10,22-26).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';
import { app } from '../server.js';
import db from '../db/schema.js';

let server, port, tokenA, tokenB, tenantA, tenantB;
let prodA, custA, invA, webhookA, shiftTerminal;

const stamp = Date.now();
const isoWhA = `ISO-WH-A-${stamp}`;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  // Bootstrap admin (first account → ADMIN)
  const bootAdmin = `iso_root_${stamp}`;
  await req('POST', '/api/auth/register', { username: bootAdmin, password: 'Pass1234', fullName: 'Isolation Root', role: 'ADMIN' });
  const admin = (await req('POST', '/api/auth/login', { username: bootAdmin, password: 'Pass1234' })).body.token;

  tenantA = (await req('POST', '/api/tenants', { name: `Isolation A ${stamp}` }, admin)).body.id;
  tenantB = (await req('POST', '/api/tenants', { name: `Isolation B ${stamp}` }, admin)).body.id;

  // Two per-tenant ADMIN users (sphere A owns the fixtures below).
  const ua = `iso_a_${stamp}`;
  await req('POST', '/api/auth/register', { username: ua, password: 'Pass1234', fullName: 'User A', role: 'ADMIN', tenantId: tenantA }, admin);
  tokenA = (await req('POST', '/api/auth/login', { username: ua, password: 'Pass1234' })).body.token;
  const ub = `iso_b_${stamp}`;
  await req('POST', '/api/auth/register', { username: ub, password: 'Pass1234', fullName: 'User B', role: 'ADMIN', tenantId: tenantB }, admin);
  tokenB = (await req('POST', '/api/auth/login', { username: ub, password: 'Pass1234' })).body.token;

  // ---- Tenant-A fixtures (written via tokenA + X-Tenant-Id: tenantA) ----
  const A = { 'X-Tenant-Id': tenantA };
  const prod = await req('POST', '/api/products', { name: 'Iso Product A', code: `ISO-A-${stamp}`, unitPrice: 90, taxRate: 15 }, tokenA, A);
  assert.strictEqual(prod.status, 201, 'product fixture');
  prodA = prod.body.id;

  const adj = await req('POST', '/api/stock/adjust', { productId: prodA, warehouseId: 'W-01', qty: 20 }, tokenA, A);
  assert.strictEqual(adj.status, 200, 'stock fixture');

  const cust = await req('POST', '/api/customers', { name: 'Iso Customer A', phone: '0591001001' }, tokenA, A);
  assert.strictEqual(cust.status, 201, 'customer fixture');
  custA = cust.body.id;

  // Receivables fixtures only carry rows with remaining_amount > 0. A plain
  // invoice is settled in full (default CASH payment == total), so tenant A's
  // fixture is created as an explicit PARTIAL credit sale: it lands in both the
  // unpaid and the partial-paid list planes the scoping tests assert on.
  const inv = await req('POST', '/api/invoices', {
    items: [{ productId: prodA, qty: 1 }],
    customerId: custA,
    payments: [{ method: 'CASH', amount: 30 }],
  }, tokenA, A);
  assert.strictEqual(inv.status, 201, `invoice fixture: ${JSON.stringify(inv.body)}`);
  assert.strictEqual(inv.body.status, 'PARTIAL', `partial invoice fixture: ${JSON.stringify(inv.body)}`);
  invA = inv.body.invoiceId;

  shiftTerminal = `ISO-T-${stamp}`;
  const shift = await req('POST', '/api/shifts/open', { terminalId: shiftTerminal, openingCash: 100 }, tokenA, A);
  assert.strictEqual(shift.status, 201, 'shift fixture');

  const wh = await req('POST', '/api/webhooks', { url: `https://example.com/hook/${stamp}`, events: ['invoice.*'] }, tokenA);
  assert.strictEqual(wh.status, 201, 'webhook fixture');
  webhookA = wh.body.id;
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
  return { status: r.status, body: j };
}

describe('Tenant isolation — PASSING guards (B cannot read A by id)', () => {
  it('products/:id hides cross-tenant product (404)', async () => {
    const r = await req('GET', `/api/products/${prodA}`, null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 404);
  });

  it('customers/:id hides cross-tenant customer (404)', async () => {
    const r = await req('GET', `/api/customers/${custA}`, null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 404);
  });

  it('invoices/:id hides cross-tenant invoice (404)', async () => {
    const r = await req('GET', `/api/invoices/${invA}`, null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 404);
  });
});

describe('Tenant isolation — FIXED (secure behavior asserted)', () => {
  it('stock GET /:productId — cross-tenant stock hidden (200 zeros, no row)', async () => {
    const r = await req('GET', `/api/stock/${prodA}?warehouse=W-01`, null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 200, 'scoped read returns zero-fallback');
    assert.strictEqual(r.body.product_id, undefined, 'cross-tenant stock hidden (no tenant-A row)');
  });

  it('stock POST /reserve — cross-tenant reserve blocked (404)', async () => {
    const r = await req('POST', '/api/stock/reserve', { productId: prodA, warehouseId: 'W-01', qty: 1 }, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 404, 'cross-tenant reserve must be blocked');
  });

  it('shifts GET /open/:terminalId — cross-tenant open shift hidden (shift:null)', async () => {
    const r = await req('GET', `/api/shifts/open/${shiftTerminal}`, null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.shift, null, 'tenant-A open shift is scoped away');
  });

  it('webhooks GET / — GLOBAL integration plane (by design, role-gated)', async () => {
    // Not a cross-tenant leak: webhook_subscriptions is a deployment-GLOBAL
    // plane (no tenant column) and the list is role-gated to
    // ADMIN/MANAGER/AUDITOR (routes/webhooks.js:8-10,22-26).
    const r = await req('GET', '/api/webhooks', null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 200);
    const ids = r.body.subscriptions.map((s) => s.id);
    assert.ok(ids.includes(webhookA), 'global webhook list includes tenant-A subscription (by design)');
  });

  it('sync pull — cross-tenant invoice sync row hidden (tenant-attributed)', async () => {
    const r = await req('GET', '/api/sync/pull?checkpoint=0&limit=2000', null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 200);
    const ids = r.body.changes.map((c) => c.entity_id);
    assert.ok(!ids.includes(invA), 'tenant-A invoice sync row is scoped away');
  });

  it('X-Tenant-Id write spoof — B cannot act as tenant A (403)', async () => {
    const spoofed = await req('POST', '/api/customers', { name: 'Spoofed Into A', phone: '0592002002' }, tokenB, { 'X-Tenant-Id': tenantA });
    assert.strictEqual(spoofed.status, 403, 'bound user cannot spoof another tenant');
  });

  it('stock GET / (bulk) — cross-tenant levels hidden', async () => {
    const r = await req('GET', '/api/stock?warehouse=W-01', null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 200);
    const ids = r.body.stock.map((s) => s.product_id);
    assert.ok(!ids.includes(prodA), 'tenant-A stock level is scoped away from tenant B');
  });

  it('stock GET / (bulk) — all_warehouses=1 still honours the tenant scope', async () => {
    const r = await req('GET', '/api/stock?all_warehouses=1', null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.allWarehouses, true);
    const ids = r.body.stock.map((s) => s.product_id);
    assert.ok(!ids.includes(prodA), 'spanning warehouses must not leak another tenant');
  });

  it('stock GET / (bulk) — a bound caller cannot widen scope via ?tenant=', async () => {
    const r = await req('GET', `/api/stock?warehouse=W-01&tenant=${tenantA}`, null, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(r.status, 403, 'bound user must not read another tenant via ?tenant=');
  });

  it('get_warehouses — a tenant-owned warehouse is hidden from other tenants', async () => {
    // Warehouses carry an optional tenant_id (migrated). A tenant-owned row must
    // not appear in another tenant's picker, which drives their stock reads.
    db.prepare('INSERT OR REPLACE INTO warehouses (id,name,is_active,tenant_id) VALUES (?,?,1,?)')
      .run(isoWhA, `ISO Warehouse A ${stamp}`, tenantA);

    const mine = await req('POST', '/api/method/DyPOS.api.pos_profile.get_warehouses', {}, tokenA, { 'X-Tenant-Id': tenantA });
    assert.strictEqual(mine.status, 200);
    assert.ok(mine.body.message.some((w) => w.id === isoWhA), 'owner sees its own warehouse');

    const theirs = await req('POST', '/api/method/DyPOS.api.pos_profile.get_warehouses', {}, tokenB, { 'X-Tenant-Id': tenantB });
    assert.strictEqual(theirs.status, 200);
    assert.ok(!theirs.body.message.some((w) => w.id === isoWhA), 'foreign tenant warehouse is scoped away');
  });
});

/**
 * partial_payments list endpoints are the method-router read plane for
 * receivables. They previously ran unscoped `SELECT * FROM invoices WHERE ...`,
 * so tenant B saw tenant A's unpaid/partial invoices and their money totals.
 * Every statement now carries the resolveTenantFilter clause (fail-closed 403
 * on an invalid/spoofed tenant) plus `start` offset paging.
 */
describe('Tenant isolation — partial_payments list plane (scoped + paged)', () => {
  const method = async (path, tok, tenantId, body) => {
    const r = await req('POST', `/api/method/${path}`, body || {}, tok, { 'X-Tenant-Id': tenantId });
    assert.strictEqual(r.status, 200, `${path} must answer 200 for a bound tenant`);
    return Array.isArray(r.body.message) ? r.body.message : r.body.message;
  };

  const LIST_PATHS = [
    'DyPOS.api.partial_payments.get_unpaid_invoices',
    'DyPOS.api.partial_payments.get_partial_paid_invoices',
  ];
  const SUMMARY_PATHS = [
    'DyPOS.api.partial_payments.get_unpaid_summary',
    'DyPOS.api.partial_payments.get_partial_payment_summary',
  ];

  for (const p of LIST_PATHS) {
    it(`${p} — tenant-A invoice never leaks to tenant B`, async () => {
      const rows = await method(p, tokenB, tenantB, { limit: 200, start: 0 });
      const ids = rows.map((r) => r.id || r.name);
      assert.ok(!ids.includes(invA), `${p} must scope away tenant-A invoice ${invA}`);
    });

    it(`${p} — tenant A sees its own invoice (scoped read still works)`, async () => {
      const rows = await method(p, tokenA, tenantA, { limit: 200, start: 0 });
      const ids = rows.map((r) => r.id || r.name);
      assert.ok(ids.includes(invA), `${p} must still return tenant A's own invoice`);
    });

    it(`${p} — spoofed tenant header is rejected (403)`, async () => {
      const r = await req('POST', `/api/method/${p}`, { limit: 10 }, tokenB, { 'X-Tenant-Id': tenantA });
      assert.strictEqual(r.status, 403, `${p} must fail closed on a spoofed tenant`);
    });
  }

  for (const p of SUMMARY_PATHS) {
    it(`${p} — totals exclude tenant-A money`, async () => {
      const mine = await method(p, tokenA, tenantA);
      const theirs = await method(p, tokenB, tenantB);
      assert.ok(
        (theirs.count || 0) <= (mine.count || 0),
        `${p}: tenant B count must not exceed tenant A's global pool`,
      );
    });

    it(`${p} — spoofed tenant header is rejected (403)`, async () => {
      const r = await req('POST', `/api/method/${p}`, {}, tokenB, { 'X-Tenant-Id': tenantA });
      assert.strictEqual(r.status, 403, `${p} must fail closed on a spoofed tenant`);
    });
  }
});