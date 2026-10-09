/**
 * Sync API integration tests through the real HTTP API.
 * Covers checkpoint/pull contracts, validation, and fail-closed offline invoices.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { app } from '../server.js';
import { db } from '../db/schema.js';

let server;
let port;
let token;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;

  const username = `sync_e2e_${Date.now()}`;
  const registered = await req('POST', '/api/auth/register', {
    username, password: 'Pass1234', fullName: 'Sync E2E', role: 'ADMIN',
  }, false);
  assert.ok([200, 201].includes(registered.status), JSON.stringify(registered.body));
  const login = await req('POST', '/api/auth/login', { username, password: 'Pass1234' }, false);
  assert.equal(login.status, 200);
  token = login.body.token;
});

after(() => new Promise((resolve, reject) => {
  if (!server) return resolve();
  server.close((error) => error ? reject(error) : resolve());
}));

async function req(method, path, body, authenticated = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (authenticated && token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed;
  try { parsed = JSON.parse(raw); } catch { parsed = raw; }
  return { status: response.status, body: parsed };
}

describe('Sync lifecycle (HTTP E2E)', () => {
  it('returns a scoped checkpoint and a valid checkpoint-based pull envelope', async () => {
    const checkpoint = await req('GET', '/api/sync/checkpoint');
    assert.equal(checkpoint.status, 200, JSON.stringify(checkpoint.body));
    assert.ok(Number.isInteger(Number(checkpoint.body.checkpoint)));
    assert.ok(Number(checkpoint.body.checkpoint) >= 0);

    const pulled = await req('GET', '/api/sync/pull?checkpoint=0&entity=PRODUCT&limit=10');
    assert.equal(pulled.status, 200, JSON.stringify(pulled.body));
    assert.ok(Array.isArray(pulled.body.changes));
    assert.ok(Number.isInteger(Number(pulled.body.checkpoint)));
    assert.equal(pulled.body.entity, 'PRODUCT');
    assert.ok(pulled.body.changes.length <= 10);
  });

  it('rejects invalid entity filters and malformed push envelopes', async () => {
    const invalidEntity = await req('GET', '/api/sync/pull?entity=PRODUCT%3BDROP');
    assert.equal(invalidEntity.status, 400);

    const invalidChanges = await req('POST', '/api/sync/push', { changes: 'not-an-array' });
    assert.equal(invalidChanges.status, 400);

    const invalidOperations = await req('POST', '/api/sync/push', { operations: 'not-an-array' });
    assert.equal(invalidOperations.status, 400);
  });

  it('isolates batch failures and persists valid catalog changes', async () => {
    const productId = `sync-product-${Date.now()}`;
    const pushed = await req('POST', '/api/sync/push', {
      changes: [
        {
          id: `bad-product-${Date.now()}`,
          entity_type: 'PRODUCT',
          action: 'UPSERT',
          payload: JSON.stringify({ id: 'invalid-product', name: 'Missing code' }),
        },
        {
          id: `good-product-${Date.now()}`,
          entity_type: 'PRODUCT',
          action: 'UPSERT',
          payload: JSON.stringify({
            id: productId,
            code: productId,
            name: 'Synced catalog item',
            unitPrice: 12.5,
            cost: 4,
            isActive: true,
          }),
        },
      ],
    });

    assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
    assert.equal(pushed.body.failed, 1);
    assert.equal(pushed.body.synced, 1);
    assert.equal(pushed.body.results[0].status, 'FAILED');
    assert.equal(pushed.body.results[1].status, 'SYNCED');
    assert.equal(pushed.body.results[0].recovery.code, 'REQUIRED_FIELDS');
    assert.equal(pushed.body.results[0].recovery.title, 'أكمل بيانات الصنف');
    assert.deepEqual(pushed.body.results[0].recovery.missingFields.map((field) => field.field), ['code']);
    assert.equal(pushed.body.results[0].recovery.nextAction, 'EDIT_PAYLOAD_AND_RETRY');
    assert.equal(pushed.body.results[0].recovery.retryable, false);

    const product = db.prepare('SELECT id, code, name, unit_price FROM products WHERE id=?').get(productId);
    assert.ok(product);
    assert.equal(product.code, productId);
    assert.equal(product.name, 'Synced catalog item');
    assert.equal(product.unit_price, 12.5);
  });

  it('never reports an offline invoice as synced before the invoice core is supported', async () => {
    const pushed = await req('POST', '/api/sync/push', {
      changes: [{
        id: `offline-invoice-${Date.now()}`,
        entity_type: 'INVOICE',
        action: 'UPSERT',
        payload: JSON.stringify({ items: [{ productId: 'offline-product', qty: 1 }] }),
      }],
    });
    assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
    assert.equal(pushed.body.failed, 1);
    assert.equal(pushed.body.synced, 0);
    assert.equal(pushed.body.results[0].status, 'FAILED');
    assert.match(pushed.body.results[0].error, /مزامنة الفواتير غير مدعومة/);
    assert.equal(pushed.body.results[0].recovery.code, 'INVOICE_SYNC_UNSUPPORTED');
    assert.equal(pushed.body.results[0].recovery.nextAction, 'OPEN_ONLINE_INVOICE_FLOW');
    assert.equal(pushed.body.results[0].recovery.endpoint, '/api/invoices');
    assert.equal(pushed.body.results[0].recovery.preserveDraft, true);
    assert.equal(pushed.body.results[0].recovery.retryable, false);
  });

  it('denies sync push to unauthenticated callers', async () => {
    const response = await req('POST', '/api/sync/push', { changes: [] }, false);
    assert.ok([401, 403].includes(response.status), JSON.stringify(response.body));
  });
});
