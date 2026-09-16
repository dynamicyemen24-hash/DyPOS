/**
 * Integration plane tests: export / import / webhooks / restore-staging.
 * Fresh :memory: DB per file — first registered user bootstraps as ADMIN.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

import { app } from '../server.js';

let server, port, admin;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const uname = 'integ_' + Date.now();
  const reg = await req('POST', '/api/auth/register', { username: uname, password: 'Pass1234', fullName: 'Integ', role: 'ADMIN' });
  assert.strictEqual(reg.status, 201);
  assert.strictEqual(reg.body.role, 'ADMIN');
  const login = await req('POST', '/api/auth/login', { username: uname, password: 'Pass1234' });
  admin = login.body.token;
  assert.ok(admin);
});

after(() => server.close());

async function req(method, path, body, tok, contentType) {
  const headers = {};
  if (tok) headers.Authorization = `Bearer ${tok}`;
  let payload;
  if (body !== undefined && body !== null) {
    if (contentType) { headers['Content-Type'] = contentType; payload = typeof body === 'string' ? body : JSON.stringify(body); }
    else { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  }
  const res = await fetch(`http://localhost:${port}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, text };
}

describe('Export', () => {
  it('GET /api/export/products?format=csv returns header row', async () => {
    await req('POST', '/api/products', { name: 'Exp Prod', code: 'EXP-' + Date.now(), unitPrice: 9 }, admin);
    const r = await req('GET', '/api/export/products?format=csv&limit=10', null, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('code,name'));
  });

  it('GET /api/export/invoices?format=json respects filters', async () => {
    const r = await req('GET', '/api/export/invoices?format=json&from=2020-01-01&limit=5', null, admin);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.entity, 'invoices');
    assert.ok(Array.isArray(r.body.rows));
  });

  it('rejects unknown entity and bad format', async () => {
    assert.strictEqual((await req('GET', '/api/export/nope', null, admin)).status, 404);
    assert.strictEqual((await req('GET', '/api/export/products?format=xml', null, admin)).status, 400);
  });

  it('CASHIER cannot export (403)', async () => {
    const u = 'cash_' + Date.now();
    await req('POST', '/api/auth/register', { username: u, password: 'Pass1234', fullName: 'Cash' });
    const l = await req('POST', '/api/auth/login', { username: u, password: 'Pass1234' });
    const r = await req('GET', '/api/export/products', null, l.body.token);
    assert.strictEqual(r.status, 403);
  });
});

describe('Import', () => {
  const rows = [
    { code: 'IMP-001', name: 'Imp One', unitPrice: 5 },
    { code: 'IMP-002', name: 'Imp Two', unitPrice: 7, category: 'Cat' },
  ];

  it('dryRun validates without writing', async () => {
    const r = await req('POST', '/api/import/products?dryRun=1', rows, admin);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.dryRun, true);
    const exp = await req('GET', '/api/export/products?format=json&limit=10000', null, admin);
    assert.ok(!exp.body.rows.some((p) => p.code === 'IMP-001'));
  });

  it('commit upserts + re-import updates', async () => {
    const c1 = await req('POST', '/api/import/products', rows, admin);
    assert.strictEqual(c1.status, 201);
    assert.strictEqual(c1.body.created, 2);
    const c2 = await req('POST', '/api/import/products', [{ code: 'IMP-001', name: 'Imp One v2', unitPrice: 6 }], admin);
    assert.strictEqual(c2.body.updated, 1);
    assert.strictEqual(c2.body.created, 0);
  });

  it('invalid rows fail closed (nothing written)', async () => {
    const r = await req('POST', '/api/import/products', [{ code: '', name: '' }], admin);
    assert.strictEqual(r.status, 400);
    assert.ok(r.body.errors);
  });

  it('CSV import works (text/csv)', async () => {
    const csv = 'code,name,unitPrice\nIMP-CSV-1,Csv One,12\n';
    const r = await req('POST', '/api/import/products', csv, admin, 'text/csv');
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.created, 1);
  });

  it('stock import resolves product by code', async () => {
    const r = await req('POST', '/api/import/stock', [{ productCode: 'IMP-001', warehouseId: 'W-01', qty: 42 }], admin);
    assert.strictEqual(r.status, 201);
    const st = await req('GET', '/api/stock', null, admin);
    assert.strictEqual(st.status, 200);
  });
});

describe('Webhooks', () => {
  it('subscribe → event enqueues to outbox on product.create', async () => {
    const sub = await req('POST', '/api/webhooks', { url: 'https://erp.example.test/hook', events: ['product.*'] }, admin);
    assert.strictEqual(sub.status, 201);
    assert.ok(sub.body.id);
    await req('POST', '/api/products', { name: 'Hook Prod', code: 'HOOK-' + Date.now() }, admin);
    const box = await req('GET', '/api/webhooks/outbox?limit=5', null, admin);
    assert.strictEqual(box.status, 200);
    assert.ok(box.body.outbox.some((j) => j.event === 'product.created' && j.status === 'PENDING'));
    const del = await req('DELETE', `/api/webhooks/${sub.body.id}`, null, admin);
    assert.strictEqual(del.status, 200);
  });

  it('rejects non-http urls', async () => {
    const r = await req('POST', '/api/webhooks', { url: 'ftp://x/y', events: ['*'] }, admin);
    assert.strictEqual(r.status, 400);
  });

  it('events catalog documents signing', async () => {
    const r = await req('GET', '/api/webhooks/events', null, admin);
    assert.ok(r.body.events.includes('invoice.paid'));
    assert.ok(r.body.signing.includes('HMAC'));
  });
});

describe('Restore staging (safe paths)', () => {
  it('GET /api/admin/backups lists without crashing', async () => {
    const r = await req('GET', '/api/admin/backups', null, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.backups));
  });

  it('rejects bad names and missing files without staging', async () => {
    assert.strictEqual((await req('POST', '/api/admin/restore', { file: '../../x.db' }, admin)).status, 400);
    assert.strictEqual((await req('POST', '/api/admin/restore', { file: 'dypos-nope.db' }, admin)).status, 404);
  });
});
