/**
 * Version single-source drift test (C3).
 * `server/lib/version.js` is the ONLY place the server version is defined.
 * server.js, openapi.js, print.js import it; package.json and the frontend
 * build stamp must match. Any drift fails the suite.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { once } from 'events';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app } from '../server.js';
import { VERSION } from '../lib/version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));

let server, port;

async function req(method, path) {
  const res = await fetch(`http://localhost:${port}${path}`, { method });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed };
}

before(async () => {
  server = http.createServer(app);
  server.listen(0);
  await once(server, 'listening');
  port = server.address().port;
});

after(() => server.close());

describe('Version single source (C3)', () => {
  it('lib/version.js exports a semver string', () => {
    assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  });

  it('server/package.json matches the single source', () => {
    assert.strictEqual(pkg.version, VERSION);
  });

  it('GET /api/health reports the single-source version', async () => {
    const r = await req('GET', '/api/health');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.version, VERSION);
  });

  it('GET /api/ready reports the single-source version', async () => {
    const r = await req('GET', '/api/ready');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.version, VERSION);
  });

  it('GET /api/openapi.json reports the single-source version', async () => {
    const r = await req('GET', '/api/openapi.json');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body?.info?.version, VERSION);
  });
});
