/**
 * Functional requirements regression: بحث/إضافة/تعديل/طباعة/إيقاف/استيراد/تصدير
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { app } from '../server.js';

let server, port, admin, custId, prodId, invId;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const u = 'func_' + Date.now();
  await req('POST', '/api/auth/register', { username: u, password: 'Pass1234', fullName: 'Func', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: u, password: 'Pass1234' })).body.token;
});

after(() => server.close());

async function req(method, path, body, tok, ct) {
  const h = {};
  if (tok) h.Authorization = `Bearer ${tok}`;
  const isText = ct === 'text/csv';
  if (body != null) h['Content-Type'] = isText ? 'text/csv' : 'application/json';
  const r = await fetch(`http://localhost:${port}${path}`, { method, headers: h, body: body == null ? undefined : (isText ? String(body) : JSON.stringify(body)) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, body: j, text, headers: Object.fromEntries(r.headers.entries()) };
}

describe('بحث (Search)', () => {
  it('products/customers/invoices q filter works', async () => {
    const p = await req('POST', '/api/products', { name: 'SearchProd', code: 'SRCH-' + Date.now(), unitPrice: 5 }, admin);
    prodId = p.body.id;
    const s1 = await req('GET', `/api/products?q=SearchProd`, null, admin);
    assert.ok(s1.body.products.some((x) => x.id === prodId));
    const c = await req('POST', '/api/customers', { name: 'SearchCust', phone: '0590000001' }, admin);
    custId = c.body.id;
    const s2 = await req('GET', `/api/customers?q=SearchCust`, null, admin);
    assert.ok(s2.body.customers.some((x) => x.id === custId));
    const inv = await req('POST', '/api/invoices', { items: [{ productId: prodId, qty: 1 }] }, admin);
    invId = inv.body.invoiceId;
    const s3 = await req('GET', `/api/invoices?q=${inv.body.number.slice(0, 8)}`, null, admin);
    assert.ok(s3.body.invoices.some((x) => x.id === invId));
  });
});

describe('إضافة/تعديل', () => {
  it('PUT product + PUT customer persist', async () => {
    const r1 = await req('PUT', `/api/products/${prodId}`, { name: 'SearchProd v2', code: 'SRCH-' + Date.now(), unitPrice: 6 }, admin);
    assert.strictEqual(r1.status, 200);
    const r2 = await req('PUT', `/api/customers/${custId}`, { name: 'SearchCust v2', phone: '0590000002' }, admin);
    assert.strictEqual(r2.status, 200);
    const got = await req('GET', `/api/customers/${custId}`, null, admin);
    assert.strictEqual(got.body.name, 'SearchCust v2');
  });
});

describe('إيقاف/تفعيل (Stop/Toggle)', () => {
  it('customers/products toggle flips is_active', async () => {
    const a = await req('PATCH', `/api/customers/${custId}/toggle`, {}, admin);
    assert.strictEqual(a.status, 200);
    assert.strictEqual(a.body.is_active, 0);
    const b = await req('PATCH', `/api/customers/${custId}/toggle`, {}, admin);
    assert.strictEqual(b.body.is_active, 1);
    const pa = await req('PATCH', `/api/products/${prodId}/toggle`, {}, admin);
    assert.strictEqual(pa.status, 200);
    assert.strictEqual(typeof pa.body.is_active, 'number');
    // restore
    await req('PATCH', `/api/products/${prodId}/toggle`, {}, admin);
  });
  it('invoice void restores stock', async () => {
    const p2 = await req('POST', '/api/products', { name: 'VoidProd', code: 'VOID-' + Date.now(), unitPrice: 10 }, admin);
    const pid = p2.body.id;
    await req('POST', '/api/stock/adjust', { productId: pid, warehouseId: 'W-01', qty: 10 }, admin);
    const inv = await req('POST', '/api/invoices', { items: [{ productId: pid, qty: 2 }] }, admin);
    const before = await req('GET', `/api/stock/${pid}?warehouse=W-01`, null, admin);
    const v = await req('POST', `/api/invoices/${inv.body.invoiceId}/void`, { reason: 'اختبار' }, admin);
    assert.strictEqual(v.status, 200);
    const after = await req('GET', `/api/stock/${pid}?warehouse=W-01`, null, admin);
    assert.strictEqual(Number(after.body.qty), Number(before.body.qty) + 2);
  });
});

describe('طباعة (Print)', () => {
  it('GET /api/print/invoice/:id returns HTML with QR', async () => {
    const r = await req('GET', `/api/print/invoice/${invId}`, null, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(r.headers['content-type'].includes('text/html'));
    assert.ok(r.text.includes(invId.slice(0, 8)) || r.text.includes('فاتورة'));
    assert.ok(r.text.includes('data:image/png'));
  });
  it('GET /api/print/daily returns HTML', async () => {
    const r = await req('GET', `/api/print/daily?date=2026-09-16`, null, admin);
    assert.strictEqual(r.status, 200);
    assert.ok(r.text.includes('تقرير يومي'));
  });
});

describe('استيراد/تصدير (Import/Export)', () => {
  it('export csv + import dryRun + commit', async () => {
    const exp = await req('GET', '/api/export/products?format=csv&limit=2', null, admin);
    assert.strictEqual(exp.status, 200);
    assert.ok(exp.headers['content-type'].includes('text/csv'));
    const rows = [{ code: 'FUNC-IMP-1', name: 'Func Imp', unitPrice: 3 }];
    const dry = await req('POST', '/api/import/products?dryRun=1', rows, admin);
    assert.strictEqual(dry.body.dryRun, true);
    const commit = await req('POST', '/api/import/products', rows, admin);
    assert.strictEqual(commit.status, 201);
  });
  it('csv import path', async () => {
    const csv = 'code,name,unitPrice\nFUNC-CSV-2,Csv Func,4\n';
    const r = await req('POST', '/api/import/products', csv, admin, 'text/csv');
    assert.strictEqual(r.status, 201);
  });
});
