/**
 * Sync push envelope compatibility (offline client contract).
 * - per-operation envelope { operations: [...] } normalizes to the batch pipeline
 * - PRODUCT/STOCK upserts apply; per-item isolation preserved
 * - INVOICE stays fail-closed (never silently SYNCED)
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';

import { app } from '../server.js';

let server, port, token;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const uname = 'synce_' + Date.now();
  await req('POST', '/api/auth/register', { username: uname, password: 'Pass1234', fullName: 'Sync Envelope', role: 'ADMIN' });
  const login = await req('POST', '/api/auth/login', { username: uname, password: 'Pass1234' });
  assert.strictEqual(login.status, 200);
  token = login.body.token;
});

after(() => server.close());

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

describe('Sync push envelope compatibility', () => {
  it('accepts the per-operation envelope for PRODUCT upserts', async () => {
    const code = 'SYNCE-' + Date.now();
    const res = await req('POST', '/api/sync/push', {
      operations: [{
        entity_id: 'op-1',
        entity_type: 'PRODUCT',
        operation: 'UPSERT',
        payload: { id: 'sync-prod-' + Date.now(), code, name: 'Sync Prod', unitPrice: 25 },
        idempotency_key: 'synce-key-' + Date.now(),
      }],
    }, token);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.synced, 1);
    assert.strictEqual(res.body.failed, 0);
    assert.strictEqual(res.body.results[0].status, 'SYNCED');
  });

  it('mixes batch changes and operations with per-item isolation', async () => {
    const stamp = Date.now();
    const res = await req('POST', '/api/sync/push', {
      changes: [{
        id: 1,
        entity_type: 'PRODUCT',
        action: 'UPSERT',
        payload: JSON.stringify({ id: 'sync-mix-' + stamp, code: 'SYNCM-' + stamp, name: 'Mix Prod' }),
      }],
      operations: [{
        entity_id: 'op-bad',
        entity_type: 'NOPE',
        operation: 'UPSERT',
        payload: {},
      }],
    }, token);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.synced, 1);
    assert.strictEqual(res.body.failed, 1);
  });

  it('keeps INVOICE operations fail-closed (never silently SYNCED)', async () => {
    const res = await req('POST', '/api/sync/push', {
      operations: [{
        entity_id: 'inv-offline-1',
        entity_type: 'INVOICE',
        operation: 'CREATE',
        payload: { items: [] },
        idempotency_key: 'synce-inv-' + Date.now(),
      }],
    }, token);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.synced, 0);
    assert.strictEqual(res.body.failed, 1);
    assert.match(res.body.results[0].error, /الفواتير/);
  });

  it('rejects non-array operations', async () => {
    const res = await req('POST', '/api/sync/push', { operations: 'nope' }, token);
    assert.strictEqual(res.status, 400);
  });
});
