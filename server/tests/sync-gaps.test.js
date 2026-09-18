/**
 * DyPOS v1.25.0 regression — closes third-party audit gaps:
 * sync tenant isolation (v16), push idempotency keys, device registry.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { app } from '../server.js';
import db from '../db/schema.js';

let server, port, admin, cashier, tenantA, tenantB;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
  const a = 'sgadmin_' + Date.now();
  await req('POST', '/api/auth/register', { username: a, password: 'Pass1234', fullName: 'SG Admin', role: 'ADMIN' });
  admin = (await req('POST', '/api/auth/login', { username: a, password: 'Pass1234' })).body.token;
  const c = 'sgcash_' + Date.now();
  await req('POST', '/api/auth/register', { username: c, password: 'Pass1234', fullName: 'SG Cash' });
  cashier = (await req('POST', '/api/auth/login', { username: c, password: 'Pass1234' })).body.token;
  tenantA = (await req('POST', '/api/tenants', { name: 'SG A' }, admin)).body.id;
  tenantB = (await req('POST', '/api/tenants', { name: 'SG B' }, admin)).body.id;
});

after(() => server.close());

async function req(method, path, body, tok, extra = {}) {
  const h = {};
  if (tok) h.Authorization = `Bearer ${tok}`;
  if (body != null) h['Content-Type'] = 'application/json';
  Object.assign(h, extra);
  const r = await fetch(`http://localhost:${port}${path}`, { method, headers: h, body: body == null ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: r.status, body: j };
}

describe('Sync tenant isolation (v16)', () => {
  it('scoped pull hides cross-tenant rows, keeps legacy NULL rows', async () => {
    const t = Date.now();
    db.prepare(`INSERT INTO sync_log (entity_type,entity_id,action,tenant_id,status) VALUES
      ('PRODUCT',?, 'UPSERT', ?, 'PENDING'),
      ('PRODUCT',?, 'UPSERT', ?, 'PENDING'),
      ('PRODUCT',?, 'UPSERT', NULL, 'PENDING')`)
      .run('sg-a-' + t, tenantA, 'sg-b-' + t, tenantB, 'sg-legacy-' + t);
    const scoped = await req('GET', '/api/sync/pull?checkpoint=0&limit=2000', null, admin, { 'X-Tenant-Id': tenantA });
    assert.strictEqual(scoped.status, 200);
    const ids = scoped.body.changes.map((c) => c.entity_id);
    assert.ok(ids.includes('sg-a-' + t), 'own tenant row visible');
    assert.ok(ids.includes('sg-legacy-' + t), 'legacy NULL row visible');
    assert.ok(!ids.includes('sg-b-' + t), 'cross-tenant row hidden');
    const open = await req('GET', '/api/sync/pull?checkpoint=0&limit=2000', null, admin);
    const openIds = open.body.changes.map((c) => c.entity_id);
    assert.ok(openIds.includes('sg-b-' + t), 'unscoped admin tool still sees all');
  });

  it('unknown tenant on pull is 404, not a leak', async () => {
    const r = await req('GET', '/api/sync/pull?checkpoint=0', null, admin, { 'X-Tenant-Id': 'no-such-tenant' });
    assert.strictEqual(r.status, 404);
  });
});

describe('Sync push idempotency (v16)', () => {
  it('replayed batch returns deduped without re-applying', async () => {
    const t = Date.now();
    const code = 'SGP-' + t;
    const rowId = db.prepare(`INSERT INTO sync_log (entity_type,entity_id,action,status) VALUES ('PRODUCT',?,'UPSERT','PENDING')`).run('sg-prod-' + t).lastInsertRowid;
    const change = {
      id: rowId,
      entity_type: 'PRODUCT',
      action: 'UPSERT',
      idempotencyKey: 'sg-key-' + t,
      payload: JSON.stringify({ id: 'sg-p-' + t, code, name: 'SG Prod', unitPrice: 10 }),
    };
    const first = await req('POST', '/api/sync/push', { changes: [change] }, admin);
    assert.strictEqual(first.status, 200);
    assert.strictEqual(first.body.results[0].status, 'SYNCED');
    assert.strictEqual(first.body.results[0].deduped, undefined);
    const replay = await req('POST', '/api/sync/push', { changes: [change] }, admin);
    assert.strictEqual(replay.status, 200);
    assert.strictEqual(replay.body.results[0].status, 'SYNCED');
    assert.strictEqual(replay.body.results[0].deduped, true);
    const prod = db.prepare('SELECT COUNT(*) AS c FROM products WHERE code=?').get(code);
    assert.strictEqual(prod.c, 1, 'exactly one product row after replay');
  });

  it('cashier push stays forbidden', async () => {
    const r = await req('POST', '/api/sync/push', { changes: [] }, cashier);
    assert.strictEqual(r.status, 403);
  });
});

describe('Device registry (v16)', () => {
  it('cashier terminal can self-register; list is tenant-filtered', async () => {
    const devId = 'POS-T1-' + Date.now();
    const reg = await req('POST', '/api/devices/register', { deviceId: devId, platform: 'android', appVersion: '2.4.0', tenantId: tenantA }, cashier);
    assert.strictEqual(reg.status, 201);
    assert.strictEqual(reg.body.device.status, 'ACTIVE');
    assert.strictEqual(reg.body.device.tenantId, tenantA);
    const scopedB = await req('GET', '/api/devices', null, admin, { 'X-Tenant-Id': tenantB });
    assert.ok(!scopedB.body.devices.some((d) => d.deviceId === devId), 'tenant B cannot see tenant A device');
    const scopedA = await req('GET', '/api/devices', null, admin, { 'X-Tenant-Id': tenantA });
    assert.ok(scopedA.body.devices.some((d) => d.deviceId === devId), 'tenant A sees its device');
  });

  it('revoke blocks re-registration; revive restores; cashier cannot revoke', async () => {
    const devId = 'POS-T2-' + Date.now();
    const reg = await req('POST', '/api/devices/register', { deviceId: devId, platform: 'windows' }, admin);
    const id = reg.body.device.id;
    const cashRevoke = await req('POST', `/api/devices/${id}/revoke`, {}, cashier);
    assert.strictEqual(cashRevoke.status, 403);
    const revoked = await req('POST', `/api/devices/${id}/revoke`, {}, admin);
    assert.strictEqual(revoked.status, 200);
    assert.strictEqual(revoked.body.device.status, 'REVOKED');
    const reReg = await req('POST', '/api/devices/register', { deviceId: devId, platform: 'windows' }, admin);
    assert.strictEqual(reReg.status, 423, 'revoked device cannot silently re-enroll');
    const revived = await req('POST', `/api/devices/${id}/revive`, {}, admin);
    assert.strictEqual(revived.body.device.status, 'ACTIVE');
  });

  it('invalid deviceId is rejected', async () => {
    const r = await req('POST', '/api/devices/register', { deviceId: 'bad id!!' }, admin);
    assert.strictEqual(r.status, 400);
  });
});
