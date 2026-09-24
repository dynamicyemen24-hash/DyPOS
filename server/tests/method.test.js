/**
 * Frappe-compat /api/method router tests — dual GET + POST coverage.
 * Env is set up via tests/setup.js (loaded with --import).
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

import { app } from '../server.js';

let server, port;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
});

after(() => server.close());

async function call(method, path, { body, token, cookie } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  const payload = body === undefined || body === null ? undefined : JSON.stringify(body);
  const res = await fetch(`http://localhost:${port}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return {
    status: res.status,
    body: parsed,
    headers: res.headers,
    setCookie: res.headers.getSetCookie?.() || [],
  };
}

describe('/api/method — dual GET + POST', () => {
  it('GET DyPOS.api.ping returns { message.pong:true }', async () => {
    const res = await call('GET', '/api/method/DyPOS.api.ping');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message.pong, true);
  });

  it('POST DyPOS.api.ping returns { message.pong:true }', async () => {
    const res = await call('POST', '/api/method/DyPOS.api.ping');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message.pong, true);
  });

  it('GET DyPOS.api.utilities.ping returns message envelope', async () => {
    const res = await call('GET', '/api/method/DyPOS.api.utilities.ping');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.message);
    assert.strictEqual(res.body.message.pong, true);
  });

  it('GET get_app_translations returns Arabic dictionary', async () => {
    const res = await call('GET', '/api/method/DyPOS.api.localization.get_app_translations?locale=ar');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.message);
    assert.strictEqual(
      res.body.message['Skip to main content'],
      'تخطي إلى المحتوى الرئيسي',
    );
  });

  it('POST get_app_translations works too', async () => {
    const res = await call('POST', '/api/method/get_app_translations', { body: { locale: 'ar' } });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.message);
  });

  it('GET get_allowed_locales returns ar,en', async () => {
    const res = await call('GET', '/api/method/DyPOS.api.localization.get_allowed_locales');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.message.locales, ['ar', 'en']);
  });

  it('GET get_csrf_token returns csrf_token + sets cookie', async () => {
    const res = await call('GET', '/api/method/DyPOS.api.utilities.get_csrf_token');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.message.csrf_token);
    const cookies = res.setCookie.join(';');
    assert.ok(cookies.includes('csrf_token='));
  });

  it('GET rate_limit.check returns allowed:true', async () => {
    const res = await call('GET', '/api/method/DyPOS.api.rate_limit.check?key=test&maxAttempts=5');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message.allowed, true);
  });

  it('POST rate_limit.check returns allowed:true', async () => {
    const res = await call('POST', '/api/method/DyPOS.api.rate_limit.check', { body: { key: 't', maxAttempts: 3 } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message.allowed, true);
    assert.strictEqual(res.headers.get('x-ratelimit-limit'), '3');
  });

  it('GET get_locale_names returns ar/en labels', async () => {
    const res = await call('GET', '/api/method/DyPOS.api.localization.get_locale_names');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message.ar.native, 'العربية');
  });

  it('unknown method → 404 with Frappe error shape', async () => {
    const res = await call('POST', '/api/method/DyPOS.api.does.not.exist');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.exc_type, 'NotFoundError');
    assert.ok(res.body._error_message);
  });

  it('unknown method GET → 404 with Frappe error shape', async () => {
    const res = await call('GET', '/api/method/no.such.method');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.exc_type, 'NotFoundError');
  });

  it('bare /api/method responds ok', async () => {
    const res = await call('GET', '/api/method');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message.status, 'ok');
  });
});

describe('/api/method — auth (login / get_logged_user / has_permission)', () => {
  const user = {
    username: `m_${Date.now()}`,
    password: 'StrongP@55!',
    fullName: 'Method User',
  };

  before(async () => {
    const reg = await call('POST', '/api/method/frappe.auth.register', {
      body: { ...user, role: 'CASHIER' },
    });
    assert.strictEqual(reg.status, 200);
    assert.ok(reg.body.message?.id || reg.body.id);
  });

  it('POST login (usr/pwd) returns full payload + sets dypos_token cookie', async () => {
    const res = await call('POST', '/api/method/login', {
      body: { usr: user.username, pwd: user.password },
    });
    assert.strictEqual(res.status, 200);
    // frappeRequest short-circuits on /login → full body, not only message
    assert.ok(res.body.token || res.body.message?.token);
    const cookies = res.setCookie.join(';');
    assert.ok(cookies.includes('dypos_token='));
    assert.ok(cookies.includes('user_id='));
    assert.ok(cookies.includes('full_name='));
  });

  it('POST login with wrong password → 401 Frappe error', async () => {
    const res = await call('POST', '/api/method/login', {
      body: { usr: user.username, pwd: 'WrongP@55!' },
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.exc_type, 'AuthenticationError');
  });

  it('GET frappe.auth.get_logged_user with Bearer token returns username', async () => {
    const login = await call('POST', '/api/method/login', {
      body: { usr: user.username, pwd: user.password },
    });
    const token = login.body.token || login.body.message?.token;
    assert.ok(token);
    const res = await call('GET', '/api/method/frappe.auth.get_logged_user', { token });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, user.username);
  });

  it('GET frappe.auth.get_logged_user via dypos_token cookie returns username', async () => {
    const login = await call('POST', '/api/method/login', {
      body: { usr: user.username, pwd: user.password },
    });
    const token = login.body.token || login.body.message?.token;
    const res = await call('GET', '/api/method/frappe.auth.get_logged_user', {
      cookie: `dypos_token=${encodeURIComponent(token)}`,
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, user.username);
  });

  it('GET frappe.auth.get_logged_user without auth → 401 Frappe error', async () => {
    const res = await call('GET', '/api/method/frappe.auth.get_logged_user');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.exc_type, 'AuthenticationError');
  });

  it('POST frappe.client.has_permission → { has_permission: boolean }', async () => {
    const login = await call('POST', '/api/method/login', {
      body: { usr: user.username, pwd: user.password },
    });
    const token = login.body.token || login.body.message?.token;
    const yes = await call('POST', '/api/method/frappe.client.has_permission', {
      token,
      body: { doctype: 'Customer', perm_type: 'read' },
    });
    assert.strictEqual(yes.status, 200);
    assert.strictEqual(yes.body.message.has_permission, true);

    const no = await call('POST', '/api/method/frappe.client.has_permission', {
      token,
      body: { doctype: 'User', perm_type: 'write' },
    });
    assert.strictEqual(no.status, 200);
    assert.strictEqual(no.body.message.has_permission, false);
  });

  it('POST frappe.client.has_permission without auth → 401', async () => {
    const res = await call('POST', '/api/method/frappe.client.has_permission', {
      body: { doctype: 'Item', perm_type: 'read' },
    });
    assert.strictEqual(res.status, 401);
  });

  it('POST logout revokes session and clears cookies', async () => {
    const login = await call('POST', '/api/method/login', {
      body: { usr: user.username, pwd: user.password },
    });
    const token = login.body.token || login.body.message?.token;
    const res = await call('POST', '/api/method/logout', { token });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message.logged_out, true);

    // Token should now be rejected
    const after = await call('GET', '/api/method/frappe.auth.get_logged_user', { token });
    assert.strictEqual(after.status, 401);
  });
});

describe('/api/method — frappe.client get_list / get_value', () => {
  let token;
  const user = {
    username: `cl_${Date.now()}`,
    password: 'StrongP@55!',
    fullName: 'Client User',
  };

  before(async () => {
    await call('POST', '/api/method/frappe.auth.register', {
      body: { ...user, role: 'CASHIER' },
    });
    const login = await call('POST', '/api/method/login', {
      body: { usr: user.username, pwd: user.password },
    });
    token = login.body.token || login.body.message?.token;
    assert.ok(token);
  });

  it('GET frappe.client.get_list Item returns array', async () => {
    const res = await call('GET', '/api/method/frappe.client.get_list?doctype=Item&limit_page_length=5', { token });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.message));
  });

  it('POST frappe.client.get_list Customer returns array', async () => {
    const res = await call('POST', '/api/method/frappe.client.get_list', {
      token,
      body: { doctype: 'Customer', limit_page_length: 5 },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.message));
  });

  it('GET frappe.client.get_list unknown doctype → empty array (never 500)', async () => {
    const res = await call('GET', '/api/method/frappe.client.get_list?doctype=NoSuchDoctype', { token });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(res.body.message, []);
  });

  it('GET frappe.client.get_list without auth → 401', async () => {
    const res = await call('GET', '/api/method/frappe.client.get_list?doctype=Item');
    assert.strictEqual(res.status, 401);
  });

  it('POST frappe.client.get_value Item with filters returns mapped row or null', async () => {
    const res = await call('POST', '/api/method/frappe.client.get_value', {
      token,
      body: {
        doctype: 'Item',
        filters: { name: 'no-such-item-xyz' },
        fieldname: 'item_name',
      },
    });
    assert.strictEqual(res.status, 200);
    // null or object with field — never throws
    assert.ok(res.body.message === null || typeof res.body.message === 'object');
  });

  it('POST frappe.client.get unknown doctype → 404 Frappe error', async () => {
    const res = await call('POST', '/api/method/frappe.client.get', {
      token,
      body: { doctype: 'NoSuchDoctype', name: 'x' },
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.exc_type, 'NotFoundError');
  });
});

describe('/api/method — items / customers / bootstrap (authed)', () => {
  let token;
  const user = {
    username: `it_${Date.now()}`,
    password: 'StrongP@55!',
    fullName: 'Items User',
  };

  before(async () => {
    await call('POST', '/api/method/frappe.auth.register', {
      body: { ...user, role: 'CASHIER' },
    });
    const login = await call('POST', '/api/method/login', {
      body: { usr: user.username, pwd: user.password },
    });
    token = login.body.token || login.body.message?.token;
    assert.ok(token);
  });

  it('POST DyPOS.api.items.get_items returns array of Frappe-shaped items', async () => {
    const res = await call('POST', '/api/method/DyPOS.api.items.get_items', {
      token,
      body: { limit: 10 },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.message));
    if (res.body.message.length) {
      const item = res.body.message[0];
      assert.ok('item_code' in item);
      assert.ok('item_name' in item);
    }
  });

  it('GET DyPOS.api.items.get_items_count returns number', async () => {
    const res = await call('GET', '/api/method/DyPOS.api.items.get_items_count', { token });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(typeof res.body.message, 'number');
  });

  it('POST DyPOS.api.customers.get_customers returns array', async () => {
    const res = await call('POST', '/api/method/DyPOS.api.customers.get_customers', {
      token,
      body: { limit: 5 },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.message));
  });

  it('POST DyPOS.api.bootstrap.get_initial_data returns settings + precision', async () => {
    const res = await call('POST', '/api/method/DyPOS.api.bootstrap.get_initial_data', { token });
    assert.strictEqual(res.status, 200);
    const m = res.body.message;
    assert.strictEqual(m.success, true);
    assert.ok(m.precision);
    assert.ok(m.settings);
    assert.ok(m.pos_settings);
    assert.strictEqual(m.locale, 'ar');
  });

  it('POST DyPOS.api.bootstrap.get_initial_data without auth → 401', async () => {
    const res = await call('POST', '/api/method/DyPOS.api.bootstrap.get_initial_data');
    assert.strictEqual(res.status, 401);
  });

  it('POST DyPOS.api.items.get_stock_quantities returns array (offline worker path)', async () => {
    const res = await call('POST', '/api/method/DyPOS.api.items.get_stock_quantities', {
      token,
      body: { codes: ['NOPE-1'], warehouse: 'W-01' },
    });
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.message));
  });

  it('POST DyPOS.DyPOS.doctype.pos_settings.pos_settings.get_pos_settings returns shape', async () => {
    const res = await call('POST', '/api/method/DyPOS.DyPOS.doctype.pos_settings.pos_settings.get_pos_settings', { token });
    assert.strictEqual(res.status, 200);
    assert.ok('tax_rate_default' in res.body.message);
    assert.ok('allow_negative_stock' in res.body.message);
  });
});

describe('/api/method — error contract', () => {
  it('POST methods that throw mid-handler never hang (async catch)', async () => {
    // login with empty body → validation Frappe error, not hang
    const res = await call('POST', '/api/method/login', { body: {} });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.exc_type, 'ValidationError');
  });

  it('frappeError responses always include _error_message', async () => {
    const res = await call('POST', '/api/method/frappe.auth.register', {
      body: { username: 'x', password: 'short' },
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body._error_message);
    assert.ok(res.body.exc_type);
  });
});
