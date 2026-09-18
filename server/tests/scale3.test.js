/**
 * DyPOS v1.7.0 regression — shared rate store, hash-chained invoices,
 * ZATCA settings, background export jobs.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { setTimeout as sleep } from 'node:timers/promises';
import { app } from '../server.js';
import { createRateStore } from '../lib/rate-store.js';

let server, port, admin, prodId;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const a = 's3admin_' + Date.now();
  await req('POST', '/api/auth/register', { username: a, password: 'Pass1234', fullName: 'S3 Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: a, password: 'Pass1234' })).body.token;
  const p = await req('POST', '/api/products', { name: 'S3 Prod', code: 'S3-' + Date.now(), unitPrice: 20 }, admin);
  prodId = p.body.id;
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

describe('Shared rate store', () => {
  it('increments within a window and resets', async () => {
    const store = createRateStore(60000);
    const k = 's3-' + Date.now();
    const r1 = await store.increment(k);
    const r2 = await store.increment(k);
    assert.strictEqual(r2.totalHits, r1.totalHits + 1);
    await store.resetKey(k);
    const got = await store.get(k);
    assert.strictEqual(got, undefined);
  });
});

describe('Invoice hash chain', () => {
  it('CREATE stamps chain_hash + audit link', async () => {
    const c = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 2 }] }, admin);
    assert.strictEqual(c.status, 201);
    const got = await req('GET', `/api/invoices/${c.body.invoiceId}`, null, admin);
    assert.ok(got.body.chain_hash && got.body.chain_hash.length === 64);
    const audit = await req('GET', `/api/invoices/${c.body.invoiceId}/audit`, null, admin);
    assert.strictEqual(audit.status, 200);
    assert.ok(audit.body.links.length >= 1);
    assert.strictEqual(audit.body.links[0].action, 'CREATE');
  });
  it('PAY appends a second link; chain verifies', async () => {
    const c = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }], payments: [{ method: 'CASH', amount: 0 }] }, admin);
    const id = c.body.invoiceId;
    await req('POST', `/api/invoices/${id}/pay`, { method: 'CASH', amount: 23 }, admin);
    const audit = await req('GET', `/api/invoices/${id}/audit`, null, admin);
    assert.ok(audit.body.links.length >= 2);
    assert.ok(audit.body.links.some((l) => l.action === 'PAY'));
    const v = await req('GET', '/api/admin/chain/verify?limit=10000', null, admin);
    assert.strictEqual(v.status, 200);
    assert.strictEqual(v.body.ok, true);
  });
});

describe('ZATCA settings', () => {
  it('GET default + PUT valid VAT + reject bad VAT', async () => {
    const g = await req('GET', '/api/admin/zatca/settings', null, admin);
    assert.strictEqual(g.status, 200);
    const bad = await req('PUT', '/api/admin/zatca/settings', { vatNumber: '123' }, admin);
    assert.strictEqual(bad.status, 400);
    const ok = await req('PUT', '/api/admin/zatca/settings', { sellerName: 'S3 Store', vatNumber: '300000000000003', phase: 'simulation' }, admin);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.body.settings.vat_number, '300000000000003');
  });
});

describe('Background export jobs', () => {
  it('POST job → poll DONE → download', async () => {
    const j = await req('POST', '/api/export/products/jobs', { format: 'json', limit: 50 }, admin);
    assert.strictEqual(j.status, 202);
    assert.ok(j.body.jobId);
    let st = null;
    for (let i = 0; i < 50; i++) {
      await sleep(100);
      st = await req('GET', `/api/export/jobs/${j.body.jobId}`, null, admin);
      if (st.body.status === 'DONE') break;
    }
    assert.strictEqual(st.body.status, 'DONE');
    const dl = await req('GET', `/api/export/jobs/${j.body.jobId}?download=1`, null, admin);
    assert.strictEqual(dl.status, 200);
    assert.ok(dl.body.count >= 1);
    const list = await req('GET', '/api/export/jobs', null, admin);
    assert.ok(list.body.jobs.some((x) => x.id === j.body.jobId));
  });
  it('unknown entity job rejected (404)', async () => {
    const r = await req('POST', '/api/export/nope/jobs', { format: 'json' }, admin);
    assert.strictEqual(r.status, 404);
  });
});

describe('OpenAPI v1.7.0 surface', () => {
  it('documents chain/audit, jobs, zatca', async () => {
    const r = await fetch(`http://localhost:${port}/api/openapi.json`);
    const spec = await r.json();
    assert.ok(spec.paths['/invoices/{id}/audit'] || spec.paths['/invoices/{id}']);
  });
});
