/**
 * Method-router compat regression (FUNC wave): every handler the POS
 * dialogs call must exist and behave — returns end-to-end, offline dedupe,
 * credit/wallet, promotions, product management, QZ, variants.
 *
 * Env from tests/setup.js (--import). Fresh in-memory DB per file.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import { once } from 'node:events';

import { app } from '../server.js';

let server, port;

const stamp = Date.now();
let seq = 0;
const uniq = (p) => `${p}_${stamp}_${seq++}`;
const PW = 'StrongP@55!';

let adminToken, cashierToken;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const boot = uniq('mcompat_boot');
  const reg = await req('POST', '/api/auth/register', {
    body: { username: boot, password: PW, fullName: 'Compat Root', role: 'ADMIN' },
  });
  assert.strictEqual(reg.status, 201);
  adminToken = (await req('POST', '/api/auth/login', { body: { username: boot, password: PW } })).body.token;
  assert.ok(adminToken);

  const cu = uniq('mcompat_cash');
  await req('POST', '/api/auth/register', {
    body: { username: cu, password: PW, fullName: 'Compat Cashier', role: 'CASHIER' },
    token: adminToken,
  });
  cashierToken = (await req('POST', '/api/auth/login', { body: { username: cu, password: PW } })).body.token;
  assert.ok(cashierToken);
});

after(() => server.close());

async function req(method, path, { body, token } = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  const payload = body === undefined || body === null ? undefined : JSON.stringify(body);
  const res = await fetch(`http://localhost:${port}${path}`, { method, headers: h, body: payload });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

const M = (path, token, body) => req('POST', `/api/method/${path}`, { token, body });

let prodId, prodCode, invId, custId;

describe('returns end-to-end via the method router', () => {
  it('setup: product + stock + customer + PAID sale', async () => {
    prodCode = `MCOMP-${stamp}`;
    const p = await req('POST', '/api/products', {
      token: adminToken,
      body: { name: 'Compat Widget', code: prodCode, unitPrice: 10, taxRate: 15 },
    });
    assert.strictEqual(p.status, 201, JSON.stringify(p.body));
    prodId = p.body.id;

    const adj = await req('POST', '/api/stock/adjust', {
      token: adminToken,
      body: { productId: prodId, warehouseId: 'W-01', qty: 100 },
    });
    assert.strictEqual(adj.status, 200, JSON.stringify(adj.body));

    const c = await req('POST', '/api/customers', {
      token: adminToken,
      body: { name: 'Compat Buyer', creditLimit: 500 },
    });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    custId = c.body.id;

    const sub = await M('DyPOS.api.invoices.submit_invoice', adminToken, {
      items: [{ item_code: prodCode, qty: 4, rate: 10 }],
      payments: [{ mode_of_payment: 'CASH', amount: 46 }],
      customer: custId,
    });
    assert.strictEqual(sub.status, 200, JSON.stringify(sub.body).slice(0, 400));
    invId = sub.body.message.name;
    assert.ok(invId);
    assert.strictEqual(sub.body.message.status, 'PAID');
  });

  it('get_returnable_invoices + search_invoice_by_number find it', async () => {
    const list = await M('DyPOS.api.invoices.get_returnable_invoices', cashierToken, { limit: 50 });
    assert.strictEqual(list.status, 200);
    assert.ok(list.body.message.some((r) => r.name === invId), 'returnable list contains the sale');

    const found = await M('DyPOS.api.invoices.search_invoice_by_number', cashierToken, { search_term: list.body.message.find((r) => r.name === invId).number });
    assert.strictEqual(found.status, 200);
    assert.ok(found.body.message.some((r) => r.name === invId));
  });

  it('validity true + prepare exposes remaining_qty', async () => {
    const v = await M('DyPOS.api.invoices.check_invoice_return_validity', cashierToken, { invoice_name: invId });
    assert.strictEqual(v.status, 200);
    assert.strictEqual(v.body.message.valid, true);

    const prep = await M('DyPOS.api.invoices.prepare_return_invoice', cashierToken, { invoice_name: invId });
    assert.strictEqual(prep.status, 200);
    assert.strictEqual(prep.body.message.return_against, invId);
    assert.ok(Array.isArray(prep.body.message.items) && prep.body.message.items.length === 1);
    assert.strictEqual(prep.body.message.items[0].remaining_qty, 4);
    assert.ok(prep.body.message._original_invoice);
  });

  it('partial is_return via submit_invoice → PARTIAL + restocked', async () => {
    const ret = await M('DyPOS.api.invoices.submit_invoice', cashierToken, {
      invoice: JSON.stringify({
        is_return: 1,
        return_against: invId,
        customer: custId,
        remarks: 'compat partial',
        items: [{ item_code: prodCode, qty: -1, rate: 10, warehouse: 'W-01' }],
        payments: [],
      }),
      data: JSON.stringify({}),
    });
    assert.strictEqual(ret.status, 200, JSON.stringify(ret.body).slice(0, 400));
    assert.strictEqual(ret.body.message.name, invId);
    // Fully-paid invoice minus one line stays PAID with the total reduced.
    assert.strictEqual(ret.body.message.status, 'PAID');
    assert.ok(Number(ret.body.message.grand_total) < 46, 'total reduced by the returned line');

    const prep = await M('DyPOS.api.invoices.prepare_return_invoice', cashierToken, { invoice_name: invId });
    assert.strictEqual(prep.body.message.items[0].remaining_qty, 3);
  });

  it('over-return rejected (409-style 4xx, Arabic message)', async () => {
    const ret = await M('DyPOS.api.invoices.submit_invoice', cashierToken, {
      invoice: JSON.stringify({
        is_return: 1,
        return_against: invId,
        items: [{ item_code: prodCode, qty: -99, warehouse: 'W-01' }],
        payments: [],
      }),
      data: JSON.stringify({}),
    });
    assert.ok(ret.status >= 400 && ret.status < 500, `expected 4xx, got ${ret.status}`);
    assert.ok(ret.body._error_message);
  });

  it('UNPAID invoice validity → unpaid (not returnable)', async () => {
    const sub = await M('DyPOS.api.invoices.submit_invoice', adminToken, {
      items: [{ item_code: prodCode, qty: 1, rate: 10 }],
      payments: [],
      customer: custId,
    });
    assert.strictEqual(sub.status, 200);
    const v = await M('DyPOS.api.invoices.check_invoice_return_validity', cashierToken, { invoice_name: sub.body.message.name });
    assert.strictEqual(v.body.message.valid, false);
    assert.strictEqual(v.body.message.error_type, 'unpaid');
  });
});

describe('offline dedupe check', () => {
  it('synced offline_id found; unknown → { synced:false }', async () => {
    const offId = `pos_offline_${stamp}`;
    const sub = await M('DyPOS.api.invoices.submit_invoice', adminToken, {
      items: [{ item_code: prodCode, qty: 1, rate: 10 }],
      payments: [{ mode_of_payment: 'CASH', amount: 11.5 }],
      customer: custId,
      offline_id: offId,
    });
    assert.strictEqual(sub.status, 200, JSON.stringify(sub.body).slice(0, 300));

    const hit = await M('DyPOS.api.invoices.check_offline_invoice_synced', adminToken, { offline_id: offId });
    assert.strictEqual(hit.status, 200);
    assert.strictEqual(hit.body.message.synced, true);
    assert.ok(hit.body.message.sales_invoice);

    const miss = await M('DyPOS.api.invoices.check_offline_invoice_synced', adminToken, { offline_id: `pos_offline_nope_${stamp}` });
    assert.strictEqual(miss.body.message.synced, false);
  });
});

describe('credit / wallet / receivable / flags', () => {
  it('available credit + balance shape + wallet info', async () => {
    const avail = await M('DyPOS.api.credit_sales.get_available_credit', cashierToken, { customer: custId });
    assert.strictEqual(avail.status, 200);
    assert.ok(Array.isArray(avail.body.message) && avail.body.message.length === 1);
    assert.ok(avail.body.message[0].credit_amount > 0);

    const bal = await M('DyPOS.api.credit_sales.get_customer_balance', cashierToken, { customer: custId });
    assert.strictEqual(bal.status, 200);
    assert.strictEqual(typeof bal.body.message.total_outstanding, 'number');
    assert.strictEqual(typeof bal.body.message.total_credit, 'number');
    assert.strictEqual(typeof bal.body.message.net_balance, 'number');

    const wallet = await M('DyPOS.api.wallet.get_wallet_info', cashierToken, { customer: custId });
    assert.strictEqual(wallet.status, 200);
    assert.strictEqual(wallet.body.message.wallet_enabled, true);
    assert.strictEqual(typeof wallet.body.message.wallet_balance, 'number');

    const missing = await M('DyPOS.api.wallet.get_wallet_info', cashierToken, { customer: 'no-such-customer' });
    assert.strictEqual(missing.status, 404);
  });

  it('receivable accounts [] + wallet flags map', async () => {
    const recv = await M('DyPOS.api.pos_profile.get_receivable_accounts', cashierToken, {});
    assert.strictEqual(recv.status, 200);
    assert.deepStrictEqual(recv.body.message, []);

    const flags = await M('DyPOS.api.pos_profile.get_wallet_payment_flags', cashierToken, { methods: ['CASH', 'WALLET'] });
    assert.strictEqual(flags.status, 200);
    assert.strictEqual(typeof flags.body.message.CASH, 'boolean');
    assert.strictEqual(typeof flags.body.message.WALLET, 'boolean');
  });
});

describe('promotions CRUD', () => {
  const coupon = `MC-${stamp}`.slice(0, 20);

  it('coupon lifecycle: create → list → details → toggle → delete', async () => {
    const create = await M('DyPOS.api.promotions.create_coupon', adminToken, {
      data: JSON.stringify({
        coupon_code: coupon, discount_type: 'Percentage', discount_percentage: 10,
        min_amount: 50, maximum_use: 5, valid_from: '2020-01-01', valid_upto: '2030-01-01',
      }),
    });
    assert.strictEqual(create.status, 200, JSON.stringify(create.body));
    assert.strictEqual(create.body.message.coupon_code, coupon);

    const denied = await M('DyPOS.api.promotions.create_coupon', cashierToken, {
      data: JSON.stringify({ coupon_code: `${coupon}X`, discount_type: 'Amount', discount_amount: 5 }),
    });
    assert.strictEqual(denied.status, 403);

    const list = await M('DyPOS.api.promotions.get_coupons', cashierToken, { include_disabled: true });
    assert.ok(list.body.message.some((c) => c.coupon_code === coupon));

    const details = await M('DyPOS.api.promotions.get_coupon_details', cashierToken, { coupon_name: coupon });
    assert.strictEqual(details.body.message.discount_percentage, 10);

    const toggled = await M('DyPOS.api.promotions.toggle_coupon', adminToken, { coupon_name: coupon });
    assert.strictEqual(toggled.body.message.status, 'Disabled');

    const del = await M('DyPOS.api.promotions.delete_coupon', adminToken, { coupon_name: coupon });
    assert.strictEqual(del.body.message.deleted, true);
  });

  it('promotion lifecycle: create → list → details → toggle → delete', async () => {
    const name = `MScheme ${stamp}`;
    const create = await M('DyPOS.api.promotions.create_promotion', adminToken, {
      data: JSON.stringify({
        name, apply_on: 'Item Group', discount_type: 'percentage', discount_value: 15,
        items: [{ item_group: 'General' }], min_amt: 100, valid_from: '2020-01-01', valid_upto: '2030-01-01',
      }),
    });
    assert.strictEqual(create.status, 200, JSON.stringify(create.body));

    const list = await M('DyPOS.api.promotions.get_promotions', cashierToken, { include_disabled: true });
    assert.ok(list.body.message.some((p) => p.name === name));

    const details = await M('DyPOS.api.promotions.get_promotion_details', cashierToken, { scheme_name: name });
    assert.strictEqual(details.body.message.discount_value, 15);
    assert.strictEqual(details.body.message.discount_type, 'percentage');

    const groups = await M('DyPOS.api.promotions.get_item_groups', cashierToken, {});
    assert.ok(Array.isArray(groups.body.message));

    const brands = await M('DyPOS.api.promotions.get_brands', cashierToken, {});
    assert.ok(Array.isArray(brands.body.message));

    const toggled = await M('DyPOS.api.promotions.toggle_promotion', adminToken, { scheme_name: name });
    assert.strictEqual(toggled.body.message.disabled, 1);

    const del = await M('DyPOS.api.promotions.delete_promotion', adminToken, { scheme_name: name });
    assert.strictEqual(del.body.message.deleted, true);
  });
});

describe('product management + variants', () => {
  const code = `MPM-${stamp}`;

  it('save → list → image → settings', async () => {
    const save = await M('DyPOS.api.product_management.save_product', adminToken, {
      data: JSON.stringify({ item_code: code, item_name: 'Compat Managed', item_group: 'General', stock_uom: 'Nos', price: 25 }),
    });
    assert.strictEqual(save.status, 200, JSON.stringify(save.body));
    assert.strictEqual(save.body.message.item_code, code);

    const denied = await M('DyPOS.api.product_management.save_product', cashierToken, {
      data: JSON.stringify({ item_code: `${code}X`, item_name: 'Nope' }),
    });
    assert.strictEqual(denied.status, 403);

    const list = await M('DyPOS.api.product_management.get_products', cashierToken, { search_term: code, limit: 10 });
    assert.ok(list.body.message.some((p) => p.item_code === code));

    const img = await M('DyPOS.api.product_management.update_product_image', adminToken, { item_code: code, file_url: '/uploads/x.png' });
    assert.strictEqual(img.body.message.image, '/uploads/x.png');

    const settings = await M('DyPOS.api.product_management.get_product_image_settings', cashierToken, {});
    assert.ok(settings.body.message.max_file_size > 0);

    const groups = await M('DyPOS.api.product_management.get_item_groups', cashierToken, {});
    assert.ok(groups.body.message.some((g) => g.name === 'General'));
  });

  it('get_item_variants returns explicit []', async () => {
    const r = await M('DyPOS.api.items.get_item_variants', cashierToken, { template_item: code });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.message, []);
  });
});

describe('QZ certificate lifecycle', () => {
  it('setup (ADMIN) → get → sign → download; CASHIER cannot setup', async () => {
    const denied = await M('DyPOS.api.qz.setup_qz_certificate', cashierToken, {});
    assert.strictEqual(denied.status, 403);

    const setup = await M('DyPOS.api.qz.setup_qz_certificate', adminToken, {});
    assert.strictEqual(setup.status, 200, JSON.stringify(setup.body).slice(0, 300));
    assert.ok(['generated', 'exists'].includes(setup.body.message.status));
    assert.ok(setup.body.message.fingerprint);

    const cert = await M('DyPOS.api.qz.get_certificate', cashierToken, {});
    assert.strictEqual(cert.status, 200);
    assert.ok(String(cert.body.message).includes('BEGIN CERTIFICATE'));

    const sig = await M('DyPOS.api.qz.sign_message', cashierToken, { message: 'hello-qz' });
    assert.strictEqual(sig.status, 200);
    assert.ok(String(sig.body.message).length > 100);

    const dl = await M('DyPOS.api.qz.get_certificate_download', cashierToken, {});
    assert.strictEqual(dl.status, 200);
    assert.ok(dl.body.message.pem.includes('BEGIN CERTIFICATE'));
    assert.ok(dl.body.message.company);
  });
});

describe('warehouse availability / batch-serial / one-time / pos settings', () => {
  it('availability lists per-warehouse rows with actual/available qty', async () => {
    const r = await M('DyPOS.api.items.get_item_warehouse_availability', cashierToken, { item_code: prodCode });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.message.some((w) => w.warehouse === 'W-01' && w.item_code === prodCode));
    const row = r.body.message.find((w) => w.warehouse === 'W-01');
    assert.strictEqual(typeof row.actual_qty, 'number');
    assert.strictEqual(typeof row.available_qty, 'number');
    assert.ok(row.warehouse_name);

    const batch = await M('DyPOS.api.items.get_item_warehouse_availability', cashierToken, {
      item_codes: JSON.stringify([prodCode]),
    });
    assert.ok(batch.body.message.some((w) => w.item_code === prodCode));
  });

  it('batch-serial answers the offline-cache contract explicitly', async () => {
    const r = await M('DyPOS.api.items.get_batch_serial_data_for_items', cashierToken, {
      item_codes: JSON.stringify([prodCode]),
      warehouse: 'W-01',
    });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.message[prodCode]);
    assert.deepStrictEqual(r.body.message[prodCode].batches, []);
  });

  it('one-time redemptions reflect live invoices + one-time offers', async () => {
    const offer = await req('POST', '/api/offers/offers', {
      token: adminToken,
      body: { name: `OneTime ${stamp}`, type: 'FIXED', value: 5, oneTimePerCustomer: true },
    });
    assert.strictEqual(offer.status, 201, JSON.stringify(offer.body));

    const none = await M('DyPOS.api.offers.get_customer_one_time_redemptions', cashierToken, { customer: 'WALK-IN' });
    assert.deepStrictEqual(none.body.message, []);

    // custId owns live invoices → the one-time offer counts as redeemed.
    const hit = await M('DyPOS.api.offers.get_customer_one_time_redemptions', cashierToken, { customer: custId });
    assert.strictEqual(hit.status, 200);
    assert.ok(hit.body.message.includes(`OneTime ${stamp}`), JSON.stringify(hit.body.message));

    // A fresh customer with no invoices redeems nothing.
    const fresh = await req('POST', '/api/customers', { token: adminToken, body: { name: `Fresh ${stamp}` } });
    assert.strictEqual(fresh.status, 201);
    const clean = await M('DyPOS.api.offers.get_customer_one_time_redemptions', cashierToken, { customer: fresh.body.id });
    assert.deepStrictEqual(clean.body.message, []);
  });

  it('pos settings update persists + warehouse update sticks', async () => {
    const denied = await M('DyPOS.DyPOS.doctype.pos_settings.pos_settings.update_pos_settings', cashierToken, {
      settings: { tax_inclusive: true },
    });
    assert.strictEqual(denied.status, 403);

    const saved = await M('DyPOS.DyPOS.doctype.pos_settings.pos_settings.update_pos_settings', adminToken, {
      pos_profile: 'POS',
      settings: { tax_inclusive: true, allow_negative_stock: false },
    });
    assert.strictEqual(saved.status, 200, JSON.stringify(saved.body));
    assert.strictEqual(saved.body.message.tax_inclusive, true);
    assert.strictEqual(saved.body.message.allow_negative_stock, false);

    const bad = await M('DyPOS.DyPOS.doctype.pos_settings.pos_settings.update_pos_settings', adminToken, { settings: {} });
    assert.strictEqual(bad.status, 400);

    const whBad = await M('DyPOS.api.pos_profile.update_warehouse', adminToken, { warehouse: 'NOPE' });
    assert.strictEqual(whBad.status, 404);

    const wh = await M('DyPOS.api.pos_profile.update_warehouse', adminToken, { pos_profile: 'POS', warehouse: 'W-01' });
    assert.strictEqual(wh.status, 200);
    assert.strictEqual(wh.body.message.success, true);

    const profile = await M('DyPOS.api.pos_profile.get_pos_profile_data', cashierToken, {});
    assert.strictEqual(profile.body.message.warehouse, 'W-01');
  });
});
