/**
 * Ops-surface regression tests: static admin console + doctor preflight.
 *  - GET /admin → 200 HTML (public like a login page), no-store, wires APIs
 *  - scripts/doctor.mjs on :memory: → exit 0 + { ok:true } JSON
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { execFile } from 'node:child_process';

import { app } from '../server.js';

let server, port;

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
});

after(() => server.close());

describe('Ops console (/admin)', () => {
  it('serves the console HTML publicly with no-store', async () => {
    const r = await fetch(`http://localhost:${port}/admin`);
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('content-type') || '', /text\/html/);
    assert.match(r.headers.get('cache-control') || '', /no-store/);
    const html = await r.text();
    assert.ok(html.includes('DyPOS Ops'));
    assert.ok(html.includes('/api/health'));
    assert.ok(html.includes('/api/payment-methods'));
    assert.ok(html.includes('/api/fiscal-years'));
    assert.ok(html.includes('/api/webhooks/outbox'));
  });
});

describe('Doctor preflight (scripts/doctor.mjs)', () => {
  it('reports ready on a fresh :memory: DB', async () => {
    const out = await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        ['scripts/doctor.mjs'],
        { cwd: process.cwd(), env: { ...process.env, DYPOS_DB_PATH: ':memory:' }, timeout: 60000 },
        (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)),
      );
    });
    // doctor shares stdout with migrate()'s log line — the JSON report is the
    // first '{' onward (the log line contains no braces).
    const report = JSON.parse(out.slice(out.indexOf('{')));
    assert.strictEqual(report.ok, true);
    assert.ok(report.checks.some((c) => c.name === 'db migrated to latest' && c.level === 'ok'));
    assert.ok(report.checks.some((c) => c.name.startsWith('table ') && c.level === 'ok'));
  });
});
