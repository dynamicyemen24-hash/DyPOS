/**
 * Finance-core regression tests — production upgrade campaign:
 * user-managed payment methods, business profile (any-country), fiscal
 * years + gapless invoice numbering.
 *
 *  - masters payment-methods CRUD/toggle (CASH locked, ADMIN-gated)
 *  - invoice create/pay validate the method (unknown/disabled/no-ref → 400)
 *  - settings get/put validation + product tax-rate inheritance
 *  - fiscal close blocks posting (409); sequential numbers are gapless
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

import { app } from '../server.js';

let server, port, admin, cashier, productId;

async function req(method, path, body, tok) {
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers, body: body === undefined || body === null ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

async function loginAs(username, password) {
  const r = await req('POST', '/api/auth/login', { username, password });
  assert.strictEqual(r.status, 200);
  return r.body.token;
}

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const au = 'fin_' + Date.now();
  await req('POST', '/api/auth/register', { username: au, password: 'Pass1234', fullName: 'Finance', role: 'ADMIN' });
  admin = await loginAs(au, 'Pass1234');

  const cu = 'finc_' + Date.now();
  await req('POST', '/api/auth/register', { username: cu, password: 'Pass1234', fullName: 'Finance Cashier' });
  cashier = await loginAs(cu, 'Pass1234');

  const p = await req('POST', '/api/products', { name: 'Finance SKU', code: 'FIN-' + Date.now(), unitPrice: 100 }, admin);
  assert.strictEqual(p.status, 201);
  productId = p.body.id;
});

after(() => server.close());

describe('Payment methods master (user-managed)', () => {
  it('lists seeded methods incl. CASH + WALLET active', async () => {
    const r = await req('GET', '/api/payment-methods', null, admin);
    assert.strictEqual(r.status, 200);
    const codes = r.body.methods.map((m) => m.code);
    assert.ok(codes.includes('CASH') && codes.includes('WALLET') && codes.includes('CARD'));
    assert.ok(r.body.methods.every((m) => Number(m.is_active) === 1));
  });

  it('CASHIER cannot create (403); ADMIN creates TABBY (201); dup → 409', async () => {
    const f = await req('POST', '/api/payment-methods', { code: 'TABBY', name: 'Tabby' }, cashier);
    assert.strictEqual(f.status, 403);
    const c = await req('POST', '/api/payment-methods', { code: 'TABBY', name: 'Tabby', nameAr: 'تابي', kind: 'CARD', requiresReference: true }, admin);
    assert.strictEqual(c.status, 201);
    const d = await req('POST', '/api/payment-methods', { code: 'TABBY', name: 'Tabby' }, admin);
    assert.strictEqual(d.status, 409);
  });

  it('bad kind → 400; CASH can never be disabled; CARD toggles off/on', async () => {
    const bad = await req('POST', '/api/payment-methods', { code: 'XX', name: 'X', kind: 'NOPE' }, admin);
    assert.strictEqual(bad.status, 400);
    const lock = await req('PATCH', '/api/payment-methods/CASH/toggle', { isActive: false }, admin);
    assert.strictEqual(lock.status, 400);
    const off = await req('PATCH', '/api/payment-methods/CARD/toggle', { isActive: false }, admin);
    assert.strictEqual(off.status, 200);
    assert.strictEqual(Number(off.body.is_active), 0);
    const on = await req('PATCH', '/api/payment-methods/CARD/toggle', { isActive: true }, admin);
    assert.strictEqual(Number(on.body.is_active), 1);
  });
});

describe('Invoice payment-method enforcement', () => {
  it('unknown method → 400, nothing posted', async () => {
    const r = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }], payments: [{ method: 'NOPE', amount: 115 }] }, admin);
    assert.strictEqual(r.status, 400);
    assert.match(String(r.body?.error || ''), /طريقة الدفع/);
  });

  it('disabled method → 400; reference-required without ref → 400', async () => {
    await req('PATCH', '/api/payment-methods/MADA/toggle', { isActive: false }, admin);
    const dis = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }], payments: [{ method: 'MADA', amount: 115, reference: 'R1' }] }, admin);
    assert.strictEqual(dis.status, 400);
    await req('PATCH', '/api/payment-methods/MADA/toggle', { isActive: true }, admin);
    const noref = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }], payments: [{ method: 'MADA', amount: 115 }] }, admin);
    assert.strictEqual(noref.status, 400);
    const ok = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }], payments: [{ method: 'MADA', amount: 115, reference: 'AUTH-1' }] }, admin);
    assert.strictEqual(ok.status, 201);
  });

  it('pay endpoint validates too (unknown → 400)', async () => {
    const inv = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }], payments: [] }, admin);
    // empty payments array falls back to default CASH full payment; craft UNPAID via partial:
    const inv2 = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }], payments: [{ method: 'CASH', amount: 10 }] }, admin);
    assert.strictEqual(inv2.status, 201);
    assert.ok(inv && inv.status === 201);
    const bad = await req('POST', `/api/invoices/${inv2.body.invoiceId}/pay`, { method: 'NOPE', amount: 5 }, admin);
    assert.strictEqual(bad.status, 400);
  });
});

describe('Business settings (any-country profile)', () => {
  it('GET returns seeded profile incl. tax_rate_default 15', async () => {
    const r = await req('GET', '/api/settings', null, admin);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.settings.tax_rate_default, '15');
    assert.strictEqual(r.body.settings.country_code, 'SA');
  });

  it('CASHIER cannot write (403); unknown key → 400; bad values → 400; nothing partial', async () => {
    const f = await req('PUT', '/api/settings', { business_name: 'X' }, cashier);
    assert.strictEqual(f.status, 403);
    const u = await req('PUT', '/api/settings', { nope: '1' }, admin);
    assert.strictEqual(u.status, 400);
    const bad = await req('PUT', '/api/settings', { business_name: 'OK', tax_rate_default: 999 }, admin);
    assert.strictEqual(bad.status, 400);
    const after = await req('GET', '/api/settings', null, admin);
    assert.notStrictEqual(after.body.settings.business_name, 'OK');
  });

  it('country must be ISO-3166; currency must be an active currency', async () => {
    const c = await req('PUT', '/api/settings', { country_code: 'USA' }, admin);
    assert.strictEqual(c.status, 400);
    // Overlong values must be REJECTED, never truncated-into-valid ('USAD'→'US').
    const c4 = await req('PUT', '/api/settings', { country_code: 'USAD' }, admin);
    assert.strictEqual(c4.status, 400);
    const px = await req('PUT', '/api/settings', { invoice_prefix: 'ABCDEFGHIJK' }, admin);
    assert.strictEqual(px.status, 400);
    const afterBad = await req('GET', '/api/settings', null, admin);
    assert.strictEqual(afterBad.body.settings.country_code, 'SA');
    const cur = await req('PUT', '/api/settings', { currency: 'XXQ' }, admin);
    assert.strictEqual(cur.status, 400);
    const ok = await req('PUT', '/api/settings', { business_name: 'متجر الاختبار', country_code: 'AE', tax_rate_default: 5 }, admin);
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.body.settings.country_code, 'AE');
  });

  it('products created without taxRate inherit the profile default', async () => {
    const p = await req('POST', '/api/products', { name: 'Tax Inherit', code: 'TX-' + Date.now(), unitPrice: 50 }, admin);
    assert.strictEqual(p.status, 201);
    const g = await req('GET', `/api/products/${p.body.id}`, null, admin);
    assert.strictEqual(Number(g.body.tax_rate), 5);
    await req('PUT', '/api/settings', { tax_rate_default: 15 }, admin);
  });
});

describe('Fiscal years + gapless numbering', () => {  it('current year auto-provisioned OPEN; invoices number sequentially', async () => {
    const y = new Date().getUTCFullYear();
    const list = await req('GET', '/api/fiscal-years', null, admin);
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.years.some((r) => r.code === String(y) && r.status === 'OPEN'));
    const a = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }] }, admin);
    const b = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }] }, admin);
    assert.strictEqual(a.status, 201);
    assert.strictEqual(b.status, 201);
    const na = String(a.body.number), nb = String(b.body.number);
    assert.match(na, new RegExp(`^INV-${y}-\\d{6}$`));
    assert.match(nb, new RegExp(`^INV-${y}-\\d{6}$`));
    assert.strictEqual(Number(nb.slice(-6)) - Number(na.slice(-6)), 1);
  });

  it('closing the year blocks posting (409); reopen restores it', async () => {
    const y = String(new Date().getUTCFullYear());
    const close = await req('POST', `/api/fiscal-years/${y}/close`, null, admin);
    assert.strictEqual(close.status, 200);
    const blocked = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }] }, admin);
    assert.strictEqual(blocked.status, 409);
    assert.match(String(blocked.body?.error || ''), /مقفلة/);
    const reopen = await req('POST', `/api/fiscal-years/${y}/reopen`, null, admin);
    assert.strictEqual(reopen.status, 200);
    const ok = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }] }, admin);
    assert.strictEqual(ok.status, 201);
  });

  it('CASHIER cannot close (403); unknown year → 404', async () => {
    const f = await req('POST', '/api/fiscal-years/2099/close', null, cashier);
    assert.strictEqual(f.status, 403);
    const n = await req('POST', '/api/fiscal-years/2099/close', null, admin);
    assert.strictEqual(n.status, 404);
  });

  it('closed year blocks pay + void on its invoices (period immutability)', async () => {
    const y = String(new Date().getUTCFullYear());
    const inv = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }], payments: [{ method: 'CASH', amount: 10 }] }, admin);
    assert.strictEqual(inv.status, 201);
    const id = inv.body.invoiceId;
    await req('POST', `/api/fiscal-years/${y}/close`, null, admin);
    const pay = await req('POST', `/api/invoices/${id}/pay`, { method: 'CASH', amount: 5 }, admin);
    assert.strictEqual(pay.status, 409);
    const vd = await req('POST', `/api/invoices/${id}/void`, { reason: 'test' }, admin);
    assert.strictEqual(vd.status, 409);
    const reopen = await req('POST', `/api/fiscal-years/${y}/reopen`, null, admin);
    assert.strictEqual(reopen.status, 200);
    const pay2 = await req('POST', `/api/invoices/${id}/pay`, { method: 'CASH', amount: 5 }, admin);
    assert.strictEqual(pay2.status, 200);
  });
});

describe('Change, inclusive tax, currency default, print branding', () => {
  it('cash overpay → 201 + explicit change, receivables never negative', async () => {
    // product 100 + 15% tax = 115 total; hand 200 → change 80, remaining 0.
    const r = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }], payments: [{ method: 'CASH', amount: 200 }] }, admin);
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.change, 85);
    assert.strictEqual(r.body.remainingAmount, 0);
    assert.strictEqual(r.body.paidAmount, 115);
    assert.strictEqual(r.body.status, 'PAID');
    const got = await req('GET', `/api/invoices/${r.body.invoiceId}`, null, admin);
    assert.strictEqual(got.body.remainingAmount ?? got.body.remaining_amount, 0);
  });

  it('pay-endpoint overpay → 200 + change, clamped totals', async () => {
    const inv = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }], payments: [{ method: 'CASH', amount: 10 }] }, admin);
    assert.strictEqual(inv.status, 201);
    const pay = await req('POST', `/api/invoices/${inv.body.invoiceId}/pay`, { method: 'CASH', amount: 200 }, admin);
    assert.strictEqual(pay.status, 200);
    assert.strictEqual(pay.body.remainingAmount, 0);
    assert.strictEqual(pay.body.paidAmount, 115);
    assert.strictEqual(pay.body.change, 95);
  });

  it('wallet never over-deducts: capped at the total, change 0', async () => {
    const cu = await req('POST', '/api/customers', { name: 'Wallet Cap', phone: '05' + Date.now().toString().slice(-8) }, admin);
    assert.strictEqual(cu.status, 201);
    const cid = cu.body.id;
    const fund = await req('POST', `/api/customers/${cid}/wallet`, { amount: 1000, direction: 'credit' }, admin);
    assert.strictEqual(fund.status, 200);
    const r = await req('POST', '/api/invoices', { customerId: cid, items: [{ productId, qty: 1 }], payments: [{ method: 'WALLET', amount: 500 }] }, admin);
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.change, 0);
    assert.strictEqual(r.body.remainingAmount, 0);
    const bal = await req('GET', `/api/customers/${cid}/balance`, null, admin);
    assert.strictEqual(Number(bal.body.wallet_balance ?? bal.body.balance ?? NaN), 885);
  });

  it('tax-inclusive profile keeps the charged total exact (net backed out)', async () => {
    await req('PUT', '/api/settings', { tax_inclusive: 1 }, admin);
    // shelf 100 tax-inclusive @15%: total stays 100, net 86.96, tax 13.04.
    const r = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }] }, admin);
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body.total, 100);
    assert.strictEqual(r.body.taxAmount, 13.04);
    assert.strictEqual(r.body.subtotal, 86.96);
    await req('PUT', '/api/settings', { tax_inclusive: 0 }, admin);
  });

  it('invoice currency defaults to the profile currency', async () => {
    await req('PUT', '/api/settings', { currency: 'USD' }, admin);
    const r = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }] }, admin);
    assert.strictEqual(r.status, 201);
    const got = await req('GET', `/api/invoices/${r.body.invoiceId}`, null, admin);
    assert.strictEqual(got.body.currency, 'USD');
    await req('PUT', '/api/settings', { currency: 'SAR' }, admin);
  });

  it('printed invoice shows the business name from settings', async () => {
    await req('PUT', '/api/settings', { business_name: 'متجر النور' }, admin);
    const inv = await req('POST', '/api/invoices', { items: [{ productId, qty: 1 }] }, admin);
    const html = await req('GET', `/api/print/invoice/${inv.body.invoiceId}`, null, admin);
    assert.strictEqual(html.status, 200);
    assert.ok(String(html.body).includes('متجر النور'));
    await req('PUT', '/api/settings', { business_name: '' }, admin);
  });
});
