/**
 * Stock guard — the sale-time stock policy (C1+C5).
 *
 * The policy is a SETTING, not a constant, and it lives in ONE implementation
 * (`lib/stockPolicy.js`) that both sale paths call:
 *   warn   (DEFAULT) → the sale ALWAYS completes: the cashier gets an Arabic
 *                      warning, the shortage is recorded, and the ledger keeps
 *                      the truthful remainder (qty may go negative → correct it
 *                      with a stock adjustment instead of a silent clamp).
 *   strict           → a short sale is refused (409) and stock never goes
 *                      negative; a missing stock row counts as 0 available.
 *   off              → no availability check at all (blind decrement).
 *
 * `DYPOS_STOCK_GUARD=strict` stays an operator hard floor over all of it and is
 * covered by `stock-guard-strict.test.js` (`npm run test:stock-strict`).
 *
 * The mode is flipped through the real ADMIN endpoint (`PUT /api/settings`), so
 * this suite proves the operator's switch actually changes sale behaviour —
 * not that a module-scope constant was read once at boot.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

import { app } from '../server.js';

let server, port, admin;
let pWarn, pStrict, pStrictMissing, pOff, pUntracked;
let seq = 0;

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

async function stockOf(pid, wh = 'W-01') {
  const r = await req('GET', `/api/stock/${pid}?warehouse=${wh}`, null, admin);
  assert.strictEqual(r.status, 200);
  return Number(r.body?.qty ?? 0);
}

/** Flip the policy the way an operator does: the ADMIN settings endpoint. */
async function setPolicy(mode, threshold = 0) {
  const r = await req('PUT', '/api/settings', { stock_control_mode: mode, stock_warning_threshold: threshold }, admin);
  assert.strictEqual(r.status, 200, `policy ${mode} → ${JSON.stringify(r.body)}`);
}

/** `POST /api/stock/adjust` is additive; this suite wants an absolute start. */
async function setStock(pid, target, wh = 'W-01') {
  const current = await stockOf(pid, wh);
  if (current === target) return target;
  const r = await req('POST', '/api/stock/adjust', { productId: pid, warehouseId: wh, qty: target - current }, admin);
  assert.strictEqual(r.status, 200, `adjust → ${JSON.stringify(r.body)}`);
  assert.strictEqual(Number(r.body.newQty), target);
  return target;
}

async function newProduct(label) {
  seq++;
  const r = await req('POST', '/api/products', { name: label, code: `SG-${seq}-${Date.now()}`, unitPrice: 10 }, admin);
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body.id;
}
before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const uname = 'sg_' + Date.now();
  await req('POST', '/api/auth/register', { username: uname, password: 'Pass1234', fullName: 'Stock Guard', role: 'ADMIN' });
  const login = await req('POST', '/api/auth/login', { username: uname, password: 'Pass1234' });
  assert.strictEqual(login.status, 200);
  admin = login.body.token;

  pWarn = await newProduct('Warn SKU');
  pStrict = await newProduct('Strict SKU');
  pStrictMissing = await newProduct('Strict Untracked SKU');
  pOff = await newProduct('Off SKU');
  pUntracked = await newProduct('Walkin SKU');
});

after(async () => {
  // Leave the shared in-memory DB on the production default.
  await setPolicy('warn', 0).catch(() => {});
  server.close();
});

describe('Stock policy — warn (production default)', () => {
  it('a short sale completes with an Arabic warning and a truthful negative remainder', async () => {
    await setPolicy('warn', 0);
    await setStock(pWarn, 5);
    const r = await req('POST', '/api/invoices', { items: [{ productId: pWarn, qty: 10 }] }, admin);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.ok(Array.isArray(r.body?.warnings), 'the cashier must be told, not blocked');
    assert.match(String(r.body.warnings[0]), /نفاد الكمية/);
    assert.match(String(r.body.warnings[0]), /تم إتمام البيع/);
    assert.strictEqual(await stockOf(pWarn), -5, 'the ledger keeps the truth instead of clamping to zero');
  });

  it('a sufficient sale above the threshold decrements exactly with no warning', async () => {
    await setPolicy('warn', 0);
    await setStock(pWarn, 10);
    const r = await req('POST', '/api/invoices', { items: [{ productId: pWarn, qty: 3 }] }, admin);
    assert.strictEqual(r.status, 201);
    assert.strictEqual(r.body?.warnings, undefined, 'a healthy remainder stays silent');
    assert.strictEqual(await stockOf(pWarn), 7);
  });

  it('threshold 0 warns at depletion (the sale that empties the row is not silent)', async () => {
    await setStock(pWarn, 3);
    const r = await req('POST', '/api/invoices', { items: [{ productId: pWarn, qty: 3 }] }, admin);
    assert.strictEqual(r.status, 201);
    assert.match(String(r.body?.warnings?.[0] || ''), /تنبيه مخزون منخفض/);
    assert.strictEqual(await stockOf(pWarn), 0);
  });

  it('warns at the configured low-stock threshold even when the sale fits', async () => {
    await setPolicy('warn', 5);
    await setStock(pWarn, 10);
    const r = await req('POST', '/api/invoices', { items: [{ productId: pWarn, qty: 6 }] }, admin);
    assert.strictEqual(r.status, 201);
    assert.match(String(r.body?.warnings?.[0] || ''), /تنبيه مخزون منخفض/);
    assert.strictEqual(await stockOf(pWarn), 4);
    await setPolicy('warn', 0);
  });

  it('an untracked walk-in still sells, and claims nothing it did not measure', async () => {
    const r = await req('POST', '/api/invoices', { items: [{ productId: pUntracked, qty: 2 }] }, admin);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body?.warnings, undefined, 'no stock row → nothing measured → no claim');
    assert.strictEqual(await stockOf(pUntracked), -2, 'the first sale creates the row with the real remainder');
  });
});
describe('Stock policy — strict (operator opt-in)', () => {
  it('a short sale is refused in Arabic and leaves stock untouched', async () => {
    await setPolicy('strict', 0);
    await setStock(pStrict, 5);
    const r = await req('POST', '/api/invoices', { items: [{ productId: pStrict, qty: 10 }] }, admin);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.match(String(r.body?.error || ''), /الكمية المتوفرة غير كافية/);
    assert.strictEqual(await stockOf(pStrict), 5);
  });

  it('a missing stock row counts as 0 available (every sellable SKU must be tracked)', async () => {
    await setStock(pStrictMissing, 0);
    const r = await req('POST', '/api/invoices', { items: [{ productId: pStrictMissing, qty: 1 }] }, admin);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.match(String(r.body?.error || ''), /الكمية المتوفرة غير كافية/);
    assert.strictEqual(await stockOf(pStrictMissing), 0, 'no negative row is ever created');
  });

  it('reserved_qty reduces available → 409; exactly available sells against the reserve', async () => {
    await setStock(pStrict, 12);
    const res = await req('POST', '/api/stock/reserve', { productId: pStrict, qty: 10, reference: 'sg-test' }, admin);
    assert.ok([200, 201].includes(res.status), JSON.stringify(res.body));
    assert.strictEqual(Number(res.body?.reserved), 10);
    // available = 12 - 10 = 2 → a demand of 3 must be refused with stock intact
    const over = await req('POST', '/api/invoices', { items: [{ productId: pStrict, qty: 3 }] }, admin);
    assert.strictEqual(over.status, 409);
    assert.strictEqual(await stockOf(pStrict), 12);
    const exact = await req('POST', '/api/invoices', { items: [{ productId: pStrict, qty: 2 }] }, admin);
    assert.strictEqual(exact.status, 201, JSON.stringify(exact.body));
    assert.strictEqual(await stockOf(pStrict), 10);
    const rel = await req('POST', '/api/stock/release', { productId: pStrict, qty: 10 }, admin);
    assert.strictEqual(rel.status, 200);
  });

  it('duplicate lines for one product cannot oversell, and no partial write survives', async () => {
    await setStock(pStrict, 3);
    const r = await req('POST', '/api/invoices', { items: [{ productId: pStrict, qty: 2 }, { productId: pStrict, qty: 2 }] }, admin);
    assert.strictEqual(r.status, 409, 'the second line must see the first line\'s decrement');
    assert.strictEqual(await stockOf(pStrict), 3, 'the refusal rolls the whole sale back');
  });
});

describe('Stock policy — off (operator opt-in)', () => {
  it('no availability check: the sale completes with a blind decrement', async () => {
    await setPolicy('off', 0);
    await setStock(pOff, 1);
    const r = await req('POST', '/api/invoices', { items: [{ productId: pOff, qty: 5 }] }, admin);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body?.warnings, undefined, 'off means no measurement and no claim');
    assert.strictEqual(await stockOf(pOff), -4);
  });
});