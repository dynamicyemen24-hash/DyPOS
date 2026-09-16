/**
 * Auth API tests
 * Environment is set up via tests/setup.js (loaded with --import)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// Import app AFTER env vars are set by setup.js
import { app } from '../server.js';
import http from 'http';
import { once } from 'events';

let server, port;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
});

after(() => server.close());

async function req(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const payload = body === undefined || body === null ? undefined : JSON.stringify(body);
  const res = await fetch(`http://localhost:${port}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

describe('Health Check', () => {
  it('GET /api/health returns 200 with status ok', async () => {
    const res = await req('GET', '/api/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.ok(res.body.database.healthy);
  });
});

describe('Auth — Registration', () => {
  it('POST /api/auth/register creates a new user', async () => {
    const res = await req('POST', '/api/auth/register', {
      username: 'testuser_' + Date.now(),
      password: 'StrongP@55!',
      fullName: 'Test User',
      role: 'CASHIER',
    });
    assert.strictEqual(res.status, 201);
    assert.ok(res.body.id);
    assert.ok(res.body.username);
  });

  it('POST /api/auth/register rejects missing fields', async () => {
    const res = await req('POST', '/api/auth/register', { username: 'incomplete' });
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/auth/register rejects duplicate username', async () => {
    const un = 'dup_' + Date.now();
    await req('POST', '/api/auth/register', { username: un, password: 'StrongP@55!', fullName: 'Dup' });
    const res2 = await req('POST', '/api/auth/register', { username: un, password: 'StrongP@56!', fullName: 'Dup2' });
    assert.strictEqual(res2.status, 409);
  });
});

describe('Auth — Login', () => {
  const creds = { username: 'login_' + Date.now(), password: 'StrongP@55!', fullName: 'Login Test' };

  before(async () => {
    await req('POST', '/api/auth/register', creds);
  });

  it('POST /api/auth/login returns JWT for valid credentials', async () => {
    const res = await req('POST', '/api/auth/login', { username: creds.username, password: creds.password });
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.token);
    assert.strictEqual(res.body.user.username, creds.username);
  });

  it('POST /api/auth/login returns 401 for wrong password', async () => {
    const res = await req('POST', '/api/auth/login', { username: creds.username, password: 'wrongpassword' });
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/auth/me with valid token returns user info', async () => {
    const loginRes = await req('POST', '/api/auth/login', { username: creds.username, password: creds.password });
    const meRes = await req('GET', '/api/auth/me', null, loginRes.body.token);
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.username, creds.username);
  });
});

describe('Protected Routes', () => {
  it('GET /api/products without token returns 401', async () => {
    const res = await req('GET', '/api/products');
    assert.strictEqual(res.status, 401);
  });

  it('GET /api/products with invalid token returns 401', async () => {
    const res = await req('GET', '/api/products', null, 'invalid-token');
    assert.strictEqual(res.status, 401);
  });
});
