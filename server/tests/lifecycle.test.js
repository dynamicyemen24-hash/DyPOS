/**
 * SaaS Lifecycle E2E (HTTP plane) — one tenant's full commercial day.
 *
 * register → tenant → catalog+stock → customer → shift → full sale (loyalty
 * earned) → partial+final pay on credit sale → void (idempotent replay) →
 * return (idempotent replay) → reports → export → isolation.
 *
 * Fresh :memory: DB per file. Asserts money movement AND safety rails at
 * every step — this is the production-readiness contract.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { once } from 'events';

import { app } from '../server.js';

let server, port, admin;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const uname = 'life_' + Date.now();
  const reg = await req('POST', '/api/auth/register', { username: uname, password: 'Pass1234', fullName: 'Lifecycle', role: 'ADMIN' });
  assert.strictEqual(reg.status, 201);
  const login = await req('POST', '/api/auth/login', { username: uname, password: 'Pass1234' });
  admin = login.body.token;
  assert.ok(admin);
});

after(() => server.close());

async function req(method, path, body, tok, extraHeaders) {
  const headers = { ...(extraHeaders || {}) };
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let payload;
  if (body !== undefined && body !== null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`http://localhost:${port}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, text };
}

describe('SaaS tenant lifecycle (tenant-scoped writes throughout)', () => {
  let tenantId, productId, customerId, shiftId, paidInvoiceId, partialInvoiceId;
  const T = () => ({ 'X-Tenant-Id': tenantId });

  it('provisions a tenant', async () => {
    const r = await req('POST', '/api/tenants', { name: 'Lifecycle Stores', code: 'LIFE', plan: 'pro' }, admin);
    assert.strictEqual(r.status, 201);
    tenantId = r.body.id;
    assert.ok(tenantId);
  });

  it('stocks the catalog', async () => {
    const p = await req('POST', '/api/products', { name: 'Lifecycle Widget', code: 'LIFE-W1', unitPrice: 100, taxRate: 15 }, admin, T());
    assert.strictEqual(p.status, 201);
    productId = p.body.id;
    const adj = await req('POST', '/api/stock/adjust', { productId, warehouseId: 'W-01', qty: 50, reason: 'lifecycle' }, admin);
    assert.strictEqual(adj.status, 200);
    assert.strictEqual(adj.body.newQty, 50);
  });

  it('registers a customer with credit + loyalty', async () => {
    const c = await req('POST', '/api/customers', { name: 'Lifecycle Buyer', phone: '+966500000001', creditLimit: 1000 }, admin, T());
    assert.strictEqual(c.status, 201);
    customerId = c.body.id;
  });

  it('opens a shift', async () => {
    const s = await req('POST', '/api/shifts/open', { terminalId: 'LIFE-T1', openingCash: 200 }, admin, T());
    assert.strictEqual(s.status, 201);
    shiftId = s.body.shiftId;
  });

  it('creates a fully-paid idempotent sale (earns loyalty)', async () => {
    const body = {
      items: [{ productId, qty: 2, unitPrice: 100, taxRate: 15 }],
      customerId, shiftId, idempotencyKey: 'life-full-sale',
    };
    const r1 = await req('POST', '/api/invoices', body, admin, T());
    assert.strictEqual(r1.status, 201);
    paidInvoiceId = r1.body.invoiceId;
    const r2 = await req('POST', '/api/invoices', body, admin, T());
    assert.strictEqual(r2.status, 200);
    assert.strictEqual(r2.body.deduped, true);
    assert.strictEqual(r2.body.invoiceId, paidInvoiceId);
    const inv = (await req('GET', `/api/invoices/${paidInvoiceId}`, null, admin, T())).body;
    assert.strictEqual(inv.status, 'PAID');
    assert.strictEqual(inv.total, 230);
    const stock = await req('GET', `/api/stock/${productId}?warehouse=W-01`, null, admin);
    assert.strictEqual(stock.body.qty, 48, 'stock decremented exactly once (50-2)');
  });

  it('creates a credit sale (PARTIAL) and completes it idempotently', async () => {
    const body = {
      items: [{ productId, qty: 1, unitPrice: 100, taxRate: 15 }],
      customerId, shiftId, idempotencyKey: 'life-credit-sale',
      payments: [{ method: 'CASH', amount: 50 }],
    };
    const r1 = await req('POST', '/api/invoices', body, admin, T());
    assert.strictEqual(r1.status, 201);
    partialInvoiceId = r1.body.invoiceId;
    const inv = (await req('GET', `/api/invoices/${partialInvoiceId}`, null, admin, T())).body;
    assert.strictEqual(inv.status, 'PARTIAL');
    assert.strictEqual(inv.paid_amount, 50);
    assert.ok(inv.remaining_amount > 0);
    const rest = Math.round(inv.remaining_amount * 100) / 100;
    const key = 'life-pay-1';
    const p1 = await req('POST', `/api/invoices/${partialInvoiceId}/pay`, { method: 'CASH', amount: rest, idempotencyKey: key }, admin, T());
    assert.strictEqual(p1.status, 200);
    assert.strictEqual(p1.body.status, 'PAID');
    const p2 = await req('POST', `/api/invoices/${partialInvoiceId}/pay`, { method: 'CASH', amount: rest, idempotencyKey: key }, admin, T());
    assert.strictEqual(p2.body.deduped, true);
    assert.strictEqual(p2.body.status, 'PAID');
  });

  it('earns loyalty then redeems to wallet', async () => {
    const bal = await req('GET', `/api/customers/${customerId}/balance`, null, admin, T());
    assert.ok(Number(bal.body.loyalty_points) > 0, 'PAID sale earned points');
    const redeem = await req('POST', `/api/customers/${customerId}/loyalty/redeem`, { points: 1 }, admin, T());
    assert.strictEqual(redeem.status, 200);
    assert.strictEqual(redeem.body.redeemedPoints, 1);
  });

  it('voids idempotently via header key and restores stock', async () => {
    const H = { ...T(), 'X-Idempotency-Key': 'life-void-1' };
    const v1 = await req('POST', `/api/invoices/${paidInvoiceId}/void`, { reason: 'lifecycle' }, admin, H);
    assert.strictEqual(v1.status, 200);
    assert.strictEqual(v1.body.status, 'VOIDED');
    const v2 = await req('POST', `/api/invoices/${paidInvoiceId}/void`, { reason: 'lifecycle' }, admin, H);
    assert.strictEqual(v2.body.deduped, true);
    const stock = await req('GET', `/api/stock/${productId}?warehouse=W-01`, null, admin);
    assert.strictEqual(stock.body.qty, 49, 'void restored the 2 units from voided invoice (47+2=49)');
  });

  it('returns a sale idempotently', async () => {
    const s = await req('POST', '/api/invoices', {
      items: [{ productId, qty: 1, unitPrice: 100, taxRate: 15 }],
      customerId, shiftId, idempotencyKey: 'life-return-sale',
    }, admin, T());
    assert.strictEqual(s.status, 201);
    const returnInvId = s.body.invoiceId;
    const H = { ...T(), 'X-Idempotency-Key': 'life-return-1' };
    const r1 = await req('POST', `/api/invoices/${returnInvId}/return`, { reason: 'lifecycle' }, admin, H);
    assert.strictEqual(r1.status, 200);
    assert.strictEqual(r1.body.status, 'RETURNED');
    const r2 = await req('POST', `/api/invoices/${returnInvId}/return`, { reason: 'lifecycle' }, admin, H);
    assert.strictEqual(r2.body.deduped, true);
  });

  it('reports the day and exports invoices', async () => {
    const sum = await req('GET', '/api/reports/summary', null, admin, T());
    assert.strictEqual(sum.status, 200);
    const exp = await req('POST', '/api/export/invoices/jobs', { format: 'json' }, admin, T());
    assert.ok(exp.status === 201 || exp.status === 202, `export status=${exp.status}`);
    const job = await req('GET', `/api/export/jobs/${exp.body.jobId || exp.body.id}`, null, admin);
    assert.ok(job.status === 200 || job.status === 204, `job status=${job.status}`);
  });

  it('isolates tenants (cross-tenant reads are 404, no leak)', async () => {
    const other = await req('POST', '/api/tenants', { name: 'Other', code: 'OTHX' }, admin);
    const H = { 'X-Tenant-Id': other.body.id };
    const leakedProduct = await req('GET', `/api/products/${productId}`, null, admin, H);
    assert.strictEqual(leakedProduct.status, 404);
    const leakedInvoice = await req('GET', `/api/invoices/${paidInvoiceId}`, null, admin, H);
    assert.strictEqual(leakedInvoice.status, 404);
    const leakedCustomer = await req('GET', `/api/customers/${customerId}`, null, admin, H);
    assert.strictEqual(leakedCustomer.status, 404);
  });

  it('closes the shift with zero variance', async () => {
    const c = await req('POST', `/api/shifts/${shiftId}/close`, {}, admin, T());
    assert.strictEqual(c.status, 200);
    assert.strictEqual(c.body.variance, 0);
  });
});
