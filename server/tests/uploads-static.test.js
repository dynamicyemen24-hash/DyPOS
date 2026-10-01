/**
 * /uploads static gate.
 *
 * The method-router upload directory used to be mounted with no middleware at
 * all, so `GET /uploads/<any file>` worked for an anonymous visitor — a
 * cross-tenant read of product images on filenames that are just
 * `${Date.now()}_${name}`. It is now auth-gated (the HttpOnly dypos_token
 * cookie rides along on same-origin <img> requests) and restricted to image
 * extensions, because upload_file accepts any extension an authenticated
 * client sends.
 *
 * Env from tests/setup.js (--import). Fresh in-memory DB per file.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'node:events';

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
  return { status: res.status, body: parsed, headers: res.headers };
}

// PNG signature — enough for upload_file's base64 path and for express.static
// to hand back a 200 with an image/png body.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64');

describe('/uploads — auth gate + extension allowlist', () => {
  const username = `up_${Date.now()}`;
  let token;
  let fileUrl;

  before(async () => {
    const reg = await call('POST', '/api/method/dypos.auth.register', {
      body: { username, password: 'StrongP@55!', fullName: 'Upload Gate', role: 'CASHIER' },
    });
    assert.strictEqual(reg.status, 200, JSON.stringify(reg.body).slice(0, 300));

    const login = await call('POST', '/api/method/login', {
      body: { usr: username, pwd: 'StrongP@55!' },
    });
    assert.strictEqual(login.status, 200, JSON.stringify(login.body).slice(0, 300));
    token = login.body.token || login.body.message?.token;
    assert.ok(token, 'login must return a token');

    const up = await call('POST', '/api/method/upload_file', {
      token,
      body: { filename: 'gate.png', content: PNG },
    });
    assert.strictEqual(up.status, 200, JSON.stringify(up.body).slice(0, 300));
    fileUrl = up.body.message?.file_url || up.body.file_url;
    assert.ok(fileUrl?.startsWith('/uploads/'), `unexpected file_url: ${fileUrl}`);
  });

  it('rejects an anonymous request with 401 (was world-readable)', async () => {
    const res = await call('GET', fileUrl);
    assert.strictEqual(res.status, 401, `expected 401, got ${res.status} ${String(res.body).slice(0, 200)}`);
  });

  it('rejects a garbage bearer token with 401', async () => {
    const res = await call('GET', fileUrl, { token: 'not-a-jwt' });
    assert.strictEqual(res.status, 401);
  });

  it('serves the file with a Bearer token', async () => {
    const res = await call('GET', fileUrl, { token });
    assert.strictEqual(res.status, 200, String(res.body).slice(0, 200));
    assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(
      String(res.headers.get('content-security-policy') || '').includes("default-src 'none'"),
      'uploads must carry a kill-switch CSP',
    );
  });

  it('serves the file with the dypos_token cookie (what <img> sends)', async () => {
    const res = await call('GET', fileUrl, { cookie: `dypos_token=${encodeURIComponent(token)}` });
    assert.strictEqual(res.status, 200, String(res.body).slice(0, 200));
  });

  it('refuses non-image extensions with 404 (stored-XSS vector)', async () => {
    for (const name of ['x.html', 'x.svg.html', 'x.txt', 'x.js']) {
      const res = await call('GET', `/uploads/${name}`, { token });
      assert.strictEqual(res.status, 404, `${name} must not be served, got ${res.status}`);
    }
  });

  it('serves an allowlisted image extension to an authenticated caller', async () => {
    const res = await call('GET', fileUrl, { token });
    assert.strictEqual(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /image\/png/);
  });

  it('never lists the directory', async () => {
    const res = await call('GET', '/uploads/', { token });
    assert.notStrictEqual(res.status, 200);
  });
});
