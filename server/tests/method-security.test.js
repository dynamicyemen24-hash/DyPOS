/**
 * Method-router security regression (SEC wave):
 *  1. /api/method login shares the username lockout with /api/auth/login
 *     (5 fails/15min → 429 + Retry-After, Arabic message).
 *  2. password_hash is never exposed via frappe.client.get_list / get_value /
 *     get / set_value — neither by omission (SELECT *) nor by explicit ask.
 *  3. Tenant-bound callers only see their own + legacy-global rows on the
 *     method list endpoints (get_items, frappe.client.get_list Item).
 *
 * Env comes from tests/setup.js (--import). Fresh in-memory DB per file.
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

let adminToken;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const boot = uniq('msec_boot');
  const reg = await req('POST', '/api/auth/register', {
    body: { username: boot, password: PW, fullName: 'Method Sec Root', role: 'ADMIN' },
  });
  assert.strictEqual(reg.status, 201, `bootstrap register: ${JSON.stringify(reg.body)}`);
  const login = await req('POST', '/api/auth/login', { body: { username: boot, password: PW } });
  assert.strictEqual(login.status, 200);
  adminToken = login.body.token;
  assert.ok(adminToken);
});

after(() => server.close());

async function req(method, path, { body, token, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const payload = body === undefined || body === null ? undefined : JSON.stringify(body);
  const res = await fetch(`http://localhost:${port}${path}`, { method, headers: h, body: payload });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, retryAfter: res.headers.get('retry-after') };
}

describe('/api/method login — shared username lockout', () => {
  it('5 bad method-logins → 6th is 429 + Retry-After (even with right password → still 429)', async () => {
    const username = uniq('msec_lock');
    const reg = await req('POST', '/api/auth/register', {
      body: { username, password: PW, fullName: 'Lock Target', role: 'CASHIER' },
    }, );
    assert.strictEqual(reg.status, 201);
    const path = '/api/method/DyPOS.api.auth.login';
    for (let i = 0; i < 5; i++) {
      const r = await req('POST', path, { body: { usr: username, pwd: 'WrongP@55!' } });
      assert.strictEqual(r.status, 401, `attempt ${i + 1} must be a clean 401`);
    }
    const blocked = await req('POST', path, { body: { usr: username, pwd: 'WrongP@55!' } });
    assert.strictEqual(blocked.status, 429, '6th wrong attempt → 429');
    assert.ok(Number(blocked.retryAfter) > 0, 'Retry-After must be present');
    // Fail-closed: even the CORRECT password is rejected while locked.
    const correct = await req('POST', path, { body: { usr: username, pwd: PW } });
    assert.strictEqual(correct.status, 429, 'locked account rejects even the correct password');
  });
});

describe('frappe.client.* — password_hash never leaves the server', () => {
  it('get_list User without fields omits password_hash', async () => {
    const r = await req('POST', '/api/method/frappe.client.get_list', {
      token: adminToken,
      body: { doctype: 'User', limit_page_length: 50 },
    });
    assert.strictEqual(r.status, 200);
    assert.ok(Array.isArray(r.body.message));
    assert.ok(r.body.message.length >= 1);
    for (const row of r.body.message) {
      assert.strictEqual(row.password_hash, undefined, 'row must not carry password_hash');
    }
  });

  it('get_list User explicitly asking password_hash still omits it', async () => {
    const r = await req('POST', '/api/method/frappe.client.get_list', {
      token: adminToken,
      body: { doctype: 'User', fields: ['name', 'password_hash'], limit_page_length: 50 },
    });
    assert.strictEqual(r.status, 200);
    for (const row of r.body.message) {
      assert.strictEqual(row.password_hash, undefined);
    }
  });

  it('get_value User password_hash → null (array and string forms)', async () => {
    const arr = await req('POST', '/api/method/frappe.client.get_value', {
      token: adminToken,
      body: { doctype: 'User', fieldname: ['password_hash'] },
    });
    assert.strictEqual(arr.status, 200);
    assert.strictEqual(arr.body.message?.password_hash ?? null, null);

    const str = await req('POST', '/api/method/frappe.client.get_value', {
      token: adminToken,
      body: { doctype: 'User', fieldname: 'password_hash' },
    });
    assert.strictEqual(str.status, 200);
    assert.strictEqual(str.body.message ?? null, null);
  });

  it('get (singular) User omits password_hash', async () => {
    const list = await req('POST', '/api/method/frappe.client.get_list', {
      token: adminToken,
      body: { doctype: 'User', fields: ['name'], limit_page_length: 1 },
    });
    const name = list.body.message[0]?.name;
    assert.ok(name);
    const r = await req('POST', '/api/method/frappe.client.get', {
      token: adminToken,
      body: { doctype: 'User', name },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.message?.password_hash, undefined);
  });

  it('set_value User response omits password_hash', async () => {
    const list = await req('POST', '/api/method/frappe.client.get_list', {
      token: adminToken,
      body: { doctype: 'User', fields: ['name'], limit_page_length: 1 },
    });
    const name = list.body.message[0]?.name;
    assert.ok(name);
    const r = await req('POST', '/api/method/frappe.client.set_value', {
      token: adminToken,
      body: { doctype: 'User', name, fieldname: { full_name: 'Redacted Check' } },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.message?.password_hash, undefined);
  });
});

describe('method lists — tenant isolation', () => {
  it("tenant B never sees tenant A's products (get_items + get_list Item)", async () => {
    const tA = (await req('POST', '/api/tenants', { body: { name: `MSec A ${stamp}` }, token: adminToken })).body.id;
    const tB = (await req('POST', '/api/tenants', { body: { name: `MSec B ${stamp}` }, token: adminToken })).body.id;
    assert.ok(tA && tB);

    const ua = uniq('msec_a');
    await req('POST', '/api/auth/register', {
      body: { username: ua, password: PW, fullName: 'MSec User A', role: 'ADMIN', tenantId: tA }, token: adminToken,
    });
    const tokenA = (await req('POST', '/api/auth/login', { body: { username: ua, password: PW } })).body.token;
    const ub = uniq('msec_b');
    await req('POST', '/api/auth/register', {
      body: { username: ub, password: PW, fullName: 'MSec User B', role: 'ADMIN', tenantId: tB }, token: adminToken,
    });
    const tokenB = (await req('POST', '/api/auth/login', { body: { username: ub, password: PW } })).body.token;
    assert.ok(tokenA && tokenB);

    const code = `MSEC-${stamp}`;
    const prod = await req('POST', '/api/products', {
      token: tokenA,
      headers: { 'X-Tenant-Id': tA },
      body: { name: 'MSec Product A', code, unitPrice: 10, taxRate: 15 },
    });
    assert.strictEqual(prod.status, 201, `product fixture: ${JSON.stringify(prod.body)}`);

    const asB = await req('POST', '/api/method/DyPOS.api.items.get_items', {
      token: tokenB,
      body: { search_term: code, limit: 50 },
    });
    assert.strictEqual(asB.status, 200);
    assert.ok(!asB.body.message.some((i) => i.item_code === code || i.code === code), "B must not see A's product");

    const listB = await req('POST', '/api/method/frappe.client.get_list', {
      token: tokenB,
      body: { doctype: 'Item', filters: { item_code: code }, limit_page_length: 50 },
    });
    assert.strictEqual(listB.status, 200);
    assert.ok(!listB.body.message.some((i) => i.item_code === code), "B must not see A's product via get_list");

    const asA = await req('POST', '/api/method/DyPOS.api.items.get_items', {
      token: tokenA,
      body: { search_term: code, limit: 50 },
    });
    assert.strictEqual(asA.status, 200);
    assert.ok(asA.body.message.some((i) => i.item_code === code || i.code === code), 'A sees its own product');
  });
});
